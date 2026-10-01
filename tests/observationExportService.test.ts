import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { buildDarwinCoreCsv, buildGeoJson, runObservationExport } from '../services/observationExportService';

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


const pdf = vi.hoisted(() => ({
    internal: { pageSize: { getWidth: () => 210, getHeight: () => 45 } },
    setFontSize: vi.fn(), text: vi.fn(), addPage: vi.fn(), save: vi.fn(),
    splitTextToSize: vi.fn((text: string) => text.split('\n')),
}));
vi.mock('jspdf', () => ({ default: vi.fn(function () { return pdf; }) }));

const readBlob = (blob: Blob): Promise<ArrayBuffer> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
});

describe('formats exportés — compatibilité et confidentialité', () => {
    const blobs: Blob[] = [];
    beforeEach(() => {
        blobs.length = 0;
        vi.clearAllMocks();
        vi.stubGlobal('URL', class extends URL {
            static createObjectURL = vi.fn((blob: Blob) => { blobs.push(blob); return 'blob:export-test'; });
            static revokeObjectURL = vi.fn();
        });
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    });
    afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

    it('exporte le JSON en masquant le GPS sensible sans modifier les observations en mémoire', async () => {
        const sensitive = makeObs({ status: Status.CR, gps: { lat: 48.4567, lon: 2.7890 } });
        const ordinary = makeObs({ id: 'ordinaire' });
        await runObservationExport('json', [sensitive, ordinary]);
        const output = JSON.parse(new TextDecoder().decode(await readBlob(blobs[0])));
        expect(output[0].gps).toEqual({ lat: 48.5, lon: 2.8 });
        expect(output[1].gps).toEqual(ordinary.gps);
        expect(sensitive.gps).toEqual({ lat: 48.4567, lon: 2.7890 });
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:export-test');
    });

    it('produit un vrai XLSX relisible, protège le GPS et garde les formules importées comme texte', async () => {
        const { default: ExcelJS } = await import('exceljs');
        const sensitive = makeObs({ status: Status.EN, gps: { lat: 48.4567, lon: 2.7890 },
            maleCount: 0, femaleCount: 2, unidentifiedCount: 0,
            habitat: Habitat.WETLAND, phenology: Phenology.FLOWERING, observers: ['Alice', 'Bob'], comment: '=1+1' });
        const missing = makeObs({ id: 'sans-gps', gps: { lat: null, lon: null }, altitude: null });
        const sensitiveMissing = makeObs({ id: 'sensible-sans-gps', status: Status.CR, gps: { lat: null, lon: null } });
        await runObservationExport('excel', [sensitive, missing, sensitiveMissing]);
        const book = new ExcelJS.Workbook(); await book.xlsx.load(await readBlob(blobs[0]));
        const sheet = book.worksheets[0];
        expect(sheet.rowCount).toBe(4);
        expect(sheet.getCell('L2').value).toBe(48.5);
        expect(sheet.getCell('M2').value).toBe(2.8);
        expect(sheet.getCell('H2').value).toBe(0);
        expect(sheet.getCell('I2').value).toBe(2);
        expect(sheet.getCell('AB2').value).toBe('Alice | Bob');
        expect(sheet.getCell('AC2').value).toBe('=1+1');
        expect(sheet.getCell('AC2').formula).toBeUndefined();
        expect(sheet.getCell('L3').value).toBe('');
        expect(sheet.getCell('L4').value).toBe('');
        expect(sheet.getCell('Q3').value).toBe('');
        expect(sensitive.gps.lat).toBe(48.4567);
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:export-test');
    });

    it('conserve les textes, compteurs et sauts de page du PDF sans traiter le contenu comme HTML', async () => {
        await runObservationExport('pdf', [makeObs({ maleCount: 0, comment: '<img onerror=alert(1)>' }),
            makeObs({ latinName: '', time: '', location: '', municipality: '', weather: undefined, comment: '' })]);
        const calls = pdf.splitTextToSize.mock.calls.map(([text]) => text).join('\n');
        expect(calls).toContain('M:0 F:0 NI:0');
        expect(calls).toContain('Détail: n/a');
        expect(calls).toContain('Nom latin non renseigné');
        expect(calls).toContain('Lieu non renseigné');
        expect(calls).toContain('<img onerror=alert(1)>');
        expect(pdf.text).toHaveBeenCalled();
        expect(pdf.addPage).toHaveBeenCalled();
        expect(pdf.save).toHaveBeenCalledWith('carnet-naturaliste-observations.pdf');
    });

    it.each(['darwincore', 'geojson'] as const)('télécharge %s avec un contenu relisible', async format => {
        await runObservationExport(format, [makeObs({ date: '', time: '', country: 'inconnu', latinName: '', location: '', municipality: '', altitude: null })]);
        const text = new TextDecoder().decode(await readBlob(blobs[0]));
        if (format === 'geojson') expect(JSON.parse(text).features).toHaveLength(1);
        else expect(text).toContain('HumanObservation');
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:export-test');
    });
});
