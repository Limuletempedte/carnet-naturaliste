import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithTimeout } from '../utils/fetchUtils';

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
