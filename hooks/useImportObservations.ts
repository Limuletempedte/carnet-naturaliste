import { captureSessionContext, assertSessionContext, isSessionCurrent } from '../services/sessionScope';
import { useState, type Dispatch, type SetStateAction } from 'react';
import { Observation, View } from '../types';
import { saveObservation, updateObservation, bulkUpsertObservationsInCache, isDuplicateKeyError } from '../services/storageService';
import { buildImportPersistencePlan, ImportConflictMode } from '../services/importPolicy';
import type { ImportResult } from '../services/excelImportService';
import { isUuid, generateUUID } from '../utils/uuidUtils';
import { compareIsoDate } from '../utils/dateUtils';
import { logger } from '../utils/logger';
import type { ToastType } from '../components/ToastContainer';

interface UseImportObservationsParams {
    observations: Observation[];
    setObservations: Dispatch<SetStateAction<Observation[]>>;
    setView: (view: View) => void;
    setError: (message: string | null) => void;
    onToast: (type: ToastType, message: string, durationMs?: number) => string;
    removeToast: (id: string) => void;
    refreshOfflineQueueSnapshot: () => void;
}

/**
 * Import d'observations (Excel/JSON) : construit un plan de persistance
 * (insert/update + résolution de conflits), exécute en concurrence limitée,
 * gère la collision de clé primaire (SI-30 : régénération d'UUID + retry),
 * met à jour state + cache local, puis notifie un résumé détaillé.
 * Extraction d'`App.tsx` sans changement de comportement.
 */
export const useImportObservations = ({
    observations,
    setObservations,
    setView,
    setError,
    onToast,
    removeToast,
    refreshOfflineQueueSnapshot,
}: UseImportObservationsParams) => {
    const [importSession] = useState(() => { try { return captureSessionContext(); } catch { return null; } });
    const [isImporting, setIsImporting] = useState(false);

    const handleImportRequest = async (
        importResult: ImportResult,
        options: { conflictMode: ImportConflictMode } = { conflictMode: 'merge' }
    ): Promise<void> => {
        if (!importSession || !isSessionCurrent(importSession)) return;
        const context = importSession;
        let importToastId: string | null = null;
        try {
            if (importResult.report.blockingErrors.length > 0) {
                throw new Error(`Le fichier contient ${importResult.report.blockingErrors.length} erreur(s) bloquante(s).`);
            }

            setIsImporting(true);
            importToastId = onToast('info', "Import en cours...", 0);

            const mergedById = new Map(observations.map(obs => [obs.id, obs] as [string, Observation]));
            const failureReasons = new Map<string, number>();
            let addedCount = 0;
            let updatedCount = 0;
            let failedCount = 0;
            let regeneratedIds = 0;

            const captureFailure = (reason: string) => {
                failureReasons.set(reason, (failureReasons.get(reason) || 0) + 1);
            };

            const toErrorMessage = (error: unknown): string => {
                if (error instanceof Error && error.message) return error.message;
                return String(error);
            };

            const importPlan = buildImportPersistencePlan(importResult.observations, observations, {
                conflictMode: options.conflictMode
            });
            const successfulOps: Observation[] = [];

            const IMPORT_CONCURRENCY = 5;
            let nextIndex = 0;

            const worker = async () => {
                while (nextIndex < importPlan.length) {
                    assertSessionContext(context);
                    const i = nextIndex++;
                    const planned = importPlan[i];
                    const observationToPersist = planned.observation;

                    if (planned.regeneratedId && !isUuid(planned.originalId)) {
                        regeneratedIds++;
                    }

                    try {
                        if (planned.mode === 'update') {
                            await updateObservation(observationToPersist, { skipCache: true, context });
                            successfulOps.push(observationToPersist);
                            updatedCount++;
                        } else {
                            try {
                                const savedObs = await saveObservation(observationToPersist, { skipCache: true, context });
                                const persisted = { ...observationToPersist, id: savedObs.id };
                                successfulOps.push(persisted);
                                addedCount++;
                            } catch (insertErr) {
                                if (!isDuplicateKeyError(insertErr)) throw insertErr;
                                // SI-30: collision PK globale — l'ID existe déjà en DB sous un autre
                                // user_id (orphelin d'un ancien compte), RLS l'empêche d'être visible
                                // côté client. On régénère un UUID et on retente une fois.
                                const retryObs: Observation = { ...observationToPersist, id: generateUUID() };
                                const savedRetry = await saveObservation(retryObs, { skipCache: true, context });
                                successfulOps.push({ ...retryObs, id: savedRetry.id });
                                addedCount++;
                                regeneratedIds++;
                            }
                        }
                    } catch (importError) {
                        assertSessionContext(context);
                        failedCount++;
                        captureFailure(toErrorMessage(importError));
                    }
                }
            };

            // Exécution en batch concurrent
            await Promise.all(Array.from({ length: IMPORT_CONCURRENCY }, worker));

            assertSessionContext(context);
            const successCount = addedCount + updatedCount;
            const failureSummary = Array.from(failureReasons.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([reason, count]) => `${count}× ${reason}`)
                .join(' ; ');

            if (successCount === 0) {
                throw new Error(failureSummary
                    ? `Aucune ligne n'a pu être importée. Échecs: ${failureSummary}`
                    : "Aucune ligne n'a pu être importée.");
            }

            // Cohérence Cache <-> React State
            // 1. Mise à jour de l'état React d'abord (source de vérité UI)
            for (const obs of successfulOps) {
                mergedById.set(obs.id, obs);
            }
            const mergedObservations = Array.from(mergedById.values()).sort((a, b) => compareIsoDate(b.date, a.date));
            setObservations(mergedObservations);

            // 2. Mise à jour du cache local (si échoue, re-sync au prochain load)
            bulkUpsertObservationsInCache(successfulOps, context);

            // UI Reset
            setView(View.LIST);
            setError(null);

            onToast(
                failedCount > 0 ? 'warning' : 'success',
                `Import terminé: ${addedCount} ajoutée(s), ${updatedCount} mise(s) à jour, ${failedCount} échec(s).`,
                failedCount > 0 ? 8000 : 5000
            );

            if (failedCount > 0 && failureSummary) {
                onToast('error', `Échecs : ${failureSummary}`, 10000);
            }

            if (importResult.report.warnings.length > 0) {
                onToast('warning', `Import avec ${importResult.report.warnings.length} warning(s).`, 7000);
            }
            if (importResult.report.errors.length > 0) {
                onToast('warning', `${importResult.report.errors.length} erreur(s) de validation détectées.`, 7000);
            }
            if (regeneratedIds > 0) {
                onToast('info', `${regeneratedIds} ligne(s) ont reçu un nouvel ID (source vide/invalide ou conflit avec une observation existante).`, 7000);
            }

            refreshOfflineQueueSnapshot();

        } catch (e: unknown) {
            if (!isSessionCurrent(context)) return;
            const errorMessage = e instanceof Error ? e.message : String(e);
            setError(`Erreur lors de l'importation : ${errorMessage}`);
            onToast('error', `Échec de l'import: ${errorMessage}`);
            logger.error(e);
            throw e;
        } finally {
            if (importToastId && isSessionCurrent(context)) {
                removeToast(importToastId);
            }
            if (isSessionCurrent(context)) setIsImporting(false);
        }
    };

    return { isImporting, handleImportRequest };
};
