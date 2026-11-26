// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// Page blanche constatée le 2026-11-26 : une version d'avant la PR #135
// importait au démarrage vendor-jspdf-*.js, exclu du pré-cache. Après un
// redéploiement, ce fichier n'existe plus : la page reste vide, le bandeau
// « Nouvelle version disponible » ne s'affiche jamais, et la nouvelle version
// du service worker attend pour toujours (registerType: 'prompt').
// public/sw-unstick.js, chargé par sw.js, doit l'activer dans ce seul cas.

const SCRIPT = readFileSync(resolve(__dirname, '../public/sw-unstick.js'), 'utf8');
const ORIGIN = 'https://carnet.test';
const PRECACHE = `workbox-precache-v2-${ORIGIN}/`;
const VENDOR_CACHE = 'vendor-chunks-cache';

const js = (code: string) =>
    new Response(code, { headers: { 'content-type': 'application/javascript; charset=utf-8' } });
const html = (body: string, status = 200) =>
    new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
const shell = (entry: string) =>
    `<!doctype html><html><head><script type="module" crossorigin src="${entry}"></script></head><body><div id="root"></div></body></html>`;

type Entries = Record<string, Response>;

const fakeCaches = (stores: Record<string, Entries>) => {
    const byName = new Map(
        Object.entries(stores).map(([name, entries]) => [
            name,
            new Map(Object.entries(entries).map(([path, response]) => [new URL(path, ORIGIN).href, response])),
        ])
    );
    return {
        keys: async () => [...byName.keys()],
        has: async (name: string) => byName.has(name),
        open: async (name: string) => {
            const store = byName.get(name) ?? new Map<string, Response>();
            byName.set(name, store);
            return {
                keys: async () => [...store.keys()].map((url) => new Request(url)),
                match: async (request: Request | string) =>
                    store.get(typeof request === 'string' ? new URL(request, ORIGIN).href : request.url)?.clone(),
            };
        },
    };
};

interface Scenario {
    hasActiveWorker?: boolean;
    caches: Record<string, Entries>;
    /** Réponses du serveur par chemin ; absent → 404 ; Error → réseau coupé. */
    network: Record<string, Response | Error>;
}

const run = (scenario: Scenario) => {
    const listeners = new Map<string, (event: unknown) => void>();
    const windows = [{ url: `${ORIGIN}/`, navigate: vi.fn(async () => undefined) }];
    const self = {
        location: new URL(`${ORIGIN}/sw.js`),
        registration: { active: scenario.hasActiveWorker === false ? null : {} },
        addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener),
        skipWaiting: vi.fn(async () => undefined),
        clients: { claim: vi.fn(async () => undefined), matchAll: vi.fn(async () => windows) },
    };
    const fetchMock = vi.fn(async (input: string | Request) => {
        const url = new URL(typeof input === 'string' ? input : input.url, ORIGIN);
        const response = scenario.network[url.pathname];
        if (response instanceof Error) throw response;
        return response ? response.clone() : html('<h1>404</h1>', 404);
    });
    new Function('self', 'caches', 'fetch', SCRIPT)(self, fakeCaches(scenario.caches), fetchMock);

    const fire = async (type: string) => {
        const pending: Promise<unknown>[] = [];
        listeners.get(type)?.({ waitUntil: (promise: Promise<unknown>) => pending.push(promise) });
        await Promise.all(pending);
        // Le rechargement des fenêtres part après l'activation, hors waitUntil.
        await new Promise((done) => setTimeout(done, 0));
    };
    const fetchedPaths = () =>
        fetchMock.mock.calls.map(([input]) => new URL(typeof input === 'string' ? input : input.url, ORIGIN).pathname);
    return { self, windows, fire, fetchedPaths };
};

// Ancienne version cassée : son entrée importe un chunk lourd qui n'est ni
// pré-caché ni sur le serveur ; le cache des chunks vendeur a gardé, sous son
// nom, la page HTML renvoyée par la réécriture de Vercel.
const brokenOldVersion = (): Scenario => ({
    caches: {
        [PRECACHE]: {
            '/index.html?__WB_REVISION__=old': html(shell('/assets/index-OLD.js')),
            '/assets/index-OLD.js': js(
                'import{a as e}from"./vendor-core-OLD.js";import{t}from"./vendor-jspdf-OLD.js";const n=()=>import("./ObservationForm-OLD.js");'
            ),
            '/assets/vendor-core-OLD.js': js('export const a=1;'),
        },
        [VENDOR_CACHE]: {
            '/assets/vendor-jspdf-OLD.js': html(shell('/assets/index-OLD.js')),
        },
    },
    network: { '/index.html': html(shell('/assets/index-NEW.js')) },
});

describe("sw-unstick : débloquer une ancienne version qui ne démarre plus", () => {
    it("active tout de suite la nouvelle version et recharge les fenêtres quand l'ancienne ne peut pas démarrer", async () => {
        const { self, windows, fire } = run(brokenOldVersion());

        await fire('install');
        expect(self.skipWaiting).toHaveBeenCalledTimes(1);

        await fire('activate');
        expect(self.clients.claim).toHaveBeenCalledTimes(1);
        expect(windows[0].navigate).toHaveBeenCalledWith(`${ORIGIN}/`);
    });

    it('suit les imports statiques en profondeur (chunk manquant importé par un chunk importé)', async () => {
        const { self, fire } = run({
            caches: {
                [PRECACHE]: {
                    '/index.html?__WB_REVISION__=old': html(shell('/assets/index-OLD.js')),
                    '/assets/index-OLD.js': js('import{a}from"./vendor-core-OLD.js";'),
                    '/assets/vendor-core-OLD.js': js('import"./vendor-jspdf-OLD.js";export const a=1;'),
                },
            },
            network: { '/index.html': html(shell('/assets/index-NEW.js')) },
        });

        await fire('install');
        expect(self.skipWaiting).toHaveBeenCalledTimes(1);
    });

    it("garde l'attente normale quand l'ancienne version démarre (tout est pré-caché)", async () => {
        const { self, windows, fire } = run({
            caches: {
                [PRECACHE]: {
                    '/index.html?__WB_REVISION__=old': html(shell('/assets/index-OLD.js')),
                    '/assets/index-OLD.js': js(
                        'import{a}from"./vendor-core-OLD.js";const p=()=>import("./vendor-jspdf-OLD.js");'
                    ),
                    '/assets/vendor-core-OLD.js': js('export const a=1;'),
                },
            },
            network: { '/index.html': html(shell('/assets/index-NEW.js')) },
        });

        await fire('install');
        await fire('activate');
        expect(self.skipWaiting).not.toHaveBeenCalled();
        expect(self.clients.claim).not.toHaveBeenCalled();
        expect(windows[0].navigate).not.toHaveBeenCalled();
    });

    it('accepte un chunk gardé comme JavaScript dans le cache des chunks vendeur, sans passer par le réseau', async () => {
        const scenario = brokenOldVersion();
        scenario.caches[VENDOR_CACHE] = { '/assets/vendor-jspdf-OLD.js': js('export const t=1;') };
        const { self, fire, fetchedPaths } = run(scenario);

        await fire('install');
        expect(self.skipWaiting).not.toHaveBeenCalled();
        expect(fetchedPaths()).toEqual(['/index.html']);
    });

    it('accepte un chunk encore servi en JavaScript par le serveur', async () => {
        const scenario = brokenOldVersion();
        scenario.network['/assets/vendor-jspdf-OLD.js'] = js('export const t=1;');
        const { self, fire } = run(scenario);

        await fire('install');
        expect(self.skipWaiting).not.toHaveBeenCalled();
    });

    it('ne fait rien à la première installation', async () => {
        const scenario = brokenOldVersion();
        scenario.hasActiveWorker = false;
        const { self, fire, fetchedPaths } = run(scenario);

        await fire('install');
        expect(self.skipWaiting).not.toHaveBeenCalled();
        expect(fetchedPaths()).toEqual([]);
    });

    it("ne relit rien quand l'ancienne version a la même entrée que la nouvelle", async () => {
        const scenario = brokenOldVersion();
        scenario.network['/index.html'] = html(shell('/assets/index-OLD.js'));
        const { self, fire, fetchedPaths } = run(scenario);

        await fire('install');
        expect(self.skipWaiting).not.toHaveBeenCalled();
        expect(fetchedPaths()).toEqual(['/index.html']);
    });

    it("en cas de doute (réseau coupé), garde l'attente normale sans faire échouer l'installation", async () => {
        const scenario = brokenOldVersion();
        scenario.network['/index.html'] = new Error('réseau coupé');
        const { self, fire } = run(scenario);

        await expect(fire('install')).resolves.toBeUndefined();
        expect(self.skipWaiting).not.toHaveBeenCalled();
    });
});

describe('vercel.json : un fichier manquant de /assets/ reste un 404', () => {
    // Sinon Vercel renvoie index.html (200) à la place du JavaScript disparu,
    // et la règle CacheFirst des chunks vendeur garde cette page HTML 30 jours.
    const config = JSON.parse(readFileSync(resolve(__dirname, '../vercel.json'), 'utf8')) as {
        rewrites: { source: string; destination: string }[];
    };
    const rewritten = (path: string) => config.rewrites.some((rule) => new RegExp(`^${rule.source}$`).test(path));

    it('ne réécrit pas les fichiers de /assets/', () => {
        expect(rewritten('/assets/vendor-jspdf-erKfmjEl.js')).toBe(false);
        expect(rewritten('/assets/index-BoxHwRJ1.js')).toBe(false);
    });

    it("réécrit toujours les autres adresses vers l'application, sauf /api/", () => {
        expect(rewritten('/')).toBe(true);
        expect(rewritten('/observations/42')).toBe(true);
        expect(rewritten('/api/ping')).toBe(false);
    });
});
