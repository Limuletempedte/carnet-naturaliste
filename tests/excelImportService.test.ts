import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { parseExcel } from '../services/excelImportService';
import { TaxonomicGroup } from '../types';

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
