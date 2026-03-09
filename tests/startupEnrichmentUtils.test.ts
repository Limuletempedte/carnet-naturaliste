import { describe, expect, it } from 'vitest';
import { Age, Comportement, Observation, ObservationCondition, Protocol, Sexe, Status, TaxonomicGroup } from '../types';
import { selectStartupEnrichmentCandidates } from '../services/startupEnrichmentUtils';

const makeObservation = (overrides: Partial<Observation> = {}): Observation => ({
    id: crypto.randomUUID(),
    speciesName: 'Renard roux',
    latinName: 'Vulpes vulpes',
    taxonomicGroup: TaxonomicGroup.MAMMAL,
    date: '2026-03-01',
    time: '12:00',
    count: 1,
    location: 'Bois',
    gps: { lat: null, lon: null },
    municipality: 'Lille',
    department: '59',
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
    photo: undefined,
    sound: undefined,
    wikipediaImage: undefined,
    ...overrides
});

describe('selectStartupEnrichmentCandidates', () => {
    it('keeps only observations without media and with latin name', () => {
        const observations = [
            makeObservation({ id: '1', latinName: 'Vulpes vulpes' }),
            makeObservation({ id: '2', latinName: '' }),
            makeObservation({ id: '3', latinName: 'Parus major', wikipediaImage: 'https://img.example/bird.jpg' }),
            makeObservation({ id: '4', latinName: 'Cervus elaphus', photo: 'https://img.example/photo.jpg' }),
            makeObservation({ id: '5', latinName: 'Erinaceus europaeus' })
        ];

        const selection = selectStartupEnrichmentCandidates(observations, 10);

        expect(selection.skippedDueToMissingLatin).toBe(1);
        expect(selection.candidates.map(obs => obs.id)).toEqual(['1', '5']);
    });

    it('enforces the configured limit', () => {
        const observations = [
            makeObservation({ id: 'a', latinName: 'Species a' }),
            makeObservation({ id: 'b', latinName: 'Species b' }),
            makeObservation({ id: 'c', latinName: 'Species c' })
        ];

        const selection = selectStartupEnrichmentCandidates(observations, 2);

        expect(selection.candidates.map(obs => obs.id)).toEqual(['a', 'b']);
    });
});
