import { useEffect, useMemo, useState } from 'react';
import { Status, TaxonomicGroup } from '../types';
import { safeGet, safeSet } from '../utils/safeStorage';
import { logger } from '../utils/logger';
import { generateUUID } from '../utils/uuidUtils';
import type { AdvancedFilterDialogState, FilterPreset } from '../components/AdvancedFilterDialog';
import type { ObservationFilterState, SortCriterion } from './useObservationFilters';
import type { ToastType } from '../components/ToastContainer';

export const FILTER_PRESETS_STORAGE_KEY = 'observation-filter-presets-v1';

export const createDefaultAdvancedFilterState = (): AdvancedFilterDialogState => ({
    geoMode: 'none',
    radiusCenterLat: '',
    radiusCenterLon: '',
    radiusKm: '',
    bboxMinLat: '',
    bboxMaxLat: '',
    bboxMinLon: '',
    bboxMaxLon: '',
    secondarySortKey: '',
    secondarySortDirection: 'ascending',
    tertiarySortKey: '',
    tertiarySortDirection: 'ascending'
});

export interface StoredFilterPreset extends FilterPreset {
    searchTerm: string;
    yearFilter: string;
    taxonomicGroupFilter: TaxonomicGroup | 'all';
    statusFilter: Status | 'all';
    startDateFilter: string;
    endDateFilter: string;
    advancedFilters: AdvancedFilterDialogState;
}

interface UseFilterControlsParams {
    /** Notifie l'utilisateur lors de l'enregistrement/application d'un preset. */
    onToast: (type: ToastType, message: string, durationMs?: number) => void;
}

/**
 * Regroupe l'état de filtrage des observations (recherche, année, groupe, statut,
 * intervalle de dates, filtres avancés géo/tri) et les presets de filtres
 * (persistés en localStorage). Produit l'objet `filters` et le tableau
 * `additionalSorts` directement consommables par {@link useObservationFilters}.
 *
 * Extraction d'`App.tsx` sans changement de comportement : les setters exposés
 * gardent les noms et signatures de `useState` pour être branchés tels quels.
 */
export const useFilterControls = ({ onToast }: UseFilterControlsParams) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [yearFilter, setYearFilter] = useState<string>('all');
    const [taxonomicGroupFilter, setTaxonomicGroupFilter] = useState<TaxonomicGroup | 'all'>('all');
    const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all');
    const [startDateFilter, setStartDateFilter] = useState<string>('');
    const [endDateFilter, setEndDateFilter] = useState<string>('');
    const [advancedFilterState, setAdvancedFilterState] = useState<AdvancedFilterDialogState>(() => createDefaultAdvancedFilterState());
    const [filterPresets, setFilterPresets] = useState<StoredFilterPreset[]>(() => {
        const raw = safeGet(FILTER_PRESETS_STORAGE_KEY);
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw) as StoredFilterPreset[];
            return Array.isArray(parsed) ? parsed : [];
        } catch (err) {
            logger.error('Presets de filtres corrompus dans localStorage, réinitialisation.', err);
            window.setTimeout(() => {
                window.dispatchEvent(new CustomEvent('storage-corruption-detected', { detail: { scope: 'presets' } }));
            }, 0);
            return [];
        }
    });

    useEffect(() => {
        try { safeSet(FILTER_PRESETS_STORAGE_KEY, JSON.stringify(filterPresets)); } catch { /* non-critical */ }
    }, [filterPresets]);

    const additionalSorts = useMemo(() => {
        const sorts: SortCriterion[] = [];
        if (advancedFilterState.secondarySortKey) {
            sorts.push({
                key: advancedFilterState.secondarySortKey,
                direction: advancedFilterState.secondarySortDirection
            });
        }
        if (advancedFilterState.tertiarySortKey) {
            sorts.push({
                key: advancedFilterState.tertiarySortKey,
                direction: advancedFilterState.tertiarySortDirection
            });
        }
        return sorts;
    }, [
        advancedFilterState.secondarySortDirection,
        advancedFilterState.secondarySortKey,
        advancedFilterState.tertiarySortDirection,
        advancedFilterState.tertiarySortKey
    ]);

    const filters: ObservationFilterState = useMemo(() => ({
        searchTerm,
        yearFilter,
        taxonomicGroupFilter,
        statusFilter,
        startDateFilter,
        endDateFilter,
        geoMode: advancedFilterState.geoMode,
        radiusCenterLat: advancedFilterState.radiusCenterLat,
        radiusCenterLon: advancedFilterState.radiusCenterLon,
        radiusKm: advancedFilterState.radiusKm,
        bboxMinLat: advancedFilterState.bboxMinLat,
        bboxMaxLat: advancedFilterState.bboxMaxLat,
        bboxMinLon: advancedFilterState.bboxMinLon,
        bboxMaxLon: advancedFilterState.bboxMaxLon
    }), [searchTerm, yearFilter, taxonomicGroupFilter, statusFilter, startDateFilter, endDateFilter, advancedFilterState]);

    const resetAdvancedFilters = () => {
        setAdvancedFilterState(createDefaultAdvancedFilterState());
    };

    const saveFilterPreset = (name: string) => {
        const newPreset: StoredFilterPreset = {
            id: generateUUID(),
            name,
            createdAt: new Date().toISOString(),
            searchTerm,
            yearFilter,
            taxonomicGroupFilter,
            statusFilter,
            startDateFilter,
            endDateFilter,
            advancedFilters: { ...advancedFilterState }
        };
        setFilterPresets(prev => [newPreset, ...prev]);
        onToast('success', `Preset sauvegardé: ${name}`, 4000);
    };

    const applyFilterPreset = (presetId: string) => {
        const preset = filterPresets.find(item => item.id === presetId);
        if (!preset) return;
        setSearchTerm(preset.searchTerm);
        setYearFilter(preset.yearFilter);
        setTaxonomicGroupFilter(preset.taxonomicGroupFilter);
        setStatusFilter(preset.statusFilter);
        setStartDateFilter(preset.startDateFilter);
        setEndDateFilter(preset.endDateFilter);
        setAdvancedFilterState({ ...preset.advancedFilters });
        onToast('info', `Preset appliqué: ${preset.name}`, 4000);
    };

    const deleteFilterPreset = (presetId: string) => {
        setFilterPresets(prev => prev.filter(item => item.id !== presetId));
    };

    return {
        searchTerm,
        setSearchTerm,
        yearFilter,
        setYearFilter,
        taxonomicGroupFilter,
        setTaxonomicGroupFilter,
        statusFilter,
        setStatusFilter,
        startDateFilter,
        setStartDateFilter,
        endDateFilter,
        setEndDateFilter,
        advancedFilterState,
        setAdvancedFilterState,
        filterPresets,
        filters,
        additionalSorts,
        resetAdvancedFilters,
        saveFilterPreset,
        applyFilterPreset,
        deleteFilterPreset,
    };
};
