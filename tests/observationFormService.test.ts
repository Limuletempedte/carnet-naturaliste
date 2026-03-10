import { describe, expect, it } from 'vitest';
import { Age, Comportement, ObservationCondition, Protocol, Sexe, Status, TaxonomicGroup } from '../types';
import { ObservationFormData, validateObservationForm } from '../services/observationFormService';

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
