import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); delete window.turnstile; });
afterEach(() => { document.querySelectorAll('script').forEach(s => s.remove()); delete window.turnstile; vi.useRealTimers(); });

describe('Chargeur Turnstile', () => {
    it('partage le chargement et conserve une seule instance disponible', async () => {
        const { loadTurnstile } = await import('../services/turnstileService');
        const first = loadTurnstile(); const second = loadTurnstile();
        expect(first).toBe(second); expect(document.querySelectorAll('script')).toHaveLength(1);
        const api = { render: vi.fn(), remove: vi.fn() }; window.turnstile = api;
        document.querySelector('script')!.dispatchEvent(new Event('load'));
        expect(await first).toBe(api); expect(await loadTurnstile()).toBe(api);
        expect(vi.getTimerCount()).toBe(0);
    });
    it.each(['error', 'timeout'] as const)('permet un nouveau chargement après %s, sans succès du script obsolète', async mode => {
        const { loadTurnstile } = await import('../services/turnstileService');
        const first = loadTurnstile(); const rejection = expect(first).rejects.toThrow('indisponible');
        const oldScript = document.querySelector('script')!;
        if (mode === 'error') oldScript.dispatchEvent(new Event('error'));
        else vi.advanceTimersByTime(15000);
        await rejection; expect(oldScript.isConnected).toBe(false);
        const second = loadTurnstile(); expect(second).not.toBe(first);
        oldScript.dispatchEvent(new Event('load'));
        const api = { render: vi.fn(), remove: vi.fn() }; window.turnstile = api;
        document.querySelector('script')!.dispatchEvent(new Event('load'));
        expect(await second).toBe(api);
    });
});
