import { TaxonomicGroup } from '../types';

export interface SpeciesInfo {
    description: string;
    imageUrl: string | null;
    sourceUrl: string;
    latinName?: string;
    taxonomicGroup?: TaxonomicGroup;
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

// ---------------------------------------------------------------------------
// iNaturalist API  (primary source — supports French common names)
// Docs: https://api.inaturalist.org/v1/docs/
// ---------------------------------------------------------------------------

interface INatTaxonResult {
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
}

const normalizeTaxonText = (value?: string): string => {
    return (value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
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
    const exactCommon = normalizedQuery.length > 0 && (common === normalizedQuery || matchedTerm === normalizedQuery) ? 1 : 0;
    const startsWith = normalizedQuery.length > 0
        && [latin, common, matchedTerm].some(value => value.length > 0 && value.startsWith(normalizedQuery))
        ? 1
        : 0;

    return [
        isSpeciesRank(item.rank) ? 1 : 0,
        exactLatin,
        exactCommon,
        startsWith
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
const fetchINatTaxon = async (query: string): Promise<INatTaxonResult | null> => {
    try {
        const url = `https://api.inaturalist.org/v1/taxa/autocomplete?q=${encodeURIComponent(query.trim())}&per_page=8&locale=fr`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        const results: INatTaxonResult[] = data?.results ?? [];
        return pickBestINatTaxonResult(results, query);
    } catch (e) {
        console.error('iNaturalist fetch error:', e);
        return null;
    }
};

const fetchINatSuggestions = async (query: string, limit: number): Promise<INatTaxonResult[]> => {
    try {
        const url = `https://api.inaturalist.org/v1/taxa/autocomplete?q=${encodeURIComponent(query.trim())}&per_page=${limit}&locale=fr`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data?.results) ? data.results : [];
    } catch (e) {
        console.error('iNaturalist suggest error:', e);
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

/**
 * Match a latin/scientific name to the GBIF backbone taxonomy.
 * NOTE: GBIF does NOT support French common names — always pass a latin name.
 */
export const matchSpecies = async (latinName: string): Promise<GBIFMatchResult | null> => {
    if (!latinName || latinName.trim().length < 2) return null;
    try {
        const url = `${GBIF_BASE}/match?name=${encodeURIComponent(latinName.trim())}&verbose=true`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data: GBIFMatchResult = await res.json();
        if (data.matchType === 'NONE') return null;
        return data;
    } catch (e) {
        console.error('GBIF match error:', e);
        return null;
    }
};

/**
 * Suggest species names for autocomplete (accepts partial latin names).
 */
export const suggestSpecies = async (query: string, limit = 5): Promise<GBIFSuggestResult[]> => {
    if (!query || query.trim().length < 2) return [];
    try {
        const url = `${GBIF_BASE}/suggest?q=${encodeURIComponent(query.trim())}&limit=${limit}`;
        const res = await fetch(url);
        if (!res.ok) return [];
        return await res.json();
    } catch (e) {
        console.error('GBIF suggest error:', e);
        return [];
    }
};

const normalizeSuggestionKey = (value: string): string => value.trim().toLowerCase();

const dedupeAndLimitSuggestions = (suggestions: SpeciesSuggestion[], limit: number): SpeciesSuggestion[] => {
    const seen = new Set<string>();
    const deduped: SpeciesSuggestion[] = [];

    for (const suggestion of suggestions) {
        const key = normalizeSuggestionKey(suggestion.latinName || suggestion.displayName);
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
export const suggestSpeciesAutocomplete = async (query: string, limit = 5): Promise<SpeciesSuggestion[]> => {
    if (!query || query.trim().length < 2) return [];
    const safeLimit = Math.max(1, Math.min(limit, 10));

    const inatSuggestions = await fetchINatSuggestions(query, safeLimit);
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

    const gbifSuggestions = await suggestSpecies(query, safeLimit);
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
};

// ---------------------------------------------------------------------------
// Strip HTML tags
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

    if (kingdom === 'Fungi') return TaxonomicGroup.MUSHROOM;

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
                default:
                    return TaxonomicGroup.OTHER;
            }

        case 'Arachnida':
            return TaxonomicGroup.ARACHNID;

        case 'Malacostraca':
        case 'Branchiopoda':
        case 'Maxillopoda':
            return TaxonomicGroup.CRUSTACEAN;

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
        case 'Lecanoromycetes':
        case 'Pezizomycetes':
            return TaxonomicGroup.MUSHROOM;

        default:
            if (kingdom === 'Plantae') return TaxonomicGroup.BOTANY;
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

export const fetchSpeciesInfo = async (speciesName: string): Promise<SpeciesInfo | null> => {
    if (!speciesName || speciesName.trim().length < 2) return null;

    try {
        // Step 1: Query iNaturalist (supports French common names)
        const inat = await fetchINatTaxon(speciesName);
        if (!inat) return null;

        const latinName = inat.name || undefined;
        const imageUrl = inat.default_photo?.medium_url ?? inat.default_photo?.square_url ?? null;
        const description = inat.wikipedia_summary
            ? stripHtml(inat.wikipedia_summary).substring(0, 300) + '...'
            : '';
        const sourceUrl = inat.wikipedia_url || '';
        const matchMeta = resolveSpeciesMatchMeta(speciesName, inat);

        // Step 2: If we got a latin name from iNaturalist, enrich with GBIF taxonomy
        let taxonomicGroup: TaxonomicGroup | undefined;

        if (latinName) {
            const gbif = await matchSpecies(latinName);
            if (gbif) {
                taxonomicGroup = mapGBIFToTaxonomicGroup(gbif.class, gbif.order, gbif.family, gbif.kingdom);
            }
        }

        // Fallback: use iNaturalist iconic_taxon_name if GBIF didn't yield a group
        if (!taxonomicGroup && inat.iconic_taxon_name) {
            taxonomicGroup = mapINatIconicToTaxonomicGroup(inat.iconic_taxon_name);
        }

        return {
            description: description || 'Aucune description disponible.',
            imageUrl,
            sourceUrl,
            latinName,
            taxonomicGroup,
            matchedBy: matchMeta.matchedBy,
            confidence: matchMeta.confidence
        };
    } catch (error) {
        console.error('Erreur lors de la récupération des infos espèce:', error);
        return null;
    }
};
