import { Inflate } from 'pako';
import { IMPORT_LIMITS, readBlobBuffer } from './importLimits';

const invalid = (message = 'Archive ZIP invalide ou format non pris en charge.'): never => { throw new Error(message); };
const crcTable = new Uint32Array(256).map((_, n) => {
    let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0;
});
type Entry = { name: string; method: number; flags: number; compressed: number; expanded: number; offset: number; crc: number; start?: number };

/** Répertoire central borné, puis décompression par blocs de sortie de 64 Kio.
 * Aucun buffer de la taille déclarée dans l'archive n'est préalloué.
 * ZIP64/chiffrement/multivolume et noms dupliqués sont refusés explicitement.
 */
export async function readBoundedZip(file: Blob, excel = false): Promise<Map<string, Blob>> {
    if (file.size > (excel ? IMPORT_LIMITS.file : IMPORT_LIMITS.zip)) invalid('Fichier trop volumineux.');
    const read = async (offset: number, length: number) => {
        if (offset < 0 || length < 0 || offset + length > file.size) invalid();
        return new DataView(await readBlobBuffer(file.slice(offset, offset + length)));
    };
    const tail = await read(Math.max(0, file.size - 65_557), Math.min(file.size, 65_557));
    let eocd = -1;
    for (let i = tail.byteLength - 22; i >= 0; i--) {
        if (tail.getUint32(i, true) === 0x06054b50 && i + 22 + tail.getUint16(i + 20, true) === tail.byteLength) { eocd = i; break; }
    }
    if (eocd < 0) invalid();
    const count = tail.getUint16(eocd + 10, true), centralSize = tail.getUint32(eocd + 12, true), central = tail.getUint32(eocd + 16, true);
    if (tail.getUint16(eocd + 4, true) || tail.getUint16(eocd + 6, true) || tail.getUint16(eocd + 8, true) !== count
        || count > IMPORT_LIMITS.entries || central === 0xffffffff || centralSize === 0xffffffff || central + centralSize > file.size - 22) invalid('Archive trop complexe ou trop nombreuses entrées.');
    const entries: Entry[] = [], names = new Set<string>();
    const decode = (view: DataView) => new TextDecoder('utf-8', { fatal: true }).decode(view.buffer as ArrayBuffer);
    let cursor = central;
    for (let i = 0; i < count; i++) {
        const h = await read(cursor, 46);
        if (h.getUint32(0, true) !== 0x02014b50) invalid();
        const nameSize = h.getUint16(28, true), extra = h.getUint16(30, true), comment = h.getUint16(32, true);
        if (!nameSize || nameSize > 4096) invalid('Nom de fichier trop long.');
        const name = decode(await read(cursor + 46, nameSize));
        if (names.has(name) || name.startsWith('/') || /[\\\u0000]/.test(name) || name.split('/').some(p => p === '.' || p === '..')) invalid('Noms de fichiers ambigus dans le ZIP.');
        if (excel && /xl\/worksheets\/sheet\d+\.xml/.test(name) && !/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) invalid('Nom de feuille Excel ambigu.');
        const extras = await read(cursor + 46 + nameSize, extra);
        for (let at = 0; at < extras.byteLength;) {
            if (at + 4 > extras.byteLength) invalid();
            const type = extras.getUint16(at, true), length = extras.getUint16(at + 2, true);
            if (at + 4 + length > extras.byteLength) invalid();
            // JSZip peut remplacer le nom par ce champ Unicode : les deux vues doivent coïncider.
            if (type === 0x7075) {
                if (length < 5 || new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(extras.buffer, at + 9, length - 5)) !== name) invalid('Alias Unicode de fichier ambigu.');
            }
            at += 4 + length;
        }
        names.add(name);
        const entry: Entry = { name, flags: h.getUint16(8, true), method: h.getUint16(10, true), compressed: h.getUint32(20, true), expanded: h.getUint32(24, true), offset: h.getUint32(42, true), crc: h.getUint32(16, true) };
        if (entry.flags & 1 || ![0, 8].includes(entry.method) || entry.compressed === 0xffffffff || entry.expanded === 0xffffffff || entry.offset === 0xffffffff || h.getUint16(34, true)) invalid();
        entries.push(entry); cursor += 46 + nameSize + extra + comment;
        if (cursor > central + centralSize) invalid();
    }
    if (cursor !== central + centralSize) invalid();
    let lastEnd = 0;
    for (const entry of [...entries].sort((a, b) => a.offset - b.offset)) {
        const h = await read(entry.offset, 30);
        const nameSize = h.getUint16(26, true), extra = h.getUint16(28, true);
        if (h.getUint32(0, true) !== 0x04034b50 || h.getUint16(8, true) !== entry.method || h.getUint16(6, true) !== entry.flags
            || entry.offset < lastEnd || decode(await read(entry.offset + 30, nameSize)) !== entry.name) invalid();
        entry.start = entry.offset + 30 + nameSize + extra;
        lastEnd = entry.start + entry.compressed;
        if (lastEnd > central) invalid();
    }
    let total = 0;
    const output = new Map<string, Blob>();
    for (const entry of entries) {
        const cap = excel ? IMPORT_LIMITS.excelExpanded : entry.name === 'data.json' ? IMPORT_LIMITS.file : /^(images|sounds)\//.test(entry.name) ? IMPORT_LIMITS.media : IMPORT_LIMITS.expanded;
        // Les tailles annoncées permettent un refus précoce ; le compteur réel reste obligatoire.
        if (entry.expanded > cap) invalid('Entrée décompressée trop volumineuse.');
        const retain = excel ? entry.name.endsWith('.xml') : entry.name === 'data.json' || /^(images|sounds)\//.test(entry.name);
        const chunks: BlobPart[] = [];
        let size = 0, crc = 0xffffffff;
        const accept = (chunk: Uint8Array) => {
            size += chunk.byteLength; total += chunk.byteLength;
            if (size > cap || total > (excel ? IMPORT_LIMITS.excelExpanded : IMPORT_LIMITS.expanded)) invalid('Limite de décompression dépassée.');
            for (const byte of chunk) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
            if (retain) chunks.push(new Uint8Array(chunk));
        };
        const inflater = entry.method === 8 ? new Inflate({ raw: true, chunkSize: 64 * 1024 }) : undefined;
        let complete = false;
        if (inflater) { inflater.onData = accept; inflater.onEnd = status => { if (status !== 0) invalid(); complete = true; }; }
        for (let offset = 0; offset < entry.compressed; offset += 32 * 1024) {
            const bytes = new Uint8Array((await read(entry.start! + offset, Math.min(32 * 1024, entry.compressed - offset))).buffer);
            if (inflater) { inflater.push(bytes, offset + bytes.length === entry.compressed); if (inflater.err) invalid(); }
            else accept(bytes);
        }
        if (size !== entry.expanded || ((crc ^ 0xffffffff) >>> 0) !== entry.crc || (inflater && !complete)) invalid('Archive corrompue ou tailles incohérentes.');
        if (retain) output.set(entry.name, new Blob(chunks));
    }
    return output;
}

/** Lecture linéaire des balises en respectant les guillemets, commentaires et CDATA. */
function* xmlTags(xml: string): Generator<[string, string]> {
    let cursor = 0;
    while ((cursor = xml.indexOf('<', cursor)) >= 0) {
        let terminator: string | undefined;
        if (xml.startsWith('<!--', cursor)) terminator = '-->';
        else if (xml.startsWith('<![CDATA[', cursor)) terminator = ']]>';
        else if (xml.startsWith('<?', cursor)) terminator = '?>';
        if (terminator) { const end = xml.indexOf(terminator, cursor + 2); if (end < 0) invalid(); cursor = end + terminator.length; continue; }
        if (xml.startsWith('<!', cursor)) invalid('Déclarations XML non autorisées.');
        const start = ++cursor;
        let quote = '';
        for (; cursor < xml.length; cursor++) {
            const character = xml[cursor];
            if (quote) { if (character === quote) quote = ''; }
            else if (character === '"' || character === "'") quote = character;
            else if (character === '>') break;
        }
        if (cursor === xml.length) invalid();
        const tag = xml.slice(start, cursor++), match = /^([\w:.-]+)([\s\S]*)$/.exec(tag);
        if (match) yield [match[1].split(':').pop()!, match[2]];
    }
}

/** Contrôle toutes les feuilles avant la matérialisation par ExcelJS. */
export async function preflightExcel(file: Blob): Promise<void> {
    const entries = await readBoundedZip(file, true);
    for (const [name, blob] of entries) {
        if (!/^xl\/worksheets\/.+\.xml$/.test(name)) continue;
        const xml = new TextDecoder().decode(await readBlobBuffer(blob));
        if (/<!DOCTYPE|<!ENTITY/i.test(xml)) invalid('Déclarations XML non autorisées.');
        let rows = 0, cells = 0, rowCells = 0;
        for (const [name, attributes] of xmlTags(xml)) {
            const tag = ['', name, attributes];
            if (tag[1] === 'row') { rowCells = 0; if (++rows > IMPORT_LIMITS.observations + 1) invalid('Trop de lignes Excel.'); }
            if (tag[1] === 'c' && (++rowCells > IMPORT_LIMITS.columns || ++cells > (IMPORT_LIMITS.observations + 1) * IMPORT_LIMITS.columns)) invalid('Trop de cellules Excel.');
            for (const attr of tag[2].matchAll(/\b(r|ref|min|max)\s*=\s*["']([^"']*)["']/g)) {
                const value = attr[2];
                if (value.includes('&')) invalid('Référence XML ambiguë.');
                if (tag[1] === 'row' && attr[1] === 'r' && (!/^\d+$/.test(value) || Number(value) > IMPORT_LIMITS.observations + 1)) invalid('Dimensions Excel trop grandes.');
                if (tag[1] === 'col' && ['min', 'max'].includes(attr[1]) && (!/^\d+$/.test(value) || Number(value) > IMPORT_LIMITS.columns)) invalid('Trop de colonnes Excel.');
                if (['c', 'dimension', 'mergeCell'].includes(tag[1]) && ['r', 'ref'].includes(attr[1])) {
                    for (const ref of value.split(':')) {
                        const match = /^([A-Z]+)([1-9]\d*)$/.exec(ref);
                        if (!match) invalid('Référence de cellule invalide.');
                        let col = 0; for (const letter of match![1]) col = col * 26 + letter.charCodeAt(0) - 64;
                        if (col > IMPORT_LIMITS.columns || Number(match![2]) > IMPORT_LIMITS.observations + 1) invalid('Dimensions Excel trop grandes.');
                    }
                }
            }
        }
    }
}
