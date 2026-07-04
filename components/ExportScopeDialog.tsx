import React from 'react';
import { useAccessibleDialog } from '../hooks/useAccessibleDialog';

interface ExportScopeDialogProps {
    isOpen: boolean;
    filteredCount: number;
    totalCount: number;
    selectedCount?: number;
    onCancel: () => void;
    onSelectFiltered: () => void;
    onSelectAll: () => void;
    onSelectSelected?: () => void;
}

const buttonClass = "px-4 py-2 rounded-lg font-semibold transition-colors";

const ExportScopeDialog: React.FC<ExportScopeDialogProps> = ({
    isOpen,
    filteredCount,
    totalCount,
    selectedCount = 0,
    onCancel,
    onSelectFiltered,
    onSelectAll,
    onSelectSelected
}) => {
    const { dialogRef, dialogProps } = useAccessibleDialog({ isOpen, onClose: onCancel, titleId: 'export-scope-dialog-title' });

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center">
            <div ref={dialogRef} {...dialogProps} className="w-full max-w-lg liquid-glass-opaque animate-scaleIn rounded-2xl p-6">
                <h3 id="export-scope-dialog-title" className="text-2xl font-bold text-nature-dark dark:text-white mb-2">Choisir le périmètre d'export</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
                    Sélectionnez les données à exporter. L'annulation ferme simplement cette fenêtre sans lancer d'export.
                </p>

                <div className="space-y-3">
                    {selectedCount > 0 && onSelectSelected && (
                        <button
                            type="button"
                            onClick={onSelectSelected}
                            className={`${buttonClass} w-full text-left bg-purple-500/10 text-purple-700 hover:bg-purple-500/20 dark:text-purple-300`}
                        >
                            <span className="block font-semibold">Exporter la sélection ({selectedCount})</span>
                            <span className="block text-xs mt-0.5 opacity-80">Uniquement les observations cochées dans le tableau.</span>
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onSelectFiltered}
                        className={`${buttonClass} w-full text-left bg-nature-green/10 text-nature-green-text hover:bg-nature-green/20`}
                    >
                        <span className="block font-semibold">Exporter les observations filtrées ({filteredCount})</span>
                        <span className="block text-xs mt-0.5 opacity-80">{filteredCount === totalCount ? 'Aucun filtre actif — correspond à toutes vos observations.' : 'Résultat des filtres actuellement appliqués.'}</span>
                    </button>
                    <button
                        type="button"
                        onClick={onSelectAll}
                        className={`${buttonClass} w-full text-left bg-blue-500/10 text-blue-700 hover:bg-blue-500/20 dark:text-blue-300`}
                    >
                        <span className="block font-semibold">Exporter toutes les observations ({totalCount})</span>
                        <span className="block text-xs mt-0.5 opacity-80">L&apos;intégralité de votre carnet, sans tenir compte des filtres.</span>
                    </button>
                </div>

                <div className="mt-6 flex justify-end">
                    <button
                        type="button"
                        onClick={onCancel}
                        className={`${buttonClass} bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-white/10 dark:text-white dark:hover:bg-white/20`}
                    >
                        Annuler
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ExportScopeDialog;

