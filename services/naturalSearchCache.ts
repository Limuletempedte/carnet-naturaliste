// Cache des phrases interprétées par l'assistant (recherche en langage
// naturel) : une phrase déjà interprétée ne coûte rien et marche hors ligne.
//
// - Dans le navigateur seulement, par personne (`ai-search-phrases-v1:<id>`),
//   effacé avec le compte (`ACCOUNT_SCOPED_STORAGE_PREFIXES`) et quand la
//   personne retire son accord à la recherche ou à l'assistant. Gardé après
//   une déconnexion (comme les bilans du mois).
// - Clé : la phrase normalisée (sans casse ni accents ni ponctuation).
// - Valeur : les critères sous leur forme RELATIVE (« le mois dernier »,
//   « autour de ma position actuelle ») : jamais de date calculée, jamais de
//   coordonnées. Chaque entrée est datée.
// - Durée : une entrée expire **12 mois** après l'interprétation ; elle n'est
//   plus relue, et `purgeExpiredNaturalSearches` la retire au démarrage pour
//   TOUS les comptes du navigateur.
// - Versionné : un changement du format ou du dictionnaire des catégories
//   (`TAXON_CATEGORIES_VERSION`) vide le cache.
// - Les 50 dernières phrases.

import { parseSearchResult, type SearchCriteria } from '../utils/aiSearchFilters';
import { normalizePhraseKey } from '../utils/naturalSearchLocal';
import { TAXON_CATEGORIES_VERSION } from '../utils/taxonCategories';
import { assertSessionContext, readAccountValue, writeAccountValue, type SessionContext } from './sessionScope';

export const NATURAL_SEARCH_CACHE_PREFIX = 'ai-search-phrases-v1';
export const NATURAL_SEARCH_CACHE_MAX = 50;
/** Durée de conservation d'une phrase interprétée, en mois. */
export const NATURAL_SEARCH_RETENTION_MONTHS = 12;
/** Format des entrées et version du dictionnaire des catégories. */
export const NATURAL_SEARCH_CACHE_VERSION = `2-categories-${TAXON_CATEGORIES_VERSION}`;

/**
 * Nombre d'effacements depuis le chargement de la page : une réponse partie
 * AVANT un retrait d'accord ne doit pas remplir de nouveau le cache après.
 */
let purges = 0;
export const naturalSearchCachePurges = (): number => purges;

// ---------------------------------------------------------------------------
// Avis aux champs de recherche affichés (plusieurs instances : téléphone,
// ordinateur, remontage après la carte)
// ---------------------------------------------------------------------------

type CacheListener = (event: 'write' | 'purge') => void;
const listeners = new Set<CacheListener>();

/** Prévenu à chaque écriture et à chaque effacement du cache. */
export const subscribeNaturalSearchCache = (listener: CacheListener): (() => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};

const notify = (event: 'write' | 'purge') => {
    for (const listener of [...listeners]) {
        try { listener(event); } catch { /* un champ démonté ne bloque pas les autres */ }
    }
};

// ---------------------------------------------------------------------------
// Interprétations en vol : une phrase déjà partie n'est jamais renvoyée par
// une autre instance du champ (remontage pendant l'attente)
// ---------------------------------------------------------------------------

/** Fin d'une interprétation : null si elle a réussi (ou a été annulée), sinon le message de son erreur. */
const inFlight = new Map<string, Promise<string | null>>();
const flightKey = (phrase: string, userId: string) => `${userId}\u0000${normalizePhraseKey(phrase)}`;

/** Interprétation de cette phrase déjà en cours pour ce compte, ou null. */
export const interpretationInFlight = (phrase: string, userId: string): Promise<string | null> | null =>
    inFlight.get(flightKey(phrase, userId)) ?? null;

/** Note qu'une interprétation est en cours (oubliée à sa fin, réussie ou non). */
export const trackInterpretation = (phrase: string, userId: string, settled: Promise<string | null>): void => {
    const key = flightKey(phrase, userId);
    inFlight.set(key, settled);
    void settled.finally(() => {
        if (inFlight.get(key) === settled) inFlight.delete(key);
    });
};

// ---------------------------------------------------------------------------
// Stockage
// ---------------------------------------------------------------------------

interface StoredEntry {
    key: string;
    criteria: SearchCriteria;
    /** Date ISO de l'interprétation. */
    at: string;
}

interface StoredCache {
    version: string;
    entries: StoredEntry[];
}

/** Encore valable : moins de 12 mois après l'interprétation. */
const isFresh = (at: unknown, now: Date): boolean => {
    if (typeof at !== 'string') return false;
    const date = new Date(at);
    if (Number.isNaN(date.getTime()) || date.getTime() > now.getTime() + 24 * 3600 * 1000) return false;
    const limit = new Date(now);
    limit.setMonth(limit.getMonth() - NATURAL_SEARCH_RETENTION_MONTHS);
    return date.getTime() >= limit.getTime();
};

const parseEntries = (raw: string | null, now: Date): StoredEntry[] => {
    if (!raw) return [];
    try {
        const value = JSON.parse(raw) as Partial<StoredCache>;
        if (value.version !== NATURAL_SEARCH_CACHE_VERSION || !Array.isArray(value.entries)) return [];
        return value.entries.filter((entry): entry is StoredEntry =>
            typeof entry === 'object' && entry !== null && typeof (entry as StoredEntry).key === 'string'
            && isFresh((entry as StoredEntry).at, now));
    } catch {
        return [];
    }
};

const readEntries = (context?: SessionContext, now: Date = new Date()): StoredEntry[] =>
    parseEntries(readAccountValue(NATURAL_SEARCH_CACHE_PREFIX, context), now);

/** Critères d'une phrase déjà interprétée, relus et revalidés ; null si inconnue ou expirée. */
export const readCachedSearch = (phrase: string, context?: SessionContext, now: Date = new Date()): SearchCriteria | null => {
    const key = normalizePhraseKey(phrase);
    if (key.length === 0) return null;
    const entry = readEntries(context, now).find(item => item.key === key);
    // Relu comme une réponse du serveur : une entrée abîmée ne s'applique pas.
    return entry ? parseSearchResult(entry.criteria) : null;
};

/**
 * Garde les critères d'une phrase (en tête, 50 au plus). Sans effet si le
 * stockage échoue, ou si le cache a été effacé depuis `sincePurges` (relevé
 * par l'appelant avant l'envoi).
 */
export const rememberSearch = (phrase: string, criteria: SearchCriteria, context: SessionContext, sincePurges?: number, now: Date = new Date()): void => {
    const key = normalizePhraseKey(phrase);
    if (key.length === 0) return;
    if (sincePurges !== undefined && sincePurges !== purges) return;
    try {
        assertSessionContext(context);
        // Forme relative seulement : aucune date calculée, aucune coordonnée.
        const stored: SearchCriteria = {
            period: criteria.period,
            years: criteria.years,
            groups: criteria.groups,
            categories: criteria.categories,
            genera: criteria.genera,
            statuses: criteria.statuses,
            habitats: criteria.habitats,
            department: criteria.department,
            commune: criteria.commune,
            near: criteria.near ? { kind: criteria.near.kind, placeName: criteria.near.placeName, radiusKm: criteria.near.radiusKm } : null,
            text: criteria.text,
            dropped: criteria.dropped,
        };
        const entries = [{ key, criteria: stored, at: now.toISOString() }, ...readEntries(context, now).filter(entry => entry.key !== key)]
            .slice(0, NATURAL_SEARCH_CACHE_MAX);
        const value: StoredCache = { version: NATURAL_SEARCH_CACHE_VERSION, entries };
        writeAccountValue(NATURAL_SEARCH_CACHE_PREFIX, JSON.stringify(value), context);
        notify('write');
    } catch { /* stockage indisponible ou compte changé : la phrase sera simplement réinterprétée */ }
};

/** Efface les phrases gardées de la personne (retrait de l'accord). */
export const clearNaturalSearchCache = (context: SessionContext): void => {
    purges += 1;
    try {
        assertSessionContext(context);
        localStorage.removeItem(`${NATURAL_SEARCH_CACHE_PREFIX}:${context.userId}`);
    } catch { /* stockage indisponible ou compte changé */ }
    notify('purge');
};

/**
 * Au démarrage, pour TOUS les comptes connus de ce navigateur : retire les
 * phrases expirées (12 mois) ou d'un ancien format (clé supprimée si plus
 * rien). Ne lève jamais d'erreur.
 */
export const purgeExpiredNaturalSearches = (now: Date = new Date()): void => {
    let keys: string[] = [];
    try {
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (key?.startsWith(`${NATURAL_SEARCH_CACHE_PREFIX}:`)) keys.push(key);
        }
    } catch {
        return;
    }
    for (const key of keys) {
        try {
            const raw = localStorage.getItem(key);
            const entries = parseEntries(raw, now);
            if (entries.length === 0) localStorage.removeItem(key);
            else {
                const next = JSON.stringify({ version: NATURAL_SEARCH_CACHE_VERSION, entries } satisfies StoredCache);
                if (next !== raw) localStorage.setItem(key, next);
            }
        } catch { /* clé illisible ou stockage refusé : on passe à la suivante */ }
    }
};
