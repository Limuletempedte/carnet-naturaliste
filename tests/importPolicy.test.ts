import { describe, expect, it } from 'vitest';
import { Age, Comportement, Observation, ObservationCondition, Protocol, Sexe, Status, TaxonomicGroup, WeatherCondition } from '../types';
import { applyImportedObservationPolicy, buildImportPersistencePlan, detectContentDuplicates } from '../services/importPolicy';

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
    comportement: Comportement.UNKNOWN,
    weather: WeatherCondition.UNKNOWN
});

describe('import policy', () => {
    it('preserves valid UUIDs when not already known (SI-28: identity preservation)', () => {
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

    it('preserves unknown valid UUIDs as inserts (SI-28: identity preservation)', () => {
        const existing = [makeObservation('123e4567-e89b-42d3-a456-426614174000', 'A')];
        const imported = [
            makeObservation('123e4567-e89b-42d3-a456-426614174000', 'A'),
            makeObservation('223e4567-e89b-42d3-a456-426614174000', 'B')
        ];

        const plan = buildImportPersistencePlan(imported, existing);

        expect(plan[0].mode).toBe('update');
        expect(plan[1].mode).toBe('insert');
        // SI-28: Valid UUID not already known → preserved for identity continuity
        expect(plan[1].observation.id).toBe('223e4567-e89b-42d3-a456-426614174000');
    });

    it('supports no-overwrite mode by inserting on known ID collisions', () => {
        const existing = [makeObservation('123e4567-e89b-42d3-a456-426614174000', 'A')];
        const imported = [makeObservation('123e4567-e89b-42d3-a456-426614174000', 'A2')];

        const plan = buildImportPersistencePlan(imported, existing, { conflictMode: 'no-overwrite' });

        expect(plan[0].mode).toBe('insert');
        expect(plan[0].observation.id).not.toBe('123e4567-e89b-42d3-a456-426614174000');
        expect(plan[0].regeneratedId).toBe(true);
    });
});

describe('detectContentDuplicates (SR-19)', () => {
    const withGps = (id: string, speciesName: string, date: string, lat: number, lon: number): Observation => ({
        ...makeObservation(id, speciesName),
        date,
        gps: { lat, lon },
    });

    it('détecte un doublon quand espèce/date/coordonnées coïncident', () => {
        const existing = [withGps('existing-1', 'Mésange bleue', '2026-03-01', 48.85, 2.35)];
        const incoming = [withGps('incoming-1', 'Mésange bleue', '2026-03-01', 48.85, 2.35)];

        const dupes = detectContentDuplicates(incoming, existing);
        expect(dupes).toHaveLength(1);
        expect(dupes[0].incomingId).toBe('incoming-1');
        expect(dupes[0].existingId).toBe('existing-1');
    });

    it('ne détecte pas de doublon si coordonnées divergent', () => {
        const existing = [withGps('existing-1', 'Mésange bleue', '2026-03-01', 48.85, 2.35)];
        const incoming = [withGps('incoming-1', 'Mésange bleue', '2026-03-01', 48.90, 2.40)];

        expect(detectContentDuplicates(incoming, existing)).toEqual([]);
    });

    it('ignore les observations sans coordonnées GPS', () => {
        const existing = [makeObservation('existing-1', 'Mésange bleue')];
        const incoming = [makeObservation('incoming-1', 'Mésange bleue')];

        expect(detectContentDuplicates(incoming, existing)).toEqual([]);
    });
});


it('la fusion utilise la version chargée, pas la version ancienne du fichier', () => {
    const obs = makeObservation('123e4567-e89b-42d3-a456-426614174000');
    const plan = buildImportPersistencePlan([{ ...obs, updatedAt: '2026-01-01T00:00:00Z' }], [{ ...obs, updatedAt: '2026-10-08T00:00:00Z' }]);
    expect(plan[0].observation.updatedAt).toBe('2026-10-08T00:00:00Z');
});
