import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithTimeout, fetchWithRetry } from '../utils/fetchUtils';

describe('fetchWithTimeout', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('resolves when fetch completes before timeout', async () => {
        const mockResponse = new Response('ok');
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

        const result = await fetchWithTimeout('https://example.test/ok', 5000);

        expect(result).toBe(mockResponse);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('aborts the request when the timeout fires', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
            return new Promise((_resolve, reject) => {
                (init?.signal as AbortSignal | undefined)?.addEventListener('abort', () => {
                    reject(new DOMException('aborted', 'AbortError'));
                });
            });
        });

        const promise = fetchWithTimeout('https://example.test/slow', 100);
        vi.advanceTimersByTime(200);

        await expect(promise).rejects.toThrow('aborted');
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
});

describe('fetchWithRetry', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('ne retry pas sur une réponse 2xx — retourne immédiatement', async () => {
        const response = new Response('ok', { status: 200 });
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);

        const result = await fetchWithRetry('https://example.test/ok', {}, { retries: 2, backoffMs: 10 });

        expect(result.status).toBe(200);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('ne retry pas sur 4xx — retourne la réponse immédiatement', async () => {
        const response = new Response('not found', { status: 404 });
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);

        const result = await fetchWithRetry('https://example.test/404', {}, { retries: 2, backoffMs: 10 });

        expect(result.status).toBe(404);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('retry sur 5xx puis réussit — retourne la réponse 2xx finale', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(new Response('srv err', { status: 503 }))
            .mockResolvedValueOnce(new Response('ok', { status: 200 }));

        const result = await fetchWithRetry('https://example.test/flaky', {}, { retries: 2, backoffMs: 1 });

        expect(result.status).toBe(200);
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('retry sur erreur réseau (fetch throw) puis réussit', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch')
            .mockRejectedValueOnce(new TypeError('fetch failed'))
            .mockResolvedValueOnce(new Response('ok', { status: 200 }));

        const result = await fetchWithRetry('https://example.test/flaky', {}, { retries: 2, backoffMs: 1 });

        expect(result.status).toBe(200);
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('retourne la dernière réponse 5xx si tous les retries échouent', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response('down', { status: 503 })
        );

        const result = await fetchWithRetry('https://example.test/down', {}, { retries: 2, backoffMs: 1 });

        expect(result.status).toBe(503);
        // 1 tentative initiale + 2 retries = 3 appels
        expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it('propage l erreur si toutes les tentatives lancent une exception', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));

        await expect(
            fetchWithRetry('https://example.test/down', {}, { retries: 1, backoffMs: 1 })
        ).rejects.toThrow('fetch failed');

        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('propage l AbortError immédiatement quand le caller annule, sans retry', async () => {
        const controller = new AbortController();
        controller.abort();

        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(
            new DOMException('aborted', 'AbortError')
        );

        await expect(
            fetchWithRetry('https://example.test/cancelled', {}, {
                retries: 2,
                backoffMs: 1,
                signal: controller.signal
            })
        ).rejects.toThrow('aborted');

        // Pas de retry quand la caller abort est déjà en place
        expect(fetchSpy).toHaveBeenCalledTimes(0);
    });
});
