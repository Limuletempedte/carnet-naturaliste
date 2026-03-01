import { describe, expect, it } from 'vitest';
import { Age, Comportement, Observation, ObservationCondition, Protocol, Sexe, Status, TaxonomicGroup } from '../types';
import { applyImportedObservationPolicy, buildImportPersistencePlan } from '../services/importPolicy';

const makeObservation = (id: string, speciesName = 'Test'): Observation => ({
    id,
    speciesName,
    latinName: '',
    taxonomicGroup: TaxonomicGroup.BIRD,
    date: '2026-03-01',
    time: '12:00',
    count: 1,
    location: '',
    gps: { lat: null, lon: null },
    municipality: '',
    department: '',
    country: 'France',
    altitude: null,
    comment: '',
    status: Status.NE,
    atlasCode: '',
    protocol: Protocol.OPPORTUNIST,
    sexe: Sexe.UNKNOWN,
    age: Age.UNKNOWN,
    observationCondition: ObservationCondition.UNKNOWN,
    comportement: Comportement.UNKNOWN
});

describe('import policy', () => {
    it('keeps valid UUIDs for new observations', () => {
        const uuid = '123e4567-e89b-42d3-a456-426614174000';
        const planned = applyImportedObservationPolicy(makeObservation(uuid), new Set());

        expect(planned.observation.id).toBe(uuid);
        expect(planned.mode).toBe('insert');
        expect(planned.regeneratedId).toBe(false);
    });

    it('turns existing valid UUIDs into updates', () => {
        const uuid = '123e4567-e89b-42d3-a456-426614174000';
        const planned = applyImportedObservationPolicy(makeObservation(uuid), new Set([uuid]));

        expect(planned.observation.id).toBe(uuid);
        expect(planned.mode).toBe('update');
    });

    it('regenerates invalid IDs only when needed', () => {
        const planned = applyImportedObservationPolicy(makeObservation('not-a-uuid'), new Set());

        expect(planned.observation.id).not.toBe('not-a-uuid');
        expect(planned.mode).toBe('insert');
        expect(planned.regeneratedId).toBe(true);
    });

    it('keeps IDs stable across the whole import plan', () => {
        const existing = [makeObservation('123e4567-e89b-42d3-a456-426614174000', 'A')];
        const imported = [
            makeObservation('123e4567-e89b-42d3-a456-426614174000', 'A'),
            makeObservation('223e4567-e89b-42d3-a456-426614174000', 'B')
        ];

        const plan = buildImportPersistencePlan(imported, existing);

        expect(plan[0].mode).toBe('update');
        expect(plan[1].mode).toBe('insert');
        expect(plan[1].observation.id).toBe('223e4567-e89b-42d3-a456-426614174000');
    });
});
