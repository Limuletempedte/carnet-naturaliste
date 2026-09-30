import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { readBoundedZip, preflightExcel } from '../services/boundedZip';
import { parseImportFile } from '../services/importFileParser';
import { parseJsonImport } from '../services/jsonImportValidation';
import { IMPORT_LIMITS } from '../services/importLimits';

const zipFile = async (zip: JSZip, name = 'test.zip') => new File([await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })], name);
describe('imports bornés avant matérialisation', () => {
    it('accepte une archive légitime et compte aussi les entrées ignorées', async () => {
        const zip = new JSZip(); zip.file('data.json', '[]'); zip.file('notice.txt', 'fichier fictif');
        const result = await parseImportFile(await zipFile(zip));
        expect(result.result.observations).toEqual([]);
    });
    it('refuse JSON au-delà de 15 Mio et de 10000 observations', async () => {
        await expect(parseImportFile(new File([new Uint8Array(IMPORT_LIMITS.file + 1)], 'x.json'))).rejects.toThrow(/volumineux/);
        expect(() => parseJsonImport(Array.from({ length: 10_001 }, () => ({})))).toThrow(/10 000/);
    });
    it('refuse une entrée média gonflée au-delà de 20 Mio avant accumulation', async () => {
        const zip = new JSZip(); zip.file('data.json', '[]'); zip.file('images/bombe.jpg', new Uint8Array(IMPORT_LIMITS.media + 1));
        await expect(readBoundedZip(await zipFile(zip))).rejects.toThrow(/volumineuse/);
    });
    it('compte la sortie réelle même si la taille annoncée est falsifiée', async () => {
        const zip = new JSZip(); zip.file('data.json', new Uint8Array(IMPORT_LIMITS.file + 1));
        const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
        const view = new DataView(bytes.buffer);
        for (let i = 0; i < bytes.length - 24; i++) {
            if (view.getUint32(i, true) === 0x02014b50) view.setUint32(i + 24, 1, true);
            if (view.getUint32(i, true) === 0x04034b50) view.setUint32(i + 22, 1, true);
        }
        await expect(readBoundedZip(new File([bytes], 'bombe.zip'))).rejects.toThrow(/décompression/);
    });
    it('refuse noms dupliqués et corruption CRC', async () => {
        const zip = new JSZip(); zip.file('data.json', '[]'); zip.file('date.json', '[]');
        const bytes = await zip.generateAsync({ type: 'uint8array' });
        const text = Buffer.from(bytes);
        const replacement = new TextEncoder().encode('data.json');
        for (let index = text.indexOf('date.json'); index >= 0; index = text.indexOf('date.json', index + 1)) bytes.set(replacement, index);
        await expect(readBoundedZip(new File([bytes], 'dupes.zip'))).rejects.toThrow(/ambigus|invalide/);
        const corrupt = new JSZip(); corrupt.file('data.json', '[]');
        const raw = await corrupt.generateAsync({ type: 'uint8array' }); raw[39] ^= 1;
        await expect(readBoundedZip(new File([raw], 'corrompu.zip'))).rejects.toThrow();
    });
    it('refuse dimensions mensongères, cellules et fusions géantes avant ExcelJS', async () => {
        for (const xml of [
            '<worksheet><dimension ref="A1:XFD1048576"/></worksheet>',
            '<worksheet><dimension ref="A1:A1"/><sheetData><row r="1"><c r="XFD1"/></row></sheetData></worksheet>',
            '<worksheet><sheetData><row r="10002"/></sheetData></worksheet>',
            '<worksheet><mergeCells><mergeCell ref="A1:XFD1048576"/></mergeCells></worksheet>',
        ]) {
            const zip = new JSZip(); zip.file('xl/worksheets/sheet1.xml', xml);
            await expect(preflightExcel(await zipFile(zip, 'test.xlsx'))).rejects.toThrow(/grandes/);
        }
    });
    it('refuse plus de 20005 entrées au niveau du répertoire central', async () => {
        const zip = new JSZip(); zip.file('data.json', '[]');
        const bytes = await zip.generateAsync({ type: 'uint8array' });
        const view = new DataView(bytes.buffer); const eocd = bytes.length - 22;
        view.setUint16(eocd + 8, 20006, true); view.setUint16(eocd + 10, 20006, true);
        await expect(readBoundedZip(new File([bytes], 'entries.zip'))).rejects.toThrow(/nombreuses/);
    });
    it('refuse les alias de feuilles acceptés par la recherche non ancrée d’ExcelJS', async () => {
        const zip = new JSZip(); zip.file('xl/worksheets/sheet1.xml.extra', '<worksheet/>');
        await expect(preflightExcel(await zipFile(zip, 'alias.xlsx'))).rejects.toThrow(/ambigu/);
    });
    it('ne confond pas un chevron dans un attribut XML avec la fin de balise', async () => {
        const zip = new JSZip(); zip.file('xl/worksheets/sheet1.xml', '<worksheet><row r="1"><c note=">" r="XFD1"/></row></worksheet>');
        await expect(preflightExcel(await zipFile(zip, 'attribut.xlsx'))).rejects.toThrow(/grandes/);
    });
});
