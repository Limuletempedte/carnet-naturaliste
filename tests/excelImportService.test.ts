import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseExcel } from '../services/excelImportService';
import { TaxonomicGroup } from '../types';

const createExcelFile = (rows: Record<string, unknown>[]): File => {
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Observations');
    const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    return new File([bytes], 'import.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
};

describe('excelImportService taxonomic mapping', () => {
    it('maps champignon keywords to TaxonomicGroup.MUSHROOM', async () => {
        const file = createExcelFile([
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
        const file = createExcelFile([
            { "Nom de l'espèce": 'Lichen X', 'Groupe taxonomique': 'lichen', Date: '2026-03-01', Heure: '12:00', Nombre: 1 }
        ]);

        const result = await parseExcel(file);
        expect(result.report.blockingErrors).toHaveLength(0);
        expect(result.observations[0].taxonomicGroup).toBe(TaxonomicGroup.LICHEN);
    });
});
