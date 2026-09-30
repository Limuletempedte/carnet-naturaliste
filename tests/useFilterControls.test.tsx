import { setSessionIdentity } from '../services/sessionScope';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFilterControls, FILTER_PRESETS_STORAGE_KEY } from '../hooks/useFilterControls';
import { Status, TaxonomicGroup } from '../types';

describe('useFilterControls', () => {
    beforeEach(() => {
        localStorage.clear();
        setSessionIdentity('user-1');
    });

    it('expose des filtres par défaut et un objet `filters` cohérent', () => {
        const { result } = renderHook(() => useFilterControls({ onToast: vi.fn() }));
        expect(result.current.searchTerm).toBe('');
        expect(result.current.yearFilter).toBe('all');
        expect(result.current.filterPresets).toEqual([]);
        expect(result.current.filters).toMatchObject({
            searchTerm: '',
            yearFilter: 'all',
            taxonomicGroupFilter: 'all',
            statusFilter: 'all',
            geoMode: 'none'
        });
        expect(result.current.additionalSorts).toEqual([]);
    });

    it('sauvegarde un preset (état courant), le persiste et notifie', () => {
        const onToast = vi.fn();
        const { result } = renderHook(() => useFilterControls({ onToast }));

        act(() => {
            result.current.setSearchTerm('renard');
            result.current.setYearFilter('2026');
            result.current.setStatusFilter(Status.VU);
            result.current.setTaxonomicGroupFilter(TaxonomicGroup.MAMMAL);
        });
        act(() => {
            result.current.saveFilterPreset('Mon preset');
        });

        expect(result.current.filterPresets).toHaveLength(1);
        const preset = result.current.filterPresets[0];
        expect(preset).toMatchObject({
            name: 'Mon preset',
            searchTerm: 'renard',
            yearFilter: '2026',
            statusFilter: Status.VU,
            taxonomicGroupFilter: TaxonomicGroup.MAMMAL
        });
        expect(onToast).toHaveBeenCalledWith('success', expect.stringContaining('Mon preset'), 4000);

        // Persistance localStorage
        const raw = localStorage.getItem(`${FILTER_PRESETS_STORAGE_KEY}:user-1`);
        expect(raw).toBeTruthy();
        expect(JSON.parse(raw as string)).toHaveLength(1);
    });

    it('applique un preset (restaure tous les filtres) et notifie', () => {
        const onToast = vi.fn();
        const { result } = renderHook(() => useFilterControls({ onToast }));

        // act séparés : saveFilterPreset lit l'état du rendu courant, il faut donc
        // que setSearchTerm/setYearFilter aient déjà été appliqués (re-render).
        act(() => {
            result.current.setSearchTerm('mésange');
            result.current.setYearFilter('2025');
        });
        act(() => {
            result.current.saveFilterPreset('P1');
        });
        const presetId = result.current.filterPresets[0].id;

        // On modifie les filtres, puis on réapplique le preset.
        act(() => {
            result.current.setSearchTerm('autre chose');
            result.current.setYearFilter('all');
        });
        act(() => {
            result.current.applyFilterPreset(presetId);
        });

        expect(result.current.searchTerm).toBe('mésange');
        expect(result.current.yearFilter).toBe('2025');
        expect(onToast).toHaveBeenCalledWith('info', expect.stringContaining('P1'), 4000);
    });

    it('supprime un preset', () => {
        const { result } = renderHook(() => useFilterControls({ onToast: vi.fn() }));
        act(() => { result.current.saveFilterPreset('A'); });
        act(() => { result.current.saveFilterPreset('B'); });
        expect(result.current.filterPresets).toHaveLength(2);

        const idToDelete = result.current.filterPresets[0].id;
        act(() => { result.current.deleteFilterPreset(idToDelete); });

        expect(result.current.filterPresets).toHaveLength(1);
        expect(result.current.filterPresets.some(p => p.id === idToDelete)).toBe(false);
    });

    it('charge les presets existants depuis localStorage au montage', () => {
        const stored = [{
            id: 'p-1', name: 'Stocké', createdAt: '2026-01-01T00:00:00.000Z',
            searchTerm: 'loutre', yearFilter: 'all', taxonomicGroupFilter: 'all',
            statusFilter: 'all', startDateFilter: '', endDateFilter: '',
            advancedFilters: { geoMode: 'none' }
        }];
        localStorage.setItem(`${FILTER_PRESETS_STORAGE_KEY}:user-1`, JSON.stringify(stored));

        const { result } = renderHook(() => useFilterControls({ onToast: vi.fn() }));
        expect(result.current.filterPresets).toHaveLength(1);
        expect(result.current.filterPresets[0].name).toBe('Stocké');
    });

    it('reset des filtres avancés revient aux valeurs par défaut', () => {
        const { result } = renderHook(() => useFilterControls({ onToast: vi.fn() }));
        act(() => {
            result.current.setAdvancedFilterState(prev => ({ ...prev, geoMode: 'radius', radiusKm: '10' }));
        });
        expect(result.current.advancedFilterState.geoMode).toBe('radius');

        act(() => { result.current.resetAdvancedFilters(); });
        expect(result.current.advancedFilterState.geoMode).toBe('none');
        expect(result.current.advancedFilterState.radiusKm).toBe('');
    });
});
