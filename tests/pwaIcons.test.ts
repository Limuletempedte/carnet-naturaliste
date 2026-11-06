import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Non-régression des icônes (logo « Oiseau sur sa feuille », générées par
// `npm run icons`) : présence, vraies dimensions et poids raisonnable. Le lot E
// (PR #33) avait trouvé des icônes 1024 px de 1,35 Mo déclarées en 192/512.

const PUBLIC = resolve(__dirname, '../public');
const read = (name: string) => readFileSync(resolve(PUBLIC, name));

/** Largeur et hauteur lues dans l'en-tête IHDR d'un PNG. */
const pngSize = (buf: Buffer) => {
    expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
};

const PNG_ICONS: Array<[string, number]> = [
    ['pwa-144x144.png', 144],
    ['pwa-192x192.png', 192],
    ['pwa-384x384.png', 384],
    ['pwa-512x512.png', 512],
    ['pwa-maskable-192x192.png', 192],
    ['pwa-maskable-512x512.png', 512],
    ['apple-touch-icon.png', 180]
];

describe('Icônes PWA et favicons', () => {
    it.each(PNG_ICONS)('%s existe, mesure %i px et reste léger', (name, size) => {
        const buf = read(name);
        expect(pngSize(buf)).toEqual({ width: size, height: size });
        expect(buf.length).toBeLessThan(60 * 1024);
    });

    it('favicon.ico contient les tailles 16, 32 et 48 px', () => {
        const ico = read('favicon.ico');
        expect(ico.readUInt16LE(2)).toBe(1); // type « icône »
        const count = ico.readUInt16LE(4);
        const sizes = Array.from({ length: count }, (_, i) => ico.readUInt8(6 + 16 * i));
        expect(sizes).toEqual([16, 32, 48]);
        expect(ico.length).toBeLessThan(20 * 1024);
    });

    it.each(['logo.svg', 'favicon.svg'])('%s est un SVG titré, carré, sans image intégrée', (name) => {
        const svg = read(name).toString('utf8');
        expect(svg).toContain('viewBox="0 0 512 512"');
        expect(svg).toContain('<title>Carnet Naturaliste</title>');
        expect(svg).not.toMatch(/<image|data:image/);
        expect(statSync(resolve(PUBLIC, name)).size).toBeLessThan(8 * 1024);
    });

    it('les sources des variantes existent à côté du script de génération', () => {
        for (const name of ['logo-16.svg', 'logo-maskable.svg', 'logo-apple.svg']) {
            expect(existsSync(resolve(__dirname, '../scripts/icons', name))).toBe(true);
        }
    });

    it('le manifest et index.html pointent vers les fichiers présents', () => {
        const config = readFileSync(resolve(__dirname, '../vite.config.ts'), 'utf8');
        const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
        const referenced = [
            ...config.matchAll(/src: '([^']+\.png)'/g),
            ...html.matchAll(/href="\/([^"]+\.(?:svg|ico|png))"/g)
        ].map((m) => m[1]);
        expect(referenced).toContain('favicon.svg');
        for (const name of referenced) {
            expect(existsSync(resolve(PUBLIC, name)), name).toBe(true);
        }
    });
});
