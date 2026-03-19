import React from 'react';
import { SortDirection, SortKey } from '../hooks/useObservationFilters';

export interface AdvancedFilterDialogState {
    geoMode: 'none' | 'radius' | 'bbox';
    radiusCenterLat: string;
    radiusCenterLon: string;
    radiusKm: string;
    bboxMinLat: string;
    bboxMaxLat: string;
    bboxMinLon: string;
    bboxMaxLon: string;
    secondarySortKey: SortKey;
    secondarySortDirection: SortDirection;
    tertiarySortKey: SortKey;
    tertiarySortDirection: SortDirection;
}

export interface FilterPreset {
    id: string;
    name: string;
    createdAt: string;
}

interface AdvancedFilterDialogProps {
    isOpen: boolean;
    state: AdvancedFilterDialogState;
    presets: FilterPreset[];
    onClose: () => void;
    onStateChange: (next: AdvancedFilterDialogState) => void;
    onReset: () => void;
    onSavePreset: (name: string) => void;
    onApplyPreset: (presetId: string) => void;
    onDeletePreset: (presetId: string) => void;
}

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
    { value: '', label: 'Aucun tri supplémentaire' },
    { value: 'date', label: 'Date' },
    { value: 'speciesName', label: 'Espèce' },
    { value: 'latinName', label: 'Nom latin' },
    { value: 'taxonomicGroup', label: 'Groupe taxonomique' },
    { value: 'count', label: 'Nombre' },
    { value: 'status', label: 'Statut' },
    { value: 'location', label: 'Lieu' },
    { value: 'municipality', label: 'Commune' }
];

const AdvancedFilterDialog: React.FC<AdvancedFilterDialogProps> = ({
    isOpen,
    state,
    presets,
    onClose,
    onStateChange,
    onReset,
    onSavePreset,
    onApplyPreset,
    onDeletePreset
}) => {
    const [presetName, setPresetName] = React.useState('');

    if (!isOpen) return null;

    const updateState = (patch: Partial<AdvancedFilterDialogState>) => {
        onStateChange({ ...state, ...patch });
    };

    const handleSavePreset = () => {
        const cleanName = presetName.trim();
        if (!cleanName) return;
        onSavePreset(cleanName);
        setPresetName('');
    };

    return (
        <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center">
            <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-white dark:bg-nature-dark-surface rounded-2xl shadow-2xl border border-white/20 dark:border-white/10 p-6">
                <div className="flex items-center justify-between gap-4 mb-5">
                    <div>
                        <h3 className="text-2xl font-bold text-nature-dark dark:text-white">Filtres avancés</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-300">Geo-filtres, tri multi-critères et presets sauvegardés.</p>
                    </div>
                    <button onClick={onClose} className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-white/10 text-sm font-semibold text-gray-700 dark:text-gray-200">
                        Fermer
                    </button>
                </div>

                <section className="rounded-xl border border-gray-200 dark:border-white/10 p-4 mb-5">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Filtre géographique</h4>
                    <div className="flex flex-wrap gap-2 mb-3">
                        <button onClick={() => updateState({ geoMode: 'none' })} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${state.geoMode === 'none' ? 'bg-nature-green text-white' : 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300'}`}>Aucun</button>
                        <button onClick={() => updateState({ geoMode: 'radius' })} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${state.geoMode === 'radius' ? 'bg-nature-green text-white' : 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300'}`}>Rayon</button>
                        <button onClick={() => updateState({ geoMode: 'bbox' })} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${state.geoMode === 'bbox' ? 'bg-nature-green text-white' : 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300'}`}>BBox</button>
                    </div>
                    {state.geoMode === 'radius' && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <input type="number" step="any" placeholder="Lat centre" value={state.radiusCenterLat} onChange={(e) => updateState({ radiusCenterLat: e.target.value })} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm dark:text-white" />
                            <input type="number" step="any" placeholder="Lon centre" value={state.radiusCenterLon} onChange={(e) => updateState({ radiusCenterLon: e.target.value })} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm dark:text-white" />
                            <input type="number" step="any" placeholder="Rayon (km)" value={state.radiusKm} onChange={(e) => updateState({ radiusKm: e.target.value })} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm dark:text-white" />
                        </div>
                    )}
                    {state.geoMode === 'bbox' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <input type="number" step="any" placeholder="Lat min" value={state.bboxMinLat} onChange={(e) => updateState({ bboxMinLat: e.target.value })} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm dark:text-white" />
                            <input type="number" step="any" placeholder="Lat max" value={state.bboxMaxLat} onChange={(e) => updateState({ bboxMaxLat: e.target.value })} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm dark:text-white" />
                            <input type="number" step="any" placeholder="Lon min" value={state.bboxMinLon} onChange={(e) => updateState({ bboxMinLon: e.target.value })} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm dark:text-white" />
                            <input type="number" step="any" placeholder="Lon max" value={state.bboxMaxLon} onChange={(e) => updateState({ bboxMaxLon: e.target.value })} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm dark:text-white" />
                        </div>
                    )}
                </section>

                <section className="rounded-xl border border-gray-200 dark:border-white/10 p-4 mb-5">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Tri multi-critères</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Critère secondaire</label>
                            <select value={state.secondarySortKey} onChange={(e) => updateState({ secondarySortKey: e.target.value as SortKey })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm dark:text-white">
                                {SORT_OPTIONS.map(option => <option key={`secondary-${option.value || 'none'}`} value={option.value}>{option.label}</option>)}
                            </select>
                            <select value={state.secondarySortDirection} onChange={(e) => updateState({ secondarySortDirection: e.target.value as SortDirection })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm dark:text-white">
                                <option value="ascending">Ascendant</option>
                                <option value="descending">Descendant</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Critère tertiaire</label>
                            <select value={state.tertiarySortKey} onChange={(e) => updateState({ tertiarySortKey: e.target.value as SortKey })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm dark:text-white">
                                {SORT_OPTIONS.map(option => <option key={`tertiary-${option.value || 'none'}`} value={option.value}>{option.label}</option>)}
                            </select>
                            <select value={state.tertiarySortDirection} onChange={(e) => updateState({ tertiarySortDirection: e.target.value as SortDirection })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm dark:text-white">
                                <option value="ascending">Ascendant</option>
                                <option value="descending">Descendant</option>
                            </select>
                        </div>
                    </div>
                </section>

                <section className="rounded-xl border border-gray-200 dark:border-white/10 p-4 mb-5">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Presets</h4>
                    <div className="flex flex-wrap gap-2 mb-3">
                        <input
                            type="text"
                            value={presetName}
                            onChange={(e) => setPresetName(e.target.value)}
                            placeholder="Nom du preset"
                            className="flex-1 min-w-[220px] px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm dark:text-white"
                        />
                        <button onClick={handleSavePreset} className="px-3 py-2 rounded-lg bg-nature-green text-white text-sm font-semibold">Sauvegarder</button>
                    </div>
                    <div className="space-y-2">
                        {presets.length === 0 ? (
                            <p className="text-xs text-gray-500 dark:text-gray-400">Aucun preset sauvegardé.</p>
                        ) : (
                            presets.map((preset) => (
                                <div key={preset.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 dark:border-white/10 p-2">
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{preset.name}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{new Date(preset.createdAt).toLocaleString('fr-FR')}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => onApplyPreset(preset.id)} className="px-2.5 py-1.5 rounded-md bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200 text-xs font-semibold">Appliquer</button>
                                        <button onClick={() => onDeletePreset(preset.id)} className="px-2.5 py-1.5 rounded-md bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-200 text-xs font-semibold">Supprimer</button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </section>

                <div className="flex justify-end gap-3">
                    <button onClick={onReset} className="px-3 py-2 rounded-lg bg-gray-200 dark:bg-white/10 text-sm font-semibold text-gray-700 dark:text-gray-200">Réinitialiser avancé</button>
                    <button onClick={onClose} className="px-3 py-2 rounded-lg bg-nature-green text-white text-sm font-semibold">Appliquer</button>
                </div>
            </div>
        </div>
    );
};

export default AdvancedFilterDialog;
