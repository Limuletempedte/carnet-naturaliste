import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFilterControls } from '../hooks/useFilterControls';
import { setSessionIdentity } from '../services/sessionScope';
import { Status, TaxonomicGroup } from '../types';
import { emptyCriteria, type SearchCriteria } from '../utils/aiSearchFilters';

const criteria = (overrides: Partial<SearchCriteria> = {}): SearchCriteria => ({ ...emptyCriteria(), ...overrides });

describe('useFilterControls : recherche en langage naturel', () => {
    beforeEach(() => {
        localStorage.clear();
        setSessionIdentity('user-1');
        // Horloge figée : « le mois dernier » = octobre 2026.
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(2026, 10, 21, 12, 0, 0));
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('applique : filtres existants écrits, le reste dans l’AiFilter ; les filtres d’avant sont remplacés', () => {
        const { result } = renderHook(() => useFilterControls({ onToast: vi.fn() }));
        act(() => { result.current.setYearFilter('2020'); result.current.setSearchTerm('renard'); });
        act(() => {
            result.current.applyNaturalSearch({
                phrase: 'les rapaces le mois dernier',
                source: 'local',
                criteria: criteria({ period: { kind: 'last_month', days: null, month: null, season: null, yearScope: null }, categories: ['rapaces_diurnes', 'rapaces_nocturnes'] }),
            });
        });
        expect(result.current.yearFilter).toBe('all');
        expect(result.current.searchTerm).toBe('');
        expect(result.current.startDateFilter).toBe('2026-10-01');
        expect(result.current.endDateFilter).toBe('2026-10-31');
        expect(result.current.filters.aiFilter?.categories).toEqual(['rapaces_diurnes', 'rapaces_nocturnes']);
        expect(result.current.naturalSearch?.plan.chips).toHaveLength(3);
        expect(result.current.hasActiveFilters).toBe(true);
    });

    it('retire une étiquette à la fois, puis plus rien quand la dernière part', () => {
        const { result } = renderHook(() => useFilterControls({ onToast: vi.fn() }));
        act(() => {
            result.current.applyNaturalSearch({ phrase: 'p', source: 'ai', criteria: criteria({ years: [2024], statuses: [Status.VU, Status.EN] }) });
        });
        expect(result.current.yearFilter).toBe('2024');
        expect(result.current.filters.aiFilter?.statuses).toEqual([Status.VU, Status.EN]);
        act(() => { result.current.removeNaturalCriterion({ field: 'statuses', value: Status.EN }); });
        // Un seul statut restant : il passe dans le filtre existant.
        expect(result.current.statusFilter).toBe(Status.VU);
        expect(result.current.filters.aiFilter).toBeNull();
        expect(result.current.yearFilter).toBe('2024');
        act(() => { result.current.removeNaturalCriterion({ field: 'years' }); });
        expect(result.current.yearFilter).toBe('all');
        act(() => { result.current.removeNaturalCriterion({ field: 'statuses', value: Status.VU }); });
        expect(result.current.statusFilter).toBe('all');
        expect(result.current.naturalSearch).toBeNull();
    });

    it('un filtre changé à la main retire le critère qui l’avait écrit (et lui seul)', () => {
        const { result } = renderHook(() => useFilterControls({ onToast: vi.fn() }));
        act(() => {
            result.current.applyNaturalSearch({
                phrase: 'p', source: 'local',
                criteria: criteria({ period: { kind: 'last_month', days: null, month: null, season: null, yearScope: null }, groups: [TaxonomicGroup.BIRD] }),
            });
        });
        act(() => { result.current.setStartDateFilter('2026-01-01'); });
        expect(result.current.startDateFilter).toBe('2026-01-01');
        // La fin de la période retirée ne reste pas, invisible.
        expect(result.current.endDateFilter).toBe('');
        expect(result.current.naturalSearch?.criteria.period).toBeNull();
        expect(result.current.taxonomicGroupFilter).toBe(TaxonomicGroup.BIRD);
        expect(result.current.naturalSearch?.plan.chips.map(chip => chip.id)).toEqual(['groups:Oiseaux']);
    });

    it('« Annuler la recherche » rend les filtres d’avant ; « Réinitialiser » efface tout, AiFilter compris', () => {
        const { result } = renderHook(() => useFilterControls({ onToast: vi.fn() }));
        act(() => { result.current.setYearFilter('2020'); });
        act(() => {
            result.current.applyNaturalSearch({ phrase: 'p', source: 'local', criteria: criteria({ habitats: [], categories: ['canards'] }) });
        });
        expect(result.current.yearFilter).toBe('all');
        act(() => { result.current.undoNaturalSearch(); });
        expect(result.current.yearFilter).toBe('2020');
        expect(result.current.naturalSearch).toBeNull();
        expect(result.current.filters.aiFilter).toBeNull();

        act(() => {
            result.current.applyNaturalSearch({ phrase: 'p', source: 'local', criteria: criteria({ categories: ['canards'], years: [2024] }) });
        });
        act(() => { result.current.resetAllFilters(); });
        expect(result.current.filters.aiFilter).toBeNull();
        expect(result.current.yearFilter).toBe('all');
        expect(result.current.naturalSearch).toBeNull();
        expect(result.current.hasActiveFilters).toBe(false);
    });

    it('rayon : la position est écrite dans le filtre avancé, jamais dans les critères', () => {
        const { result } = renderHook(() => useFilterControls({ onToast: vi.fn() }));
        act(() => {
            result.current.applyNaturalSearch({
                phrase: 'près de chez moi', source: 'local',
                criteria: criteria({ near: { kind: 'current_position', placeName: null, radiusKm: 10 } }),
                near: { status: 'ok', lat: 45.1, lon: 1.2 },
            });
        });
        expect(result.current.advancedFilterState).toMatchObject({ geoMode: 'radius', radiusCenterLat: '45.1', radiusCenterLon: '1.2', radiusKm: '10' });
        expect(JSON.stringify(result.current.naturalSearch?.criteria)).not.toContain('45.1');
        act(() => { result.current.resetAdvancedFilters(); });
        expect(result.current.advancedFilterState.geoMode).toBe('none');
        expect(result.current.naturalSearch).toBeNull();
    });

    it('un preset ne peut pas enregistrer l’AiFilter : un message le dit', () => {
        const onToast = vi.fn();
        const { result } = renderHook(() => useFilterControls({ onToast }));
        act(() => {
            result.current.applyNaturalSearch({ phrase: 'p', source: 'local', criteria: criteria({ categories: ['canards'], years: [2024] }) });
        });
        act(() => { result.current.saveFilterPreset('Canards'); });
        expect(onToast).toHaveBeenCalledWith('warning', expect.stringContaining('ne peuvent pas être enregistrés dans un preset'), 8000);
        const preset = result.current.filterPresets[0];
        expect(preset.yearFilter).toBe('2024');
        expect(JSON.stringify(preset)).not.toContain('canards');
        // Appliquer un preset remplace aussi la recherche en langage naturel.
        act(() => { result.current.applyFilterPreset(preset.id); });
        expect(result.current.naturalSearch).toBeNull();
        expect(result.current.filters.aiFilter).toBeNull();
    });

    it('changement de compte : la recherche ne passe pas d’un compte à l’autre', () => {
        const { result } = renderHook(() => useFilterControls({ onToast: vi.fn() }));
        act(() => {
            result.current.applyNaturalSearch({ phrase: 'p', source: 'local', criteria: criteria({ categories: ['canards'] }) });
        });
        act(() => { setSessionIdentity('user-2'); });
        expect(result.current.naturalSearch).toBeNull();
        expect(result.current.filters.aiFilter).toBeNull();
    });
});
