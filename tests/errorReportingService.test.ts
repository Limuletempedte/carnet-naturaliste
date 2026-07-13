import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock du SDK : aucun appel reseau, on verifie seulement le cablage.
vi.mock('@sentry/react', () => ({
    init: vi.fn(),
    captureException: vi.fn(),
    captureMessage: vi.fn(),
}));

const FAKE_DSN = 'https://cle-publique@o0.ingest.de.sentry.io/0';

// `initialized` et la lecture de la DSN vivent au niveau module : chaque test
// recharge le module (et le mock Sentry) pour repartir d'un etat vierge.
const load = async () => {
    const sentry = await import('@sentry/react');
    const service = await import('../services/errorReportingService');
    return { sentry: vi.mocked(sentry), service };
};

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
});

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('errorReportingService — sans DSN', () => {
    it("n'initialise pas Sentry et reste inactif", async () => {
        const { sentry, service } = await load();
        service.initErrorReporting();
        expect(sentry.init).not.toHaveBeenCalled();
        expect(service.isErrorReportingEnabled()).toBe(false);
    });

    it('reportError est un no-op silencieux', async () => {
        const { sentry, service } = await load();
        service.initErrorReporting();
        expect(() => service.reportError(['boom', new Error('x')])).not.toThrow();
        expect(sentry.captureException).not.toHaveBeenCalled();
        expect(sentry.captureMessage).not.toHaveBeenCalled();
    });
});

describe('errorReportingService — avec DSN', () => {
    beforeEach(() => {
        vi.stubEnv('VITE_SENTRY_DSN', FAKE_DSN);
    });

    it('initialise Sentry en mode erreurs uniquement, collecte minimale', async () => {
        const { sentry, service } = await load();
        service.initErrorReporting();
        expect(sentry.init).toHaveBeenCalledTimes(1);
        const options = sentry.init.mock.calls[0][0];
        expect(options?.dsn).toBe(FAKE_DSN);
        expect(options?.tracesSampleRate).toBe(0);
        expect(options?.dataCollection).toEqual({
            userInfo: false,
            cookies: false,
            httpHeaders: { request: false, response: false },
            httpBodies: [],
            queryParams: false,
        });
        expect(service.isErrorReportingEnabled()).toBe(true);
    });

    it("retire l'integration BrowserSession (pas de ping de session)", async () => {
        const { sentry, service } = await load();
        service.initErrorReporting();
        const integrations = sentry.init.mock.calls[0][0]?.integrations;
        expect(integrations).toBeTypeOf('function');
        const defaults = [{ name: 'Breadcrumbs' }, { name: 'BrowserSession' }, { name: 'GlobalHandlers' }];
        const kept = (integrations as (d: typeof defaults) => typeof defaults)(defaults);
        expect(kept.map((i) => i.name)).toEqual(['Breadcrumbs', 'GlobalHandlers']);
    });

    it("un second init n'appelle pas Sentry.init une deuxieme fois", async () => {
        const { sentry, service } = await load();
        service.initErrorReporting();
        service.initErrorReporting();
        expect(sentry.init).toHaveBeenCalledTimes(1);
    });

    it('beforeSend laisse passer une erreur normale et filtre les chunk load errors', async () => {
        const { sentry, service } = await load();
        service.initErrorReporting();
        const beforeSend = sentry.init.mock.calls[0][0]?.beforeSend;
        expect(beforeSend).toBeTypeOf('function');

        const event = { event_id: 'e1' };
        const normale = beforeSend!(event as never, { originalException: new Error('vrai bug') });
        expect(normale).toBe(event);

        const chunk = beforeSend!(event as never, {
            originalException: new Error('Failed to fetch dynamically imported module: /assets/x.js'),
        });
        expect(chunk).toBeNull();
    });

    it('reportError capture la premiere Error avec les chaines en contexte', async () => {
        const { sentry, service } = await load();
        service.initErrorReporting();
        const err = new Error('boom');
        service.reportError(['[storage] echec sync', err, { id: 1 }]);
        expect(sentry.captureException).toHaveBeenCalledWith(err, {
            extra: { loggerMessage: '[storage] echec sync' },
        });
    });

    it("reportError sans Error remonte le message en niveau 'error'", async () => {
        const { sentry, service } = await load();
        service.initErrorReporting();
        service.reportError(['probleme', 'inattendu']);
        expect(sentry.captureMessage).toHaveBeenCalledWith('probleme inattendu', 'error');
        expect(sentry.captureException).not.toHaveBeenCalled();
    });

    it('reportError ignore les chunk load errors', async () => {
        const { sentry, service } = await load();
        service.initErrorReporting();
        service.reportError([new Error('error loading dynamically imported module')]);
        expect(sentry.captureException).not.toHaveBeenCalled();
    });
});
