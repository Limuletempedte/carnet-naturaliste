import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { supportsLiquidGlassRefraction, useLiquidGlassRefraction } from '../components/LiquidGlass';

// Élément témoin : applique le hook sur un simple div.
const Probe: React.FC<{ enabled?: boolean }> = ({ enabled = true }) => {
    const glassRef = useLiquidGlassRefraction<HTMLDivElement>({ enabled });
    return <div data-testid="glass" ref={glassRef} />;
};

const setUserAgentData = (value: unknown) => {
    Object.defineProperty(navigator, 'userAgentData', { value, configurable: true });
};

const CHROMIUM_UA = { brands: [{ brand: 'Chromium', version: '126' }, { brand: 'Google Chrome', version: '126' }] };

const stubMatchMedia = (reducedTransparency: boolean) => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
        matches: reducedTransparency && query.includes('prefers-reduced-transparency'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
    })));
};

class ResizeObserverStub {
    observe() { /* noop */ }
    unobserve() { /* noop */ }
    disconnect() { /* noop */ }
}

const fakeContext = {
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: () => { /* noop */ }
} as unknown as CanvasRenderingContext2D;

describe('useLiquidGlassRefraction — réfraction Liquid Glass (EE-4)', () => {
    beforeEach(() => {
        // rAF synchrone pour des assertions immédiates.
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1; });
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
        vi.stubGlobal('ResizeObserver', ResizeObserverStub);
        stubMatchMedia(false);
        vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
            width: 200, height: 60, top: 0, left: 0, right: 200, bottom: 60, x: 0, y: 0, toJSON: () => ({})
        } as DOMRect);
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeContext);
        vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,TEST');
    });

    afterEach(() => {
        setUserAgentData(undefined);
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('ne fait rien sur un navigateur non Chromium (repli CSS)', () => {
        setUserAgentData(undefined);
        render(<Probe />);

        expect(supportsLiquidGlassRefraction()).toBe(false);
        expect(document.body.querySelector('svg filter')).toBeNull();
        expect(screen.getByTestId('glass').style.backdropFilter).toBeFalsy();
    });

    it('injecte le filtre SVG et applique le backdrop-filter sur Chromium', () => {
        setUserAgentData(CHROMIUM_UA);
        render(<Probe />);

        const filter = document.body.querySelector('svg filter');
        expect(filter).not.toBeNull();
        expect(filter?.querySelector('feDisplacementMap')).not.toBeNull();
        expect(filter?.querySelector('feImage')?.getAttribute('href')).toContain('data:image/png');

        const node = screen.getByTestId('glass');
        expect(node.style.backdropFilter).toContain('url(#');
        expect(node.style.backdropFilter).toContain('blur(');
        expect(node.style.backdropFilter).toContain('saturate(');
    });

    it('retire le filtre et le style au démontage', () => {
        setUserAgentData(CHROMIUM_UA);
        const { unmount } = render(<Probe />);
        expect(document.body.querySelector('svg filter')).not.toBeNull();

        unmount();
        expect(document.body.querySelector('svg filter')).toBeNull();
    });

    it('respecte prefers-reduced-transparency (effet désactivé)', () => {
        setUserAgentData(CHROMIUM_UA);
        stubMatchMedia(true);
        render(<Probe />);

        expect(supportsLiquidGlassRefraction()).toBe(false);
        expect(document.body.querySelector('svg filter')).toBeNull();
        expect(screen.getByTestId('glass').style.backdropFilter).toBeFalsy();
    });

    it('respecte l\'option enabled: false', () => {
        setUserAgentData(CHROMIUM_UA);
        render(<Probe enabled={false} />);

        expect(document.body.querySelector('svg filter')).toBeNull();
    });

    it('ne plante pas si le canvas est indisponible (getContext null)', () => {
        setUserAgentData(CHROMIUM_UA);
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
        render(<Probe />);

        // Pas de crash : le style inline n'est simplement pas posé, le repli CSS reste.
        expect(screen.getByTestId('glass').style.backdropFilter).toBeFalsy();
    });
});
