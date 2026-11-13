// Bilan du mois : chiffres calculés par l'application (gratuits, toujours
// affichés) et charge utile envoyée à `ai-text` pour la rédaction.
//
// Fonctions pures, sans accès au stockage ni au réseau.
//
// Contrat : la charge utile doit passer `validateSummaryInput`
// (supabase/functions/ai-text/logic.ts) — mêmes champs, mêmes bornes. Rien
// d'autre n'est envoyé : ni lieu, ni commune, ni GPS, ni commentaire, ni
// observateur, ni date précise (seulement le mois `YYYY-MM`).

import { TaxonomicGroup, type Observation } from '../types';
import { normalizeSearchText } from './textUtils';

/** Bornes de `validateSummaryInput` (`SUMMARY_LIMITS` côté fonction). */
export const MONTHLY_SUMMARY_LIMITS = {
    maxSpeciesNameLength: 120,
    maxTopSpecies: 15,
    maxNewSpecies: 30,
    maxCount: 1_000_000,
    /** Marge sous les 16 Ko du corps de requête (`MAX_BODY_BYTES`). */
    maxPayloadBytes: 15_000,
} as const;

const GROUP_VALUES: readonly string[] = Object.values(TaxonomicGroup);

export interface MonthlyTotals {
    observations: number;
    species: number;
    activeDays: number;
}

export interface MonthlyGroup {
    group: string;
    observations: number;
    species: number;
}

/** Charge utile exacte de `{ feature: 'summary', payload }`. */
export interface MonthlySummaryPayload {
    month: string;
    provisional: boolean;
    totals: MonthlyTotals;
    groups: MonthlyGroup[];
    topSpecies: { name: string; count: number }[];
    newSpecies: string[];
    newSpeciesMore: number;
    previousYear: MonthlyTotals | null;
}

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_RE = /^(\d{4}-(0[1-9]|1[0-2]))-(\d{2})/;

// Caractères de contrôle et de format invisibles (dont bidi) : retirés des
// noms, comme le fait la fonction (`cleanInlineText`).
const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;
const FORMAT_CHARS_RE = /\p{Cf}/gu;

/**
 * Nom lisible et borné, ou chaîne vide. La borne est comptée comme la
 * fonction (`string.length`, en unités UTF-16) : 120 au plus, sans couper un
 * caractère en deux.
 */
export const cleanSpeciesName = (value: string | undefined | null): string => {
    const cleaned = (value ?? '').replace(FORMAT_CHARS_RE, '').replace(CONTROL_CHARS_RE, ' ').replace(/\s+/g, ' ').trim();
    if (cleaned.length <= MONTHLY_SUMMARY_LIMITS.maxSpeciesNameLength) return cleaned;
    let result = '';
    for (const char of cleaned) {
        if (result.length + char.length > MONTHLY_SUMMARY_LIMITS.maxSpeciesNameLength) break;
        result += char;
    }
    return result.trim();
};

const clampCount = (value: number): number => Math.min(MONTHLY_SUMMARY_LIMITS.maxCount, Math.max(0, value));

/** Effectif d'une observation : entier positif, 1 si absent ou invalide. */
const observationCount = (observation: Observation): number => {
    const count = Number(observation.count);
    return Number.isFinite(count) && count >= 1 ? Math.floor(count) : 1;
};

const observationMonth = (observation: Observation): string | null => DATE_RE.exec(observation.date ?? '')?.[1] ?? null;

// ---------------------------------------------------------------------------
// Clé d'espèce unique
// ---------------------------------------------------------------------------

export interface SpeciesKeyResolver {
    /** Clé de l'espèce, ou null si l'observation n'a aucun nom. */
    keyOf(observation: Observation): string | null;
    /** Nom affiché pour une clé, d'après tout le carnet (le bilan utilise `speciesNamesFor`). */
    nameOf(key: string): string;
    /** Nom latin lisible d'une clé, d'après tout le carnet ('' si inconnu). */
    latinOf(key: string): string;
}

/** Soin apporté à une graphie : majuscule et accents comptent. */
const spellingCare = (name: string): number =>
    (/\p{Lu}/u.test(name) ? 1 : 0) + (/[\u0300-\u036f]/.test(name.normalize('NFD')) ? 1 : 0);

/**
 * Choisit une graphie parmi des comptes, SANS dépendre de l'ordre des
 * observations : la plus fréquente, puis la plus soignée (majuscule,
 * accents), puis l'ordre alphabétique.
 */
const pickName = (counts: Map<string, number> | undefined): string => {
    if (!counts || counts.size === 0) return '';
    return [...counts.entries()].sort((a, b) =>
        b[1] - a[1]
        || spellingCare(b[0]) - spellingCare(a[0])
        || a[0].localeCompare(b[0], 'fr'))[0][0];
};

const addCount = (map: Map<string, Map<string, number>>, key: string, name: string) => {
    if (!name) return;
    const counts = map.get(key) ?? new Map<string, number>();
    counts.set(name, (counts.get(name) ?? 0) + 1);
    map.set(key, counts);
};

/**
 * Une seule clé par espèce : le nom latin normalisé ; à défaut, le nom latin
 * trouvé ailleurs dans le carnet pour le même nom courant (le plus fréquent) ;
 * à défaut, le nom courant normalisé. Ainsi « Mésange charbonnière » saisie
 * une fois sans nom latin n'est pas comptée comme une seconde espèce.
 */
export const buildSpeciesKeyResolver = (observations: readonly Observation[]): SpeciesKeyResolver => {
    const latinsByCommon = new Map<string, Map<string, number>>();
    for (const observation of observations) {
        const common = normalizeSearchText(observation.speciesName ?? '');
        const latin = normalizeSearchText(observation.latinName ?? '');
        if (common && latin) addCount(latinsByCommon, common, latin);
    }
    const latinByCommon = new Map<string, string>();
    for (const [common, counts] of latinsByCommon) latinByCommon.set(common, pickName(counts));

    const keyOf = (observation: Observation): string | null => {
        const latin = normalizeSearchText(observation.latinName ?? '');
        if (latin) return `l:${latin}`;
        const common = normalizeSearchText(observation.speciesName ?? '');
        if (!common) return null;
        const mapped = latinByCommon.get(common);
        return mapped ? `l:${mapped}` : `c:${common}`;
    };

    const commonNames = new Map<string, Map<string, number>>();
    const latinNames = new Map<string, Map<string, number>>();
    for (const observation of observations) {
        const key = keyOf(observation);
        if (!key) continue;
        addCount(commonNames, key, cleanSpeciesName(observation.speciesName));
        addCount(latinNames, key, cleanSpeciesName(observation.latinName));
    }

    const latinOf = (key: string): string => pickName(latinNames.get(key));
    const nameOf = (key: string): string => pickName(commonNames.get(key)) || latinOf(key);

    return { keyOf, nameOf, latinOf };
};

/**
 * Noms affichés et envoyés pour les espèces d'UN mois, calculés sur les
 * seules observations de ce mois : une saisie faite un autre mois ne change
 * jamais les noms (donc l'empreinte) d'un mois terminé. Deux espèces
 * différentes qui partagent un nom courant sont distinguées par leur nom
 * latin : « Pouillot (Phylloscopus collybita) ».
 */
export const speciesNamesFor = (monthObservations: readonly Observation[], resolver: SpeciesKeyResolver): Map<string, string> => {
    const commonNames = new Map<string, Map<string, number>>();
    const latinNames = new Map<string, Map<string, number>>();
    for (const observation of monthObservations) {
        const key = resolver.keyOf(observation);
        if (!key) continue;
        addCount(commonNames, key, cleanSpeciesName(observation.speciesName));
        addCount(latinNames, key, cleanSpeciesName(observation.latinName));
    }
    const keys = new Set([...commonNames.keys(), ...latinNames.keys()]);
    const names = new Map<string, string>();
    for (const key of keys) {
        const latin = pickName(latinNames.get(key)) || resolver.latinOf(key);
        names.set(key, pickName(commonNames.get(key)) || latin);
    }
    // Homonymes : même nom affiché pour plusieurs clés.
    const byName = new Map<string, string[]>();
    for (const [key, name] of names) {
        const normalized = normalizeSearchText(name);
        byName.set(normalized, [...(byName.get(normalized) ?? []), key]);
    }
    for (const sharedKeys of byName.values()) {
        if (sharedKeys.length < 2) continue;
        for (const key of sharedKeys) {
            const latin = pickName(latinNames.get(key)) || resolver.latinOf(key);
            const name = names.get(key) ?? '';
            if (latin && normalizeSearchText(latin) !== normalizeSearchText(name)) names.set(key, cleanSpeciesName(`${name} (${latin})`));
        }
    }
    return names;
};

/** Mois (`YYYY-MM`) de la première observation de chaque espèce. */
export const firstSeenMonths = (observations: readonly Observation[], resolver: SpeciesKeyResolver): Map<string, string> => {
    const first = new Map<string, string>();
    for (const observation of observations) {
        const key = resolver.keyOf(observation);
        const month = observationMonth(observation);
        if (!key || !month) continue;
        const known = first.get(key);
        if (!known || month < known) first.set(key, month);
    }
    return first;
};

// ---------------------------------------------------------------------------
// Mois
// ---------------------------------------------------------------------------

export const monthKey = (date: Date): string =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

export const shiftMonth = (month: string, delta: number): string => {
    const match = MONTH_RE.exec(month);
    if (!match) return month;
    const date = new Date(Number(match[1]), Number(match[2]) - 1 + delta, 1);
    return monthKey(date);
};

/** Les `count` derniers mois, du plus récent (mois en cours) au plus ancien. */
export const selectableMonths = (now: Date = new Date(), count = 12): string[] => {
    const current = monthKey(now);
    return Array.from({ length: count }, (_, index) => shiftMonth(current, -index));
};

/** Mois proposé par défaut : le dernier mois complet. */
export const defaultSummaryMonth = (now: Date = new Date()): string => shiftMonth(monthKey(now), -1);

const MONTH_LABELS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export const formatMonthLabel = (month: string): string => {
    const match = MONTH_RE.exec(month);
    if (!match) return month;
    return `${MONTH_LABELS[Number(match[2]) - 1]} ${match[1]}`;
};

// ---------------------------------------------------------------------------
// Chiffres du mois
// ---------------------------------------------------------------------------

export interface MonthlySummaryStats {
    month: string;
    /** Mois en cours : chiffres provisoires. */
    provisional: boolean;
    totals: MonthlyTotals;
    /** Par nombre d'observations décroissant. */
    groups: MonthlyGroup[];
    /** Toutes les espèces du mois, par effectif décroissant. */
    species: { name: string; count: number }[];
    /** Toutes les espèces vues pour la première fois ce mois-ci (ordre alphabétique). */
    newSpecies: string[];
    /** Même mois de l'année précédente ; null pour le mois en cours ou si le carnet ne couvre pas ce mois en entier. */
    previousYear: MonthlyTotals | null;
}

const totalsFor = (observations: readonly Observation[], resolver: SpeciesKeyResolver): MonthlyTotals => {
    const species = new Set<string>();
    const days = new Set<string>();
    for (const observation of observations) {
        const key = resolver.keyOf(observation);
        if (key) species.add(key);
        days.add((observation.date ?? '').slice(0, 10));
    }
    return {
        observations: clampCount(observations.length),
        species: clampCount(species.size),
        activeDays: Math.min(31, days.size),
    };
};

/**
 * Chiffres d'un mois, calculés sur toutes les observations chargées.
 * `now` fixe le mois en cours (provisoire).
 */
export const computeMonthlySummaryStats = (
    observations: readonly Observation[],
    month: string,
    now: Date = new Date(),
): MonthlySummaryStats => {
    const resolver = buildSpeciesKeyResolver(observations);
    const inMonth = observations.filter(observation => observationMonth(observation) === month);

    const groupStats = new Map<string, { observations: number; species: Set<string> }>();
    const speciesCounts = new Map<string, number>();
    for (const observation of inMonth) {
        const group = GROUP_VALUES.includes(observation.taxonomicGroup) ? observation.taxonomicGroup : TaxonomicGroup.OTHER;
        const entry = groupStats.get(group) ?? { observations: 0, species: new Set<string>() };
        entry.observations += 1;
        const key = resolver.keyOf(observation);
        if (key) {
            entry.species.add(key);
            speciesCounts.set(key, clampCount((speciesCounts.get(key) ?? 0) + observationCount(observation)));
        }
        groupStats.set(group, entry);
    }

    const groups = [...groupStats.entries()]
        .map(([group, entry]) => ({ group, observations: clampCount(entry.observations), species: clampCount(entry.species.size) }))
        .sort((a, b) => b.observations - a.observations || b.species - a.species || a.group.localeCompare(b.group, 'fr'));

    const names = speciesNamesFor(inMonth, resolver);
    const species = [...speciesCounts.entries()]
        .map(([key, count]) => ({ name: names.get(key) ?? '', count }))
        .filter(item => item.name.length > 0)
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fr'));

    const firstSeen = firstSeenMonths(observations, resolver);
    const newSpecies = [...speciesCounts.keys()]
        .filter(key => firstSeen.get(key) === month)
        .map(key => names.get(key) ?? '')
        .filter(name => name.length > 0)
        .sort((a, b) => a.localeCompare(b, 'fr'));

    // Comparaison avec l'an passé seulement entre deux mois COMPLETS : pas
    // pour le mois en cours (il serait comparé à un mois entier), et pas si
    // le carnet a commencé après le 1er de ce mois-là (mois incomplet).
    const provisional = month === monthKey(now);
    const previousMonth = shiftMonth(month, -12);
    const firstDate = observations.reduce<string | null>((earliest, observation) => {
        const date = DATE_RE.test(observation.date ?? '') ? observation.date.slice(0, 10) : null;
        return date && (!earliest || date < earliest) ? date : earliest;
    }, null);
    const comparable = !provisional && firstDate !== null && firstDate <= `${previousMonth}-01`;
    const previousYear = comparable
        ? totalsFor(observations.filter(observation => observationMonth(observation) === previousMonth), resolver)
        : null;

    return {
        month,
        provisional,
        totals: totalsFor(inMonth, resolver),
        groups,
        species,
        newSpecies,
        previousYear,
    };
};

const byteLength = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).length;

/**
 * Charge utile envoyée à `ai-text` : 15 premières espèces par effectif, 30
 * espèces nouvelles au plus puis « + N autres ». Si des noms très longs
 * faisaient dépasser la taille du corps, des espèces nouvelles passent dans
 * le compte « + N autres » : jamais de refus pour un mois chargé.
 */
export const buildMonthlySummaryPayload = (stats: MonthlySummaryStats): MonthlySummaryPayload => {
    const listed = stats.newSpecies.slice(0, MONTHLY_SUMMARY_LIMITS.maxNewSpecies);
    const payload: MonthlySummaryPayload = {
        month: stats.month,
        provisional: stats.provisional,
        totals: { ...stats.totals },
        groups: stats.groups.map(group => ({ ...group })),
        topSpecies: stats.species.slice(0, MONTHLY_SUMMARY_LIMITS.maxTopSpecies).map(item => ({ ...item })),
        newSpecies: listed,
        newSpeciesMore: clampCount(stats.newSpecies.length - listed.length),
        previousYear: stats.previousYear ? { ...stats.previousYear } : null,
    };
    while (payload.newSpecies.length > 0 && byteLength({ feature: 'summary', payload }) > MONTHLY_SUMMARY_LIMITS.maxPayloadBytes) {
        payload.newSpecies = payload.newSpecies.slice(0, -1);
        payload.newSpeciesMore = clampCount(payload.newSpeciesMore + 1);
    }
    return payload;
};

/**
 * Empreinte des chiffres envoyés (hors mention « provisoire ») : un bilan
 * conservé dont l'empreinte diffère a été rédigé sur d'autres chiffres.
 */
export const summaryFingerprint = (payload: MonthlySummaryPayload): string => {
    const { provisional: _provisional, ...numbers } = payload;
    const text = JSON.stringify(numbers);
    // FNV-1a 32 bits : suffisant pour détecter un changement, rien de secret.
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `${hash.toString(16).padStart(8, '0')}-${text.length}`;
};
