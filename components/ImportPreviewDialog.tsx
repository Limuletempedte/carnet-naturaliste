import React from 'react';
import { ImportResult } from '../services/excelImportService';

interface ImportPreviewDialogProps {
    isOpen: boolean;
    fileName: string;
    result: ImportResult | null;
    isImporting: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}

const ImportPreviewDialog: React.FC<ImportPreviewDialogProps> = ({
    isOpen,
    fileName,
    result,
    isImporting,
    onCancel,
    onConfirm
}) => {
    if (!isOpen || !result) return null;

    const previewRows = result.observations.slice(0, 5);
    const warningRows = result.report.warnings.slice(0, 10);
    const validationErrorRows = result.report.errors.slice(0, 10);
    const blockingErrorRows = result.report.blockingErrors.slice(0, 10);
    const hiddenWarnings = Math.max(0, result.report.warnings.length - warningRows.length);
    const hiddenValidationErrors = Math.max(0, result.report.errors.length - validationErrorRows.length);
    const hiddenBlockingErrors = Math.max(0, result.report.blockingErrors.length - blockingErrorRows.length);
    const hasBlockingErrors = result.report.blockingErrors.length > 0;

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center">
            <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-white dark:bg-nature-dark-surface rounded-2xl shadow-2xl border border-white/20 dark:border-white/10 p-6">
                <h3 className="text-2xl font-bold text-nature-dark dark:text-white mb-2">Prévisualisation de l'import</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
                    Fichier: <span className="font-semibold">{fileName}</span>
                </p>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-6">
                    <div className="rounded-xl bg-gray-100 dark:bg-white/10 p-3">
                        <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Lignes</p>
                        <p className="text-lg font-bold dark:text-white">{result.report.totalRows}</p>
                    </div>
                    <div className="rounded-xl bg-gray-100 dark:bg-white/10 p-3">
                        <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Valides</p>
                        <p className="text-lg font-bold dark:text-white">{result.report.validRows}</p>
                    </div>
                    <div className="rounded-xl bg-gray-100 dark:bg-white/10 p-3">
                        <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Warnings</p>
                        <p className="text-lg font-bold dark:text-white">{result.report.warnings.length}</p>
                    </div>
                    <div className="rounded-xl bg-gray-100 dark:bg-white/10 p-3">
                        <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Collisions ID</p>
                        <p className="text-lg font-bold dark:text-white">{result.report.idCollisions}</p>
                    </div>
                    <div className="rounded-xl bg-orange-100 dark:bg-orange-500/10 p-3">
                        <p className="text-xs uppercase tracking-wide text-orange-700 dark:text-orange-300">Erreurs validation</p>
                        <p className="text-lg font-bold text-orange-700 dark:text-orange-200">{result.report.errors.length}</p>
                    </div>
                    <div className="rounded-xl bg-red-100 dark:bg-red-500/10 p-3 md:col-span-5">
                        <p className="text-xs uppercase tracking-wide text-red-700 dark:text-red-300">Erreurs bloquantes avant import</p>
                        <p className="text-lg font-bold text-red-700 dark:text-red-200">{result.report.blockingErrors.length}</p>
                    </div>
                </div>

                <div className="mb-6">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Aperçu (5 premières lignes)</h4>
                    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-white/10">
                        <table className="min-w-full text-sm">
                            <thead className="bg-gray-50 dark:bg-white/5">
                                <tr>
                                    <th className="text-left px-3 py-2">Espèce</th>
                                    <th className="text-left px-3 py-2">Date</th>
                                    <th className="text-left px-3 py-2">Groupe</th>
                                    <th className="text-left px-3 py-2">ID</th>
                                </tr>
                            </thead>
                            <tbody>
                                {previewRows.map(obs => (
                                    <tr key={obs.id} className="border-t border-gray-100 dark:border-white/5">
                                        <td className="px-3 py-2 dark:text-white">{obs.speciesName}</td>
                                        <td className="px-3 py-2 dark:text-white">{obs.date}</td>
                                        <td className="px-3 py-2 dark:text-white">{obs.taxonomicGroup}</td>
                                        <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-300">{obs.id}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {warningRows.length > 0 && (
                    <div className="mb-6">
                        <h4 className="text-sm font-semibold text-amber-700 dark:text-amber-300 mb-2">Warnings (premiers éléments)</h4>
                        <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 p-3 space-y-2 max-h-48 overflow-y-auto">
                            {warningRows.map((w, idx) => (
                                <p key={`${w.row}-${w.field}-${idx}`} className="text-xs text-amber-800 dark:text-amber-200">
                                    Ligne {w.row} - {w.field}: {w.message} ({w.original || 'vide'} {'->'} {w.applied})
                                </p>
                            ))}
                            {hiddenWarnings > 0 && (
                                <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                                    + {hiddenWarnings} warning(s) supplémentaire(s)
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {validationErrorRows.length > 0 && (
                    <div className="mb-6">
                        <h4 className="text-sm font-semibold text-orange-700 dark:text-orange-300 mb-2">Erreurs de validation fichier</h4>
                        <div className="rounded-xl bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/30 p-3 space-y-2 max-h-48 overflow-y-auto">
                            {validationErrorRows.map((e, idx) => (
                                <p key={`${e.row}-${e.field}-${idx}`} className="text-xs text-orange-800 dark:text-orange-200">
                                    Ligne {e.row} - {e.field}: {e.message} ({e.original || 'vide'})
                                </p>
                            ))}
                            {hiddenValidationErrors > 0 && (
                                <p className="text-xs font-semibold text-orange-800 dark:text-orange-200">
                                    + {hiddenValidationErrors} erreur(s) supplémentaire(s)
                                </p>
                            )}
                        </div>
                    </div>
                )}
                {blockingErrorRows.length > 0 && (
                    <div className="mb-6">
                        <h4 className="text-sm font-semibold text-red-700 dark:text-red-300 mb-2">Erreurs bloquantes avant import</h4>
                        <div className="rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 p-3 space-y-2 max-h-48 overflow-y-auto">
                            {blockingErrorRows.map((e, idx) => (
                                <p key={`${e.row}-${e.field}-${idx}`} className="text-xs text-red-800 dark:text-red-200">
                                    Ligne {e.row} - {e.field}: {e.message} ({e.original || 'vide'})
                                </p>
                            ))}
                            {hiddenBlockingErrors > 0 && (
                                <p className="text-xs font-semibold text-red-800 dark:text-red-200">
                                    + {hiddenBlockingErrors} erreur(s) bloquante(s) supplémentaire(s)
                                </p>
                            )}
                        </div>
                    </div>
                )}

                <p className="text-xs text-gray-600 dark:text-gray-300 mb-6">
                    Note: des erreurs serveur (droits, connexion, contraintes base) peuvent encore survenir au moment de l'import.
                </p>

                <div className="mt-8 flex justify-end gap-4 border-t border-gray-100 dark:border-white/10 pt-4">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={isImporting}
                        className={`px-4 py-2 rounded-lg font-semibold ${isImporting
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                : 'bg-gray-200 hover:bg-gray-300 text-gray-800'
                            }`}
                    >
                        Annuler
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={hasBlockingErrors || isImporting}
                        className={`px-4 py-2 rounded-lg text-white font-semibold ${hasBlockingErrors || isImporting
                                ? 'bg-gray-400 cursor-not-allowed'
                                : 'bg-nature-green hover:bg-green-700'
                            }`}
                    >
                        {isImporting
                            ? 'Import en cours...'
                            : hasBlockingErrors
                                ? 'Import bloqué (corriger blocages)'
                                : "Confirmer l'import"
                        }
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ImportPreviewDialog;
