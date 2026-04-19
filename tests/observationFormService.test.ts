import { describe, expect, it } from 'vitest';
import { Age, Comportement, Habitat, ObservationCondition, Phenology, Protocol, Sexe, Status, TaxonomicGroup, WeatherCondition } from '../types';
import { ObservationFormData, validateObservationForm, buildObservationFromForm } from '../services/observationFormService';

const makeFormData = (overrides: Partial<ObservationFormData> = {}): ObservationFormData => ({
    speciesName: 'Renard roux',
    latinName: 'Vulpes vulpes',
    taxonomicGroup: TaxonomicGroup.MAMMAL,
    date: '2026-03-10',
    time: '12:00',
    count: 20,
    maleCount: '',
    femaleCount: '',
    unidentifiedCount: '',
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
    weather: WeatherCondition.UNKNOWN,
    photo: undefined,
    sound: undefined,
    wikipediaImage: undefined,
    ...overrides
});

describe('observationFormService count breakdown', () => {
    it('accepts empty breakdown values', () => {
        const errors = validateObservationForm(makeFormData());
        expect(errors.countBreakdown).toBeUndefined();
    });

    it('accepts a valid strict sum', () => {
        const errors = validateObservationForm(makeFormData({
            maleCount: 10,
            femaleCount: 10,
            unidentifiedCount: 0
        }));
        expect(errors.countBreakdown).toBeUndefined();
    });

    it('rejects mismatched sums when breakdown is provided', () => {
        const errors = validateObservationForm(makeFormData({
            maleCount: 10,
            femaleCount: 5,
            unidentifiedCount: 0
        }));
        expect(errors.countBreakdown).toContain('La somme');
    });

    it('treats blank optional fields as zero for the strict sum', () => {
        const errors = validateObservationForm(makeFormData({
            maleCount: 20,
            femaleCount: '',
            unidentifiedCount: ''
        }));
        expect(errors.countBreakdown).toBeUndefined();
    });
});

describe('GPS bounds validation (SE-20)', () => {
    it('rejects latitude outside [-90, 90]', () => {
        const errors = validateObservationForm(makeFormData({ gps: { lat: 91, lon: 0 } }));
        expect(errors.lat).toBeDefined();
    });

    it('rejects longitude outside [-180, 180]', () => {
        const errors = validateObservationForm(makeFormData({ gps: { lat: 0, lon: 200 } }));
        expect(errors.lon).toBeDefined();
    });

    it('accepts null GPS coordinates without error', () => {
        const errors = validateObservationForm(makeFormData({ gps: { lat: null, lon: null } }));
        expect(errors.lat).toBeUndefined();
        expect(errors.lon).toBeUndefined();
    });

    it('accepts boundary values (90, -180)', () => {
        const errors = validateObservationForm(makeFormData({ gps: { lat: 90, lon: -180 } }));
        expect(errors.lat).toBeUndefined();
        expect(errors.lon).toBeUndefined();
    });
});

describe('buildObservationFromForm NaN guards', () => {
    it('returns null for altitude when value is not a valid number', () => {
        const obs = buildObservationFromForm(
            makeFormData({ altitude: 'abc' as unknown as null }),
            'test-id'
        );
        expect(obs.altitude).toBeNull();
    });

    it('returns null for GPS when coordinates are not valid numbers', () => {
        const obs = buildObservationFromForm(
            makeFormData({ gps: { lat: 'bad' as unknown as null, lon: 'bad' as unknown as null } }),
            'test-id'
        );
        expect(obs.gps.lat).toBeNull();
        expect(obs.gps.lon).toBeNull();
    });

    it('preserves valid numeric altitude and GPS', () => {
        const obs = buildObservationFromForm(
            makeFormData({ altitude: 150, gps: { lat: 48.8, lon: 2.3 } }),
            'test-id'
        );
        expect(obs.altitude).toBe(150);
        expect(obs.gps.lat).toBe(48.8);
        expect(obs.gps.lon).toBe(2.3);
    });
});

describe('buildObservationFromForm theme 12 fields (habitat, phenology, observers)', () => {
    it('préserve habitat, phenology et observers lorsqu\'ils sont fournis', () => {
        const obs = buildObservationFromForm(
            makeFormData({
                habitat: Habitat.WETLAND,
                phenology: Phenology.FLOWERING,
                observers: ['Alice', 'Bob']
            }),
            'test-id'
        );
        expect(obs.habitat).toBe(Habitat.WETLAND);
        expect(obs.phenology).toBe(Phenology.FLOWERING);
        expect(obs.observers).toEqual(['Alice', 'Bob']);
    });
});
