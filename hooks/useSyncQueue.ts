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
    const [lastSyncResult, setLastSyncResult] = useState<OfflineSyncResult | null>(null);
    const [isSyncingQueue, setIsSyncingQueue] = useState(false);
    const [syncProgress, setSyncProgress] = useState<{ current: number; total: number } | null>(null);

    const runQueueSync = async (itemIds?: string[]) => {
        setIsSyncingQueue(true);
        setSyncProgress(null);
        try {
            const syncResult = await processOfflineQueue({
                ...(itemIds && itemIds.length > 0 ? { itemIds } : {}),
                onProgress: (current, total) => setSyncProgress({ current, total })
            });
            setLastSyncResult(syncResult);
            refreshOfflineQueueSnapshot();

            if (navigator.onLine) {
                const loadResult = await getObservations();
                setObservations(loadResult.observations);
            }

            if (syncResult.failed > 0) {
                setConnectionStatus('degraded');
                const queueSnapshot = getOfflineQueueSnapshot();
                const remaining = queueSnapshot.length;
                onToast('warning', `Sync partielle : ${syncResult.failed}/${syncResult.processed} échec(s).${remaining > 0 ? ` ${remaining} action(s) encore en file.` : ''}`, 7000);
            } else {
                if (navigator.onLine) setConnectionStatus('online');
                onToast('success', `${syncResult.processed} action(s) synchronisée(s).`, 5000);
            }
        } catch (syncError) {
            const message = syncError instanceof Error ? syncError.message : String(syncError);
            onToast('error', `Synchronisation impossible: ${message}`, 7000);
        } finally {
            setIsSyncingQueue(false);
            setSyncProgress(null);
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
