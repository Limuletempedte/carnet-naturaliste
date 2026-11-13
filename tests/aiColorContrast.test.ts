import { describe, expect, it } from 'vitest';
import tailwindConfig from '../tailwind.config.js';

// Jeton lavande `ai` (tailwind.config.js) : contraste WCAG AA (4,5:1) pour
// le texte des boutons, cartes et compteurs IA, en mode clair et sombre.

const ai = (tailwindConfig as { theme: { extend: { colors: Record<string, unknown> } } }).theme.extend.colors.ai as Record<string, string>;

const luminance = (hex: string): number => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string): number => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};

describe('jeton de couleur ai', () => {
    it.each([
        ['texte 700 sur blanc', ai[700], '#FFFFFF'],
        ['texte 700 sur fond 50 (bouton clair)', ai[700], ai[50]],
        ['texte 700 sur fond 100 (pastille claire)', ai[700], ai[100]],
        ['texte blanc sur 600 (bouton plein)', '#FFFFFF', ai[600]],
        ['texte 200 sur fond sombre', ai[200], '#1C1C1E'],
        ['texte 300 sur fond sombre', ai[300], '#1C1C1E'],
    ])('%s ≥ 4,5:1', (_label, fg, bg) => {
        expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
    });
});
