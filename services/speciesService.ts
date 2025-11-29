import { TaxonomicGroup } from '../types';

export interface SpeciesInfo {
    description: string;
    imageUrl: string | null;
    sourceUrl: string;
    latinName?: string;
    taxonomicGroup?: TaxonomicGroup;
}

export const fetchSpeciesInfo = async (speciesName: string): Promise<SpeciesInfo | null> => {
    if (!speciesName) return null;

    try {
        // First, search for the page
        const searchUrl = `https://fr.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(speciesName)}&format=json&origin=*`;
        const searchResponse = await fetch(searchUrl);
        const searchData = await searchResponse.json();

        if (!searchData.query || !searchData.query.search || searchData.query.search.length === 0) {
            return null;
        }

        const pageId = searchData.query.search[0].pageid;
        const pageTitle = searchData.query.search[0].title;

        // Then, get page details (extract and image)
        const detailsUrl = `https://fr.wikipedia.org/w/api.php?action=query&prop=extracts|pageimages&exintro&explaintext&pithumbsize=500&pageids=${pageId}&format=json&origin=*`;
        const detailsResponse = await fetch(detailsUrl);
        const detailsData = await detailsResponse.json();

        const page = detailsData.query.pages[pageId];

        // Try to extract latin name from the extract (usually inside parentheses)
        const extract = page.extract || '';
        const latinNameMatch = extract.match(/\(([^)]+)\)/);
        const latinName = latinNameMatch ? latinNameMatch[1] : undefined;

        // Infer taxonomic group
        let taxonomicGroup: TaxonomicGroup | undefined;
        const lowerExtract = extract.toLowerCase();

        if (lowerExtract.includes('oiseau') || lowerExtract.includes('passereau') || lowerExtract.includes('rapace')) {
            taxonomicGroup = TaxonomicGroup.BIRD;
        } else if (lowerExtract.includes('mammifère marin') || lowerExtract.includes('cétacé') || lowerExtract.includes('dauphin') || lowerExtract.includes('baleine')) {
            taxonomicGroup = TaxonomicGroup.MARINE_MAMMAL;
        } else if (lowerExtract.includes('chauve-souris') || lowerExtract.includes('chiroptère')) {
            taxonomicGroup = TaxonomicGroup.CHIROPTERA;
        } else if (lowerExtract.includes('mammifère')) {
            taxonomicGroup = TaxonomicGroup.MAMMAL;
        } else if (lowerExtract.includes('amphibien') || lowerExtract.includes('grenouille') || lowerExtract.includes('crapaud') || lowerExtract.includes('triton')) {
            taxonomicGroup = TaxonomicGroup.AMPHIBIAN;
        } else if (lowerExtract.includes('reptile') || lowerExtract.includes('serpent') || lowerExtract.includes('lézard') || lowerExtract.includes('tortue')) {
            taxonomicGroup = TaxonomicGroup.REPTILE;
        } else if (lowerExtract.includes('poisson')) {
            taxonomicGroup = TaxonomicGroup.FISH;
        } else if (lowerExtract.includes('papillon') && !lowerExtract.includes('nuit')) {
            taxonomicGroup = TaxonomicGroup.BUTTERFLY;
        } else if (lowerExtract.includes('papillon') && lowerExtract.includes('nuit')) {
            taxonomicGroup = TaxonomicGroup.MOTH;
        } else if (lowerExtract.includes('libellule') || lowerExtract.includes('demoiselle') || lowerExtract.includes('odonate')) {
            taxonomicGroup = TaxonomicGroup.ODONATE;
        } else if (lowerExtract.includes('sauterelle') || lowerExtract.includes('criquet') || lowerExtract.includes('grillon') || lowerExtract.includes('orthoptère')) {
            taxonomicGroup = TaxonomicGroup.ORTHOPTERA;
        } else if (lowerExtract.includes('coléoptère') || lowerExtract.includes('scarabée') || lowerExtract.includes('coccinelle')) {
            taxonomicGroup = TaxonomicGroup.COLEOPTERA;
        } else if (lowerExtract.includes('abeille') || lowerExtract.includes('guêpe') || lowerExtract.includes('fourmi') || lowerExtract.includes('hyménoptère')) {
            taxonomicGroup = TaxonomicGroup.HYMENOPTERA;
        } else if (lowerExtract.includes('araignée') || lowerExtract.includes('arachnide')) {
            taxonomicGroup = TaxonomicGroup.ARACHNID;
        } else if (lowerExtract.includes('plante') || lowerExtract.includes('fleur') || lowerExtract.includes('arbre') || lowerExtract.includes('arbuste')) {
            taxonomicGroup = TaxonomicGroup.BOTANY;
        }

        return {
            description: extract ? extract.substring(0, 300) + '...' : 'Aucune description disponible.',
            imageUrl: page.thumbnail ? page.thumbnail.source : null,
            sourceUrl: `https://fr.wikipedia.org/wiki/${encodeURIComponent(pageTitle)}`,
            latinName: latinName,
            taxonomicGroup: taxonomicGroup
        };

    } catch (error) {
        console.error("Erreur lors de la récupération des infos Wikipédia:", error);
        return null;
    }
};
