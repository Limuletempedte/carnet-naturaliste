import { Status, TaxonomicGroup } from '../types';
import { logger } from '../utils/logger';

export interface SpeciesInfo {
    description: string;
    imageUrl: string | null;
    sourceUrl: string;
    latinName?: string;
    taxonomicGroup?: TaxonomicGroup;
    redListStatus?: Status;
    redListSource?: 'france' | 'global';
    matchedBy: 'latin' | 'common';
    confidence: 'high' | 'medium' | 'low';
}

export interface SpeciesSuggestion {
    displayName: string;
    latinName: string;
    commonName?: string;
    source: 'inat' | 'gbif';
    iconicTaxonName?: string;   // e.g. "Aves", "Mammalia" (iNat only)
    imageUrl?: string;          // medium_url from iNaturalist
}

interface FetchSpeciesInfoOptions {
    signal?: AbortSignal;
}

interface SpeciesAutocompleteOptions {
    signal?: AbortSignal;
    onWarning?: (message: string) => void;
}

interface SpeciesInfoCacheEntry {
    value: SpeciesInfo | null;
    expiresAt: number;
}

const APP_USER_AGENT = 'CarnetNaturaliste/5.2 (contact@carnet-naturaliste.fr)';

const SPECIES_INFO_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_SPECIES_CACHE_SIZE = 200;
const speciesInfoCache = new Map<string, SpeciesInfoCacheEntry>();
const speciesInfoInFlightRequests = new Map<string, Promise<SpeciesInfo | null>>();

// ---------------------------------------------------------------------------
// iNaturalist API  (primary source — supports French common names)
// Docs: https://api.inaturalist.org/v1/docs/
// ---------------------------------------------------------------------------

interface INatTaxonResult {
    id?: number;                    // iNaturalist taxon ID
    name?: string;                  // Scientific name (e.g. "Cyanistes caeruleus")
    rank?: string;                  // "species", "genus", "family", etc.
    rank_level?: number;            // 10 = species, 20 = genus, etc.
    matched_term?: string;          // iNat matched term when available
    iconic_taxon_name?: string;     // "Aves", "Mammalia", "Insecta", etc.
    preferred_common_name?: string; // Localized common name
    default_photo?: {
        medium_url?: string;
        square_url?: string;
    };
    wikipedia_summary?: string;
    wikipedia_url?: string;
    observations_count?: number;
}

const normalizeTaxonText = (value?: string): string => {
    return (value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
};

const isAbortError = (error: unknown): boolean => {
    return error instanceof DOMException && error.name === 'AbortError';
};

/** Combine an optional caller signal with a hard timeout. */
const withTimeout = (signal?: AbortSignal, ms = 10_000): AbortSignal => {
    const timeoutSignal = AbortSignal.timeout(ms);
    if (!signal) return timeoutSignal;
    return AbortSignal.any([signal, timeoutSignal]);
};

const getSpeciesInfoCacheKey = (value: string): string => normalizeTaxonText(value);

const getCachedSpeciesInfo = (key: string): SpeciesInfo | null | undefined => {
    const now = Date.now();
    const entry = speciesInfoCache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) {
        speciesInfoCache.delete(key);
        return undefined;
    }
    return entry.value;
};

const setCachedSpeciesInfo = (key: string, value: SpeciesInfo | null): void => {
    // PE-20: Evict oldest entries when cache exceeds max size
    if (speciesInfoCache.size >= MAX_SPECIES_CACHE_SIZE) {
        const firstKey = speciesInfoCache.keys().next().value;
        if (firstKey !== undefined) speciesInfoCache.delete(firstKey);
    }
    speciesInfoCache.set(key, {
        value,
        expiresAt: Date.now() + SPECIES_INFO_CACHE_TTL_MS
    });
};

const isSpeciesRank = (rank?: string): boolean => rank === 'species' || rank === 'subspecies';

const compareScoreTuples = (left: number[], right: number[]): number => {
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
        const l = left[index] || 0;
        const r = right[index] || 0;
        if (l !== r) return l - r;
    }
    return 0;
};

const scoreINatTaxonResult = (item: INatTaxonResult, query: string): number[] => {
    const normalizedQuery = normalizeTaxonText(query);
    const latin = normalizeTaxonText(item.name);
    const common = normalizeTaxonText(item.preferred_common_name);
    const matchedTerm = normalizeTaxonText(item.matched_term);

    const exactLatin = normalizedQuery.length > 0 && latin === normalizedQuery ? 1 : 0;
    const exactCommonName = normalizedQuery.length > 0 && common === normalizedQuery ? 1 : 0;
    const exactMatchedTerm = normalizedQuery.length > 0 && matchedTerm === normalizedQuery ? 1 : 0;
    const startsWithCommon = normalizedQuery.length > 0
        && [latin, common].some(value => value.length > 0 && value.startsWith(normalizedQuery))
        ? 1
        : 0;
    const startsWithMatched = normalizedQuery.length > 0
        && matchedTerm.length > 0 && matchedTerm.startsWith(normalizedQuery)
        ? 1
        : 0;

    return [
        isSpeciesRank(item.rank) ? 1 : 0,
        exactLatin,
        exactCommonName,
        startsWithCommon,
        exactMatchedTerm,
        startsWithMatched,
        item.observations_count || 0
    ];
};

const pickBestINatTaxonResult = (results: INatTaxonResult[], query: string): INatTaxonResult | null => {
    if (results.length === 0) return null;

    let best = results[0];
    let bestScore = scoreINatTaxonResult(best, query);

    for (let index = 1; index < results.length; index += 1) {
        const candidate = results[index];
        const candidateScore = scoreINatTaxonResult(candidate, query);
        if (compareScoreTuples(candidateScore, bestScore) > 0) {
            best = candidate;
            bestScore = candidateScore;
        }
    }

    return best;
};

const resolveSpeciesMatchMeta = (
    query: string,
    inat: INatTaxonResult
): { matchedBy: 'latin' | 'common'; confidence: 'high' | 'medium' | 'low' } => {
    const normalizedQuery = normalizeTaxonText(query);
    const latin = normalizeTaxonText(inat.name);
    const common = normalizeTaxonText(inat.preferred_common_name);
    const matchedTerm = normalizeTaxonText(inat.matched_term);

    if (normalizedQuery.length > 0 && latin === normalizedQuery) {
        return { matchedBy: 'latin', confidence: 'high' };
    }

    if (normalizedQuery.length > 0 && (common === normalizedQuery || matchedTerm === normalizedQuery)) {
        return { matchedBy: 'common', confidence: 'high' };
    }

    if (normalizedQuery.length > 0 && latin.startsWith(normalizedQuery)) {
        return { matchedBy: 'latin', confidence: 'medium' };
    }

    if (normalizedQuery.length > 0 && (common.startsWith(normalizedQuery) || matchedTerm.startsWith(normalizedQuery))) {
        return { matchedBy: 'common', confidence: 'medium' };
    }

    if (common.length > 0) {
        return { matchedBy: 'common', confidence: 'low' };
    }

    return { matchedBy: 'latin', confidence: 'low' };
};

/**
 * Search iNaturalist for a species by common or scientific name.
 * Returns the best match with photo, description, and scientific name.
 */
const fetchINatTaxon = async (query: string, signal?: AbortSignal): Promise<INatTaxonResult | null> => {
    try {
        const url = `https://api.inaturalist.org/v1/taxa/autocomplete?q=${encodeURIComponent(query.trim())}&per_page=8&locale=fr`;
        const res = await fetch(url, { signal: withTimeout(signal), headers: { 'User-Agent': APP_USER_AGENT } });
        if (!res.ok) return null;
        const data = await res.json();
        const results: INatTaxonResult[] = data?.results ?? [];
        return pickBestINatTaxonResult(results, query);
    } catch (e) {
        if (isAbortError(e)) throw e;
        logger.error('iNaturalist fetch error:', e);
        return null;
    }
};

const fetchINatSuggestions = async (query: string, limit: number, signal?: AbortSignal, onWarning?: (msg: string) => void): Promise<INatTaxonResult[]> => {
    try {
        const url = `https://api.inaturalist.org/v1/taxa/autocomplete?q=${encodeURIComponent(query.trim())}&per_page=${limit}&locale=fr`;
        const res = await fetch(url, { signal: withTimeout(signal), headers: { 'User-Agent': APP_USER_AGENT } });
        if (!res.ok) {
            onWarning?.('Service iNaturalist temporairement indisponible.');
            return [];
        }
        const data = await res.json();
        return Array.isArray(data?.results) ? data.results : [];
    } catch (e) {
        if (isAbortError(e)) throw e;
        logger.error('iNaturalist suggest error:', e);
        onWarning?.('Service iNaturalist temporairement indisponible.');
        return [];
    }
};

// ---------------------------------------------------------------------------
// GBIF Taxonomy API  (secondary — used for precise classification)
// Docs: https://www.gbif.org/developer/species
// ---------------------------------------------------------------------------

interface GBIFMatchResult {
    usageKey?: number;
    scientificName?: string;
    canonicalName?: string;
    kingdom?: string;
    phylum?: string;
    class?: string;
    order?: string;
    family?: string;
    matchType?: string;
}

interface GBIFSuggestResult {
    key?: number;
    canonicalName?: string;
    scientificName?: string;
    class?: string;
    order?: string;
    family?: string;
    kingdom?: string;
}

const GBIF_BASE = 'https://api.gbif.org/v1/species';
const GBIF_V2_SPECIES_MATCH = 'https://api.gbif.org/v2/species/match';

/**
 * Match a latin/scientific name to the GBIF backbone taxonomy.
 * NOTE: GBIF does NOT support French common names — always pass a latin name.
 */
export const matchSpecies = async (latinName: string, signal?: AbortSignal): Promise<GBIFMatchResult | null> => {
    if (!latinName || latinName.trim().length < 2) return null;
    try {
        const url = `${GBIF_BASE}/match?name=${encodeURIComponent(latinName.trim())}&verbose=true`;
        const res = await fetch(url, { signal: withTimeout(signal), headers: { 'User-Agent': APP_USER_AGENT } });
        if (!res.ok) return null;
        const data: GBIFMatchResult = await res.json();
        if (data.matchType === 'NONE') return null;
        return data;
    } catch (e) {
        if (isAbortError(e)) throw e;
        logger.error('GBIF match error:', e);
        return null;
    }
};

/**
 * Suggest species names for autocomplete (accepts partial latin names).
 */
export const suggestSpecies = async (query: string, limit = 5, signal?: AbortSignal): Promise<GBIFSuggestResult[]> => {
    if (!query || query.trim().length < 2) return [];
    try {
        const url = `${GBIF_BASE}/suggest?q=${encodeURIComponent(query.trim())}&limit=${limit}`;
        const res = await fetch(url, { signal: withTimeout(signal), headers: { 'User-Agent': APP_USER_AGENT } });
        if (!res.ok) return [];
        return await res.json();
    } catch (e) {
        if (isAbortError(e)) throw e;
        logger.error('GBIF suggest error:', e);
        return [];
    }
};

interface GBIFAdditionalStatusEntry {
    datasetAlias?: string;
    statusCode?: string;
}

interface GBIFV2MatchResult {
    additionalStatus?: GBIFAdditionalStatusEntry[];
}

// ---------------------------------------------------------------------------
// iNaturalist place-specific conservation status (France = place_id 6753)
// ---------------------------------------------------------------------------

const INAT_FRANCE_PLACE_ID = 6753;

interface INatConservationStatusEntry {
    status?: string;
    place?: { id?: number; display_name?: string; } | null;
}

interface INatTaxonDetail {
    conservation_statuses?: INatConservationStatusEntry[];
    wikipedia_summary?: string;
    wikipedia_url?: string;
    default_photo?: {
        medium_url?: string;
        square_url?: string;
    };
}

export interface INatFranceTaxonDetail {
    status?: Status;
    wikipediaSummary?: string;
    wikipediaUrl?: string;
    defaultPhotoUrl?: string;
}

const mapIucnStatusCodeToStatus = (code?: string): Status | undefined => {
    const normalizedCode = (code || '').trim().toUpperCase();
    if (!normalizedCode) return undefined;

    switch (normalizedCode) {
        case 'NE': return Status.NE;
        case 'DD': return Status.DD;
        case 'LC': return Status.LC;
        case 'NT': return Status.NT;
        case 'VU': return Status.VU;
        case 'EN': return Status.EN;
        case 'CR': return Status.CR;
        case 'EW': return Status.EW;
        case 'EX': return Status.EX;
        default: return undefined;
    }
};

/**
 * Fetch France-specific conservation status from iNaturalist using the taxon ID.
 * Uses place_id=6753 (France) and reads conservation_statuses (plural) array.
 * Returns undefined if no France-specific status is found.
 */
const fetchINatFranceStatus = async (taxonId: number, signal?: AbortSignal): Promise<INatFranceTaxonDetail> => {
    try {
        const url = `https://api.inaturalist.org/v1/taxa/${taxonId}?place_id=${INAT_FRANCE_PLACE_ID}`;
        const res = await fetch(url, { signal: withTimeout(signal) });
        if (!res.ok) return {};
        const data = await res.json();
        const results: INatTaxonDetail[] = data?.results ?? [];
        if (results.length === 0) return {};

        const detail = results[0];
        const statuses = detail.conservation_statuses ?? [];
        const frenchEntry = statuses.find(s => s.place?.id === INAT_FRANCE_PLACE_ID);
        const status = frenchEntry?.status ? mapIucnStatusCodeToStatus(frenchEntry.status) : undefined;

        return {
            status,
            wikipediaSummary: detail.wikipedia_summary,
            wikipediaUrl: detail.wikipedia_url,
            defaultPhotoUrl: detail.default_photo?.medium_url ?? detail.default_photo?.square_url
        };
    } catch (e) {
        if (isAbortError(e)) throw e;
        logger.error('iNaturalist France conservation status error:', e);
        return {};
    }
};

export const fetchGbifIucnStatus = async (latinName: string, signal?: AbortSignal): Promise<Status | undefined> => {
    if (!latinName || latinName.trim().length < 2) return undefined;

    try {
        const url = `${GBIF_V2_SPECIES_MATCH}?scientificName=${encodeURIComponent(latinName.trim())}`;
        const response = await fetch(url, { signal: withTimeout(signal), headers: { 'User-Agent': APP_USER_AGENT } });
        if (!response.ok) return undefined;

        const data: GBIFV2MatchResult = await response.json();
        const additionalStatuses = Array.isArray(data.additionalStatus) ? data.additionalStatus : [];
        const iucnEntry = additionalStatuses.find(entry => (entry.datasetAlias || '').trim().toUpperCase() === 'IUCN');

        return mapIucnStatusCodeToStatus(iucnEntry?.statusCode);
    } catch (error) {
        if (isAbortError(error)) throw error;
        logger.error('GBIF v2 IUCN status error:', error);
        return undefined;
    }
};

const normalizeSuggestionKey = (value: string): string => value.trim().toLowerCase();

const dedupeAndLimitSuggestions = (suggestions: SpeciesSuggestion[], limit: number): SpeciesSuggestion[] => {
    const seen = new Set<string>();
    const deduped: SpeciesSuggestion[] = [];

    for (const suggestion of suggestions) {
        const key = normalizeSuggestionKey((suggestion.latinName || '') + '|' + (suggestion.displayName || ''));
        if (!key || seen.has(key)) continue;
        seen.add(key);
        deduped.push(suggestion);
        if (deduped.length >= limit) break;
    }

    return deduped;
};

/**
 * Unified autocomplete suggestions for the species field.
 * Strategy: iNaturalist first (French common names), then GBIF fallback.
 */
export const suggestSpeciesAutocomplete = async (
    query: string,
    limit = 5,
    options: SpeciesAutocompleteOptions = {}
): Promise<SpeciesSuggestion[]> => {
    if (!query || query.trim().length < 2) return [];
    const safeLimit = Math.max(1, Math.min(limit, 10));

    try {
        const inatSuggestions = await fetchINatSuggestions(query, safeLimit, options.signal, options.onWarning);
        if (inatSuggestions.length > 0) {
            // Prioritize species/subspecies; if none found keep everything
            const speciesOnly = inatSuggestions.filter(r => r.rank === 'species' || r.rank === 'subspecies');
            const bestResults = speciesOnly.length > 0 ? speciesOnly : inatSuggestions;
            const normalized = bestResults
                .map((item): SpeciesSuggestion | null => {
                    const latinName = (item.name || '').trim();
                    const commonName = item.preferred_common_name?.trim();
                    const displayName = commonName || latinName;
                    if (!displayName || !latinName) return null;
                    return {
                        displayName,
                        latinName,
                        commonName,
                        source: 'inat',
                        iconicTaxonName: item.iconic_taxon_name,
                        imageUrl: item.default_photo?.medium_url
                    };
                })
                .filter((item): item is SpeciesSuggestion => item !== null);

            return dedupeAndLimitSuggestions(normalized, safeLimit);
        }

        const gbifSuggestions = await suggestSpecies(query, safeLimit, options.signal);
        const normalized = gbifSuggestions
            .map((item): SpeciesSuggestion | null => {
                const latinName = (item.scientificName || item.canonicalName || '').trim();
                const displayName = (item.canonicalName || item.scientificName || '').trim();
                if (!displayName || !latinName) return null;
                return {
                    displayName,
                    latinName,
                    source: 'gbif'
                };
            })
            .filter((item): item is SpeciesSuggestion => item !== null);

        return dedupeAndLimitSuggestions(normalized, safeLimit);
    } catch (error) {
        if (isAbortError(error)) return [];
        throw error;
    }
};

// ---------------------------------------------------------------------------
// Strip HTML tags
// Best-effort sanitization for display readability only.
// NOT a security boundary — React's JSX escaping is the real XSS protection.
// ---------------------------------------------------------------------------

const stripHtml = (html: string): string =>
    html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------------------
// GBIF class/order → TaxonomicGroup mapping
// ---------------------------------------------------------------------------

const mapGBIFToTaxonomicGroup = (
    gbifClass?: string,
    order?: string,
    family?: string,
    kingdom?: string
): TaxonomicGroup | undefined => {
    if (!gbifClass && !kingdom) return undefined;

    switch (gbifClass) {
        case 'Aves':
            return TaxonomicGroup.BIRD;

        case 'Mammalia':
            if (order === 'Chiroptera') return TaxonomicGroup.CHIROPTERA;
            if (['Cetacea', 'Sirenia', 'Cetartiodactyla'].includes(order || '')) {
                const marineFamilies = [
                    'Balaenopteridae', 'Balaenidae', 'Delphinidae', 'Phocoenidae',
                    'Physeteridae', 'Ziphiidae', 'Kogiidae', 'Eschrichtiidae',
                    'Trichechidae', 'Dugongidae'
                ];
                if (order === 'Sirenia' || (family && marineFamilies.includes(family))) {
                    return TaxonomicGroup.MARINE_MAMMAL;
                }
            }
            return TaxonomicGroup.MAMMAL;

        case 'Reptilia':
            return TaxonomicGroup.REPTILE;

        case 'Amphibia':
            return TaxonomicGroup.AMPHIBIAN;

        case 'Actinopterygii':
        case 'Chondrichthyes':
        case 'Cephalaspidomorphi':
            return TaxonomicGroup.FISH;

        case 'Insecta':
            switch (order) {
                case 'Lepidoptera':
                    if (family && ['Nymphalidae', 'Papilionidae', 'Pieridae', 'Lycaenidae', 'Hesperiidae', 'Riodinidae'].includes(family)) {
                        return TaxonomicGroup.BUTTERFLY;
                    }
                    return TaxonomicGroup.MOTH;
                case 'Odonata':
                    return TaxonomicGroup.ODONATE;
                case 'Orthoptera':
                    return TaxonomicGroup.ORTHOPTERA;
                case 'Coleoptera':
                    return TaxonomicGroup.COLEOPTERA;
                case 'Hymenoptera':
                    if (family === 'Formicidae') return TaxonomicGroup.ANT;
                    return TaxonomicGroup.HYMENOPTERA;
                case 'Mantodea':
                    return TaxonomicGroup.MANTIS;
                case 'Hemiptera':
                    return TaxonomicGroup.HETEROPTERA;
                case 'Diptera':
                    return TaxonomicGroup.DIPTERA;
                case 'Neuroptera':
                    return TaxonomicGroup.NEUROPTERA;
                case 'Phasmatodea':
                    return TaxonomicGroup.PHASMID;
                case 'Dermaptera':
                    return TaxonomicGroup.DERMAPTERA;
                default:
                    return TaxonomicGroup.OTHER;
            }

        case 'Arachnida':
            if (order === 'Scorpiones') return TaxonomicGroup.SCORPION;
            return TaxonomicGroup.ARACHNID;

        case 'Malacostraca':
        case 'Maxillopoda':
            return TaxonomicGroup.CRUSTACEAN;

        case 'Branchiopoda':
            return TaxonomicGroup.BRANCHIOPOD;

        case 'Gastropoda':
            return TaxonomicGroup.GASTROPOD;

        case 'Bivalvia':
            return TaxonomicGroup.BIVALVE;

        case 'Magnoliopsida':
        case 'Liliopsida':
        case 'Polypodiopsida':
        case 'Pinopsida':
        case 'Gnetopsida':
        case 'Cycadopsida':
            if (family === 'Orchidaceae') return TaxonomicGroup.ORCHID;
            return TaxonomicGroup.BOTANY;

        case 'Bryopsida':
        case 'Jungermanniopsida':
        case 'Marchantiopsida':
            return TaxonomicGroup.BOTANY;

        case 'Agaricomycetes':
        case 'Sordariomycetes':
        case 'Eurotiomycetes':
        case 'Pezizomycetes':
            return TaxonomicGroup.MUSHROOM;

        case 'Lecanoromycetes':
        case 'Lichinomycetes':
            return TaxonomicGroup.LICHEN;

        default:
            if (kingdom === 'Plantae') return TaxonomicGroup.BOTANY;
            if (kingdom === 'Fungi') return TaxonomicGroup.MUSHROOM;
            if (kingdom === 'Animalia') return TaxonomicGroup.OTHER;
            return undefined;
    }
};

/**
 * Fallback: map iNaturalist iconic_taxon_name to TaxonomicGroup.
 * Less precise than GBIF (no order/family info) but always available.
 */
export const mapINatIconicToTaxonomicGroup = (iconicName?: string): TaxonomicGroup | undefined => {
    switch (iconicName) {
        case 'Aves': return TaxonomicGroup.BIRD;
        case 'Mammalia': return TaxonomicGroup.MAMMAL;
        case 'Reptilia': return TaxonomicGroup.REPTILE;
        case 'Amphibia': return TaxonomicGroup.AMPHIBIAN;
        case 'Actinopterygii': return TaxonomicGroup.FISH;
        case 'Insecta': return TaxonomicGroup.OTHER; // Too broad without order
        case 'Arachnida': return TaxonomicGroup.ARACHNID;
        case 'Mollusca': return TaxonomicGroup.OTHER;
        case 'Plantae': return TaxonomicGroup.BOTANY;
        case 'Fungi': return TaxonomicGroup.MUSHROOM;
        default: return undefined;
    }
};

// ---------------------------------------------------------------------------
// fetchSpeciesInfo — main public function (drop-in replacement)
// Strategy: iNaturalist first (handles French names), then GBIF for taxonomy
// ---------------------------------------------------------------------------

export const fetchSpeciesInfo = async (
    speciesName: string,
    options: FetchSpeciesInfoOptions = {}
): Promise<SpeciesInfo | null> => {
    if (!speciesName || speciesName.trim().length < 2) return null;

    const cacheKey = getSpeciesInfoCacheKey(speciesName);
    if (!cacheKey || cacheKey.length < 2) return null;

    const cached = getCachedSpeciesInfo(cacheKey);
    if (cached !== undefined) return cached;

    const inFlightRequest = speciesInfoInFlightRequests.get(cacheKey);
    if (inFlightRequest) {
        return inFlightRequest;
    }

    const requestPromise = (async (): Promise<SpeciesInfo | null> => {
        try {
            // Step 1: Query iNaturalist (supports French common names)
            const inat = await fetchINatTaxon(speciesName, options.signal);
            if (!inat) {
                setCachedSpeciesInfo(cacheKey, null);
                return null;
            }

            const latinName = inat.name || undefined;
            let imageUrl = inat.default_photo?.medium_url ?? inat.default_photo?.square_url ?? null;
            let description = inat.wikipedia_summary
                ? (() => { const d = stripHtml(inat.wikipedia_summary); return d.length > 300 ? d.substring(0, 300) + '\u2026' : d; })()
                : '';
            let sourceUrl = inat.wikipedia_url || '';
            const matchMeta = resolveSpeciesMatchMeta(speciesName, inat);

            // Step 2: Enrich with GBIF taxonomy + red list status in parallel (PE-14)
            let taxonomicGroup: TaxonomicGroup | undefined;
            let redListStatus: Status | undefined;
            let redListSource: 'france' | 'global' | undefined;

            if (latinName || inat.id) {
                // Launch independent API calls in parallel
                const [gbifResult, franceStatusResult] = await Promise.allSettled([
                    latinName ? matchSpecies(latinName, options.signal) : Promise.resolve(null),
                    inat.id ? fetchINatFranceStatus(inat.id, options.signal) : Promise.resolve({} as INatFranceTaxonDetail)
                ]);

                // Process GBIF taxonomy result
                if (gbifResult.status === 'fulfilled' && gbifResult.value) {
                    taxonomicGroup = mapGBIFToTaxonomicGroup(gbifResult.value.class, gbifResult.value.order, gbifResult.value.family, gbifResult.value.kingdom);
                } else if (gbifResult.status === 'rejected' && isAbortError(gbifResult.reason)) {
                    throw gbifResult.reason;
                }

                // Process France red list + enrich description/photo from taxon detail
                if (franceStatusResult.status === 'fulfilled' && franceStatusResult.value) {
                    const detail = franceStatusResult.value;
                    if (detail.status) {
                        redListStatus = detail.status;
                        redListSource = 'france';
                    }
                    // Autocomplete doesn't include wikipedia_summary — use detail endpoint response
                    if (!description && detail.wikipediaSummary) {
                        const d = stripHtml(detail.wikipediaSummary);
                        description = d.length > 300 ? d.substring(0, 300) + '\u2026' : d;
                    }
                    if (!sourceUrl && detail.wikipediaUrl) sourceUrl = detail.wikipediaUrl;
                    if (!imageUrl && detail.defaultPhotoUrl) imageUrl = detail.defaultPhotoUrl;
                } else if (franceStatusResult.status === 'rejected' && isAbortError(franceStatusResult.reason)) {
                    throw franceStatusResult.reason;
                }

                // Fallback to GBIF IUCN if no France status
                if (!redListStatus && latinName) {
                    try {
                        redListStatus = await fetchGbifIucnStatus(latinName, options.signal);
                        if (redListStatus) redListSource = 'global';
                    } catch (e) {
                        if (isAbortError(e)) throw e;
                    }
                }
            }

            // Fallback: use iNaturalist iconic_taxon_name if GBIF didn't yield a group
            if (!taxonomicGroup && inat.iconic_taxon_name) {
                taxonomicGroup = mapINatIconicToTaxonomicGroup(inat.iconic_taxon_name);
            }

            const resolvedInfo: SpeciesInfo = {
                description: description || 'Aucune description disponible.',
                imageUrl,
                sourceUrl,
                latinName,
                taxonomicGroup,
                redListStatus,
                redListSource,
                matchedBy: matchMeta.matchedBy,
                confidence: matchMeta.confidence
            };

            setCachedSpeciesInfo(cacheKey, resolvedInfo);
            return resolvedInfo;
        } catch (error) {
            if (isAbortError(error)) return null;
            logger.error('Erreur lors de la récupération des infos espèce:', error);
            return null;
        }
    })();

    speciesInfoInFlightRequests.set(cacheKey, requestPromise);
    try {
        return await requestPromise;
    } finally {
        if (speciesInfoInFlightRequests.get(cacheKey) === requestPromise) {
            speciesInfoInFlightRequests.delete(cacheKey);
        }
    }
};

export const clearSpeciesInfoCache = (): void => {
    speciesInfoCache.clear();
    speciesInfoInFlightRequests.clear();
};
