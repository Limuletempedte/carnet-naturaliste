// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build, type Rolldown } from 'vite';

// Démarrage hors ligne après UNE seule visite : tout ce que l'app charge au
// démarrage doit être dans le pré-cache du service worker (sw.js).
//
// Le 2026-11-20, l'entrée index-*.js importait vendor-jspdf-*.js (Rolldown y
// avait rangé l'aide au préchargement de Vite), exclu du pré-cache : hors ligne,
// la page restait vide. Ce test lance un vrai build de production dans un
// dossier temporaire et vérifie le graphe des imports statiques contre sw.js.

const ROOT = resolve(__dirname, '..');

// Bibliothèques lourdes chargées seulement à l'export (PDF, Excel, ZIP).
// Elles restent hors du démarrage et du pré-cache (vite.config.ts, PE-11 / PE-30).
const HEAVY_ON_DEMAND = ['vendor-jspdf', 'vendor-exceljs', 'vendor-html2canvas', 'vendor-jszip', 'vendor-file-saver'];
const isHeavy = (fileName: string) => HEAVY_ON_DEMAND.some((name) => fileName.startsWith(`assets/${name}-`));

let outDir = '';
let chunks: Rolldown.OutputChunk[] = [];
let precached = new Set<string>();
let indexHtml = '';
let swSource = '';

beforeAll(async () => {
    outDir = mkdtempSync(join(tmpdir(), 'carnet-precache-'));
    // Vitest fixe NODE_ENV=test ; le build doit se faire comme en production.
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
        const result = await build({
            root: ROOT,
            configFile: resolve(ROOT, 'vite.config.ts'),
            mode: 'production',
            logLevel: 'silent',
            build: { outDir, emptyOutDir: true }
        });
        const outputs = Array.isArray(result) ? result : [result];
        chunks = outputs.flatMap((o) =>
            'output' in o ? o.output.filter((item): item is Rolldown.OutputChunk => item.type === 'chunk') : []
        );
    } finally {
        process.env.NODE_ENV = previousNodeEnv;
    }
    swSource = readFileSync(join(outDir, 'sw.js'), 'utf8');
    precached = new Set([...swSource.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]));
    indexHtml = readFileSync(join(outDir, 'index.html'), 'utf8');
}, 180_000);

afterAll(() => {
    if (outDir) rmSync(outDir, { recursive: true, force: true });
});

/** Fichiers chargés au démarrage : l'entrée et tout ce qu'elle importe statiquement. */
const startupFiles = () => {
    const byName = new Map(chunks.map((c) => [c.fileName, c]));
    const seen = new Set<string>();
    const queue = chunks.filter((c) => c.isEntry).map((c) => c.fileName);
    while (queue.length) {
        const name = queue.pop()!;
        if (seen.has(name)) continue;
        seen.add(name);
        queue.push(...(byName.get(name)?.imports ?? []));
    }
    return seen;
};

describe('Pré-cache du service worker et démarrage hors ligne', () => {
    it('le build produit bien les chunks lourds et un pré-cache', () => {
        for (const name of HEAVY_ON_DEMAND) {
            expect(chunks.some((c) => c.fileName.startsWith(`assets/${name}-`)), name).toBe(true);
        }
        expect(chunks.some((c) => c.isEntry)).toBe(true);
        expect(precached.size).toBeGreaterThan(10);
    });

    it('les chunks lourds restent hors du pré-cache', () => {
        expect([...precached].filter(isHeavy)).toEqual([]);
    });

    it("tout ce que charge le démarrage est pré-caché, sans chunk lourd", () => {
        const startup = [...startupFiles()];
        expect(startup.filter(isHeavy)).toEqual([]);
        expect(startup.filter((name) => !precached.has(name))).toEqual([]);
    });

    it("aucun chunk pré-caché n'importe statiquement un chunk absent du pré-cache", () => {
        // Couvre aussi les écrans chargés à la demande (statistiques, formulaire…) :
        // pré-cachés, ils doivent pouvoir s'ouvrir hors ligne dès la première visite.
        const broken = chunks
            .filter((c) => precached.has(c.fileName))
            .flatMap((c) => c.imports.filter((dep) => !precached.has(dep)).map((dep) => `${c.fileName} -> ${dep}`));
        expect(broken).toEqual([]);
    });

    it('sw.js charge le script qui débloque une ancienne version cassée', () => {
        // Page blanche du 2026-11-26 : voir public/sw-unstick.js et tests/swUnstick.test.ts.
        expect(swSource).toContain('"/sw-unstick.js"');
        expect(precached.has('sw-unstick.js')).toBe(true);
    });

    it("index.html ne précharge aucun chunk lourd", () => {
        const referenced = [...indexHtml.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
        expect(referenced.length).toBeGreaterThan(0);
        expect(referenced.filter(isHeavy)).toEqual([]);
    });
});
