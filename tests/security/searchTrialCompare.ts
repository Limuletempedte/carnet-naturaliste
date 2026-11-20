// Comparaison des réponses de la recherche en langage naturel aux filtres
// attendus du jeu d'essai (tests/security/fixtures/ai-text-trial-search.json).
//
// Module pur, sans réseau : importé par le script d'essai
// (tests/security/ai-text-trial.mjs, sous Deno) et testé par Vitest
// (tests/searchTrialCompare.test.ts), pour qu'une comparaison trop
// indulgente (faux vert) ne puisse pas s'installer.
//
// Règles, STRICTES :
// - un champ absent de `expected` doit rester vide (sinon « inventé ») ;
// - plusieurs réponses admises s'écrivent `{ "oneOf": [a, b] }` ; null dans
//   la liste admet le champ vide ;
// - listes (années, groupes, catégories, genres, statuts, habitats) :
//   ensembles ÉGAUX, sans doublon ; un élément en trop ou en moins est faux,
//   jamais une simple inclusion ;
// - textes (département, commune, lieu, texte libre) : égalité après
//   normalisation (casse, accents, pluriel en -s/-x, article en tête),
//   jamais une inclusion ;
// - période et proximité : type et champs utiles égaux ; rayon attendu
//   10 km quand l'entrée n'en donne pas (valeur par défaut de la fonction) ;
// - un champ retiré par le validateur (nommé dans `dropped`) a son propre
//   verdict, « retiré », jamais « juste » : la sortie validée le montre vide,
//   mais le modèle s'était trompé ;
// - fuites : recherche sans casse ni accents dans toute la réponse.

import {
    ALLOWED_TAXONOMIC_GROUPS,
    SEARCH_CATEGORY_KEYS,
    SEARCH_FIELDS,
    SEARCH_HABITATS,
    SEARCH_LIMITS,
    SEARCH_NEAR_KINDS,
    SEARCH_PERIOD_KINDS,
    SEARCH_SEASONS,
    SEARCH_STATUSES,
    SEARCH_YEAR_SCOPES,
    type SearchField,
    type SearchNear,
    type SearchOutput,
    type SearchPeriod,
} from '../../supabase/functions/ai-text/logic.ts';
import { foldText, normalizeName, normalizePlace } from './noteTrialCompare.ts';

export type Verdict = 'ok' | 'invente' | 'manque' | 'faux' | 'retire';

export interface SearchTrialItem {
    label: string;
    expected: Partial<Record<SearchField, unknown>>;
    forbidden?: string[];
}

export interface SearchComparison {
    verdicts: Record<SearchField, Verdict>;
    leaks: string[];
    dropped: SearchField[];
}

const LIST_CHOICES: Partial<Record<SearchField, readonly string[]>> = {
    groups: ALLOWED_TAXONOMIC_GROUPS,
    categories: SEARCH_CATEGORY_KEYS,
    statuses: SEARCH_STATUSES,
    habitats: SEARCH_HABITATS,
};
const LIST_FIELDS: readonly SearchField[] = ['years', 'groups', 'categories', 'genera', 'statuses', 'habitats'];
const TEXT_FIELDS: readonly SearchField[] = ['department', 'commune', 'text'];

/** Champs utiles de chaque type de période. */
const PERIOD_KEYS: Record<SearchPeriod['kind'], (keyof SearchPeriod)[]> = {
    this_month: [],
    last_month: [],
    this_year: [],
    last_year: [],
    last_n_days: ['days'],
    month: ['month', 'yearScope'],
    season: ['season', 'yearScope'],
};

/** Options admises pour un champ : `{ oneOf: [...] }` ou une seule valeur. */
function optionsOf(raw: unknown): unknown[] {
    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw) && 'oneOf' in raw) {
        return (raw as { oneOf: unknown[] }).oneOf;
    }
    return [raw];
}

function isEmptyOption(field: SearchField, option: unknown): boolean {
    if (option === null) return true;
    if (LIST_FIELDS.includes(field)) return Array.isArray(option) && option.length === 0;
    if (field === 'period' || field === 'near') return (option as { kind?: string }).kind === 'none';
    return option === '';
}

function isEmptyResult(field: SearchField, value: unknown): boolean {
    if (LIST_FIELDS.includes(field)) return (value as unknown[]).length === 0;
    return value === null;
}

/** Ensembles égaux (doublons ignorés des deux côtés), jamais une inclusion. */
export function sameSet(expected: readonly unknown[], got: readonly unknown[]): boolean {
    const a = new Set(expected);
    const b = new Set(got);
    return a.size === b.size && [...a].every(item => b.has(item));
}

function samePeriod(expected: Partial<SearchPeriod>, got: SearchPeriod): boolean {
    if (expected.kind !== got.kind) return false;
    return PERIOD_KEYS[got.kind].every(key => {
        // Mois ou saison sans précision d'année : « all » par défaut.
        const wanted = expected[key] ?? (key === 'yearScope' ? 'all' : null);
        return wanted === got[key];
    });
}

function sameNear(expected: Partial<SearchNear>, got: SearchNear): boolean {
    if (expected.kind !== got.kind) return false;
    if ((expected.radiusKm ?? SEARCH_LIMITS.defaultRadiusKm) !== got.radiusKm) return false;
    if (got.kind !== 'place') return true;
    return typeof expected.placeName === 'string' && got.placeName !== null && normalizePlace(expected.placeName) === normalizePlace(got.placeName);
}

function sameValue(field: SearchField, expected: unknown, got: unknown): boolean {
    if (field === 'period') return samePeriod(expected as Partial<SearchPeriod>, got as SearchPeriod);
    if (field === 'near') return sameNear(expected as Partial<SearchNear>, got as SearchNear);
    if (LIST_FIELDS.includes(field)) return sameSet(expected as unknown[], got as unknown[]);
    if (field === 'text') return normalizeName(expected as string) === normalizeName(got as string);
    return normalizePlace(expected as string) === normalizePlace(got as string);
}

/** Verdict d'un champ : juste, inventé, manqué ou faux. */
export function judgeSearchField(item: SearchTrialItem, field: SearchField, got: unknown): Verdict {
    const raw = item.expected[field];
    const options = raw === undefined ? [null] : optionsOf(raw);
    const emptyAllowed = options.some(option => isEmptyOption(field, option));
    if (isEmptyResult(field, got)) return emptyAllowed ? 'ok' : 'manque';
    const filled = options.filter(option => !isEmptyOption(field, option));
    if (filled.length === 0) return 'invente';
    return filled.some(option => sameValue(field, option, got)) ? 'ok' : 'faux';
}

/** Compare une réponse de recherche aux filtres attendus de l'entrée. */
export function compareSearch(item: SearchTrialItem, result: SearchOutput): SearchComparison {
    const dropped = result.dropped ?? [];
    const verdicts = Object.fromEntries(SEARCH_FIELDS.map(field => [
        field,
        dropped.includes(field) ? 'retire' : judgeSearchField(item, field, result[field]),
    ])) as Record<SearchField, Verdict>;
    const structured = foldText(JSON.stringify(Object.fromEntries(SEARCH_FIELDS.map(field => [field, result[field]]))));
    const leaks = (item.forbidden ?? []).filter(word => structured.includes(foldText(word)));
    return { verdicts, leaks, dropped };
}

function checkOption(field: SearchField, option: unknown, where: string): void {
    if (option === null) return;
    const fail = (message: string): never => { throw new Error(`${where} : ${field} ${message}`); };
    if (LIST_FIELDS.includes(field)) {
        if (!Array.isArray(option)) fail('doit être une liste');
        const list = option as unknown[];
        if (new Set(list).size !== list.length) fail('contient un doublon');
        const choices = LIST_CHOICES[field];
        for (const value of list) {
            if (field === 'years' && !Number.isInteger(value)) fail('doit contenir des entiers');
            if (field === 'genera' && !(typeof value === 'string' && /^[A-Z][a-z]+(?: [a-z]+(?:-[a-z]+)?)?$/.test(value))) fail(`: « ${String(value)} » n'est pas un genre`);
            if (choices && !choices.includes(value as string)) fail(`: « ${String(value)} » hors de la liste`);
        }
        return;
    }
    if (TEXT_FIELDS.includes(field)) {
        if (typeof option !== 'string') fail('doit être un texte');
        return;
    }
    const record = option as Record<string, unknown>;
    if (typeof record !== 'object' || Array.isArray(record)) fail('doit être un objet');
    if (field === 'period') {
        if (!(SEARCH_PERIOD_KINDS as readonly string[]).includes(record.kind as string)) fail('.kind invalide');
        if (record.season !== undefined && !(SEARCH_SEASONS as readonly string[]).includes(record.season as string)) fail('.season invalide');
        if (record.yearScope !== undefined && !(SEARCH_YEAR_SCOPES as readonly string[]).includes(record.yearScope as string)) fail('.yearScope invalide');
        for (const key of Object.keys(record)) {
            if (!['kind', 'days', 'month', 'season', 'yearScope'].includes(key)) fail(`.${key} inconnu`);
        }
    } else if (field === 'near') {
        if (!(SEARCH_NEAR_KINDS as readonly string[]).includes(record.kind as string)) fail('.kind invalide');
        if (record.kind === 'place' && typeof record.placeName !== 'string') fail('.placeName manquant');
        if (record.radiusKm !== undefined && typeof record.radiusKm !== 'number') fail('.radiusKm doit être un nombre');
        for (const key of Object.keys(record)) {
            if (!['kind', 'placeName', 'radiusKm'].includes(key)) fail(`.${key} inconnu`);
        }
    }
}

/**
 * Vérifie le bloc `expected` d'une entrée : champs connus, valeurs des listes
 * fermées, types, forme de la période et de la proximité. Lève une erreur au
 * premier défaut.
 */
export function checkSearchExpected(item: unknown, file: string): asserts item is SearchTrialItem {
    const record = item as Record<string, unknown> | null;
    const where = `${file} « ${String(record?.label)} »`;
    const expected = record?.expected;
    if (typeof expected !== 'object' || expected === null || Array.isArray(expected)) throw new Error(`${where} : « expected » manquant`);
    for (const [field, value] of Object.entries(expected)) {
        if (!(SEARCH_FIELDS as readonly string[]).includes(field)) throw new Error(`${where} : champ attendu inconnu « ${field} »`);
        for (const option of optionsOf(value)) checkOption(field as SearchField, option, where);
    }
    const forbidden = record?.forbidden;
    if (forbidden !== undefined && !(Array.isArray(forbidden) && forbidden.every(f => typeof f === 'string' && f.length > 0))) {
        throw new Error(`${where} : « forbidden » doit être une liste de textes`);
    }
}
