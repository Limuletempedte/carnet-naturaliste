import { describe, expect, it } from 'vitest';
import {
    ATLAS_CODE_GROUPS,
    ATLAS_CODE_VALUES,
    formatAtlasCode,
    isKnownAtlasCode,
} from '../utils/atlasCodes';

describe('atlasCodes', () => {
    it('expose les 16 codes EBCC répartis en 3 niveaux', () => {
        expect(ATLAS_CODE_GROUPS).toHaveLength(3);
        expect(ATLAS_CODE_GROUPS.map(group => group.level)).toEqual([
            'Nidification possible',
            'Nidification probable',
            'Nidification certaine',
        ]);
        expect(ATLAS_CODE_VALUES.size).toBe(16);
    });

    it('couvre exactement les codes "1" à "16", sans doublon', () => {
        const codes = ATLAS_CODE_GROUPS.flatMap(group => group.options.map(option => option.code));
        const expected = Array.from({ length: 16 }, (_, index) => String(index + 1));
        expect([...codes].sort((a, b) => Number(a) - Number(b))).toEqual(expected);
        expect(new Set(codes).size).toBe(codes.length);
    });

    it('a un libellé non vide pour chaque code', () => {
        for (const group of ATLAS_CODE_GROUPS) {
            for (const option of group.options) {
                expect(option.label.trim().length).toBeGreaterThan(0);
            }
        }
    });

    it('isKnownAtlasCode distingue les codes valides des valeurs héritées', () => {
        expect(isKnownAtlasCode('15')).toBe(true);
        expect(isKnownAtlasCode('1')).toBe(true);
        expect(isKnownAtlasCode('16')).toBe(true);
        // Valeurs hors liste (anciens systèmes / texte libre) → non reconnues.
        expect(isKnownAtlasCode('19')).toBe(false);
        expect(isKnownAtlasCode('0')).toBe(false);
        expect(isKnownAtlasCode('B2')).toBe(false);
        expect(isKnownAtlasCode('')).toBe(false);
    });

    it('formatAtlasCode renvoie « code — libellé » pour un code connu', () => {
        expect(formatAtlasCode('15')).toBe('15 — Nid avec œufs');
    });

    it('formatAtlasCode renvoie la valeur brute pour un code inconnu et "" pour vide', () => {
        expect(formatAtlasCode('19')).toBe('19');
        expect(formatAtlasCode('')).toBe('');
    });
});
