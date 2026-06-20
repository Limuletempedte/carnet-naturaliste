import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { getInstallHintState } from '../utils/installPromptState';

/**
 * Tests de non-régression du hook PWA (détection navigateur + événements natifs).
 * jsdom n'implémente ni `matchMedia` ni `navigator.standalone` → on les simule.
 */

const UA = {
    chromeAndroid: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
    instagram: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 Instagram 250.0.0.0 Android',
};

const savedDescriptors: Record<string, PropertyDescriptor | undefined> = {};

const defineNav = (prop: string, value: unknown): void => {
    if (!(prop in savedDescriptors)) {
        savedDescriptors[prop] = Object.getOwnPropertyDescriptor(window.navigator, prop);
    }
    Object.defineProperty(window.navigator, prop, { value, configurable: true });
};

const setUserAgent = (ua: string, maxTouchPoints = 0): void => {
    defineNav('userAgent', ua);
    defineNav('maxTouchPoints', maxTouchPoints);
};

const setIosStandalone = (value: boolean): void => defineNav('standalone', value);

const mockMatchMedia = (standaloneMatches: boolean): void => {
    vi.stubGlobal('matchMedia', (query: string) => ({
        matches: /display-mode: standalone/.test(query) ? standaloneMatches : false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(() => false),
    }));
};

interface BeforeInstallPromptEventMock extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const makeBeforeInstallEvent = (outcome: 'accepted' | 'dismissed'): BeforeInstallPromptEventMock => {
    const e = new Event('beforeinstallprompt') as BeforeInstallPromptEventMock;
    e.prompt = vi.fn().mockResolvedValue(undefined);
    e.userChoice = Promise.resolve({ outcome, platform: 'web' });
    return e;
};

beforeEach(() => {
    localStorage.clear();
    mockMatchMedia(false);
});

afterEach(() => {
    for (const [prop, desc] of Object.entries(savedDescriptors)) {
        if (desc) {
            Object.defineProperty(window.navigator, prop, desc);
        } else {
            delete (window.navigator as unknown as Record<string, unknown>)[prop];
        }
        delete savedDescriptors[prop];
    }
    vi.unstubAllGlobals();
    localStorage.clear();
});

describe('useInstallPrompt — classification du contexte', () => {
    it("renvoie 'ios' sur iPhone", () => {
        setUserAgent(UA.iphone);
        const { result } = renderHook(() => useInstallPrompt());
        expect(result.current.installMode).toBe('ios');
        expect(result.current.isIOS).toBe(true);
    });

    it("renvoie 'unsupported' sur Firefox", () => {
        setUserAgent(UA.firefox);
        const { result } = renderHook(() => useInstallPrompt());
        expect(result.current.installMode).toBe('unsupported');
    });

    it("renvoie 'unsupported' dans un navigateur intégré (Instagram)", () => {
        setUserAgent(UA.instagram);
        const { result } = renderHook(() => useInstallPrompt());
        expect(result.current.installMode).toBe('unsupported');
    });

    it("renvoie 'pending' sur Chromium (en attente du prompt)", () => {
        setUserAgent(UA.chromeAndroid);
        const { result } = renderHook(() => useInstallPrompt());
        expect(result.current.installMode).toBe('pending');
        expect(result.current.canInstall).toBe(false);
    });
});

describe('useInstallPrompt — détection « déjà installée » (standalone)', () => {
    it('détecte le mode standalone via matchMedia', () => {
        setUserAgent(UA.chromeAndroid);
        mockMatchMedia(true);
        const { result } = renderHook(() => useInstallPrompt());
        expect(result.current.isStandalone).toBe(true);
    });

    it('détecte le mode standalone via navigator.standalone (iOS)', () => {
        setUserAgent(UA.iphone);
        setIosStandalone(true);
        const { result } = renderHook(() => useInstallPrompt());
        expect(result.current.isStandalone).toBe(true);
    });
});

describe('useInstallPrompt — événements natifs', () => {
    it("passe en mode 'prompt' et empêche l'infobar sur beforeinstallprompt", () => {
        setUserAgent(UA.chromeAndroid);
        const { result } = renderHook(() => useInstallPrompt());

        const evt = makeBeforeInstallEvent('accepted');
        const preventSpy = vi.spyOn(evt, 'preventDefault');
        act(() => { window.dispatchEvent(evt); });

        expect(preventSpy).toHaveBeenCalledTimes(1);
        expect(result.current.canInstall).toBe(true);
        expect(result.current.installMode).toBe('prompt');
    });

    it("promptInstall() renvoie 'accepted' et marque l'app comme installée", async () => {
        setUserAgent(UA.chromeAndroid);
        const { result } = renderHook(() => useInstallPrompt());

        act(() => { window.dispatchEvent(makeBeforeInstallEvent('accepted')); });

        let outcome: string | undefined;
        await act(async () => { outcome = await result.current.promptInstall(); });

        expect(outcome).toBe('accepted');
        expect(getInstallHintState().installed).toBe(true);
        expect(result.current.canInstall).toBe(false);
    });

    it("promptInstall() renvoie 'dismissed' sans marquer comme installé", async () => {
        setUserAgent(UA.chromeAndroid);
        const { result } = renderHook(() => useInstallPrompt());

        act(() => { window.dispatchEvent(makeBeforeInstallEvent('dismissed')); });

        let outcome: string | undefined;
        await act(async () => { outcome = await result.current.promptInstall(); });

        expect(outcome).toBe('dismissed');
        expect(getInstallHintState().installed).toBe(false);
    });

    it("promptInstall() renvoie 'unavailable' sans prompt disponible", async () => {
        setUserAgent(UA.chromeAndroid);
        const { result } = renderHook(() => useInstallPrompt());

        let outcome: string | undefined;
        await act(async () => { outcome = await result.current.promptInstall(); });

        expect(outcome).toBe('unavailable');
    });

    it('passe en standalone sur appinstalled', () => {
        setUserAgent(UA.chromeAndroid);
        const { result } = renderHook(() => useInstallPrompt());

        act(() => { window.dispatchEvent(new Event('appinstalled')); });

        expect(result.current.isStandalone).toBe(true);
        expect(result.current.canInstall).toBe(false);
        expect(getInstallHintState().installed).toBe(true);
    });

    it("masque canInstall quand l'app est déjà installée", () => {
        setUserAgent(UA.chromeAndroid);
        mockMatchMedia(true);
        const { result } = renderHook(() => useInstallPrompt());

        act(() => { window.dispatchEvent(makeBeforeInstallEvent('accepted')); });

        // Le prompt est arrivé, mais l'app est déjà installée → on n'invite pas.
        expect(result.current.canInstall).toBe(false);
    });
});
