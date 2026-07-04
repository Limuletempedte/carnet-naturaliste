import React from 'react';
import { useAccessibleDialog } from '../hooks/useAccessibleDialog';

export interface StatsExportDialogState {
    startDate: string;
    endDate: string;
    includeVisualAssets: boolean;
}

interface StatsExportDialogProps {
    isOpen: boolean;
    isExporting: boolean;
    state: StatsExportDialogState;
    onStateChange: (next: StatsExportDialogState) => void;
    onClose: () => void;
    onConfirm: () => void;
}

const StatsExportDialog: React.FC<StatsExportDialogProps> = ({
    isOpen,
    isExporting,
    state,
    onStateChange,
    onClose,
    onConfirm
}) => {
    const { dialogRef, dialogProps } = useAccessibleDialog({ isOpen, onClose, titleId: 'stats-export-dialog-title' });

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center">
            <div ref={dialogRef} {...dialogProps} className="w-full max-w-xl liquid-glass-opaque animate-scaleIn rounded-2xl p-6">
                <h3 id="stats-export-dialog-title" className="text-2xl font-bold text-nature-dark dark:text-white mb-2">Export stats avancé</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-5">Mode léger (sans images/logos) + plage de dates pour export ciblé.</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                    <div>
                        <label htmlFor="stats-export-start-date" className="text-xs font-semibold text-gray-600 dark:text-gray-300">Date début</label>
                        <input
                            id="stats-export-start-date"
                            type="date"
                            value={state.startDate}
                            onChange={(e) => onStateChange({ ...state, startDate: e.target.value })}
                            className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm dark:text-white"
                        />
                    </div>
                    <div>
                        <label htmlFor="stats-export-end-date" className="text-xs font-semibold text-gray-600 dark:text-gray-300">Date fin</label>
                        <input
                            id="stats-export-end-date"
                            type="date"
                            value={state.endDate}
                            onChange={(e) => onStateChange({ ...state, endDate: e.target.value })}
                            className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm dark:text-white"
                        />
                    </div>
                </div>

                <label className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-white/10 p-3 mb-5">
                    <input
                        type="checkbox"
                        checked={state.includeVisualAssets}
                        onChange={(e) => onStateChange({ ...state, includeVisualAssets: e.target.checked })}
                    />
                    <div>
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Inclure images/logos</p>
                        <p className="text-xs text-gray-600 dark:text-gray-300">Décoche pour un export léger (plus rapide, taille réduite).</p>
                    </div>
                </label>

                {state.startDate && state.endDate && state.startDate > state.endDate && (
                    <p role="alert" className="text-xs text-red-500 mb-3">La date de début doit être antérieure à la date de fin.</p>
                )}

                <div className="flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        disabled={isExporting}
                        className={`px-3 py-2 rounded-lg text-sm font-semibold ${isExporting ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-white/5' : 'bg-gray-200 text-gray-700 dark:bg-white/10 dark:text-gray-200'}`}
                    >
                        Annuler
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isExporting || (!!state.startDate && !!state.endDate && state.startDate > state.endDate)}
                        className={`px-3 py-2 rounded-lg text-sm font-semibold text-white ${isExporting || (!!state.startDate && !!state.endDate && state.startDate > state.endDate) ? 'bg-gray-400 cursor-not-allowed' : 'bg-nature-green hover:bg-green-700'}`}
                    >
                        {isExporting ? 'Export...' : 'Lancer export'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default StatsExportDialog;
