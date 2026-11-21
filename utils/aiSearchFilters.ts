// Recherche en langage naturel (phase 4 de l'assistant IA) : des critères,
// venus de l'analyse locale gratuite (`utils/naturalSearchLocal.ts`), du
// cache des phrases ou de la fonction `ai-text`, aux filtres de la liste.
//
// Une seule forme de critères (`SearchCriteria`), celle que rend la fonction
// (`SearchOutput`, supabase/functions/ai-text/logic.ts) : les périodes y
// restent RELATIVES (« le mois dernier ») et ne sont converties en dates
// qu'au moment d'appliquer (`buildFilterPlan`), pour qu'une phrase rejouée
// plus tard depuis le cache reste juste.
//
// Ce qui correspond à un filtre existant de la liste y est écrit (année
// unique, dates de début et de fin, statut unique, groupe unique, rayon,
// texte), pour que les réglages actuels continuent de marcher ; le reste va
// dans un `AiFilter` (plusieurs groupes, catégories, genres, mois ou saison
// de toutes les années, plusieurs années ou statuts, habitats, département,
// commune). Un champ nommé dans `dropped` n'est JAMAIS appliqué.
//
// Les textes (nom, lieu, commune, département, genres) viennent de la
// phrase ou de la fonction : ce sont des TEXTES, à afficher en texte React,
// jamais en HTML.

import { Habitat, Status, TaxonomicGroup, type Observation } from '../types';
import { dateToIsoLocal } from './dateUtils';
import { departmentName, foldPlaceName, normalizeDepartment, observationInDepartment } from './frenchDepartments';
import { TAXON_CATEGORIES, TAXON_CATEGORY_KEYS, type TaxonCategoryKey } from './taxonCategories';

// ---------------------------------------------------------------------------
// Forme des critères (égalité avec la fonction vérifiée par un test)
// ---------------------------------------------------------------------------

/** Bornes de la fonction (`SEARCH_LIMITS`, égalité vérifiée par un test). */
export const AI_SEARCH_LIMITS = {
    maxInputChars: 200,
    maxYears: 60,
    minYear: 1900,
    maxDays: 3660,
    maxGenera: 20,
    maxGenusChars: 60,
    maxPlaceChars: 100,
    maxTextChars: 200,
    minRadiusKm: 0.1,
    maxRadiusKm: 100,
    defaultRadiusKm: 10,
} as const;

/** Champs de la réponse, dans l'ordre de la fonction (`SEARCH_FIELDS`). */
export const AI_SEARCH_FIELDS = [
    'period', 'years', 'groups', 'categories', 'genera', 'statuses', 'habitats', 'department', 'commune', 'near', 'text',
] as const;
export type SearchField = (typeof AI_SEARCH_FIELDS)[number];

export const SEARCH_PERIOD_KINDS = ['this_month', 'last_month', 'this_year', 'last_year', 'last_n_days', 'month', 'season'] as const;
export type SearchPeriodKind = (typeof SEARCH_PERIOD_KINDS)[number];
export const SEARCH_SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type SearchSeason = (typeof SEARCH_SEASONS)[number];
export const SEARCH_YEAR_SCOPES = ['all', 'this_year', 'last_year', 'most_recent'] as const;
export type SearchYearScope = (typeof SEARCH_YEAR_SCOPES)[number];

export interface SearchPeriod {
    kind: SearchPeriodKind;
    /** `last_n_days` : nombre de jours, aujourd'hui compris. */
    days: number | null;
    /** `month` : 1 à 12. */
    month: number | null;
    season: SearchSeason | null;
    /** `month` et `season` seulement. */
    yearScope: SearchYearScope | null;
}

export interface SearchNear {
    kind: 'current_position' | 'place';
    /** `place` seulement : le lieu tel qu'écrit. Jamais de coordonnées ici. */
    placeName: string | null;
    radiusKm: number;
}

/**
 * Critères d'une phrase, sous forme RELATIVE (aucune date calculée, aucune
 * coordonnée) : c'est cette forme qui est gardée dans le cache des phrases.
 */
export interface SearchCriteria {
    period: SearchPeriod | null;
    years: number[];
    groups: TaxonomicGroup[];
    categories: TaxonCategoryKey[];
    genera: string[];
    statuses: Status[];
    habitats: Habitat[];
    department: string | null;
    commune: string | null;
    near: SearchNear | null;
    text: string | null;
    /** Champs mal lus par la fonction : signalés, jamais appliqués. */
    dropped: SearchField[];
}

export const emptyCriteria = (): SearchCriteria => ({
    period: null,
    years: [],
    groups: [],
    categories: [],
    genera: [],
    statuses: [],
    habitats: [],
    department: null,
    commune: null,
    near: null,
    text: null,
    dropped: [],
});

const GROUP_VALUES: readonly string[] = Object.values(TaxonomicGroup);
const STATUS_VALUES: readonly string[] = Object.values(Status);
const HABITAT_VALUES: readonly string[] = Object.values(Habitat).filter(habitat => habitat !== Habitat.UNKNOWN);
const CATEGORY_KEYS: readonly string[] = TAXON_CATEGORY_KEYS;

/** Genre latin, éventuellement suivi d'une épithète (comme la fonction). */
const GENUS_RE = /^[A-Z][a-z]+(?: [a-z]+(?:-[a-z]+)?)?$/;
/** Texte rendu : lettres, chiffres, espaces, apostrophes, traits d'union, points (comme la fonction). */
const RENDERED_TEXT_RE = /^[\p{L}\p{M}\p{N} '’.-]+$/u;
const INVISIBLE_CHARS = /[\p{Cc}\p{Cf}]/gu;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
const isInt = (value: unknown, min: number, max: number): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

const cleanText = (value: unknown, max: number): string | null | undefined => {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') return undefined;
    const cleaned = value.replace(INVISIBLE_CHARS, ' ').replace(/\s+/g, ' ').trim();
    if (cleaned.length === 0) return null;
    if (cleaned.length > max || !RENDERED_TEXT_RE.test(cleaned)) return undefined;
    return cleaned;
};

const parsePeriod = (value: unknown): SearchPeriod | null | undefined => {
    if (value === null || value === undefined) return null;
    if (!isPlainObject(value) || typeof value.kind !== 'string') return undefined;
    const base: SearchPeriod = { kind: 'this_month', days: null, month: null, season: null, yearScope: null };
    const scope = typeof value.yearScope === 'string' && (SEARCH_YEAR_SCOPES as readonly string[]).includes(value.yearScope)
        ? value.yearScope as SearchYearScope
        : undefined;
    switch (value.kind) {
        case 'none':
            return null;
        case 'this_month':
        case 'last_month':
        case 'this_year':
        case 'last_year':
            return { ...base, kind: value.kind };
        case 'last_n_days':
            return isInt(value.days, 1, AI_SEARCH_LIMITS.maxDays) ? { ...base, kind: 'last_n_days', days: value.days } : undefined;
        case 'month':
            return isInt(value.month, 1, 12) && scope ? { ...base, kind: 'month', month: value.month, yearScope: scope } : undefined;
        case 'season':
            return typeof value.season === 'string' && (SEARCH_SEASONS as readonly string[]).includes(value.season) && scope
                ? { ...base, kind: 'season', season: value.season as SearchSeason, yearScope: scope }
                : undefined;
        default:
            return undefined;
    }
};

const parseNear = (value: unknown): SearchNear | null | undefined => {
    if (value === null || value === undefined) return null;
    if (!isPlainObject(value) || typeof value.kind !== 'string') return undefined;
    if (value.kind === 'none') return null;
    if (typeof value.radiusKm !== 'number' || !Number.isFinite(value.radiusKm)) return undefined;
    const radiusKm = clampRadiusKm(value.radiusKm);
    if (radiusKm === null) return undefined;
    if (value.kind === 'current_position') return { kind: 'current_position', placeName: null, radiusKm };
    if (value.kind !== 'place') return undefined;
    const placeName = cleanText(value.placeName, AI_SEARCH_LIMITS.maxPlaceChars);
    return placeName ? { kind: 'place', placeName, radiusKm } : undefined;
};

/** Rayon ramené entre 0,1 et 100 km, au dixième ; null si négatif ou illisible. */
export const clampRadiusKm = (value: number): number | null => {
    if (!Number.isFinite(value) || value < 0) return null;
    if (value === 0) return AI_SEARCH_LIMITS.defaultRadiusKm;
    const rounded = Math.round(value * 10) / 10;
    return Math.min(AI_SEARCH_LIMITS.maxRadiusKm, Math.max(AI_SEARCH_LIMITS.minRadiusKm, rounded));
};

/**
 * Relit des critères sans faire aveuglément confiance à leur source (réponse
 * de la fonction ou cache du navigateur) : chaque champ est re-borné ; un
 * champ illisible est vidé et rejoint `dropped` (jamais appliqué) ; un champ
 * déjà nommé dans `dropped` est vidé. Renvoie null si ce n'est pas un objet.
 */
export const parseSearchResult = (result: unknown): SearchCriteria | null => {
    if (!isPlainObject(result)) return null;
    const dropped = new Set<SearchField>();
    if (Array.isArray(result.dropped)) {
        for (const field of result.dropped) {
            if ((AI_SEARCH_FIELDS as readonly unknown[]).includes(field)) dropped.add(field as SearchField);
        }
    }
    const read = <T,>(field: SearchField, parse: (value: unknown) => T | undefined, empty: T): T => {
        if (dropped.has(field)) return empty;
        const parsed = parse(result[field]);
        if (parsed === undefined) {
            dropped.add(field);
            return empty;
        }
        return parsed;
    };
    const closedList = <T extends string>(choices: readonly string[]) => (value: unknown): T[] | undefined => {
        if (value === null || value === undefined) return [];
        if (!Array.isArray(value) || value.length > choices.length) return undefined;
        if (!value.every(item => typeof item === 'string' && choices.includes(item))) return undefined;
        return choices.filter(choice => value.includes(choice)) as T[];
    };

    const criteria: SearchCriteria = {
        period: read('period', parsePeriod, null),
        years: read('years', value => {
            if (value === null || value === undefined) return [];
            if (!Array.isArray(value) || value.length > AI_SEARCH_LIMITS.maxYears) return undefined;
            if (!value.every(year => isInt(year, AI_SEARCH_LIMITS.minYear, 9999))) return undefined;
            return [...new Set(value as number[])].sort((a, b) => a - b);
        }, [] as number[]),
        groups: read('groups', closedList<TaxonomicGroup>(GROUP_VALUES), []),
        categories: read('categories', closedList<TaxonCategoryKey>(CATEGORY_KEYS), []),
        genera: read('genera', value => {
            if (value === null || value === undefined) return [];
            if (!Array.isArray(value) || value.length > AI_SEARCH_LIMITS.maxGenera) return undefined;
            if (!value.every(name => typeof name === 'string' && name.length <= AI_SEARCH_LIMITS.maxGenusChars && GENUS_RE.test(name))) return undefined;
            return [...new Set(value as string[])];
        }, [] as string[]),
        statuses: read('statuses', closedList<Status>(STATUS_VALUES), []),
        habitats: read('habitats', closedList<Habitat>(HABITAT_VALUES), []),
        department: read('department', value => cleanText(value, AI_SEARCH_LIMITS.maxPlaceChars), null),
        commune: read('commune', value => cleanText(value, AI_SEARCH_LIMITS.maxPlaceChars), null),
        near: read('near', parseNear, null),
        text: read('text', value => cleanText(value, AI_SEARCH_LIMITS.maxTextChars), null),
        dropped: [],
    };
    // Comme la fonction : une année écrite l'emporte sur une période qui fixe
    // déjà l'année (une entrée du cache abîmée ou forgée ne fait pas mentir
    // une étiquette).
    if (criteria.period && criteria.years.length > 0 && periodFixesYear(criteria.period)) {
        criteria.period = null;
        dropped.add('period');
    }
    criteria.dropped = AI_SEARCH_FIELDS.filter(field => dropped.has(field));
    return criteria;
};

/** Période qui fixe déjà l'année (relative) : incompatible avec une année écrite. */
export const periodFixesYear = (period: SearchPeriod): boolean =>
    (period.kind !== 'month' && period.kind !== 'season') || period.yearScope !== 'all';

/** Aucun critère à appliquer (les champs de `dropped` ne comptent pas). */
export const criteriaIsEmpty = (criteria: SearchCriteria): boolean =>
    criteria.period === null && criteria.years.length === 0 && criteria.groups.length === 0
    && criteria.categories.length === 0 && criteria.genera.length === 0 && criteria.statuses.length === 0
    && criteria.habitats.length === 0 && criteria.department === null && criteria.commune === null
    && criteria.near === null && criteria.text === null;

// ---------------------------------------------------------------------------
// Périodes : conversion au moment d'appliquer
// ---------------------------------------------------------------------------

const MONTH_NAMES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MONTH_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** Saisons météorologiques (mois entiers), plus simples à lire qu'au jour près. */
export const SEASON_MONTHS: Readonly<Record<SearchSeason, readonly number[]>> = {
    spring: [3, 4, 5],
    summer: [6, 7, 8],
    autumn: [9, 10, 11],
    winter: [12, 1, 2],
};
const SEASON_NAMES: Readonly<Record<SearchSeason, string>> = {
    spring: 'printemps',
    summer: 'été',
    autumn: 'automne',
    winter: 'hiver',
};

const pad = (value: number): string => String(value).padStart(2, '0');
const lastDayOfMonth = (year: number, month: number): number => new Date(year, month, 0).getDate();
const monthStart = (year: number, month: number): string => `${year}-${pad(month)}-01`;
const monthEnd = (year: number, month: number): string => `${year}-${pad(month)}-${pad(lastDayOfMonth(year, month))}`;
const frDate = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export type ResolvedPeriod =
    /** Dates de début et de fin (comprises). */
    | { kind: 'range'; start: string; end: string; label: string }
    /** Une année civile entière. */
    | { kind: 'year'; year: number; label: string }
    /** Ces mois, toutes les années. */
    | { kind: 'months'; months: number[]; label: string }
    /** Entièrement à venir : aucune observation. */
    | { kind: 'future'; label: string };

/**
 * Hiver de l'année Y : de décembre Y-1 à fin février Y (29 février compris
 * les années bissextiles). Les autres saisons tiennent dans l'année.
 */
const seasonRange = (season: SearchSeason, year: number): { start: string; end: string; dates: string } => {
    const months = SEASON_MONTHS[season];
    if (season === 'winter') {
        return { start: monthStart(year - 1, 12), end: monthEnd(year, 2), dates: `décembre ${year - 1} à février ${year}` };
    }
    const first = months[0];
    const last = months[months.length - 1];
    return {
        start: monthStart(year, first),
        end: monthEnd(year, last),
        dates: `${MONTH_NAMES[first - 1]} à ${MONTH_NAMES[last - 1]} ${year}`,
    };
};

/**
 * Convertit une période relative en dates, d'après `now` (date LOCALE de
 * l'appareil). Règles :
 * - « les N derniers jours » : aujourd'hui compris ;
 * - « mai dernier » (`most_recent`) : la dernière occurrence TERMINÉE ; le
 *   mois en cours n'est pas « dernier » (« novembre dernier » dit en
 *   novembre = novembre de l'an passé). Même règle pour les saisons ;
 * - saisons météorologiques (printemps = mars à mai…) ; l'hiver Y va de
 *   décembre Y-1 à février Y. « Cet hiver » : celui qui est en cours en
 *   décembre, janvier et février ; sinon celui de janvier dernier ;
 * - une période qui commence après aujourd'hui ne donne rien (`future`).
 */
export const resolvePeriod = (period: SearchPeriod, now: Date): ResolvedPeriod => {
    const today = dateToIsoLocal(now);
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const range = (start: string, end: string, label: string): ResolvedPeriod =>
        (start > today ? { kind: 'future', label: `${label} : période à venir, aucune observation` } : { kind: 'range', start, end, label });

    switch (period.kind) {
        case 'this_month':
            return range(monthStart(year, month), monthEnd(year, month), `ce mois-ci (${MONTH_NAMES[month - 1]} ${year})`);
        case 'last_month': {
            const y = month === 1 ? year - 1 : year;
            const m = month === 1 ? 12 : month - 1;
            return range(monthStart(y, m), monthEnd(y, m), `le mois dernier (${MONTH_NAMES[m - 1]} ${y})`);
        }
        case 'this_year':
            return { kind: 'year', year, label: `cette année (${year})` };
        case 'last_year':
            return { kind: 'year', year: year - 1, label: `l'an dernier (${year - 1})` };
        case 'last_n_days': {
            const days = Math.max(1, period.days ?? 1);
            const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
            const startIso = dateToIsoLocal(start);
            const label = days === 1 ? "aujourd'hui" : `les ${days} derniers jours (depuis le ${frDate(startIso)})`;
            return { kind: 'range', start: startIso, end: today, label };
        }
        case 'month': {
            const m = period.month ?? 1;
            const name = MONTH_NAMES[m - 1];
            switch (period.yearScope) {
                case 'this_year':
                    return range(monthStart(year, m), monthEnd(year, m), `${name} ${year}`);
                case 'last_year':
                    return range(monthStart(year - 1, m), monthEnd(year - 1, m), `${name} ${year - 1}`);
                case 'most_recent': {
                    const y = m < month ? year : year - 1;
                    return range(monthStart(y, m), monthEnd(y, m), `${name} dernier (${name} ${y})`);
                }
                default:
                    return { kind: 'months', months: [m], label: `${name}, toutes les années` };
            }
        }
        case 'season': {
            const season = period.season ?? 'spring';
            const months = SEASON_MONTHS[season];
            const name = SEASON_NAMES[season];
            if (period.yearScope === 'all' || period.yearScope === null) {
                return {
                    kind: 'months',
                    months: [...months].sort((a, b) => a - b),
                    label: `${name} (${MONTH_SHORT[months[0] - 1]} à ${MONTH_SHORT[months[months.length - 1] - 1]}), toutes les années`,
                };
            }
            // Année « de rattachement » de la saison voulue (pour l'hiver : celle de sa fin, en février).
            let target: number;
            if (season === 'winter') {
                const current = month === 12 ? year + 1 : year;
                if (period.yearScope === 'this_year') target = current;
                else if (period.yearScope === 'last_year') target = current - 1;
                // Dernier hiver terminé : celui de cette année s'il a fini (mars ou après).
                else target = month <= 2 ? year - 1 : year;
            } else {
                const lastMonth = months[months.length - 1];
                if (period.yearScope === 'this_year') target = year;
                else if (period.yearScope === 'last_year') target = year - 1;
                else target = month > lastMonth ? year : year - 1;
            }
            const { start, end, dates } = seasonRange(season, target);
            return range(start, end, `${name}${period.yearScope === 'most_recent' ? ' dernier' : ''} (${dates})`);
        }
        default:
            return { kind: 'future', label: 'période inconnue' };
    }
};

// ---------------------------------------------------------------------------
// Du critère aux filtres
// ---------------------------------------------------------------------------

/** Filtres existants de la liste (`ObservationFilterState`) que la recherche peut écrire. */
export type ExistingFilterField =
    | 'searchTerm' | 'yearFilter' | 'taxonomicGroupFilter' | 'statusFilter' | 'startDateFilter' | 'endDateFilter' | 'geo';

export interface ExistingFilterWrites {
    searchTerm?: string;
    yearFilter?: string;
    taxonomicGroupFilter?: TaxonomicGroup;
    statusFilter?: Status;
    startDateFilter?: string;
    endDateFilter?: string;
    /** Rayon autour d'un point (filtre avancé « Rayon »). */
    geo?: { lat: number; lon: number; radiusKm: number };
}

/** Critères sans filtre existant : appliqués en plus des filtres de la liste. */
export interface AiFilter {
    /** Mois (1 à 12), toutes années confondues. */
    months: number[] | null;
    /** Plusieurs années. */
    years: number[] | null;
    /** Taxons : une observation doit être dans l'un des groupes, l'une des catégories OU l'un des genres. */
    groups: TaxonomicGroup[];
    categories: TaxonCategoryKey[];
    genera: string[];
    /** Plusieurs statuts. */
    statuses: Status[] | null;
    habitats: Habitat[] | null;
    /** Numéro du département. */
    department: string | null;
    /** Commune telle qu'écrite (comparée sans casse ni accents). */
    commune: string | null;
    /** Période ou année entièrement à venir : aucune observation. */
    nothing: boolean;
}

/** Où en est la recherche d'un lieu (position actuelle ou lieu nommé). */
export type NearResolution =
    | { status: 'pending' }
    | { status: 'ok'; lat: number; lon: number }
    /** Géolocalisation refusée par la personne ou le navigateur. */
    | { status: 'denied' }
    /** Géolocalisation absente, en échec ou trop longue. */
    | { status: 'unavailable' }
    /** Lieu nommé introuvable. */
    | { status: 'not_found' }
    /** Lieu nommé : la recherche demande une connexion. */
    | { status: 'offline' }
    /** Lieu nommé : le service de recherche d'adresse n'a pas répondu. */
    | { status: 'error' };

/** Ce qu'une étiquette représente : retirer l'étiquette retire ce critère. */
export type CriterionRef =
    | { field: 'period' | 'years' | 'department' | 'commune' | 'near' | 'text' }
    | { field: 'groups' | 'categories' | 'genera' | 'statuses' | 'habitats'; value: string };

export interface SearchChip {
    id: string;
    label: string;
    /** `warning` : appliqué mais à lire (rien à venir) ; `error` : NON appliqué. */
    tone: 'ok' | 'warning' | 'error';
    ref: CriterionRef;
}

export interface FilterPlan {
    writes: ExistingFilterWrites;
    /** Critère qui a écrit chaque filtre existant (pour le détacher si la personne le change). */
    owners: Partial<Record<ExistingFilterField, SearchField>>;
    aiFilter: AiFilter | null;
    chips: SearchChip[];
    /** Messages à afficher sous les étiquettes (critères mal lus, années ignorées…). */
    notes: string[];
}

export const STATUS_LABELS: Readonly<Record<Status, string>> = {
    [Status.NE]: 'non évaluée',
    [Status.DD]: 'données insuffisantes',
    [Status.LC]: 'préoccupation mineure',
    [Status.NT]: 'quasi menacée',
    [Status.VU]: 'vulnérable',
    [Status.EN]: 'en danger',
    [Status.CR]: 'en danger critique',
    [Status.EW]: "éteinte à l'état sauvage",
    [Status.EX]: 'éteinte',
};

const FIELD_LABELS: Readonly<Record<SearchField, string>> = {
    period: 'la période',
    years: 'les années',
    groups: 'les groupes',
    categories: 'les catégories',
    genera: 'les genres',
    statuses: 'les statuts',
    habitats: 'les habitats',
    department: 'le département',
    commune: 'la commune',
    near: 'le lieu',
    text: 'le nom cherché',
};

const formatKm = (km: number): string => `${String(km).replace('.', ',')} km`;

const formatYears = (years: readonly number[]): string => {
    if (years.length === 1) return String(years[0]);
    const contiguous = years.every((year, index) => index === 0 || year === years[index - 1] + 1);
    if (contiguous && years.length > 2) return `de ${years[0]} à ${years[years.length - 1]}`;
    return `${years.slice(0, -1).join(', ')} et ${years[years.length - 1]}`;
};

const joinFr = (items: readonly string[]): string =>
    items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`;

const categoryLabel = (key: string): string =>
    TAXON_CATEGORIES.find(category => category.key === key)?.label ?? key;

/**
 * Texte libre prêt pour la recherche par nom (sous-chaîne) : un pluriel
 * simple est ramené au singulier (« canards colverts » trouve « Canard
 * colvert »). Retirer un « s » ou un « x » final ne fait qu'élargir la
 * recherche, jamais la restreindre.
 */
export const singularizeSearchText = (text: string): string =>
    text.split(/(\s+)/).map(part => (/^\p{L}{4,}$/u.test(part) && /[sx]$/i.test(part) && !/ss$/i.test(part) ? part.slice(0, -1) : part)).join('');

/** Libellé de l'étiquette « près de… » selon l'état de la recherche du lieu. */
export const nearLabel = (near: SearchNear, resolution: NearResolution | undefined): { label: string; tone: SearchChip['tone'] } => {
    const where = near.kind === 'current_position' ? 'autour de ma position actuelle' : `autour de ${near.placeName ?? ''}`;
    const base = `${where} (${formatKm(near.radiusKm)})`;
    switch (resolution?.status) {
        case undefined:
        case 'ok':
            return { label: base, tone: 'ok' };
        case 'pending':
            return { label: `${base} : ${near.kind === 'current_position' ? 'localisation' : 'recherche du lieu'} en cours…`, tone: 'warning' };
        case 'denied':
            return { label: `${base} : position refusée, critère non appliqué`, tone: 'error' };
        case 'unavailable':
            return { label: `${base} : position introuvable, critère non appliqué`, tone: 'error' };
        case 'not_found':
            return { label: `${base} : lieu introuvable, critère non appliqué`, tone: 'error' };
        case 'offline':
            return { label: `${base} : lieu à chercher en ligne, critère non appliqué`, tone: 'error' };
        default:
            return { label: `${base} : recherche du lieu impossible, critère non appliqué`, tone: 'error' };
    }
};

/**
 * Traduit des critères en filtres, au moment d'appliquer (`now`). `near` :
 * la position ou le lieu déjà cherchés (jamais cherchés ici). Sans
 * résolution réussie, le critère « près de » n'est PAS appliqué, et son
 * étiquette le dit.
 */
export const buildFilterPlan = (criteria: SearchCriteria, now: Date, near?: NearResolution): FilterPlan => {
    const writes: ExistingFilterWrites = {};
    const owners: FilterPlan['owners'] = {};
    const chips: SearchChip[] = [];
    const notes: string[] = [];
    const aiFilter: AiFilter = {
        months: null, years: null, groups: [], categories: [], genera: [], statuses: null, habitats: null,
        department: null, commune: null, nothing: false,
    };
    const today = dateToIsoLocal(now);
    const currentYear = now.getFullYear();

    // Années écrites : une année à venir ne donne rien.
    const pastYears = criteria.years.filter(year => year <= currentYear);
    if (criteria.years.length > 0) {
        if (pastYears.length === 0) {
            aiFilter.nothing = true;
            chips.push({ id: 'years', label: `${formatYears(criteria.years)} : année à venir, aucune observation`, tone: 'warning', ref: { field: 'years' } });
        } else {
            if (pastYears.length === 1) {
                writes.yearFilter = String(pastYears[0]);
                owners.yearFilter = 'years';
            } else {
                aiFilter.years = pastYears;
            }
            chips.push({ id: 'years', label: formatYears(pastYears), tone: 'ok', ref: { field: 'years' } });
            if (pastYears.length < criteria.years.length) notes.push('Les années à venir sont ignorées.');
        }
    }

    if (criteria.period) {
        const resolved = resolvePeriod(criteria.period, now);
        let tone: SearchChip['tone'] = 'ok';
        let label = resolved.label;
        switch (resolved.kind) {
            case 'range':
                writes.startDateFilter = resolved.start;
                writes.endDateFilter = resolved.end;
                owners.startDateFilter = 'period';
                owners.endDateFilter = 'period';
                break;
            case 'year':
                if (writes.yearFilter !== undefined) {
                    // Jamais une étiquette d'année qui ne filtre rien : l'année écrite l'emporte.
                    tone = 'error';
                    label = `${label} : ignoré, l'année écrite l'emporte`;
                } else {
                    writes.yearFilter = String(resolved.year);
                    owners.yearFilter = 'period';
                }
                break;
            case 'months': {
                aiFilter.months = resolved.months;
                // Mois d'une année écrite, tous encore à venir (« décembre 2026 » en novembre 2026).
                if (pastYears.length > 0 && pastYears.every(year => resolved.months.every(m => monthStart(year, m) > today))) {
                    aiFilter.nothing = true;
                    tone = 'warning';
                    label = `${label} : période à venir, aucune observation`;
                }
                break;
            }
            case 'future':
                aiFilter.nothing = true;
                tone = 'warning';
                break;
        }
        chips.push({ id: 'period', label, tone, ref: { field: 'period' } });
    }

    // Taxons : groupe unique dans le filtre existant ; sinon tout ensemble
    // dans l'AiFilter (union : un groupe OU une catégorie OU un genre).
    const singleGroup = criteria.groups.length === 1 && criteria.categories.length === 0 && criteria.genera.length === 0;
    if (singleGroup) {
        writes.taxonomicGroupFilter = criteria.groups[0];
        owners.taxonomicGroupFilter = 'groups';
    } else {
        aiFilter.groups = [...criteria.groups];
        aiFilter.categories = [...criteria.categories];
        aiFilter.genera = [...criteria.genera];
    }
    for (const group of criteria.groups) chips.push({ id: `groups:${group}`, label: group, tone: 'ok', ref: { field: 'groups', value: group } });
    for (const key of criteria.categories) chips.push({ id: `categories:${key}`, label: categoryLabel(key), tone: 'ok', ref: { field: 'categories', value: key } });
    for (const genus of criteria.genera) chips.push({ id: `genera:${genus}`, label: `genre ${genus}`, tone: 'ok', ref: { field: 'genera', value: genus } });

    if (criteria.statuses.length === 1) {
        writes.statusFilter = criteria.statuses[0];
        owners.statusFilter = 'statuses';
    } else if (criteria.statuses.length > 1) {
        aiFilter.statuses = [...criteria.statuses];
    }
    for (const status of criteria.statuses) {
        chips.push({ id: `statuses:${status}`, label: `statut ${status} (${STATUS_LABELS[status]})`, tone: 'ok', ref: { field: 'statuses', value: status } });
    }

    if (criteria.habitats.length > 0) aiFilter.habitats = [...criteria.habitats];
    for (const habitat of criteria.habitats) chips.push({ id: `habitats:${habitat}`, label: habitat, tone: 'ok', ref: { field: 'habitats', value: habitat } });

    if (criteria.department) {
        const code = normalizeDepartment(criteria.department);
        if (code) {
            aiFilter.department = code;
            chips.push({ id: 'department', label: `${departmentName(code) ?? code} (${code})`, tone: 'ok', ref: { field: 'department' } });
        } else {
            chips.push({ id: 'department', label: `département « ${criteria.department} » inconnu : critère non appliqué`, tone: 'error', ref: { field: 'department' } });
        }
    }

    if (criteria.commune) {
        aiFilter.commune = criteria.commune;
        chips.push({ id: 'commune', label: `commune : ${criteria.commune}`, tone: 'ok', ref: { field: 'commune' } });
    }

    if (criteria.near) {
        const { label, tone } = nearLabel(criteria.near, near);
        if (near?.status === 'ok') {
            writes.geo = { lat: near.lat, lon: near.lon, radiusKm: criteria.near.radiusKm };
            owners.geo = 'near';
        }
        chips.push({ id: 'near', label, tone, ref: { field: 'near' } });
    }

    if (criteria.text) {
        writes.searchTerm = singularizeSearchText(criteria.text);
        owners.searchTerm = 'text';
        chips.push({ id: 'text', label: `nom ou lieu contenant « ${criteria.text} »`, tone: 'ok', ref: { field: 'text' } });
    }

    if (criteria.dropped.length > 0) {
        notes.push(`L'assistant a mal lu ${joinFr(criteria.dropped.map(field => FIELD_LABELS[field]))} : ${criteria.dropped.length > 1 ? 'ces critères ne sont pas appliqués' : "ce critère n'est pas appliqué"}.`);
    }

    const hasAiFilter = aiFilter.nothing || aiFilter.months !== null || aiFilter.years !== null || aiFilter.groups.length > 0
        || aiFilter.categories.length > 0 || aiFilter.genera.length > 0 || aiFilter.statuses !== null || aiFilter.habitats !== null
        || aiFilter.department !== null || aiFilter.commune !== null;
    return { writes, owners, aiFilter: hasAiFilter ? aiFilter : null, chips, notes };
};

/** Retire un critère (étiquette retirée par la personne). */
export const removeCriterion = (criteria: SearchCriteria, ref: CriterionRef): SearchCriteria => {
    const next: SearchCriteria = { ...criteria };
    switch (ref.field) {
        case 'period': next.period = null; break;
        case 'years': next.years = []; break;
        case 'department': next.department = null; break;
        case 'commune': next.commune = null; break;
        case 'near': next.near = null; break;
        case 'text': next.text = null; break;
        case 'groups': next.groups = criteria.groups.filter(value => value !== ref.value); break;
        case 'categories': next.categories = criteria.categories.filter(value => value !== ref.value); break;
        case 'genera': next.genera = criteria.genera.filter(value => value !== ref.value); break;
        case 'statuses': next.statuses = criteria.statuses.filter(value => value !== ref.value); break;
        case 'habitats': next.habitats = criteria.habitats.filter(value => value !== ref.value); break;
    }
    return next;
};

/** Retire tous les critères d'un champ (la personne a changé le filtre existant qu'il avait écrit). */
export const removeCriterionField = (criteria: SearchCriteria, field: SearchField): SearchCriteria => {
    switch (field) {
        case 'groups': return { ...criteria, groups: [] };
        case 'categories': return { ...criteria, categories: [] };
        case 'genera': return { ...criteria, genera: [] };
        case 'statuses': return { ...criteria, statuses: [] };
        case 'habitats': return { ...criteria, habitats: [] };
        case 'years': return { ...criteria, years: [] };
        default: return removeCriterion(criteria, { field });
    }
};

// ---------------------------------------------------------------------------
// Application de l'AiFilter aux observations
// ---------------------------------------------------------------------------

const CATEGORY_GENERA: ReadonlyMap<string, ReadonlySet<string>> = new Map(
    TAXON_CATEGORIES.map(category => [category.key, new Set(category.genera.map(genus => genus.toLowerCase()))]),
);

const latinWords = (latinName: string | undefined | null): string[] =>
    (latinName ?? '').trim().toLowerCase().split(/\s+/).filter(word => word.length > 0);

const hasTaxa = (filter: AiFilter): boolean =>
    filter.groups.length > 0 || filter.categories.length > 0 || filter.genera.length > 0;

/** Dans l'un des groupes, l'une des catégories ou l'un des genres. */
const matchesTaxa = (observation: Observation, filter: AiFilter): boolean => {
    if (!hasTaxa(filter)) return true;
    if (filter.groups.includes(observation.taxonomicGroup)) return true;
    const words = latinWords(observation.latinName);
    if (words.length === 0) return false;
    // Catégorie : le premier mot du nom latin est l'un de ses genres.
    if (filter.categories.some(key => CATEGORY_GENERA.get(key)?.has(words[0]))) return true;
    // Genre seul : premier mot ; genre et épithète : deux premiers mots.
    return filter.genera.some(name => {
        const parts = name.toLowerCase().split(' ');
        return parts.every((part, index) => words[index] === part);
    });
};

/** Tous les critères sauf les taxons. */
const matchesOthers = (observation: Observation, filter: AiFilter): boolean => {
    if (filter.nothing) return false;
    const date = observation.date ?? '';
    if (filter.months !== null) {
        const month = Number(date.slice(5, 7));
        if (!filter.months.includes(month)) return false;
    }
    if (filter.years !== null) {
        const year = Number(date.slice(0, 4));
        if (!filter.years.includes(year)) return false;
    }
    if (filter.statuses !== null && !filter.statuses.includes(observation.status)) return false;
    if (filter.habitats !== null && (!observation.habitat || !filter.habitats.includes(observation.habitat))) return false;
    if (filter.department !== null && !observationInDepartment(observation.department, filter.department)) return false;
    if (filter.commune !== null && foldPlaceName(observation.municipality ?? '') !== foldPlaceName(filter.commune)) return false;
    return true;
};

export const matchesAiFilter = (observation: Observation, filter: AiFilter): boolean =>
    matchesOthers(observation, filter) && matchesTaxa(observation, filter);

/**
 * Applique l'AiFilter. `excludedNoLatinName` : observations qui passaient
 * tous les autres critères mais qu'une catégorie ou un genre ne peut pas
 * reconnaître, faute de nom latin (affiché sous les étiquettes).
 */
export const applyAiFilter = (observations: readonly Observation[], filter: AiFilter | null | undefined): { kept: Observation[]; excludedNoLatinName: number } => {
    if (!filter) return { kept: [...observations], excludedNoLatinName: 0 };
    const kept: Observation[] = [];
    let excludedNoLatinName = 0;
    const byLatinName = filter.categories.length > 0 || filter.genera.length > 0;
    for (const observation of observations) {
        if (!matchesOthers(observation, filter)) continue;
        if (matchesTaxa(observation, filter)) kept.push(observation);
        else if (byLatinName && latinWords(observation.latinName).length === 0) excludedNoLatinName += 1;
    }
    return { kept, excludedNoLatinName };
};

/** Libellé court des critères d'un AiFilter (préréglage refusé, résumé). */
export const describeAiFilterParts = (filter: AiFilter): string[] => {
    const parts: string[] = [];
    if (filter.months) parts.push('mois');
    if (filter.years) parts.push('années');
    if (hasTaxa(filter)) parts.push('groupes, catégories ou genres');
    if (filter.statuses) parts.push('statuts');
    if (filter.habitats) parts.push('habitats');
    if (filter.department) parts.push('département');
    if (filter.commune) parts.push('commune');
    return parts;
};
