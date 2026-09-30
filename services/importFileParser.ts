import { IMPORT_LIMITS, readBlobBuffer } from './importLimits';
import { readBoundedZip } from './boundedZip';
import { parseJsonImport } from './jsonImportValidation';
import type { ImportResult } from './excelImportService';

export interface ParsedImport { result: ImportResult; media: Array<{ reference: string; blob: Blob }> }
const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', webm: 'audio/webm', m4a: 'audio/x-m4a', mp4: 'audio/mp4' };

/** Cœur appelé dans le Worker. Ne crée aucune URL ni écriture locale. */
export async function parseImportFile(file: File): Promise<ParsedImport> {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (file.size > (extension === 'zip' ? IMPORT_LIMITS.zip : IMPORT_LIMITS.file)) throw new Error('Fichier trop volumineux (JSON/Excel : 15 Mio, ZIP : 500 Mio).');
    if (extension === 'xlsx') {
        const { parseExcel } = await import('./excelImportService');
        return { result: await parseExcel(file), media: [] };
    }
    if (extension === 'xls') throw new Error('Le format XLS historique n’est pas pris en charge. Enregistrez le fichier en XLSX.');
    if (!['zip', 'json'].includes(extension ?? '')) throw new Error('Format non pris en charge.');
    const entries = extension === 'zip' ? await readBoundedZip(file) : new Map<string, Blob>();
    const json = extension === 'zip' ? entries.get('data.json') : file;
    if (!json) throw new Error('L’archive ne contient pas de data.json.');
    if (json.size > IMPORT_LIMITS.file) throw new Error('data.json dépasse 15 Mio.');
    const raw: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readBlobBuffer(json)));
    const result = parseJsonImport(raw);
    if (result.report.blockingErrors.length) return { result, media: [] };
    const rows = raw as Record<string, unknown>[];
    const media: ParsedImport['media'] = [];
    const refs = new Map<string, string>();
    let totalInline = 0;
    for (let i = 0; i < result.observations.length; i++) {
        const observation = result.observations[i];
        for (const field of ['photo', 'sound', 'wikipediaImage'] as const) {
            const value = rows[i][field];
            if (typeof value !== 'string' || !value) continue;
            let blob: Blob | undefined;
            if (value.startsWith('data:')) {
                if (value.length > Math.ceil(IMPORT_LIMITS.media * 4 / 3) + 128) throw new Error('Média intégré trop volumineux.');
                const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(value);
                if (!match || !Object.values(MIME).includes(match[1])) throw new Error('Média intégré invalide.');
                const bytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0));
                totalInline += bytes.length;
                if (totalInline > IMPORT_LIMITS.expanded) throw new Error('Trop de médias intégrés.');
                blob = new Blob([bytes], { type: match[1] });
            } else if (extension === 'zip') {
                let name: string;
                try { name = new URL(value).pathname.split('/').pop() ?? ''; }
                catch { name = value.split('/').pop() ?? ''; }
                name = name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
                const entry = entries.get(`${field === 'sound' ? 'sounds' : 'images'}/${name}`);
                if (entry) {
                    const mime = MIME[name.split('.').pop()?.toLowerCase() ?? ''];
                    if (!mime || (field === 'sound' ? !mime.startsWith('audio/') : !mime.startsWith('image/'))) throw new Error('Format du média restauré invalide.');
                    blob = entry.slice(0, entry.size, mime);
                }
            }
            if (!blob) continue;
            if (field === 'sound' ? !blob.type.startsWith('audio/') : !blob.type.startsWith('image/')) throw new Error('Type du média incompatible avec le champ.');
            if (!blob.size || blob.size > IMPORT_LIMITS.media) throw new Error('Média vide ou dépassant 20 Mio.');
            let reference = refs.get(value);
            if (!reference) { reference = `import-media:${media.length}`; refs.set(value, reference); media.push({ reference, blob }); }
            // Une image d'encyclopédie embarquée devient un média privé si aucune photo n'existe.
            if (field === 'wikipediaImage') { if (!observation.photo) observation.photo = reference; }
            else observation[field] = reference;
        }
    }
    return { result, media };
}
