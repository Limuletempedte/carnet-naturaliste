import { TAXON_LOGOS } from '../constants';
import { Observation, TaxonomicGroup } from '../types';
import { normalizeSearchText } from './textUtils';

export interface TaxonSpeciesCard {
    taxonomicGroup: TaxonomicGroup;
    logo: string;
    speciesCount: number;
}

const getObservationSpeciesKey = (observation: Observation): string => {
    const rawSpeciesName = observation.speciesName || observation.latinName || '';
    return normalizeSearchText(rawSpeciesName);
};

export const buildTaxonSpeciesCards = (observations: Observation[]): TaxonSpeciesCard[] => {
    const uniqueSpeciesPerTaxon = new Map<TaxonomicGroup, Set<string>>();

    observations.forEach((observation) => {
        const logo = TAXON_LOGOS[observation.taxonomicGroup];
        if (!logo) return;

        const speciesKey = getObservationSpeciesKey(observation);
        if (!speciesKey) return;

        const taxonSet = uniqueSpeciesPerTaxon.get(observation.taxonomicGroup) ?? new Set<string>();
        taxonSet.add(speciesKey);
        uniqueSpeciesPerTaxon.set(observation.taxonomicGroup, taxonSet);
    });

    return (Object.entries(TAXON_LOGOS) as Array<[TaxonomicGroup, string]>)
        .filter(([, logo]) => Boolean(logo))
        .map(([taxonomicGroup, logo]) => ({
            taxonomicGroup,
            logo,
            speciesCount: uniqueSpeciesPerTaxon.get(taxonomicGroup)?.size ?? 0
        }))
        .filter((card) => card.speciesCount > 0);
};
