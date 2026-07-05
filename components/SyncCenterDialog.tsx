import React from 'react';
import { OfflineQueueItem } from '../services/storageQueueUtils';
import { OfflineSyncResult, SkippedSyncItem } from '../services/storageService';
import { useAccessibleDialog } from '../hooks/useAccessibleDialog';
import { getEventLog, EventLogEntry } from '../utils/eventLog';

interface SyncCenterDialogProps {
    isOpen: boolean;
    queueItems: OfflineQueueItem[];
    lastResult: OfflineSyncResult | null;
    isSyncing: boolean;
    syncProgress?: { current: number; total: number } | null;
    onClose: () => void;
    onResyncAll: () => void;
    onRetryItem: (itemId: string) => void;
}

const actionPillClass: Record<OfflineQueueItem['action'], string> = {
    INSERT: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300',
    UPDATE: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
    DELETE: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300'
};

const actionLabel: Record<OfflineQueueItem['action'], string> = {
    INSERT: 'Ajout',
    UPDATE: 'Modification',
    DELETE: 'Suppression'
};

const formatTimestamp = (value: number): string => {
    try {
        return new Date(value).toLocaleString('fr-FR');
    } catch {
        return String(value);
    }
};

const getQueueItemLabel = (item: OfflineQueueItem): string => {
    if (item.action === 'DELETE') {
        return (item.payload as { id: string }).id || 'ID inconnu';
    }

    const payload = item.payload as { speciesName?: string; latinName?: string; id?: string };
    return payload.speciesName || payload.latinName || payload.id || 'Observation sans libellé';
};

const SyncCenterDialog: React.FC<SyncCenterDialogProps> = ({
    isOpen,
    queueItems,
    lastResult,
    isSyncing,
    syncProgress,
    onClose,
    onResyncAll,
    onRetryItem
}) => {
    const { dialogRef, dialogProps } = useAccessibleDialog({ isOpen, onClose, titleId: 'sync-center-dialog-title' });

    // SR-17 : derniers évènements applicatifs (warn/error). Relu à chaque ouverture.
    const recentEvents = React.useMemo<EventLogEntry[]>(() => {
        if (!isOpen) return [];
        const all = getEventLog();
        return all.slice(-10).reverse();
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center">
            <div ref={dialogRef} {...dialogProps} className="w-full max-w-4xl max-h-[90vh] overflow-y-auto liquid-glass-opaque animate-scaleIn rounded-2xl p-6">
                <div className="flex items-center justify-between gap-4 mb-4">
                    <div>
                        <h3 id="sync-center-dialog-title" className="text-2xl font-bold text-nature-dark dark:text-white">Centre de synchronisation</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-300">Suivi de la file hors-ligne, relance ciblée, resync globale.</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-white/10 text-sm font-semibold text-gray-700 dark:text-gray-200"
                    >
                        Fermer
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
                    <div className="rounded-xl bg-gray-100 dark:bg-white/10 p-3">
                        <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Items en attente</p>
                        <p className="text-xl font-bold dark:text-white">{queueItems.length}</p>
                    </div>
                    <div className="rounded-xl bg-gray-100 dark:bg-white/10 p-3">
                        <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Dernier batch traité</p>
                        <p className="text-xl font-bold dark:text-white">{lastResult?.processed ?? 0}</p>
                    </div>
                    <div className="rounded-xl bg-gray-100 dark:bg-white/10 p-3">
                        <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Derniers échecs</p>
                        <p className="text-xl font-bold dark:text-white">{lastResult?.failed ?? 0}</p>
                    </div>
                </div>

                <div className="flex items-center gap-3 mb-3">
                    <button
                        onClick={onResyncAll}
                        disabled={isSyncing}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold text-white ${isSyncing ? 'bg-gray-400 cursor-not-allowed' : 'bg-nature-green hover:bg-green-700'}`}
                    >
                        {isSyncing ? 'Synchronisation...' : 'Resync maintenant'}
                    </button>
                    <span className="text-xs text-gray-600 dark:text-gray-300">
                        Relance l&apos;ensemble de la file et rafraîchit les observations.
                    </span>
                </div>

                {isSyncing && syncProgress && syncProgress.total > 0 && (
                    <div className="mb-5">
                        <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-300 mb-1">
                            <span>Progression</span>
                            <span>{syncProgress.current}/{syncProgress.total}</span>
                        </div>
                        <div className="w-full h-2 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-nature-green rounded-full transition-all duration-300"
                                style={{ width: `${Math.round((syncProgress.current / syncProgress.total) * 100)}%` }}
                            />
                        </div>
                    </div>
                )}

                {lastResult && lastResult.failureReasons.length > 0 && (
                    <div className="mb-5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 p-3">
                        <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">Erreurs détaillées (dernier batch)</p>
                        <ul className="space-y-1 max-h-40 overflow-y-auto">
                            {Object.entries(lastResult.failureReasons.reduce<Record<string, number>>((acc, reason) => {
                                acc[reason] = (acc[reason] || 0) + 1;
                                return acc;
                            }, {})).map(([reason, count]) => (
                                <li key={reason} className="text-xs text-amber-800 dark:text-amber-200">
                                    {reason}{count > 1 ? ` (x${count})` : ''}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {lastResult && lastResult.skippedItems.length > 0 && (
                    <div className="mb-5 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 p-3">
                        <p className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-2">Items ignorés — ID temporaire sans correspondance ({lastResult.skippedItems.length})</p>
                        <ul className="space-y-1 max-h-40 overflow-y-auto">
                            {lastResult.skippedItems.map((item: SkippedSyncItem) => (
                                <li key={item.id} className="text-xs text-blue-800 dark:text-blue-200">
                                    <span className="font-semibold">{actionLabel[item.action as OfflineQueueItem['action']] || item.action}</span> {item.id.slice(0, 12)}… — {item.reason}
                                </li>
                            ))}
                        </ul>
                        <p className="text-xs text-blue-600 dark:text-blue-300 mt-2">Ces items nécessitent que l&apos;INSERT original soit synchronisé en premier.</p>
                    </div>
                )}

                {recentEvents.length > 0 && (
                    <div className="mb-5 rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden">
                        <div className="px-4 py-2 bg-gray-50 dark:bg-white/5 border-b border-gray-200 dark:border-white/10 text-sm font-semibold text-gray-700 dark:text-gray-200">
                            Derniers évènements ({recentEvents.length})
                        </div>
                        <ul className="divide-y divide-gray-100 dark:divide-white/10 max-h-60 overflow-y-auto">
                            {recentEvents.map((evt, idx) => (
                                <li key={`${evt.ts}-${idx}`} className="px-4 py-2 flex items-start gap-2">
                                    <span
                                        className={`mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                                            evt.level === 'error'
                                                ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300'
                                                : evt.level === 'warn'
                                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200'
                                                    : 'bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300'
                                        }`}
                                    >
                                        {evt.level}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{formatTimestamp(evt.ts)}</p>
                                        <p className="text-sm text-gray-800 dark:text-gray-100 break-words">{evt.msg}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <div className="rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden">
                    <div className="px-4 py-2 bg-gray-50 dark:bg-white/5 border-b border-gray-200 dark:border-white/10 text-sm font-semibold text-gray-700 dark:text-gray-200">
                        File hors-ligne
                    </div>
                    <div className="divide-y divide-gray-100 dark:divide-white/10">
                        {queueItems.length === 0 ? (
                            <div className="p-4 text-sm text-gray-600 dark:text-gray-300">Aucun item en attente.</div>
                        ) : (
                            queueItems.map((item) => (
                                <div key={item.id} className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${actionPillClass[item.action]}`}>{actionLabel[item.action]}</span>
                                            <span className="text-xs text-gray-500 dark:text-gray-400">{formatTimestamp(item.timestamp)}</span>
                                        </div>
                                        <p className="text-sm font-semibold text-nature-dark dark:text-white truncate">{getQueueItemLabel(item)}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">Queue ID: {item.id}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => onRetryItem(item.id)}
                                            disabled={isSyncing}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${isSyncing ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-white/5' : 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-500/20 dark:text-blue-200'}`}
                                        >
                                            Retenter cet item
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SyncCenterDialog;
