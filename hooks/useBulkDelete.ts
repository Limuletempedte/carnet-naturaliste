import { useState, type Dispatch, type SetStateAction } from 'react';
import { deleteObservation } from '../services/storageService';
import { logger } from '../utils/logger';
import type { Observation } from '../types';
import type { ToastType } from '../components/ToastContainer';

interface ConfirmationRequest {
    title: string;
    message: string;
    onConfirm: () => void;
}

interface UseBulkDeleteParams {
    /** Liste courante (pour l'aperçu des noms dans la confirmation et les échecs). */
    observations: Observation[];
    setObservations: Dispatch<SetStateAction<Observation[]>>;
    /** Ouvre le dialogue de confirmation géré par App. */
    setConfirmation: (confirmation: ConfirmationRequest) => void;
    setError: (message: string | null) => void;
    onToast: (type: ToastType, message: string, durationMs?: number) => string;
    removeToast: (id: string) => void;
    refreshOfflineQueueSnapshot: () => void;
}

/**
 * Suppression en masse d'observations : ouvre une confirmation, exécute les
 * suppressions en parallèle (`Promise.allSettled`), retire du state celles
 * réussies et notifie le résultat (succès / échecs partiels). Extraction
 * d'`App.tsx` sans changement de comportement.
 */
export const useBulkDelete = ({
    observations,
    setObservations,
    setConfirmation,
    setError,
    onToast,
    removeToast,
    refreshOfflineQueueSnapshot,
}: UseBulkDeleteParams) => {
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);

    const handleBulkDeleteRequest = (ids: string[]) => {
        const previewNames = ids.slice(0, 5).map(id => {
            const obs = observations.find(o => o.id === id);
            return obs?.speciesName || '?';
        });
        const preview = previewNames.join(', ') + (ids.length > 5 ? ` et ${ids.length - 5} autre(s)` : '');
        setConfirmation({
            title: "Confirmer la suppression multiple",
            message: `Supprimer ${ids.length} observations ?\n\n${preview}\n\nCette action est irréversible.`,
            onConfirm: async () => {
                setIsBulkDeleting(true);
                // Toast persistant de progression : le modal se ferme immédiatement
                // (cf. ConfirmationDialog), l'utilisateur a besoin d'un feedback pendant
                // que les N suppressions tournent.
                const progressToastId = onToast('info', `Suppression de ${ids.length} observation(s)…`, 0);
                try {
                    const results = await Promise.allSettled(ids.map(id => deleteObservation(id)));
                    const successIds: string[] = [];
                    const failedIds: string[] = [];

                    results.forEach((result, index) => {
                        if (result.status === 'fulfilled') {
                            successIds.push(ids[index]);
                        } else {
                            failedIds.push(ids[index]);
                        }
                    });

                    const idsSet = new Set(successIds);
                    setObservations(prev => prev.filter(obs => !idsSet.has(obs.id)));
                    refreshOfflineQueueSnapshot();

                    removeToast(progressToastId);
                    if (successIds.length > 0 && failedIds.length === 0) {
                        onToast('success', `${successIds.length} observation(s) supprimée(s).`);
                    }
                    if (failedIds.length > 0) {
                        const failedNames = failedIds.map(fid => {
                            const obs = observations.find(o => o.id === fid);
                            return obs?.speciesName || fid.slice(0, 8);
                        });
                        const preview = failedNames.length > 3
                            ? `${failedNames.slice(0, 3).join(', ')} et ${failedNames.length - 3} autre(s)`
                            : failedNames.join(', ');
                        onToast('warning', `${failedIds.length} suppression(s) échouée(s) : ${preview}`);
                    }
                } catch (e) {
                    removeToast(progressToastId);
                    setError("Erreur lors de la suppression multiple.");
                    logger.error(e);
                } finally {
                    setIsBulkDeleting(false);
                }
            }
        });
    };

    return { isBulkDeleting, handleBulkDeleteRequest };
};
