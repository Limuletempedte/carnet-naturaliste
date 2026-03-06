import { TaxonomicGroup } from '../types';

export interface SpeciesInfo {
    description: string;
    imageUrl: string | null;
    sourceUrl: string;
    latinName?: string;
    taxonomicGroup?: TaxonomicGroup;
}

// ---------------------------------------------------------------------------
// iNaturalist API  (primary source — supports French common names)
// Docs: https://api.inaturalist.org/v1/docs/
// ---------------------------------------------------------------------------

interface INatTaxonResult {
    name?: string;                  // Scientific name (e.g. "Cyanistes caeruleus")
    rank?: string;                  // "species", "genus", "family", etc.
    iconic_taxon_name?: string;     // "Aves", "Mammalia", "Insecta", etc.
    preferred_common_name?: string; // Localized common name
    default_photo?: {
        medium_url?: string;
        square_url?: string;
    };
    wikipedia_summary?: string;
    wikipedia_url?: string;
}

/**
 * Search iNaturalist for a species by common or scientific name.
 * Returns the best match with photo, description, and scientific name.
 */
const fetchINatTaxon = async (query: string): Promise<INatTaxonResult | null> => {
    try {
        const url = `https://api.inaturalist.org/v1/taxa/autocomplete?q=${encodeURIComponent(query.trim())}&per_page=1&locale=fr`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        return data?.results?.[0] ?? null;
    } catch (e) {
        console.error('iNaturalist fetch error:', e);
        return null;
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
const mapINatIconicToTaxonomicGroup = (iconicName?: string): TaxonomicGroup | undefined => {
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
            taxonomicGroup
        };
    } catch (error) {
        console.error('Erreur lors de la récupération des infos espèce:', error);
        return null;
    }
};
