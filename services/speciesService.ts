import { TaxonomicGroup } from '../types';

export interface SpeciesInfo {
    description: string;
    imageUrl: string | null;
    sourceUrl: string;
    latinName?: string;
    taxonomicGroup?: TaxonomicGroup;
}

// ---------------------------------------------------------------------------
// GBIF Taxonomy API  (free, no key required)
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
    confidence?: number;
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
 * Match a species name to the GBIF backbone taxonomy.
 * Returns the best match with classification details.
 */
export const matchSpecies = async (name: string): Promise<GBIFMatchResult | null> => {
    if (!name || name.trim().length < 2) return null;
    try {
        const url = `${GBIF_BASE}/match?name=${encodeURIComponent(name.trim())}&verbose=true`;
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
 * Suggest species names for autocomplete.
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
// iNaturalist API  (free, no key required for taxa autocomplete)
// Docs: https://api.inaturalist.org/v1/docs/
// ---------------------------------------------------------------------------

interface INatTaxon {
    default_photo?: {
        medium_url?: string;
        square_url?: string;
    };
    wikipedia_summary?: string;
    wikipedia_url?: string;
    preferred_common_name?: string;
}

/**
 * Fetch a species photo + short description from iNaturalist.
 */
const fetchINatInfo = async (
    name: string
): Promise<{ imageUrl: string | null; description: string; sourceUrl: string }> => {
    const fallback = { imageUrl: null, description: '', sourceUrl: '' };
    try {
        const url = `https://api.inaturalist.org/v1/taxa/autocomplete?q=${encodeURIComponent(name.trim())}&per_page=1&locale=fr`;
        const res = await fetch(url);
        if (!res.ok) return fallback;
        const data = await res.json();
        const taxon: INatTaxon | undefined = data?.results?.[0];
        if (!taxon) return fallback;

        return {
            imageUrl: taxon.default_photo?.medium_url ?? taxon.default_photo?.square_url ?? null,
            description: taxon.wikipedia_summary
                ? stripHtml(taxon.wikipedia_summary).substring(0, 300) + '...'
                : '',
            sourceUrl: taxon.wikipedia_url || ''
        };
    } catch (e) {
        console.error('iNaturalist fetch error:', e);
        return fallback;
    }
};

/** Strip HTML tags from a string */
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

    // Fungi → Champignons
    if (kingdom === 'Fungi') return TaxonomicGroup.MUSHROOM;

    switch (gbifClass) {
        case 'Aves':
            return TaxonomicGroup.BIRD;

        case 'Mammalia':
            if (order === 'Chiroptera') return TaxonomicGroup.CHIROPTERA;
            if (['Cetacea', 'Sirenia', 'Cetartiodactyla'].includes(order || '')) {
                // Cetartiodactyla includes whales/dolphins in modern taxonomy
                // Check family to distinguish actual marine mammals from terrestrial artiodactyls
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
                    // Rhopalocera (butterflies) vs Heterocera (moths) distinction is approximate
                    // Most common butterfly families:
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

        // Plants
        case 'Magnoliopsida':
        case 'Liliopsida':
        case 'Polypodiopsida':
        case 'Pinopsida':
        case 'Gnetopsida':
        case 'Cycadopsida':
            if (family === 'Orchidaceae') return TaxonomicGroup.ORCHID;
            return TaxonomicGroup.BOTANY;

        // Mosses / liverworts → Botany
        case 'Bryopsida':
        case 'Jungermanniopsida':
        case 'Marchantiopsida':
            return TaxonomicGroup.BOTANY;

        // Fungi classes
        case 'Agaricomycetes':
        case 'Sordariomycetes':
        case 'Eurotiomycetes':
        case 'Lecanoromycetes':
        case 'Pezizomycetes':
            return TaxonomicGroup.MUSHROOM;

        default:
            // Fallback: try kingdom
            if (kingdom === 'Plantae') return TaxonomicGroup.BOTANY;
            if (kingdom === 'Animalia') return TaxonomicGroup.OTHER;
            return undefined;
    }
};

// ---------------------------------------------------------------------------
// Combined fetchSpeciesInfo  (drop-in replacement for Wikipedia version)
// ---------------------------------------------------------------------------

/**
 * Fetch species information from GBIF (taxonomy) and iNaturalist (photo + description).
 * Returns `SpeciesInfo | null`, fully backward-compatible with the old Wikipedia version.
 */
export const fetchSpeciesInfo = async (speciesName: string): Promise<SpeciesInfo | null> => {
    if (!speciesName || speciesName.trim().length < 2) return null;

    try {
        // Run GBIF match + iNaturalist in parallel
        const [gbif, inat] = await Promise.all([
            matchSpecies(speciesName),
            fetchINatInfo(speciesName)
        ]);

        // If both return nothing, give up
        if (!gbif && !inat.imageUrl && !inat.description) return null;

        const taxonomicGroup = gbif
            ? mapGBIFToTaxonomicGroup(gbif.class, gbif.order, gbif.family, gbif.kingdom)
            : undefined;

        const latinName = gbif?.canonicalName || gbif?.scientificName || undefined;

        const description = inat.description
            || (gbif ? `${gbif.kingdom || ''} › ${gbif.phylum || ''} › ${gbif.class || ''} › ${gbif.order || ''} › ${gbif.family || ''}`.replace(/\s*›\s*›/g, ' ›').replace(/^\s*›\s*/, '').replace(/\s*›\s*$/, '') : 'Aucune description disponible.');

        const sourceUrl = inat.sourceUrl
            || (gbif?.usageKey ? `https://www.gbif.org/species/${gbif.usageKey}` : '');

        return {
            description,
            imageUrl: inat.imageUrl,
            sourceUrl,
            latinName,
            taxonomicGroup
        };
    } catch (error) {
        console.error('Erreur lors de la récupération des infos espèce:', error);
        return null;
    }
};
