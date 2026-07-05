import { useCallback, useId, useRef } from 'react';

// EE-4 : réfraction « Liquid Glass » (iOS 26) — la lumière est déviée sur les
// bords de l'élément comme à travers du verre bombé, et le rim porte un reflet
// spéculaire calculé (l'éclat « goutte brillante »). Implémentation : deux
// cartes générées en canvas — une « displacement map » (rouge = déplacement X,
// vert = Y, 128 = neutre, loi de Snell) pour feDisplacementMap, et une carte
// de hauteur (alpha = profil bombé) pour feSpecularLighting — branchées dans
// un filtre SVG appliqué via backdrop-filter. Chromium uniquement
// (Chrome/Edge/Android) : ailleurs, le style inline n'est jamais posé et la
// classe CSS .liquid-glass (flou + saturation + liseré) reste le rendu final
// — rien de cassé.

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
    /** Éclaircissement du fond derrière le verre (aspect « lumineux » iOS 26). */
    brightness?: number;
    /** Reflet spéculaire calculé sur le rim (l'éclat « goutte brillante »). */
    specular?: boolean;
    /** Intensité du reflet spéculaire (specularConstant, ~0.5 à 1.5). */
    specularStrength?: number;
    /** Finesse du reflet (specularExponent — plus haut = éclat plus étroit). */
    specularShininess?: number;
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

interface GlassMaps {
    /** Displacement map (rouge = déplacement X, vert = Y, 128 = neutre). */
    displacementUrl: string;
    /** Carte de hauteur : l'alpha encode le profil bombé du verre (pour feSpecularLighting). */
    heightUrl: string;
}

/** Génère les deux cartes du rectangle arrondi (SDF « rounded box ») :
    displacement map (chaque pixel de la zone de bord est déplacé vers
    l'extérieur, d'autant plus fort qu'il est près du bord) et carte de hauteur
    (alpha = hauteur du verre, pour l'éclairage spéculaire du rim).
    Renvoie null si le canvas est indisponible (jsdom). */
const buildGlassMaps = (
    width: number,
    height: number,
    radius: number,
    bezelWidth: number
): GlassMaps | null => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const image = ctx.createImageData(width, height);
    const data = image.data;
    const heightImage = ctx.createImageData(width, height);
    const heightData = heightImage.data;
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
            let surface = 0;
            if (distFromEdge >= 0) {
                if (distFromEdge < bezelWidth) {
                    const lutIndex = Math.min(255, Math.round((distFromEdge / bezelWidth) * 255));
                    const magnitude = lut[lutIndex];
                    dx = dirX * magnitude;
                    dy = dirY * magnitude;
                    surface = surfaceHeight(distFromEdge / bezelWidth);
                } else {
                    surface = 1; // sommet plat du verre : aucune pente → aucun reflet
                }
            }
            data[offset] = Math.round(128 + dx * 127);
            data[offset + 1] = Math.round(128 + dy * 127);
            data[offset + 2] = 128;
            data[offset + 3] = 255;
            // Carte de hauteur : seul l'alpha compte pour feSpecularLighting.
            heightData[offset] = 0;
            heightData[offset + 1] = 0;
            heightData[offset + 2] = 0;
            heightData[offset + 3] = Math.round(surface * 255);
        }
    }

    ctx.putImageData(image, 0, 0);
    const displacementUrl = canvas.toDataURL('image/png');
    ctx.putImageData(heightImage, 0, 0);
    const heightUrl = canvas.toDataURL('image/png');
    return { displacementUrl, heightUrl };
};

/** Applique la réfraction Liquid Glass à un élément. Renvoie une callback ref
    à poser sur l'élément (les éléments du chrome sont montés conditionnellement,
    une callback ref suit leurs montages/démontages sans effet supplémentaire). */
export function useLiquidGlassRefraction<T extends HTMLElement>(
    options: LiquidGlassRefractionOptions = {}
): (node: T | null) => void {
    const {
        scale = 56,
        bezelWidth = 20,
        blur = 3,
        saturate = 1.8,
        brightness = 1.08,
        specular = true,
        specularStrength = 0.9,
        specularShininess = 60,
        enabled = true
    } = options;
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
        feDisplacement.setAttribute('result', 'refracted');
        filter.appendChild(feImage);
        filter.appendChild(feDisplacement);

        // Étage spéculaire : la carte de hauteur (alpha = profil bombé du verre)
        // est éclairée par deux lumières directionnelles — la principale en
        // haut-gauche (l'éclat de la goutte), un retour plus doux en bas-droite
        // (la lumière qui « ressort » du verre, visible sur les bulles iOS 26).
        let feHeightImage: SVGFEImageElement | null = null;
        if (specular) {
            feHeightImage = document.createElementNS(SVG_NS, 'feImage') as SVGFEImageElement;
            feHeightImage.setAttribute('x', '0');
            feHeightImage.setAttribute('y', '0');
            feHeightImage.setAttribute('result', 'height');
            filter.appendChild(feHeightImage);

            const makeLight = (result: string, azimuth: number, elevation: number, strength: number, exponent: number) => {
                const lighting = document.createElementNS(SVG_NS, 'feSpecularLighting');
                lighting.setAttribute('in', 'height');
                lighting.setAttribute('surfaceScale', String(Math.max(4, bezelWidth * 0.6)));
                lighting.setAttribute('specularConstant', String(strength));
                lighting.setAttribute('specularExponent', String(exponent));
                lighting.setAttribute('lighting-color', '#ffffff');
                lighting.setAttribute('result', result);
                const light = document.createElementNS(SVG_NS, 'feDistantLight');
                light.setAttribute('azimuth', String(azimuth));
                light.setAttribute('elevation', String(elevation));
                lighting.appendChild(light);
                filter.appendChild(lighting);
            };
            makeLight('specKey', 235, 55, specularStrength, specularShininess);
            makeLight('specFill', 55, 60, specularStrength * 0.5, specularShininess * 0.8);

            const feAdd = document.createElementNS(SVG_NS, 'feComposite');
            feAdd.setAttribute('in', 'specKey');
            feAdd.setAttribute('in2', 'specFill');
            feAdd.setAttribute('operator', 'arithmetic');
            feAdd.setAttribute('k1', '0');
            feAdd.setAttribute('k2', '1');
            feAdd.setAttribute('k3', '1');
            feAdd.setAttribute('k4', '0');
            feAdd.setAttribute('result', 'spec');
            filter.appendChild(feAdd);

            // Masque à la forme du verre (l'alpha de la carte de hauteur) pour
            // que l'éclat ne déborde pas des coins arrondis.
            const feMask = document.createElementNS(SVG_NS, 'feComposite');
            feMask.setAttribute('in', 'spec');
            feMask.setAttribute('in2', 'height');
            feMask.setAttribute('operator', 'in');
            feMask.setAttribute('result', 'specMasked');
            filter.appendChild(feMask);

            const feOver = document.createElementNS(SVG_NS, 'feComposite');
            feOver.setAttribute('in', 'specMasked');
            feOver.setAttribute('in2', 'refracted');
            feOver.setAttribute('operator', 'over');
            filter.appendChild(feOver);
        }

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
            const maps = buildGlassMaps(
                Math.max(2, Math.round(width * factor)),
                Math.max(2, Math.round(height * factor)),
                radiusPx * factor,
                Math.max(1, bezelWidth * factor)
            );
            if (!maps) return; // canvas indisponible → on laisse le repli CSS

            filter.setAttribute('width', String(width));
            filter.setAttribute('height', String(height));
            feImage.setAttribute('href', maps.displacementUrl);
            feImage.setAttribute('width', String(width));
            feImage.setAttribute('height', String(height));
            if (feHeightImage) {
                feHeightImage.setAttribute('href', maps.heightUrl);
                feHeightImage.setAttribute('width', String(width));
                feHeightImage.setAttribute('height', String(height));
            }
            node.style.backdropFilter = `url(#${filterId}) blur(${blur}px) saturate(${saturate}) brightness(${brightness})`;
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
    }, [enabled, scale, bezelWidth, blur, saturate, brightness, specular, specularStrength, specularShininess, filterId]);
}
