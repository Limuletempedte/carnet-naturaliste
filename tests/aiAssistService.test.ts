import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureSessionContext, setSessionIdentity } from '../services/sessionScope';
import { CONSENT_VERSION, ERROR_HTTP_STATUS } from '../supabase/functions/ai-identify/logic';
import { CONSENT_VERSIONS as TEXT_CONSENT_VERSIONS, ERROR_HTTP_STATUS as TEXT_ERROR_HTTP_STATUS, SUMMARY_LIMITS } from '../supabase/functions/ai-text/logic';

const mocks = vi.hoisted(() => ({
    getSession: vi.fn(),
    rpc: vi.fn(),
    insert: vi.fn(),
    deleteEq: vi.fn(),
    from: vi.fn(),
    download: vi.fn(),
    compress: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({
    supabase: {
        auth: { getSession: mocks.getSession },
        rpc: mocks.rpc,
        from: mocks.from,
    },
}));
vi.mock('../services/privateMediaService', () => ({ downloadPrivateMedia: mocks.download }));
vi.mock('../utils/imageUtils', () => ({ compressImage: mocks.compress }));
vi.mock('../utils/logger', () => ({ logger: { warn: mocks.warn, error: mocks.error, info: vi.fn(), debug: vi.fn() } }));

import {
    AI_CONSENT_VERSION,
    AI_SUMMARY_MAX_CHARS,
    AI_TEXT_CONSENT_VERSIONS,
    AiAssistError,
    callAiText,
    getAiOverview,
    giveConsent,
    hasCurrentConsent,
    hasOutdatedConsent,
    mapAiOverview,
    parseSummaryResult,
    readCachedAiCounter,
    rememberRemaining,
    withdrawConsent,
    aiAssistErrorMessage,
    buildIdentifyBody,
    getAccessStatus,
    identifySpecies,
    mapAccessStatus,
    parseIdentifyResponse,
    requestAccess,
    withdrawAccess,
    type AiAssistErrorCode,
} from '../services/aiAssistService';

const okBody = {
    candidates: [{
        scientificName: 'Erithacus rubecula',
        commonName: 'Rougegorge familier',
        confidence: 'elevee',
        visibleCriteria: ['Poitrine orange'],
        criteriaToCheck: ['Chant'],
    }],
    photoNote: 'Photo nette.',
    remaining: 19,
};

const jsonResponse = (status: number, body: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
});

const setOnline = (online: boolean) => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);

beforeEach(() => {
    vi.restoreAllMocks();
    Object.values(mocks).forEach(mock => mock.mockReset());
    localStorage.clear();
    setSessionIdentity('user-1');
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'jeton-test', user: { id: 'user-1' } } } });
    mocks.download.mockResolvedValue(new Blob(['original'], { type: 'image/jpeg' }));
    mocks.compress.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }));
    mocks.insert.mockResolvedValue({ error: null });
    mocks.deleteEq.mockResolvedValue({ error: null });
    mocks.from.mockReturnValue({
        insert: mocks.insert,
        delete: () => ({ eq: mocks.deleteEq }),
    });
});

afterEach(() => {
    vi.useRealTimers();
});

describe('version du consentement', () => {
    it('est identique côté application et côté fonction', () => {
        expect(AI_CONSENT_VERSION).toBe(CONSENT_VERSION);
    });
});

describe('buildIdentifyBody', () => {
    it("n'envoie que le mois, le pays, le département, le groupe et l'habitat", () => {
        const body = buildIdentifyBody('QUJD', {
            date: '2026-05-14',
            country: 'France',
            department: 'Nord',
            taxonomicGroup: 'Oiseaux',
            habitat: 'Prairie',
            // Champs qui ne doivent jamais partir, même s'ils étaient fournis par erreur
            ...({ gps: { lat: 50.6, lon: 3.06 }, municipality: 'Lille', comment: 'secret' } as object),
        });
        expect(body).toEqual({
            image: 'QUJD',
            month: '2026-05',
            country: 'France',
            department: 'Nord',
            taxonomicGroup: 'Oiseaux',
            habitat: 'Prairie',
        });
    });

    it('ignore « Non renseigné », les champs vides, trop longs ou une date invalide', () => {
        const body = buildIdentifyBody('QUJD', {
            date: '14/05/2026',
            country: ' ',
            department: 'x'.repeat(61),
            habitat: 'Non renseigné',
        });
        expect(body).toEqual({ image: 'QUJD' });
    });
});

describe('identifySpecies', () => {
    it("envoie la photo réencodée en 1 280 × 1 280 avec l'en-tête Bearer", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, okBody));
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const result = await identifySpecies('blob:photo', { date: '2026-05-14', habitat: 'Prairie' });

        expect(mocks.download).toHaveBeenCalledWith('blob:photo', expect.objectContaining({ userId: 'user-1' }));
        expect(mocks.compress).toHaveBeenCalledWith(expect.any(Blob), 1280, 1280, 0.85);
        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toContain('/functions/v1/ai-identify');
        expect(options.method).toBe('POST');
        expect(options.headers.Authorization).toBe('Bearer jeton-test');
        const sent = JSON.parse(options.body);
        expect(sent.image).toBe(btoa('jpeg'));
        expect(sent.month).toBe('2026-05');
        expect(sent.habitat).toBe('Prairie');
        expect(result.candidates).toHaveLength(1);
        expect(result.remaining).toBe(19);
    });

    it("ne fait aucun appel réseau hors ligne", async () => {
        setOnline(false);
        const fetchMock = vi.fn();
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        await expect(identifySpecies('blob:photo', {})).rejects.toMatchObject({ code: 'offline' });
        expect(fetchMock).not.toHaveBeenCalled();
        expect(mocks.download).not.toHaveBeenCalled();
        expect(mocks.getSession).not.toHaveBeenCalled();
    });

    it('traduit chaque code du serveur en message propre à l’assistant', async () => {
        const codes = Object.keys(ERROR_HTTP_STATUS).filter(code => code !== 'method_not_allowed') as AiAssistErrorCode[];
        for (const code of codes) {
            const status = ERROR_HTTP_STATUS[code as keyof typeof ERROR_HTTP_STATUS];
            globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(status, { error: code })) as unknown as typeof fetch;
            const error = await identifySpecies('blob:photo', {}).catch(e => e);
            expect(error).toBeInstanceOf(AiAssistError);
            expect(error.code).toBe(code);
            expect(error.message).toBe(aiAssistErrorMessage(code));
            expect(error.message.length).toBeGreaterThan(10);
        }
    });

    it("« quota » n'affiche jamais le message de stockage saturé", async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(429, { error: 'quota_exceeded' })) as unknown as typeof fetch;
        const error = await identifySpecies('blob:photo', {}).catch(e => e);
        expect(error.code).toBe('quota_exceeded');
        expect(error.message).not.toMatch(/stockage/i);
        expect(error.message).toMatch(/analyses/);
    });

    it("garde le nombre d'analyses restantes renvoyé avec une erreur", async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(422, { error: 'model_refused', remaining: 7 })) as unknown as typeof fetch;
        const error = await identifySpecies('blob:photo', {}).catch(e => e);
        expect(error.code).toBe('model_refused');
        expect(error.remaining).toBe(7);
    });

    it('un code inconnu ou une réponse illisible devient une erreur générique', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.reject(new Error('pas du JSON')) }) as unknown as typeof fetch;
        await expect(identifySpecies('blob:photo', {})).rejects.toMatchObject({ code: 'unknown' });
        globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(200, { autre: true })) as unknown as typeof fetch;
        await expect(identifySpecies('blob:photo', {})).rejects.toMatchObject({ code: 'invalid_output' });
    });

    it('annule la requête si la session change', async () => {
        let capturedSignal: AbortSignal | undefined;
        globalThis.fetch = vi.fn((_url: string, options: RequestInit) => {
            capturedSignal = options.signal ?? undefined;
            return new Promise((_resolve, reject) => {
                options.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
            });
        }) as unknown as typeof fetch;

        const promise = identifySpecies('blob:photo', {});
        await vi.waitFor(() => expect(capturedSignal).toBeDefined());
        setSessionIdentity('user-2');

        await expect(promise).rejects.toMatchObject({ code: 'stale_session' });
        expect(capturedSignal?.aborted).toBe(true);
    });

    it('abandonne au bout du délai maximal', async () => {
        globalThis.fetch = vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
            options.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        })) as unknown as typeof fetch;

        await expect(identifySpecies('blob:photo', {}, { timeoutMs: 20 })).rejects.toMatchObject({ code: 'timeout' });
    });

    it("s'arrête quand l'appelant annule", async () => {
        const controller = new AbortController();
        globalThis.fetch = vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
            options.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
            controller.abort();
        })) as unknown as typeof fetch;

        await expect(identifySpecies('blob:photo', {}, { signal: controller.signal })).rejects.toMatchObject({ code: 'cancelled' });
    });

    it('une photo illisible donne photo_unavailable', async () => {
        mocks.download.mockRejectedValue(new Error('Média privé indisponible.'));
        globalThis.fetch = vi.fn() as unknown as typeof fetch;
        await expect(identifySpecies('photos/user-1/a.jpg', {})).rejects.toMatchObject({ code: 'photo_unavailable' });
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('journalise les cas attendus en avertissement et les imprévus en erreur', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(429, { error: 'busy' })) as unknown as typeof fetch;
        await identifySpecies('blob:photo', {}).catch(() => undefined);
        expect(mocks.warn).toHaveBeenCalledWith(expect.stringContaining('[aiAssist]'));
        expect(mocks.error).not.toHaveBeenCalled();

        for (const code of ['not_approved', 'quota_exceeded', 'budget_exhausted', 'model_refused']) {
            globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(400, { error: code })) as unknown as typeof fetch;
            await identifySpecies('blob:photo', {}).catch(() => undefined);
        }
        expect(mocks.error).not.toHaveBeenCalled();

        globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(502, { error: 'invalid_output' })) as unknown as typeof fetch;
        await identifySpecies('blob:photo', {}).catch(() => undefined);
        expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining('[aiAssist]'), expect.anything());
    });
});

describe('parseIdentifyResponse', () => {
    it('garde au plus 3 hypothèses valides', () => {
        const candidate = okBody.candidates[0];
        const parsed = parseIdentifyResponse({
            candidates: [candidate, { ...candidate, confidence: 'certaine' }, candidate, candidate, candidate],
            photoNote: 'ok',
            remaining: 3,
        });
        expect(parsed?.candidates).toHaveLength(2);
    });
});

describe('accès', () => {
    it("traduit les états de ai_my_status", () => {
        expect(mapAccessStatus({ status: 'none' })).toEqual({ kind: 'none' });
        expect(mapAccessStatus({ status: 'pending', consent_version: AI_CONSENT_VERSION, requested_at: '2026-11-05T10:00:00Z' }))
            .toEqual({ kind: 'pending', requestedAt: '2026-11-05T10:00:00Z' });
        expect(mapAccessStatus({ status: 'approved', consent_version: AI_CONSENT_VERSION, remaining: 12, monthly_quota: 20 }))
            .toEqual({ kind: 'approved', remaining: 12, monthlyQuota: 20 });
        expect(mapAccessStatus({ status: 'approved', consent_version: '2025-01-v0', remaining: 12, monthly_quota: 20 }))
            .toEqual({ kind: 'consent_outdated' });
        expect(mapAccessStatus({ status: 'refused', note: 'Pas pour le moment.' })).toEqual({ kind: 'refused', note: 'Pas pour le moment.' });
        expect(mapAccessStatus({ status: 'revoked', note: null })).toEqual({ kind: 'revoked', note: null });
        expect(mapAccessStatus(null)).toEqual({ kind: 'none' });
    });

    it('lit le statut par ai_my_status', async () => {
        mocks.rpc.mockResolvedValue({ data: { status: 'approved', consent_version: AI_CONSENT_VERSION, remaining: 5, monthly_quota: 20 }, error: null });
        await expect(getAccessStatus()).resolves.toEqual({ kind: 'approved', remaining: 5, monthlyQuota: 20 });
        expect(mocks.rpc).toHaveBeenCalledWith('ai_my_status');
    });

    it("demande l'accès en n'envoyant que user_id et la version du consentement", async () => {
        await requestAccess();
        expect(mocks.from).toHaveBeenCalledWith('ai_access');
        expect(mocks.insert).toHaveBeenCalledWith({ user_id: 'user-1', consent_version: AI_CONSENT_VERSION });
        expect(mocks.deleteEq).not.toHaveBeenCalled();
    });

    it('renouvelle le consentement en supprimant puis recréant la demande', async () => {
        await requestAccess({ replaceExisting: true });
        expect(mocks.deleteEq).toHaveBeenCalledWith('user_id', 'user-1');
        expect(mocks.insert).toHaveBeenCalledTimes(1);
        expect(mocks.deleteEq.mock.invocationCallOrder[0]).toBeLessThan(mocks.insert.mock.invocationCallOrder[0]);
    });

    it("retire l'accord en supprimant sa ligne", async () => {
        await withdrawAccess(captureSessionContext());
        expect(mocks.deleteEq).toHaveBeenCalledWith('user_id', 'user-1');
    });

    it('signale une erreur de la base sans détail technique', async () => {
        mocks.insert.mockResolvedValue({ error: { code: '42501', message: 'permission denied' } });
        const error = await requestAccess().catch(e => e);
        expect(error).toBeInstanceOf(AiAssistError);
        expect(error.message).not.toMatch(/permission/);
    });

    it('ne contacte pas la base hors ligne', async () => {
        setOnline(false);
        await expect(getAccessStatus()).rejects.toMatchObject({ code: 'offline' });
        expect(mocks.rpc).not.toHaveBeenCalled();
    });
});

describe('fonctionnalités texte : constantes recopiées de la fonction ai-text', () => {
    it('versions de consentement identiques', () => {
        expect(AI_TEXT_CONSENT_VERSIONS).toEqual(TEXT_CONSENT_VERSIONS);
    });

    it('plafond du texte du bilan identique', () => {
        expect(AI_SUMMARY_MAX_CHARS).toBe(SUMMARY_LIMITS.maxOutputChars);
    });
});

describe('message hors ligne commun', () => {
    it('parle de l’assistant, pas de la seule aide à l’identification', () => {
        expect(aiAssistErrorMessage('offline')).toBe("L'assistant n'est disponible qu'en ligne.");
    });
});

/** Constructeur de requête chaînable : `.delete().eq().eq()` puis `await`. */
const chainable = (calls: unknown[][], result: { error: unknown } = { error: null }) => {
    const builder = {
        eq: (...args: unknown[]) => { calls.push(['eq', ...args]); return builder; },
        then: (resolve: (value: { error: unknown }) => unknown) => Promise.resolve(result).then(resolve),
    };
    return builder;
};

describe('consentements par fonctionnalité', () => {
    let calls: unknown[][];
    beforeEach(() => {
        calls = [];
        mocks.from.mockImplementation((table: string) => ({
            delete: () => { calls.push(['delete', table]); return chainable(calls); },
            insert: (row: unknown) => { calls.push(['insert', table, row]); return Promise.resolve({ error: null }); },
        }));
    });

    it('donne l’accord par suppression puis insertion, jamais par mise à jour', async () => {
        await giveConsent('summary');
        expect(calls).toEqual([
            ['delete', 'ai_consents'],
            ['eq', 'user_id', 'user-1'],
            ['eq', 'feature', 'summary'],
            ['insert', 'ai_consents', { user_id: 'user-1', feature: 'summary', version: AI_TEXT_CONSENT_VERSIONS.summary }],
        ]);
    });

    it('refuse une fonctionnalité sans texte de consentement livré', async () => {
        await expect(giveConsent('note')).rejects.toMatchObject({ code: 'invalid_request' });
        expect(calls).toEqual([]);
    });

    it('retire l’accord d’une seule fonctionnalité', async () => {
        await withdrawConsent('summary');
        expect(calls).toEqual([['delete', 'ai_consents'], ['eq', 'user_id', 'user-1'], ['eq', 'feature', 'summary']]);
    });

    it('retirer l’accès supprime aussi les consentements texte et le dernier compteur', async () => {
        localStorage.setItem('ai-status-v1:user-1', JSON.stringify({ remaining: 12, monthlyQuota: 20, at: new Date().toISOString() }));
        await withdrawAccess(captureSessionContext());
        expect(localStorage.getItem('ai-status-v1:user-1')).toBeNull();
        expect(calls).toEqual([
            ['delete', 'ai_consents'], ['eq', 'user_id', 'user-1'],
            ['delete', 'ai_access'], ['eq', 'user_id', 'user-1'],
        ]);
    });

    it('ne contacte pas la base hors ligne', async () => {
        setOnline(false);
        await expect(giveConsent('summary')).rejects.toMatchObject({ code: 'offline' });
        await expect(withdrawConsent('summary')).rejects.toMatchObject({ code: 'offline' });
        expect(calls).toEqual([]);
    });
});

describe('vue d’ensemble (ai_my_status)', () => {
    const raw = {
        status: 'approved', consent_version: AI_CONSENT_VERSION, monthly_quota: 20, remaining: 14,
        used_by_feature: { identify: 4, summary: 2, inconnue: 9 },
        consents: { summary: '2026-11-v1', autre: 'x' },
    };

    it('lit le détail du compteur et les consentements, en ignorant l’inconnu', () => {
        const overview = mapAiOverview(raw);
        expect(overview.access).toEqual({ kind: 'approved', remaining: 14, monthlyQuota: 20 });
        expect(overview.usedByFeature).toEqual({ identify: 4, summary: 2 });
        expect(overview.consents).toEqual({ summary: '2026-11-v1' });
        expect(hasCurrentConsent(overview, 'summary')).toBe(true);
    });

    it('compare la version en égalité stricte', () => {
        const outdated = mapAiOverview({ ...raw, consents: { summary: '2026-12-v9' } });
        expect(hasCurrentConsent(outdated, 'summary')).toBe(false);
        expect(hasOutdatedConsent(outdated, 'summary')).toBe(true);
        const none = mapAiOverview({ ...raw, consents: {} });
        expect(hasOutdatedConsent(none, 'summary')).toBe(false);
    });

    it('garde le dernier compteur connu pour l’affichage hors ligne', async () => {
        mocks.rpc.mockResolvedValue({ data: raw, error: null });
        await getAiOverview();
        expect(readCachedAiCounter()).toMatchObject({ remaining: 14, monthlyQuota: 20 });
        rememberRemaining(13, captureSessionContext());
        expect(readCachedAiCounter()?.remaining).toBe(13);
    });

    it('ignore un compteur d’un mois précédent', () => {
        localStorage.setItem('ai-status-v1:user-1', JSON.stringify({ remaining: 3, monthlyQuota: 20, at: '2026-10-31T23:00:00Z' }));
        expect(readCachedAiCounter(undefined, new Date('2026-11-02T10:00:00Z'))).toBeNull();
        expect(readCachedAiCounter(undefined, new Date('2026-10-31T23:30:00Z'))).not.toBeNull();
    });

    it('oublie le dernier compteur quand l’accès n’est plus approuvé', async () => {
        mocks.rpc.mockResolvedValue({ data: raw, error: null });
        await getAiOverview();
        expect(readCachedAiCounter()).not.toBeNull();
        mocks.rpc.mockResolvedValue({ data: { status: 'revoked', note: null }, error: null });
        await getAiOverview();
        expect(readCachedAiCounter()).toBeNull();
        expect(localStorage.getItem('ai-status-v1:user-1')).toBeNull();
    });

    it('le compteur est propre à chaque personne', async () => {
        mocks.rpc.mockResolvedValue({ data: raw, error: null });
        await getAiOverview();
        setSessionIdentity('user-2');
        expect(readCachedAiCounter()).toBeNull();
    });
});

describe('callAiText', () => {
    const payload = { month: '2026-10', totals: { observations: 1, species: 1, activeDays: 1 } };

    it('envoie { feature, payload } à ai-text avec l’en-tête Bearer', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { result: { text: 'Bilan.' }, remaining: 12 }));
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        const response = await callAiText('summary', payload);
        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toContain('/functions/v1/ai-text');
        expect(options.method).toBe('POST');
        expect(options.headers.Authorization).toBe('Bearer jeton-test');
        expect(JSON.parse(options.body)).toEqual({ feature: 'summary', payload });
        expect(response).toEqual({ result: { text: 'Bilan.' }, remaining: 12 });
    });

    it('ne fait aucun appel réseau hors ligne', async () => {
        setOnline(false);
        const fetchMock = vi.fn();
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        const error = await callAiText('summary', payload).catch(e => e);
        expect(error).toMatchObject({ code: 'offline', feature: 'summary' });
        expect(error.message).toBe("Le bilan ne peut être rédigé qu'en ligne.");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('traduit chaque code du serveur ai-text, sans jamais parler de photo pour le bilan', async () => {
        const codes = (Object.keys(TEXT_ERROR_HTTP_STATUS) as AiAssistErrorCode[])
            .filter(code => code !== 'method_not_allowed' as AiAssistErrorCode);
        for (const code of codes) {
            globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(TEXT_ERROR_HTTP_STATUS[code as keyof typeof TEXT_ERROR_HTTP_STATUS], { error: code })) as unknown as typeof fetch;
            const error = await callAiText('summary', payload).catch(e => e);
            expect(error).toBeInstanceOf(AiAssistError);
            expect(error.code).toBe(code);
            expect(error.message).toBe(aiAssistErrorMessage(code, 'summary'));
            expect(error.message).not.toMatch(/photo|analyse/i);
        }
    });

    it('feature_disabled annonce une fonction pas encore ouverte', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(503, { error: 'feature_disabled' })) as unknown as typeof fetch;
        const error = await callAiText('summary', payload).catch(e => e);
        expect(error.message).toMatch(/pas encore ouverte/);
        expect(mocks.warn).toHaveBeenCalled();
        expect(mocks.error).not.toHaveBeenCalled();
    });

    it('garde les utilisations restantes renvoyées avec une erreur', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(502, { error: 'invalid_output', remaining: 8 })) as unknown as typeof fetch;
        await expect(callAiText('summary', payload)).rejects.toMatchObject({ code: 'invalid_output', remaining: 8 });
    });

    it('une réponse sans résultat est inexploitable', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(200, { remaining: 3 })) as unknown as typeof fetch;
        await expect(callAiText('summary', payload)).rejects.toMatchObject({ code: 'invalid_output' });
    });

    it('annule la requête si la session change', async () => {
        let capturedSignal: AbortSignal | undefined;
        globalThis.fetch = vi.fn((_url: string, options: RequestInit) => {
            capturedSignal = options.signal ?? undefined;
            return new Promise((_resolve, reject) => {
                options.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
            });
        }) as unknown as typeof fetch;
        const promise = callAiText('summary', payload);
        await vi.waitFor(() => expect(capturedSignal).toBeDefined());
        setSessionIdentity('user-2');
        await expect(promise).rejects.toMatchObject({ code: 'stale_session' });
        expect(capturedSignal?.aborted).toBe(true);
    });

    it('ne journalise ni la charge utile ni la réponse', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(500, { error: 'internal_error', detail: 'Mésange secrète' })) as unknown as typeof fetch;
        await callAiText('summary', { month: '2026-10', topSpecies: [{ name: 'Mésange secrète', count: 1 }] }).catch(() => undefined);
        const logged = JSON.stringify([...mocks.warn.mock.calls, ...mocks.error.mock.calls]);
        expect(logged).not.toMatch(/Mésange/);
    });
});

describe('parseSummaryResult', () => {
    it('garde un texte non vide et borné, tel quel', () => {
        expect(parseSummaryResult({ text: '  <b>Bilan</b>  ' })).toEqual({ text: '<b>Bilan</b>' });
        expect(parseSummaryResult({ text: '' })).toBeNull();
        expect(parseSummaryResult({ text: 'x'.repeat(1201) })).toBeNull();
        expect(parseSummaryResult({ text: 42 })).toBeNull();
        expect(parseSummaryResult(null)).toBeNull();
    });
});
