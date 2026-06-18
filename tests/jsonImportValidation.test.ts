import { describe, expect, it } from 'vitest';
import { parseJsonImport } from '../services/jsonImportValidation';
import { generateUUID } from '../utils/uuidUtils';
import { TaxonomicGroup } from '../types';

const makeValidRow = (overrides: Record<string, unknown> = {}) => ({
    id: generateUUID(),
    speciesName: 'Renard roux',
    latinName: 'Vulpes vulpes',
    taxonomicGroup: 'Mammifères',
    date: '2026-03-10',
    time: '12:00',
    count: 1,
    location: 'Forêt',
    gps: { lat: 48.8, lon: 2.3 },
    municipality: '',
    department: '',
    country: 'France',
    altitude: null,
    comment: '',
    status: 'NE',
    atlasCode: '',
    protocol: 'Opportuniste',
    sexe: 'Non renseigné',
    age: 'Non renseigné',
    observationCondition: 'Non renseigné',
    comportement: 'Non renseigné',
    weather: 'Non renseigné',
    ...overrides
});

describe('jsonImportValidation URL sanitization (SE-03)', () => {
    it('strips javascript: URLs from photo field', () => {
        const result = parseJsonImport([makeValidRow({ photo: 'javascript:alert(1)' })]);
        expect(result.observations[0]?.photo).toBeUndefined();
    });

    it('preserves valid https:// photo URLs', () => {
        const url = 'https://example.com/photo.jpg';
        const result = parseJsonImport([makeValidRow({ photo: url })]);
        expect(result.observations[0]?.photo).toBe(url);
    });
});

describe('jsonImportValidation — groupe Arbre (BUG-E3, anti-régression import)', () => {
    it("accepte une observation dont le groupe taxonomique est 'Arbres'", () => {
        const result = parseJsonImport([makeValidRow({ taxonomicGroup: 'Arbres' })]);
        expect(result.observations).toHaveLength(1);
        expect(result.observations[0]?.taxonomicGroup).toBe(TaxonomicGroup.TREE);
    });
});
