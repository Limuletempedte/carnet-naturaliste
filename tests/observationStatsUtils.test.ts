import { describe, expect, it } from 'vitest';
import { buildTaxonSpeciesCards } from '../utils/observationStatsUtils';
import { Age, Comportement, Observation, ObservationCondition, Protocol, Sexe, Status, TaxonomicGroup } from '../types';

const makeObservation = (overrides: Partial<Observation>): Observation => ({
    id: 'obs-1',
    speciesName: 'Espèce inconnue',
    latinName: '',
    taxonomicGroup: TaxonomicGroup.OTHER,
    date: '2026-03-01',
    time: '08:00',
    count: 1,
    location: 'Lieu',
    gps: { lat: null, lon: null },
    municipality: 'Commune',
    department: '75',
    country: 'France',
    altitude: null,
    comment: '',
    status: Status.NE,
    atlasCode: '',
    protocol: Protocol.OPPORTUNIST,
    sexe: Sexe.UNKNOWN,
    age: Age.UNKNOWN,
    observationCondition: ObservationCondition.UNKNOWN,
    comportement: Comportement.UNKNOWN,
    ...overrides
});

describe('buildTaxonSpeciesCards', () => {
    it('counts the same species only once per taxon with typographic normalization', () => {
        const cards = buildTaxonSpeciesCards([
            makeObservation({ id: '1', taxonomicGroup: TaxonomicGroup.BIRD, speciesName: 'Mésange bleue' }),
            makeObservation({ id: '2', taxonomicGroup: TaxonomicGroup.BIRD, speciesName: 'mesange   bleue' }),
            makeObservation({ id: '3', taxonomicGroup: TaxonomicGroup.BIRD, speciesName: 'MESANGE BLEUE' })
        ]);

        expect(cards).toHaveLength(1);
        expect(cards[0]).toMatchObject({
            taxonomicGroup: TaxonomicGroup.BIRD,
            speciesCount: 1
        });
    });

    it('counts the same species name independently across different taxa', () => {
        const cards = buildTaxonSpeciesCards([
            makeObservation({ id: '1', taxonomicGroup: TaxonomicGroup.BIRD, speciesName: 'Martin-pêcheur' }),
            makeObservation({ id: '2', taxonomicGroup: TaxonomicGroup.MAMMAL, speciesName: 'Martin-pêcheur' })
        ]);

        const birdCard = cards.find(card => card.taxonomicGroup === TaxonomicGroup.BIRD);
        const mammalCard = cards.find(card => card.taxonomicGroup === TaxonomicGroup.MAMMAL);

        expect(birdCard?.speciesCount).toBe(1);
        expect(mammalCard?.speciesCount).toBe(1);
    });

    it('hides taxa with 0 species and taxa without logo', () => {
        const cards = buildTaxonSpeciesCards([
            makeObservation({ id: '1', taxonomicGroup: TaxonomicGroup.OTHER, speciesName: 'Mystère sp.' }),
            makeObservation({ id: '2', taxonomicGroup: TaxonomicGroup.REPTILE, speciesName: 'Couleuvre verte' })
        ]);

        expect(cards.find(card => card.taxonomicGroup === TaxonomicGroup.OTHER)).toBeUndefined();
        expect(cards.find(card => card.taxonomicGroup === TaxonomicGroup.AMPHIBIAN)).toBeUndefined();
        expect(cards.find(card => card.taxonomicGroup === TaxonomicGroup.REPTILE)?.speciesCount).toBe(1);
    });
});
