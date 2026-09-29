import { captureSessionContext, assertSessionContext, isSessionCurrent } from '../services/sessionScope';
import { useState } from 'react';
import {
    getObservations,
    processOfflineQueue,
    getOfflineQueueSnapshot,
    OfflineSyncResult,
} from '../services/storageService';
import type { Observation } from '../types';
import type { ToastType } from '../components/ToastContainer';

type ConnectionStatus = 'online' | 'offline' | 'degraded';

interface UseSyncQueueParams {
    /** Rafraîchit la snapshot de la file hors-ligne (hook useOfflineQueue). */
    refreshOfflineQueueSnapshot: () => void;
    /** Recharge la liste d'observations après une synchro réussie. */
    setObservations: (observations: Observation[]) => void;
    /** Met à jour le badge de connexion (online / degraded). */
    setConnectionStatus: (status: ConnectionStatus) => void;
    onToast: (type: ToastType, message: string, durationMs?: number) => void;
}

/**
 * Orchestration de la synchronisation de la file d'attente hors-ligne :
 * lance `processOfflineQueue`, suit la progression, recharge les observations,
 * met à jour le statut de connexion et notifie le résultat (succès / partiel /
 * erreur). Extraction d'`App.tsx` sans changement de comportement — la logique
 * de stockage elle-même reste dans `services/storageService`.
 */
export const useSyncQueue = ({
    refreshOfflineQueueSnapshot,
    setObservations,
    setConnectionStatus,
    onToast,
}: UseSyncQueueParams) => {
    const [context] = useState(() => { try { return captureSessionContext(); } catch { return null; } });
    const [lastSyncResult, setLastSyncResult] = useState<OfflineSyncResult | null>(null);
    const [isSyncingQueue, setIsSyncingQueue] = useState(false);
    const [syncProgress, setSyncProgress] = useState<{ current: number; total: number } | null>(null);

    const runQueueSync = async (itemIds?: string[]) => {
        if (!context || !isSessionCurrent(context)) return;
        // BUG-11 : hors-ligne, processOfflineQueue renvoie {processed:0, failed:0}
        // et tombait dans la branche succès → faux toast vert « 0 action(s)
        // synchronisée(s) ». On avertit explicitement sans rien tenter.
        if (!navigator.onLine) {
            onToast('warning', 'Hors-ligne — synchronisation impossible. Reconnectez-vous puis réessayez.', 5000);
            return;
        }
        setIsSyncingQueue(true);
        setSyncProgress(null);
        try {
            const syncResult = await processOfflineQueue({
                context,
                ...(itemIds && itemIds.length > 0 ? { itemIds } : {}),
                onProgress: (current, total) => { if (isSessionCurrent(context)) setSyncProgress({ current, total }); }
            });
            assertSessionContext(context);
            setLastSyncResult(syncResult);
            refreshOfflineQueueSnapshot();

            if (navigator.onLine) {
                const loadResult = await getObservations(context);
                assertSessionContext(context);
                setObservations(loadResult.observations);
            }

            if (syncResult.failed > 0) {
                setConnectionStatus('degraded');
                const queueSnapshot = getOfflineQueueSnapshot(context);
                const remaining = queueSnapshot.length;
                onToast('warning', `Sync partielle : ${syncResult.failed}/${syncResult.processed} échec(s).${remaining > 0 ? ` ${remaining} action(s) encore en file.` : ''}`, 7000);
            } else {
                if (navigator.onLine) setConnectionStatus('online');
                if (syncResult.processed > 0) {
                    onToast('success', `${syncResult.processed} action(s) synchronisée(s).`, 5000);
                } else {
                    onToast('info', 'Rien à synchroniser.', 4000);
                }
            }
        } catch (syncError) {
            if (!isSessionCurrent(context)) return;
            const message = syncError instanceof Error ? syncError.message : String(syncError);
            onToast('error', `Synchronisation impossible: ${message}`, 7000);
        } finally {
            if (isSessionCurrent(context)) { setIsSyncingQueue(false); setSyncProgress(null); }
        }
    };

    const resyncAll = async () => {
        await runQueueSync();
    };

    const retryQueueItem = async (itemId: string) => {
        await runQueueSync([itemId]);
    };

    return {
        lastSyncResult,
        isSyncingQueue,
        syncProgress,
        runQueueSync,
        resyncAll,
        retryQueueItem,
    };
};
