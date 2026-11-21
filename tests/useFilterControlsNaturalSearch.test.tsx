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

    it('rayon : la position vit dans l’AiFilter (en mémoire), jamais dans les filtres avancés ni les critères', () => {
        const { result } = renderHook(() => useFilterControls({ onToast: vi.fn() }));
        act(() => {
            result.current.applyNaturalSearch({
                phrase: 'près de chez moi', source: 'local',
                criteria: criteria({ near: { kind: 'current_position', placeName: null, radiusKm: 10 } }),
                near: { status: 'ok', lat: 45.1, lon: 1.2 },
            });
        });
        expect(result.current.advancedFilterState).toMatchObject({ geoMode: 'none', radiusCenterLat: '', radiusCenterLon: '', radiusKm: '' });
        expect(result.current.filters.aiFilter?.near).toEqual({ lat: 45.1, lon: 1.2, radiusKm: 10 });
        expect(JSON.stringify(result.current.naturalSearch?.criteria)).not.toContain('45.1');
        // Un filtre géographique posé à la main s'ajoute à la recherche.
        act(() => { result.current.setAdvancedFilterState(state => ({ ...state, geoMode: 'bbox', bboxMinLat: '44', bboxMaxLat: '46', bboxMinLon: '0', bboxMaxLon: '2' })); });
        expect(result.current.filters.aiFilter?.near).toEqual({ lat: 45.1, lon: 1.2, radiusKm: 10 });
        expect(result.current.filters.geoMode).toBe('bbox');
        // « Réinitialiser avancé » ne touche que les filtres avancés : le « près de… » reste.
        act(() => { result.current.resetAdvancedFilters(); });
        expect(result.current.advancedFilterState.geoMode).toBe('none');
        expect(result.current.filters.aiFilter?.near).toEqual({ lat: 45.1, lon: 1.2, radiusKm: 10 });
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

    it('un preset ne garde jamais la position de « près de chez moi », et le dit', () => {
        const onToast = vi.fn();
        const { result } = renderHook(() => useFilterControls({ onToast }));
        act(() => {
            result.current.applyNaturalSearch({
                phrase: 'les oiseaux près de chez moi', source: 'local',
                criteria: criteria({ groups: [TaxonomicGroup.BIRD], near: { kind: 'current_position', placeName: null, radiusKm: 10 } }),
                near: { status: 'ok', lat: 12.3456789, lon: 6.5432109 },
            });
        });
        expect(result.current.naturalSearchPresetLimited).toBe(true);
        act(() => { result.current.saveFilterPreset('Oiseaux du coin'); });
        const stored = localStorage.getItem('observation-filter-presets-v2:user-1') ?? '';
        expect(stored).not.toContain('12.3456789');
        expect(stored).not.toContain('6.5432109');
        expect(result.current.filterPresets[0].advancedFilters.geoMode).toBe('none');
        expect(result.current.filterPresets[0].taxonomicGroupFilter).toBe(TaxonomicGroup.BIRD);
        expect(onToast).toHaveBeenCalledWith('warning', expect.stringContaining('« près de… »'), 8000);
    });

    it('aucun enchaînement ne met une coordonnée de l’appareil dans les filtres avancés ni dans un preset', () => {
        const DEVICE = { status: 'ok' as const, lat: 12.3456789, lon: 6.5432109 };
        const PLACE = { status: 'ok' as const, lat: 23.4567891, lon: 7.6543219 };
        const near = (radiusKm = 10) => criteria({ groups: [TaxonomicGroup.BIRD], near: { kind: 'current_position', placeName: null, radiusKm } });
        const { result } = renderHook(() => useFilterControls({ onToast: vi.fn() }));
        const advancedHasNoCoordinate = () => {
            const state = JSON.stringify(result.current.advancedFilterState);
            expect(state).not.toMatch(/12\.34|6\.54|23\.45|7\.65/);
        };
        act(() => { result.current.applyNaturalSearch({ phrase: 'oiseaux près de chez moi', source: 'local', criteria: near(), near: DEVICE }); });
        advancedHasNoCoordinate();
        // Retouche de la latitude ou de la longitude (valeurs tapées par la personne), effacer puis retaper.
        act(() => { result.current.setAdvancedFilterState(state => ({ ...state, geoMode: 'radius', radiusCenterLat: '4' })); });
        act(() => { result.current.setAdvancedFilterState(state => ({ ...state, radiusCenterLat: '' })); });
        act(() => { result.current.setAdvancedFilterState(state => ({ ...state, radiusCenterLon: '1', radiusKm: '25' })); });
        act(() => { result.current.setAdvancedFilterState(state => ({ ...state, geoMode: 'bbox' })); });
        act(() => { result.current.setAdvancedFilterState(state => ({ ...state, geoMode: 'none' })); });
        advancedHasNoCoordinate();
        // Deux « près de » à la suite, « Réessayer », annuler.
        act(() => {
            result.current.applyNaturalSearch({
                phrase: 'près de Castelbrume', source: 'ai',
                criteria: criteria({ near: { kind: 'place', placeName: 'Castelbrume', radiusKm: 5 } }), near: { status: 'not_found' },
            });
        });
        act(() => { result.current.updateNaturalNear(PLACE); });
        advancedHasNoCoordinate();
        act(() => { result.current.undoNaturalSearch(); });
        advancedHasNoCoordinate();
        act(() => { result.current.saveFilterPreset('Coin'); });
        act(() => { result.current.undoNaturalSearch(); });
        act(() => { result.current.saveFilterPreset('Coin 2'); });
        const everything = Object.keys(localStorage).map(key => localStorage.getItem(key)).join('|');
        expect(everything).not.toMatch(/12\.34|6\.54|23\.45|7\.65/);
    });

    it('« Annuler la recherche » garde le tri choisi après la recherche', () => {
        const { result } = renderHook(() => useFilterControls({ onToast: vi.fn() }));
        act(() => {
            result.current.applyNaturalSearch({ phrase: 'p', source: 'local', criteria: criteria({ categories: ['canards'] }) });
        });
        act(() => {
            result.current.setAdvancedFilterState(state => ({ ...state, secondarySortKey: 'speciesName', secondarySortDirection: 'descending' }));
        });
        act(() => { result.current.undoNaturalSearch(); });
        expect(result.current.advancedFilterState.secondarySortKey).toBe('speciesName');
        expect(result.current.advancedFilterState.secondarySortDirection).toBe('descending');
    });

    it('le texte du champ est gardé par le hook : appliqué, effacé, preset, recherche par nom', () => {
        const { result } = renderHook(() => useFilterControls({ onToast: vi.fn() }));
        act(() => { result.current.setSearchTerm('buse'); });
        expect(result.current.naturalDraft).toBe('buse');
        act(() => {
            result.current.applyNaturalSearch({ phrase: 'les canards en 2024', source: 'local', criteria: criteria({ categories: ['canards'], years: [2024] }) });
        });
        expect(result.current.naturalDraft).toBe('les canards en 2024');
        act(() => { result.current.clearNaturalSearch(); });
        expect(result.current.naturalSearch).toBeNull();
        expect(result.current.naturalDraft).toBe('');
        expect(result.current.yearFilter).toBe('all');
        act(() => {
            result.current.applyNaturalSearch({ phrase: 'les canards', source: 'local', criteria: criteria({ categories: ['canards'] }) });
        });
        act(() => { result.current.replaceWithNameSearch('merle'); });
        expect(result.current.naturalSearch).toBeNull();
        expect(result.current.searchTerm).toBe('merle');
        expect(result.current.naturalDraft).toBe('merle');
    });

    it('« Réessayer » : un lieu trouvé après une autre recherche n’est jamais appliqué à celle-ci', () => {
        const { result } = renderHook(() => useFilterControls({ onToast: vi.fn() }));
        const alpha = { kind: 'place' as const, placeName: 'Alpha', radiusKm: 10 };
        act(() => {
            result.current.applyNaturalSearch({ phrase: 'près de Alpha', source: 'ai', criteria: criteria({ near: alpha }), near: { status: 'not_found' } });
        });
        act(() => {
            result.current.applyNaturalSearch({
                phrase: 'près de Beta', source: 'ai',
                criteria: criteria({ near: { kind: 'place', placeName: 'Beta', radiusKm: 10 } }), near: { status: 'not_found' },
            });
        });
        // Résultat tardif de la recherche d'Alpha.
        act(() => { result.current.updateNaturalNear({ status: 'ok', lat: 1.111, lon: 2.222 }, alpha); });
        expect(result.current.advancedFilterState.geoMode).toBe('none');
        expect(result.current.naturalSearch?.near).toEqual({ status: 'not_found' });
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
