import { describe, expect, it } from 'vitest';
import {
    Age,
    Comportement,
    Habitat,
    Observation,
    ObservationCondition,
    Phenology,
    Protocol,
    Sexe,
    Status,
    TaxonomicGroup,
    WeatherCondition,
} from '../types';
import { buildDarwinCoreCsv, buildGeoJson } from '../services/observationExportService';

const makeObs = (overrides: Partial<Observation> = {}): Observation => ({
    id: '11111111-1111-4111-8111-111111111111',
    speciesName: 'Mésange bleue',
    latinName: 'Cyanistes caeruleus',
    taxonomicGroup: TaxonomicGroup.BIRD,
    date: '2026-04-20',
    time: '09:15',
    count: 2,
    location: 'Forêt de Fontainebleau',
    gps: { lat: 48.4, lon: 2.7 },
    municipality: 'Fontainebleau',
    department: '77',
    country: 'France',
    altitude: 80,
    comment: '',
    status: Status.LC,
    atlasCode: '',
    protocol: Protocol.OPPORTUNIST,
    sexe: Sexe.MALE,
    age: Age.ADULT,
    observationCondition: ObservationCondition.SEEN_LANDED,
    comportement: Comportement.HUNTING,
    weather: WeatherCondition.SUNNY,
    ...overrides,
});

describe('observationExportService Darwin Core (VP-11)', () => {
    it('exporte les headers DwC attendus sur la première ligne', () => {
        const csv = buildDarwinCoreCsv([makeObs()]);
        const firstLine = csv.split('\n')[0];
        expect(firstLine).toContain('"occurrenceID"');
        expect(firstLine).toContain('"scientificName"');
        expect(firstLine).toContain('"decimalLatitude"');
        expect(firstLine).toContain('"decimalLongitude"');
        expect(firstLine).toContain('"basisOfRecord"');
        expect(firstLine).toContain('"habitat"');
        expect(firstLine).toContain('"reproductiveCondition"');
        expect(firstLine).toContain('"recordedBy"');
    });

    it('applique obfuscation et coordinateUncertaintyInMeters=10000 pour une espèce sensible (CR)', () => {
        const csv = buildDarwinCoreCsv([makeObs({ status: Status.CR, gps: { lat: 48.4567, lon: 2.7890 } })]);
        const row = csv.split('\n')[1];
        expect(row).toContain('"48.5"');
        expect(row).toContain('"2.8"');
        expect(row).toContain('"10000"');
    });

    it('mappe sexe/age/comportement vers les vocabulaires DwC anglais', () => {
        const csv = buildDarwinCoreCsv([makeObs()]);
        const row = csv.split('\n')[1];
        expect(row).toContain('"male"');
        expect(row).toContain('"adult"');
        expect(row).toContain('"hunting"');
        expect(row).toContain('"HumanObservation"');
    });

    it('expose les champs habitat, phenology et observers via DwC', () => {
        const csv = buildDarwinCoreCsv([makeObs({
            habitat: Habitat.WETLAND,
            phenology: Phenology.FLOWERING,
            observers: ['Alice Dupont', 'Bob Martin'],
        })]);
        const row = csv.split('\n')[1];
        expect(row).toContain('"Zone humide"');
        expect(row).toContain('"En fleur"');
        expect(row).toContain('"Alice Dupont | Bob Martin"');
    });

    it('laisse coordonnées et geodeticDatum vides quand GPS absent', () => {
        const csv = buildDarwinCoreCsv([makeObs({ gps: { lat: null, lon: null } })]);
        const row = csv.split('\n')[1];
        expect(row).toContain('""');
        expect(row).not.toContain('"WGS84"');
    });
});

describe('observationExportService GeoJSON (VP-14)', () => {
    it('produit une FeatureCollection valide avec coordinates [lon, lat]', () => {
        const collection = buildGeoJson([makeObs()]);
        expect(collection.type).toBe('FeatureCollection');
        expect(collection.features).toHaveLength(1);
        const feature = collection.features[0];
        expect(feature.type).toBe('Feature');
        expect(feature.geometry.type).toBe('Point');
        expect(feature.geometry.coordinates).toEqual([2.7, 48.4]);
    });

    it('ignore les observations sans GPS', () => {
        const collection = buildGeoJson([
            makeObs(),
            makeObs({ id: '22222222-2222-4222-8222-222222222222', gps: { lat: null, lon: null } }),
        ]);
        expect(collection.features).toHaveLength(1);
        expect(collection.features[0].properties.id).toBe('11111111-1111-4111-8111-111111111111');
    });

    it('applique l\'obfuscation GPS pour les espèces sensibles', () => {
        const collection = buildGeoJson([makeObs({ status: Status.EN, gps: { lat: 48.4567, lon: 2.7890 } })]);
        expect(collection.features[0].geometry.coordinates).toEqual([2.8, 48.5]);
    });

    it('ne contient pas la propriété gps dans properties (redondant avec geometry)', () => {
        const collection = buildGeoJson([makeObs()]);
        expect(collection.features[0].properties).not.toHaveProperty('gps');
        expect(collection.features[0].properties.speciesName).toBe('Mésange bleue');
    });
});
