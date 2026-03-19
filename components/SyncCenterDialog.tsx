import React from 'react';
import { OfflineQueueItem } from '../services/storageQueueUtils';
import { OfflineSyncResult } from '../services/storageService';

interface SyncCenterDialogProps {
    isOpen: boolean;
    queueItems: OfflineQueueItem[];
    lastResult: OfflineSyncResult | null;
    isSyncing: boolean;
    onClose: () => void;
    onResyncAll: () => void;
    onRetryItem: (itemId: string) => void;
}

const actionPillClass: Record<OfflineQueueItem['action'], string> = {
    INSERT: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300',
    UPDATE: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
    DELETE: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300'
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
    onClose,
    onResyncAll,
    onRetryItem
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center">
            <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-white dark:bg-nature-dark-surface rounded-2xl shadow-2xl border border-white/20 dark:border-white/10 p-6">
                <div className="flex items-center justify-between gap-4 mb-4">
                    <div>
                        <h3 className="text-2xl font-bold text-nature-dark dark:text-white">Centre de synchronisation</h3>
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

                <div className="flex items-center gap-3 mb-5">
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

                {lastResult && lastResult.failureReasons.length > 0 && (
                    <div className="mb-5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 p-3">
                        <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">Erreurs détaillées (dernier batch)</p>
                        <ul className="space-y-1">
                            {lastResult.failureReasons.map((reason) => (
                                <li key={reason} className="text-xs text-amber-800 dark:text-amber-200">{reason}</li>
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
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${actionPillClass[item.action]}`}>{item.action}</span>
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
