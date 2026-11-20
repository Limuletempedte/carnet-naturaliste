import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TAXON_LOGOS } from '../constants';

// Non-régression des logos des groupes taxonomiques (générés par `npm run logos`,
// scripts/generate-taxon-logos.py). Ils pesaient 1,5 Mo chacun en 1024 px pour
// un affichage de 80 px CSS au plus : 45 Mo à télécharger pour les 32 logos.

const PUBLIC = resolve(__dirname, '../public');
const LOGO_DIR = resolve(PUBLIC, 'Logo');
const SIZE = 256;

/** Largeur, hauteur et type de couleur lus dans l'en-tête IHDR d'un PNG. */
const pngHeader = (buf: Buffer) => {
    expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colorType: buf.readUInt8(25) };
};

// Le groupe « Autre » n'a pas de logo (chaîne vide).
const logoSources = Object.values(TAXON_LOGOS).filter(Boolean);
const logoFiles = logoSources.map((src) => src.replace(/^\/Logo\//, ''));

describe('Logos des groupes taxonomiques', () => {
    it('chaque groupe pointe vers un fichier présent dans public/Logo', () => {
        expect(logoSources.length).toBe(32);
        for (const src of logoSources) {
            expect(src.startsWith('/Logo/'), src).toBe(true);
            expect(existsSync(resolve(PUBLIC, `.${src}`)), src).toBe(true);
        }
    });

    it.each(logoFiles)('%s est un PNG carré de 256 px, transparent et léger', (name) => {
        const buf = readFileSync(resolve(LOGO_DIR, name));
        // 6 = RGBA : la transparence est conservée pour les fonds clairs et sombres.
        expect(pngHeader(buf)).toEqual({ width: SIZE, height: SIZE, colorType: 6 });
        expect(buf.length).toBeLessThan(40 * 1024);
    });

    it('le dossier ne contient que des logos utilisés, 1 Mo au plus au total', () => {
        const files = readdirSync(LOGO_DIR);
        expect(files.sort()).toEqual([...new Set(logoFiles)].sort());
        const total = files.reduce((sum, name) => sum + readFileSync(resolve(LOGO_DIR, name)).length, 0);
        expect(total).toBeLessThan(1024 * 1024);
    });
});
