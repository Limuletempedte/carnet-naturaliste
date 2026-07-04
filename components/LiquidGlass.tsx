import { useCallback, useId, useRef } from 'react';

// EE-4 : réfraction « Liquid Glass » (iOS 26) — la lumière est déviée sur les
// bords de l'élément comme à travers du verre bombé. Implémentation : une
// « displacement map » (rouge = déplacement X, vert = Y, 128 = neutre) générée
// en canvas selon la loi de Snell, branchée dans un filtre SVG feDisplacementMap
// appliqué via backdrop-filter. Chromium uniquement (Chrome/Edge/Android) :
// ailleurs, le style inline n'est jamais posé et la classe CSS .liquid-glass
// (flou + saturation + liseré) reste le rendu final — rien de cassé.

// navigator.userAgentData n'est pas encore dans lib.dom (TS 5.7) — déclaration minimale.
interface NavigatorUABrand {
    brand: string;
    version: string;
}

interface NavigatorUAData {
    brands?: NavigatorUABrand[];
}

declare global {
    interface Navigator {
        userAgentData?: NavigatorUAData;
    }
}

export interface LiquidGlassRefractionOptions {
    /** Force du déplacement max en px (attribut scale de feDisplacementMap). */
    scale?: number;
    /** Largeur en px de la zone de bord qui réfracte. */
    bezelWidth?: number;
    /** Flou appliqué derrière le verre, en px (en plus de la réfraction). */
    blur?: number;
    /** Saturation du fond derrière le verre. */
    saturate?: number;
    /** Permet de désactiver l'effet (ex. selon un état). */
    enabled?: boolean;
}

/** Vrai si le navigateur sait appliquer un filtre SVG en backdrop-filter
    (Chromium) et que l'utilisateur n'a pas demandé une transparence réduite. */
export const supportsLiquidGlassRefraction = (): boolean => {
    if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
    const brands = navigator.userAgentData?.brands;
    const isChromium = Array.isArray(brands) && brands.some(b => b.brand.toLowerCase().includes('chromium'));
    if (!isChromium) return false;
    if (typeof window.matchMedia !== 'function') return false;
    return !window.matchMedia('(prefers-reduced-transparency: reduce)').matches;
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const REFRACTIVE_INDEX = 1.5; // verre courant
const MAX_MAP_SIDE = 512; // au-delà, la map est générée réduite puis étirée (lisse → invisible)

/** Profil de surface « convex squircle » (celui d'Apple) : hauteur du verre en
    fonction de la distance normalisée au bord (0 = bord, 1 = intérieur). */
const surfaceHeight = (x: number): number => {
    const t = Math.min(1, Math.max(0, x));
    return Math.pow(1 - Math.pow(1 - t, 4), 0.25);
};

/** Table des magnitudes de déviation (loi de Snell) sur la zone de bord,
    normalisée pour valoir ~1 au bord et 0 à l'intérieur. */
const buildMagnitudeLut = (size: number): Float32Array => {
    const lut = new Float32Array(size);
    const delta = 1e-3;
    let max = 0;
    for (let i = 0; i < size; i++) {
        const x = i / (size - 1);
        const slope = (surfaceHeight(x + delta) - surfaceHeight(x - delta)) / (2 * delta);
        const incident = Math.atan(slope); // angle rayon vertical ↔ normale de surface
        const transmitted = Math.asin(Math.sin(incident) / REFRACTIVE_INDEX);
        const deviation = Math.tan(incident - transmitted);
        lut[i] = deviation;
        if (deviation > max) max = deviation;
    }
    if (max > 0) {
        for (let i = 0; i < size; i++) lut[i] /= max;
    }
    return lut;
};

/** Génère la displacement map du rectangle arrondi (SDF « rounded box ») :
    chaque pixel de la zone de bord est déplacé vers l'extérieur, d'autant plus
    fort qu'il est près du bord. Renvoie null si le canvas est indisponible (jsdom). */
const buildDisplacementMapUrl = (
    width: number,
    height: number,
    radius: number,
    bezelWidth: number
): string | null => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const image = ctx.createImageData(width, height);
    const data = image.data;
    const lut = buildMagnitudeLut(256);
    const halfW = width / 2;
    const halfH = height / 2;
    const r = Math.min(radius, halfW, halfH);

    for (let py = 0; py < height; py++) {
        for (let px = 0; px < width; px++) {
            const cx = px + 0.5 - halfW;
            const cy = py + 0.5 - halfH;
            // SDF d'un rectangle arrondi centré : qx/qy > 0 = zone du coin.
            const qx = Math.abs(cx) - (halfW - r);
            const qy = Math.abs(cy) - (halfH - r);
            let distOutside: number;
            let dirX = 0;
            let dirY = 0;
            if (qx > 0 && qy > 0) {
                const len = Math.hypot(qx, qy);
                distOutside = len - r;
                dirX = (Math.sign(cx) * qx) / len;
                dirY = (Math.sign(cy) * qy) / len;
            } else if (qx > qy) {
                distOutside = qx - r;
                dirX = Math.sign(cx);
            } else {
                distOutside = qy - r;
                dirY = Math.sign(cy);
            }
            const distFromEdge = -distOutside; // positif à l'intérieur
            const offset = (py * width + px) * 4;
            let dx = 0;
            let dy = 0;
            if (distFromEdge >= 0 && distFromEdge < bezelWidth) {
                const lutIndex = Math.min(255, Math.round((distFromEdge / bezelWidth) * 255));
                const magnitude = lut[lutIndex];
                dx = dirX * magnitude;
                dy = dirY * magnitude;
            }
            data[offset] = Math.round(128 + dx * 127);
            data[offset + 1] = Math.round(128 + dy * 127);
            data[offset + 2] = 128;
            data[offset + 3] = 255;
        }
    }

    ctx.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png');
};

/** Applique la réfraction Liquid Glass à un élément. Renvoie une callback ref
    à poser sur l'élément (les éléments du chrome sont montés conditionnellement,
    une callback ref suit leurs montages/démontages sans effet supplémentaire). */
export function useLiquidGlassRefraction<T extends HTMLElement>(
    options: LiquidGlassRefractionOptions = {}
): (node: T | null) => void {
    const { scale = 32, bezelWidth = 14, blur = 3, saturate = 1.8, enabled = true } = options;
    // useId peut contenir « : » ou « « » » selon la version de React → assainir pour url(#…).
    const rawId = useId();
    const filterId = `lg-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const cleanupRef = useRef<(() => void) | null>(null);

    return useCallback((node: T | null) => {
        cleanupRef.current?.();
        cleanupRef.current = null;
        if (!node || !enabled || !supportsLiquidGlassRefraction()) return;

        let rafId: number | null = null;
        let lastWidth = 0;
        let lastHeight = 0;

        // Un <svg> hôte par instance (jamais display:none, sinon le filtre n'est pas résolu).
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('width', '0');
        svg.setAttribute('height', '0');
        svg.setAttribute('aria-hidden', 'true');
        svg.style.position = 'absolute';
        const filter = document.createElementNS(SVG_NS, 'filter');
        filter.setAttribute('id', filterId);
        filter.setAttribute('filterUnits', 'userSpaceOnUse');
        filter.setAttribute('color-interpolation-filters', 'sRGB');
        filter.setAttribute('x', '0');
        filter.setAttribute('y', '0');
        const feImage = document.createElementNS(SVG_NS, 'feImage');
        feImage.setAttribute('x', '0');
        feImage.setAttribute('y', '0');
        feImage.setAttribute('result', 'map');
        const feDisplacement = document.createElementNS(SVG_NS, 'feDisplacementMap');
        feDisplacement.setAttribute('in', 'SourceGraphic');
        feDisplacement.setAttribute('in2', 'map');
        feDisplacement.setAttribute('scale', String(scale));
        feDisplacement.setAttribute('xChannelSelector', 'R');
        feDisplacement.setAttribute('yChannelSelector', 'G');
        filter.appendChild(feImage);
        filter.appendChild(feDisplacement);
        svg.appendChild(filter);
        document.body.appendChild(svg);

        const render = () => {
            rafId = null;
            const rect = node.getBoundingClientRect();
            const width = Math.round(rect.width);
            const height = Math.round(rect.height);
            if (width < 2 || height < 2) return;
            if (width === lastWidth && height === lastHeight) return;
            lastWidth = width;
            lastHeight = height;

            // Coins : suit le border-radius calculé (les pilules rounded-full → min(w,h)/2).
            const radiusPx = parseFloat(getComputedStyle(node).borderTopLeftRadius) || 0;
            // Cap : au-delà de MAX_MAP_SIDE, la map est générée réduite puis étirée par feImage.
            const factor = Math.min(1, MAX_MAP_SIDE / Math.max(width, height));
            const mapUrl = buildDisplacementMapUrl(
                Math.max(2, Math.round(width * factor)),
                Math.max(2, Math.round(height * factor)),
                radiusPx * factor,
                Math.max(1, bezelWidth * factor)
            );
            if (!mapUrl) return; // canvas indisponible → on laisse le repli CSS

            filter.setAttribute('width', String(width));
            filter.setAttribute('height', String(height));
            feImage.setAttribute('href', mapUrl);
            feImage.setAttribute('width', String(width));
            feImage.setAttribute('height', String(height));
            node.style.backdropFilter = `url(#${filterId}) blur(${blur}px) saturate(${saturate})`;
        };

        const scheduleRender = () => {
            if (rafId !== null) return;
            rafId = requestAnimationFrame(render);
        };

        scheduleRender();

        let resizeObserver: ResizeObserver | null = null;
        if (typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(scheduleRender);
            resizeObserver.observe(node);
        }

        cleanupRef.current = () => {
            if (rafId !== null) cancelAnimationFrame(rafId);
            resizeObserver?.disconnect();
            svg.remove();
            node.style.backdropFilter = '';
        };
    }, [enabled, scale, bezelWidth, blur, saturate, filterId]);
}
