// Cache des phrases interprétées par l'assistant (recherche en langage
// naturel) : une phrase déjà comprise ne coûte rien et marche hors ligne.
//
// - Dans le navigateur seulement, par personne (`ai-search-phrases-v1:<id>`),
//   effacé avec le compte (`ACCOUNT_SCOPED_STORAGE_PREFIXES`) et quand la
//   personne retire son accord à la recherche ou à l'assistant.
// - Clé : la phrase normalisée (sans casse ni accents ni ponctuation).
// - Valeur : les critères sous leur forme RELATIVE (« le mois dernier »,
//   « autour de ma position actuelle ») : jamais de date calculée, jamais de
//   coordonnées.
// - Versionné : un changement du format ou du dictionnaire des catégories
//   (`TAXON_CATEGORIES_VERSION`) vide le cache.
// - Les 50 dernières phrases.

import { parseSearchResult, type SearchCriteria } from '../utils/aiSearchFilters';
import { normalizePhraseKey } from '../utils/naturalSearchLocal';
import { TAXON_CATEGORIES_VERSION } from '../utils/taxonCategories';
import { assertSessionContext, readAccountValue, writeAccountValue, type SessionContext } from './sessionScope';

export const NATURAL_SEARCH_CACHE_PREFIX = 'ai-search-phrases-v1';
export const NATURAL_SEARCH_CACHE_MAX = 50;
/** Format des entrées et version du dictionnaire des catégories. */
export const NATURAL_SEARCH_CACHE_VERSION = `1-categories-${TAXON_CATEGORIES_VERSION}`;

interface StoredEntry {
    key: string;
    criteria: SearchCriteria;
}

interface StoredCache {
    version: string;
    entries: StoredEntry[];
}

const readEntries = (context?: SessionContext): StoredEntry[] => {
    const raw = readAccountValue(NATURAL_SEARCH_CACHE_PREFIX, context);
    if (!raw) return [];
    try {
        const value = JSON.parse(raw) as Partial<StoredCache>;
        if (value.version !== NATURAL_SEARCH_CACHE_VERSION || !Array.isArray(value.entries)) return [];
        return value.entries.filter((entry): entry is StoredEntry =>
            typeof entry === 'object' && entry !== null && typeof (entry as StoredEntry).key === 'string');
    } catch {
        return [];
    }
};

/** Critères d'une phrase déjà interprétée, relus et revalidés ; null si inconnue. */
export const readCachedSearch = (phrase: string, context?: SessionContext): SearchCriteria | null => {
    const key = normalizePhraseKey(phrase);
    if (key.length === 0) return null;
    const entry = readEntries(context).find(item => item.key === key);
    // Relu comme une réponse du serveur : une entrée abîmée ne s'applique pas.
    return entry ? parseSearchResult(entry.criteria) : null;
};

/** Garde les critères d'une phrase (en tête, 50 au plus). Sans effet si le stockage échoue. */
export const rememberSearch = (phrase: string, criteria: SearchCriteria, context: SessionContext): void => {
    const key = normalizePhraseKey(phrase);
    if (key.length === 0) return;
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
        const entries = [{ key, criteria: stored }, ...readEntries(context).filter(entry => entry.key !== key)]
            .slice(0, NATURAL_SEARCH_CACHE_MAX);
        const value: StoredCache = { version: NATURAL_SEARCH_CACHE_VERSION, entries };
        writeAccountValue(NATURAL_SEARCH_CACHE_PREFIX, JSON.stringify(value), context);
    } catch { /* stockage indisponible ou compte changé : la phrase sera simplement réinterprétée */ }
};

/** Efface les phrases gardées de la personne (retrait de l'accord). */
export const clearNaturalSearchCache = (context: SessionContext): void => {
    try {
        assertSessionContext(context);
        localStorage.removeItem(`${NATURAL_SEARCH_CACHE_PREFIX}:${context.userId}`);
    } catch { /* stockage indisponible ou compte changé */ }
};
