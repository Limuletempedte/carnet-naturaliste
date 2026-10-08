import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { parseExcel } from '../services/excelImportService';
import { Habitat, Phenology, TaxonomicGroup } from '../types';

const createExcelFile = async (rows: Record<string, unknown>[]): Promise<File> => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Observations');
    if (rows.length > 0) {
        const headers = Object.keys(rows[0]);
        worksheet.addRow(headers);
        rows.forEach(row => worksheet.addRow(headers.map(h => row[h] ?? '')));
    }
    const buffer = await workbook.xlsx.writeBuffer();
    return new File([buffer], 'import.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
};

describe('excelImportService taxonomic mapping', () => {
    it('maps champignon keywords to TaxonomicGroup.MUSHROOM', async () => {
        const file = await createExcelFile([
            { "Nom de l'espèce": 'A', 'Groupe taxonomique': 'champignon', Date: '2026-03-01', Heure: '12:00', Nombre: 1 },
            { "Nom de l'espèce": 'B', 'Groupe taxonomique': 'champignons', Date: '2026-03-01', Heure: '12:00', Nombre: 1 },
            { "Nom de l'espèce": 'C', 'Groupe taxonomique': 'fungi', Date: '2026-03-01', Heure: '12:00', Nombre: 1 },
            { "Nom de l'espèce": 'D', 'Groupe taxonomique': 'mycologie', Date: '2026-03-01', Heure: '12:00', Nombre: 1 }
        ]);

        const result = await parseExcel(file);
        const groups = result.observations.map(obs => obs.taxonomicGroup);

        expect(result.report.blockingErrors).toHaveLength(0);
        expect(groups).toEqual([
            TaxonomicGroup.MUSHROOM,
            TaxonomicGroup.MUSHROOM,
            TaxonomicGroup.MUSHROOM,
            TaxonomicGroup.MUSHROOM
        ]);
    });

    it('maps arbre keywords to TaxonomicGroup.TREE (BUG-E3)', async () => {
        const file = await createExcelFile([
            { "Nom de l'espèce": 'Chêne', 'Groupe taxonomique': 'arbre', Date: '2026-03-01', Heure: '12:00', Nombre: 1 },
            { "Nom de l'espèce": 'Pin', 'Groupe taxonomique': 'Arbres', Date: '2026-03-01', Heure: '12:00', Nombre: 1 },
            { "Nom de l'espèce": 'Saule', 'Groupe taxonomique': 'sylviculture', Date: '2026-03-01', Heure: '12:00', Nombre: 1 }
        ]);

        const result = await parseExcel(file);
        const groups = result.observations.map(obs => obs.taxonomicGroup);

        expect(result.report.blockingErrors).toHaveLength(0);
        expect(groups).toEqual([TaxonomicGroup.TREE, TaxonomicGroup.TREE, TaxonomicGroup.TREE]);
    });

    it('maps lichen keyword to TaxonomicGroup.LICHEN', async () => {
        const file = await createExcelFile([
            { "Nom de l'espèce": 'Lichen X', 'Groupe taxonomique': 'lichen', Date: '2026-03-01', Heure: '12:00', Nombre: 1 }
        ]);

        const result = await parseExcel(file);
        expect(result.report.blockingErrors).toHaveLength(0);
        expect(result.observations[0].taxonomicGroup).toBe(TaxonomicGroup.LICHEN);
    });

    it('maps new taxon keywords (bivalves, branchiopodes, dermatères, gastéropodes, scorpions)', async () => {
        const file = await createExcelFile([
            { "Nom de l'espèce": 'Moule commune', 'Groupe taxonomique': 'bivalve', Date: '2026-03-01', Heure: '12:00', Nombre: 1 },
            { "Nom de l'espèce": 'Daphnie', 'Groupe taxonomique': 'branchiopode', Date: '2026-03-01', Heure: '12:00', Nombre: 1 },
            { "Nom de l'espèce": 'Perce-oreille', 'Groupe taxonomique': 'dermatere', Date: '2026-03-01', Heure: '12:00', Nombre: 1 },
            { "Nom de l'espèce": 'Escargot', 'Groupe taxonomique': 'gasteropode', Date: '2026-03-01', Heure: '12:00', Nombre: 1 },
            { "Nom de l'espèce": 'Scorpion jaune', 'Groupe taxonomique': 'scorpion', Date: '2026-03-01', Heure: '12:00', Nombre: 1 }
        ]);

        const result = await parseExcel(file);
        const groups = result.observations.map(obs => obs.taxonomicGroup);

        expect(result.report.blockingErrors).toHaveLength(0);
        expect(groups).toEqual([
            TaxonomicGroup.BIVALVE,
            TaxonomicGroup.BRANCHIOPOD,
            TaxonomicGroup.DERMAPTERA,
            TaxonomicGroup.GASTROPOD,
            TaxonomicGroup.SCORPION
        ]);
    });

    it('rejects files missing mandatory species/date columns', async () => {
        const file = await createExcelFile([
            { ID: '1', Nombre: 3, Commune: 'Lille' }
        ]);

        const result = await parseExcel(file);

        expect(result.observations).toHaveLength(0);
        expect(result.report.blockingErrors).toHaveLength(1);
        expect(result.report.blockingErrors[0].message).toContain('Colonnes obligatoires manquantes');
    });
});

describe('excelImportService — champs habitat/phénologie/observateurs (H12)', () => {
    it('réimporte Habitat, Phénologie et Observateurs (plus de perte au round-trip)', async () => {
        const file = await createExcelFile([
            {
                "Nom de l'espèce": 'Chouette hulotte', Date: '2026-03-01', Nombre: 1,
                Habitat: 'Forêt de feuillus', 'Phénologie': 'En reproduction', Observateurs: 'Jean D. | Marie L.'
            }
        ]);

        const result = await parseExcel(file);
        const obs = result.observations[0];

        expect(result.report.blockingErrors).toHaveLength(0);
        expect(obs.habitat).toBe(Habitat.FOREST_DECIDUOUS);
        expect(obs.phenology).toBe(Phenology.BREEDING);
        expect(obs.observers).toEqual(['Jean D.', 'Marie L.']);
    });

    it('laisse ces champs à undefined quand les colonnes sont absentes (pas d\'écrasement par null)', async () => {
        const file = await createExcelFile([
            { "Nom de l'espèce": 'Merle', Date: '2026-03-01', Nombre: 1 }
        ]);

        const obs = (await parseExcel(file)).observations[0];
        expect(obs.habitat).toBeUndefined();
        expect(obs.phenology).toBeUndefined();
        expect(obs.observers).toBeUndefined();
    });
});

describe('excelImportService — heure manquante (BUG-07)', () => {
    it('laisse l\'heure vide (pas « 12:00 » fabriqué) quand la colonne Heure est absente', async () => {
        const file = await createExcelFile([
            { "Nom de l'espèce": 'Pinson', Date: '2026-03-01', Nombre: 1 }
        ]);

        const obs = (await parseExcel(file)).observations[0];
        expect(obs.time).toBe('');
    });
});


describe('excelImportService — valeurs héritées des objets JavaScript', () => {
    it.each(['constructor', '__proto__', 'toString'])('traite %s comme une valeur inconnue, sans casser le Worker', async (value) => {
        const result = await parseExcel(await createExcelFile([{
            "Nom de l'espèce": 'Espèce fictive', Date: '2026-10-08', Nombre: 1,
            Protocole: value, Sexe: value, Habitat: value
        }]));
        expect(result.report.blockingErrors).toHaveLength(0);
        expect(typeof result.observations[0].protocol).toBe('string');
        expect(typeof result.observations[0].sexe).toBe('string');
        expect(result.observations[0].habitat).toBeUndefined();
        expect(() => structuredClone(result)).not.toThrow();
        expect(result.report.warnings.length).toBeGreaterThan(0);
    });
});
