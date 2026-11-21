import { useEffect, useMemo, useRef, useState } from 'react';
import { Status, TaxonomicGroup } from '../types';
import { captureSessionContext, readAccountValue, subscribeSessionChange, writeAccountValue } from '../services/sessionScope';
import { subscribeNaturalSearchCache } from '../services/naturalSearchCache';
import { logger } from '../utils/logger';
import { generateUUID } from '../utils/uuidUtils';
import {
    buildFilterPlan,
    criteriaIsEmpty,
    describeAiFilterParts,
    removeCriterion,
    removeCriterionField,
    type CriterionRef,
    type ExistingFilterField,
    type ExistingFilterWrites,
    type FilterPlan,
    type NearResolution,
    type SearchCriteria,
    type SearchNear,
} from '../utils/aiSearchFilters';
import type { AdvancedFilterDialogState, FilterPreset } from '../components/AdvancedFilterDialog';
import type { ObservationFilterState, SortCriterion } from './useObservationFilters';
import type { ToastType } from '../components/ToastContainer';

export const FILTER_PRESETS_STORAGE_KEY = 'observation-filter-presets-v2';

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

/** Filtres d'avant une recherche en langage naturel (« Annuler la recherche »). */
interface FilterSnapshot {
    searchTerm: string;
    yearFilter: string;
    taxonomicGroupFilter: TaxonomicGroup | 'all';
    statusFilter: Status | 'all';
    startDateFilter: string;
    endDateFilter: string;
    advanced: AdvancedFilterDialogState;
    natural: AppliedNaturalSearch | null;
}

/**
 * Recherche en langage naturel appliquée : ses critères (forme relative),
 * le lieu déjà cherché (en mémoire seulement, jamais gardé ni envoyé), les
 * filtres qu'elle a écrits et ceux d'avant.
 */
export interface AppliedNaturalSearch {
    phrase: string;
    /** `local` : analyse gratuite ; `ai` : interprétée par l'assistant ; `cache` : déjà interprétée. */
    source: 'local' | 'ai' | 'cache';
    criteria: SearchCriteria;
    near: NearResolution | undefined;
    plan: FilterPlan;
    /** Filtres existants actuellement écrits par la recherche. */
    owned: ExistingFilterField[];
    previous: FilterSnapshot;
}

/** Dernière réponse de l'assistant, pour la phrase qu'elle interprète (gardée au remontage du champ). */
export interface AiSearchProposal {
    phrase: string;
    criteria: SearchCriteria;
}

export interface NaturalSearchInput {
    phrase: string;
    source: AppliedNaturalSearch['source'];
    criteria: SearchCriteria;
    near?: NearResolution;
}

interface UseFilterControlsParams {
    /** Notifie l'utilisateur lors de l'enregistrement/application d'un preset. */
    onToast: (type: ToastType, message: string, durationMs?: number) => void;
}

const ALL_FIELDS: readonly ExistingFilterField[] = [
    'searchTerm', 'yearFilter', 'taxonomicGroupFilter', 'statusFilter', 'startDateFilter', 'endDateFilter',
];


const withoutGeo = (state: AdvancedFilterDialogState): AdvancedFilterDialogState => ({
    ...state,
    geoMode: 'none',
    radiusCenterLat: '',
    radiusCenterLon: '',
    radiusKm: '',
    bboxMinLat: '',
    bboxMaxLat: '',
    bboxMinLon: '',
    bboxMaxLon: '',
});

/**
 * Regroupe l'état de filtrage des observations (recherche, année, groupe, statut,
 * intervalle de dates, filtres avancés géo/tri), les presets de filtres
 * (persistés en localStorage) et la recherche en langage naturel appliquée.
 * Produit l'objet `filters` et le tableau `additionalSorts` directement
 * consommables par {@link useObservationFilters}.
 *
 * Les setters exposés gardent les noms de `useState`. Quand la personne
 * change elle-même un filtre qu'une recherche en langage naturel avait
 * écrit, le critère correspondant est retiré de la recherche (son étiquette
 * disparaît) : une étiquette ne montre jamais un filtre qui n'est plus actif.
 */
export const useFilterControls = ({ onToast }: UseFilterControlsParams) => {
    const [context] = useState(() => { try { return captureSessionContext(); } catch { return null; } });
    const [searchTerm, setSearchTermRaw] = useState('');
    const [yearFilter, setYearFilterRaw] = useState<string>('all');
    const [taxonomicGroupFilter, setTaxonomicGroupFilterRaw] = useState<TaxonomicGroup | 'all'>('all');
    const [statusFilter, setStatusFilterRaw] = useState<Status | 'all'>('all');
    const [startDateFilter, setStartDateFilterRaw] = useState<string>('');
    const [endDateFilter, setEndDateFilterRaw] = useState<string>('');
    const [advancedFilterState, setAdvancedFilterStateRaw] = useState<AdvancedFilterDialogState>(() => createDefaultAdvancedFilterState());
    const [naturalSearch, setNaturalSearchState] = useState<AppliedNaturalSearch | null>(null);
    /**
     * Texte du champ de recherche de la liste, gardé ici (et non dans le
     * champ) : passer à la carte, tourner l'écran ou franchir la largeur
     * téléphone/ordinateur ne le perd pas, ni la dernière réponse payée.
     */
    const [naturalDraft, setNaturalDraft] = useState('');
    const [lastAiProposal, setLastAiProposal] = useState<AiSearchProposal | null>(null);
    /** Copie synchrone de `naturalSearch` (plusieurs changements dans un même geste). */
    const naturalRef = useRef<AppliedNaturalSearch | null>(null);
    const [filterPresets, setFilterPresets] = useState<StoredFilterPreset[]>(() => {
        const raw = context ? readAccountValue(FILTER_PRESETS_STORAGE_KEY, context) : null;
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
        try { if (context) writeAccountValue(FILTER_PRESETS_STORAGE_KEY, JSON.stringify(filterPresets), context); } catch { /* non-critical */ }
    }, [filterPresets, context]);

    const commitNatural = (next: AppliedNaturalSearch | null) => {
        naturalRef.current = next;
        setNaturalSearchState(next);
    };

    // Changement de compte : la recherche (phrase, lieu) ne passe jamais d'un compte à l'autre.
    useEffect(() => subscribeSessionChange(() => {
        naturalRef.current = null;
        setNaturalSearchState(null);
        setNaturalDraft('');
        setLastAiProposal(null);
        setSearchTermRaw('');
        setYearFilterRaw('all');
        setTaxonomicGroupFilterRaw('all');
        setStatusFilterRaw('all');
        setStartDateFilterRaw('');
        setEndDateFilterRaw('');
        setAdvancedFilterStateRaw(previous => withoutGeo(previous));
    }), []);

    // Accord retiré (cache effacé) : la dernière réponse ne reste pas à l'écran.
    useEffect(() => subscribeNaturalSearchCache(event => {
        if (event === 'purge') setLastAiProposal(null);
    }), []);

    const resetFields = (fields: readonly ExistingFilterField[]) => {
        for (const field of fields) {
            switch (field) {
                case 'searchTerm': setSearchTermRaw(''); break;
                case 'yearFilter': setYearFilterRaw('all'); break;
                case 'taxonomicGroupFilter': setTaxonomicGroupFilterRaw('all'); break;
                case 'statusFilter': setStatusFilterRaw('all'); break;
                case 'startDateFilter': setStartDateFilterRaw(''); break;
                case 'endDateFilter': setEndDateFilterRaw(''); break;
            }
        }
    };


    const writeFields = (writes: ExistingFilterWrites) => {
        if (writes.searchTerm !== undefined) setSearchTermRaw(writes.searchTerm);
        if (writes.yearFilter !== undefined) setYearFilterRaw(writes.yearFilter);
        if (writes.taxonomicGroupFilter !== undefined) setTaxonomicGroupFilterRaw(writes.taxonomicGroupFilter);
        if (writes.statusFilter !== undefined) setStatusFilterRaw(writes.statusFilter);
        if (writes.startDateFilter !== undefined) setStartDateFilterRaw(writes.startDateFilter);
        if (writes.endDateFilter !== undefined) setEndDateFilterRaw(writes.endDateFilter);
    };
    const ownedFields = (plan: FilterPlan): ExistingFilterField[] =>
        ALL_FIELDS.filter(field => plan.writes[field as keyof ExistingFilterWrites] !== undefined);

    /**
     * Réapplique des critères modifiés : remet à zéro les filtres que la
     * recherche avait écrits (sauf `except`, que la personne est en train de
     * changer), puis écrit le nouveau plan. Les périodes sont reconverties
     * maintenant.
     */
    const replan = (current: AppliedNaturalSearch, criteria: SearchCriteria, near: NearResolution | undefined, except: readonly ExistingFilterField[] = []) => {
        const plan = buildFilterPlan(criteria, new Date(), near);
        resetFields(current.owned.filter(field => !except.includes(field)));
        if (criteriaIsEmpty(criteria)) {
            commitNatural(null);
            // Plus aucune étiquette : le champ suit (vide, ou la recherche par nom restante).
            setNaturalDraft(except.includes('searchTerm') ? naturalDraft : '');
            return;
        }
        const writes: ExistingFilterWrites = { ...plan.writes };
        for (const field of except) delete writes[field as keyof ExistingFilterWrites];
        writeFields(writes);
        commitNatural({ ...current, criteria, near, plan, owned: ownedFields(plan).filter(field => !except.includes(field)) });
    };

    /** La personne change elle-même ces filtres : les critères qui les avaient écrits sont retirés. */
    const detach = (fields: readonly ExistingFilterField[]) => {
        const current = naturalRef.current;
        if (!current) return;
        const hit = fields.filter(field => current.owned.includes(field));
        if (hit.length === 0) return;
        let criteria = current.criteria;
        for (const field of hit) {
            const owner = current.plan.owners[field];
            if (owner) criteria = removeCriterionField(criteria, owner);
        }
        replan(current, criteria, current.near, hit);
    };

    const takeSnapshot = (): FilterSnapshot => ({
        searchTerm,
        yearFilter,
        taxonomicGroupFilter,
        statusFilter,
        startDateFilter,
        endDateFilter,
        advanced: { ...advancedFilterState },
        natural: naturalRef.current,
    });

    // Sans recherche en langage naturel appliquée, le champ de la liste montre
    // la recherche par nom (tapée ici, sur la carte ou dans la galerie).
    const setSearchTerm = (value: string) => {
        detach(['searchTerm']);
        setSearchTermRaw(value);
        if (!naturalRef.current) setNaturalDraft(value);
    };
    const setYearFilter = (value: string) => { detach(['yearFilter']); setYearFilterRaw(value); };
    const setTaxonomicGroupFilter = (value: TaxonomicGroup | 'all') => { detach(['taxonomicGroupFilter']); setTaxonomicGroupFilterRaw(value); };
    const setStatusFilter = (value: Status | 'all') => { detach(['statusFilter']); setStatusFilterRaw(value); };
    const setStartDateFilter = (value: string) => { detach(['startDateFilter']); setStartDateFilterRaw(value); };
    const setEndDateFilter = (value: string) => { detach(['endDateFilter']); setEndDateFilterRaw(value); };
    const setAdvancedFilterState = (
        update: AdvancedFilterDialogState | ((previous: AdvancedFilterDialogState) => AdvancedFilterDialogState),
    ) => {
        // Le rayon d'un « près de… » n'est jamais ici (il vit dans l'AiFilter,
        // en mémoire) : un filtre géographique posé à la main s'y ajoute.
        setAdvancedFilterStateRaw(typeof update === 'function' ? update(advancedFilterState) : update);
    };

    /**
     * Applique une recherche en langage naturel : elle REMPLACE les filtres en
     * cours (le tri est gardé) ; « Annuler la recherche » les rend. Les
     * périodes relatives sont converties maintenant.
     */
    const applyNaturalSearch = (input: NaturalSearchInput) => {
        const previous = takeSnapshot();
        const plan = buildFilterPlan(input.criteria, new Date(), input.near);
        resetFields(ALL_FIELDS);
        writeFields(plan.writes);
        setNaturalDraft(input.phrase);
        commitNatural({
            phrase: input.phrase,
            source: input.source,
            criteria: input.criteria,
            near: input.near,
            plan,
            owned: ownedFields(plan),
            previous,
        });
    };

    /** Retire une étiquette (un critère) de la recherche appliquée. */
    const removeNaturalCriterion = (ref: CriterionRef) => {
        const current = naturalRef.current;
        if (!current) return;
        const criteria = removeCriterion(current.criteria, ref);
        replan(current, criteria, ref.field === 'near' ? undefined : current.near);
    };

    /**
     * Nouveau résultat de la recherche du lieu (« Réessayer »). `forNear` :
     * le critère pour lequel le lieu a été cherché ; un résultat arrivé
     * après une autre recherche (ou un « Annuler ») est ignoré.
     */
    const updateNaturalNear = (near: NearResolution, forNear?: SearchNear) => {
        const current = naturalRef.current;
        if (!current || !current.criteria.near) return;
        if (forNear && current.criteria.near !== forNear) return;
        replan(current, current.criteria, near);
    };

    /** Rend les filtres d'avant la recherche. */
    const undoNaturalSearch = () => {
        const current = naturalRef.current;
        if (!current) return;
        const { previous } = current;
        setSearchTermRaw(previous.searchTerm);
        setYearFilterRaw(previous.yearFilter);
        setTaxonomicGroupFilterRaw(previous.taxonomicGroupFilter);
        setStatusFilterRaw(previous.statusFilter);
        setStartDateFilterRaw(previous.startDateFilter);
        setEndDateFilterRaw(previous.endDateFilter);
        // Les filtres avancés (géographie posée à la main, tri) ne sont pas
        // touchés par une recherche : ils restent tels quels.
        commitNatural(previous.natural);
        setNaturalDraft(previous.natural?.phrase ?? previous.searchTerm);
    };

    /**
     * Retire la recherche en langage naturel appliquée (croix « Effacer la
     * recherche ») : les filtres qu'elle avait écrits et le champ sont vidés ;
     * les autres filtres ne bougent pas.
     */
    const clearNaturalSearch = () => {
        const current = naturalRef.current;
        if (current) resetFields(current.owned);
        commitNatural(null);
        setSearchTermRaw('');
        setNaturalDraft('');
    };

    /** Remplace la recherche appliquée par une recherche par nom (geste explicite). */
    const replaceWithNameSearch = (text: string) => {
        clearNaturalSearch();
        setSearchTermRaw(text);
        setNaturalDraft(text);
    };

    /** « Réinitialiser » : tous les filtres ET la recherche en langage naturel (le tri est gardé). */
    const resetAllFilters = () => {
        resetFields(ALL_FIELDS);
        // « Réinitialiser » : tous les filtres, géographie posée à la main comprise (le tri est gardé).
        setAdvancedFilterStateRaw(previous => withoutGeo(previous));
        commitNatural(null);
        setNaturalDraft('');
        setLastAiProposal(null);
    };

    const aiFilter = naturalSearch?.plan.aiFilter ?? null;
    const searchTermFoldsPlural = naturalSearch?.owned.includes('searchTerm') ?? false;

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
        bboxMaxLon: advancedFilterState.bboxMaxLon,
        aiFilter,
        // Le repli du pluriel ne vaut que pour le texte écrit par une recherche en langage naturel.
        searchTermFoldsPlural,
    }), [searchTerm, yearFilter, taxonomicGroupFilter, statusFilter, startDateFilter, endDateFilter, advancedFilterState, aiFilter, searchTermFoldsPlural]);

    const hasActiveFilters = naturalSearch !== null || searchTerm !== '' || yearFilter !== 'all' || taxonomicGroupFilter !== 'all'
        || statusFilter !== 'all' || startDateFilter !== '' || endDateFilter !== '' || advancedFilterState.geoMode !== 'none';

    const resetAdvancedFilters = () => {
        setAdvancedFilterStateRaw(createDefaultAdvancedFilterState());
    };

    /**
     * Ce qu'un preset ne peut pas garder de la recherche en cours : ses
     * critères sans filtre existant (AiFilter), dont le rayon d'un « près
     * de… ». Un preset n'enregistre que les filtres classiques et avancés,
     * où la position de l'appareil n'entre jamais.
     */
    const presetLimits = (): string[] => {
        const current = naturalRef.current;
        if (!current) return [];
        const limits: string[] = [];
        if (current.plan.aiFilter) {
            const parts = describeAiFilterParts(current.plan.aiFilter);
            limits.push(parts.length > 0 ? parts.join(', ') : 'période à venir');
        }
        return limits;
    };

    const saveFilterPreset = (name: string) => {
        const limits = presetLimits();
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
        // Un preset ne garde que les filtres classiques : jamais l'AiFilter ni la position.
        if (limits.length > 0) {
            onToast('warning', `Preset sauvegardé : ${name}. Les critères de la recherche en langage naturel (${limits.join(', ')}) ne peuvent pas être enregistrés dans un preset.`, 8000);
            return;
        }
        onToast('success', `Preset sauvegardé: ${name}`, 4000);
    };

    const applyFilterPreset = (presetId: string) => {
        const preset = filterPresets.find(item => item.id === presetId);
        if (!preset) return;
        // Le preset remplace tout, recherche en langage naturel comprise.
        commitNatural(null);
        setNaturalDraft(preset.searchTerm);
        setSearchTermRaw(preset.searchTerm);
        setYearFilterRaw(preset.yearFilter);
        setTaxonomicGroupFilterRaw(preset.taxonomicGroupFilter);
        setStatusFilterRaw(preset.statusFilter);
        setStartDateFilterRaw(preset.startDateFilter);
        setEndDateFilterRaw(preset.endDateFilter);
        setAdvancedFilterStateRaw({ ...preset.advancedFilters });
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
        naturalSearch,
        /** Une recherche en cours a des critères qu'un preset ne garde pas. */
        naturalSearchPresetLimited: naturalSearch !== null && naturalSearch.plan.aiFilter !== null,
        applyNaturalSearch,
        naturalDraft,
        setNaturalDraft,
        lastAiProposal,
        setLastAiProposal,
        clearNaturalSearch,
        replaceWithNameSearch,
        removeNaturalCriterion,
        updateNaturalNear,
        undoNaturalSearch,
        resetAllFilters,
        hasActiveFilters,
    };
};
