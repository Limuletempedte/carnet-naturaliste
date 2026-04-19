import { describe, expect, it } from 'vitest';
import { Status } from '../types';
import { isSensitiveSpecies, obfuscateCoordinate } from '../utils/gpsPrivacy';

describe('isSensitiveSpecies', () => {
    it('returns true for VU, EN, CR, EW', () => {
        expect(isSensitiveSpecies(Status.VU)).toBe(true);
        expect(isSensitiveSpecies(Status.EN)).toBe(true);
        expect(isSensitiveSpecies(Status.CR)).toBe(true);
        expect(isSensitiveSpecies(Status.EW)).toBe(true);
    });

    it('returns false for NE, DD, LC, NT, EX', () => {
        expect(isSensitiveSpecies(Status.NE)).toBe(false);
        expect(isSensitiveSpecies(Status.DD)).toBe(false);
        expect(isSensitiveSpecies(Status.LC)).toBe(false);
        expect(isSensitiveSpecies(Status.NT)).toBe(false);
        expect(isSensitiveSpecies(Status.EX)).toBe(false);
    });
});

describe('obfuscateCoordinate', () => {
    it('rounds to 1 decimal place', () => {
        expect(obfuscateCoordinate(43.61234)).toBe(43.6);
        expect(obfuscateCoordinate(3.87654)).toBe(3.9);
        expect(obfuscateCoordinate(-1.45678)).toBe(-1.5);
    });

    it('returns null for null/undefined', () => {
        expect(obfuscateCoordinate(null)).toBeNull();
        expect(obfuscateCoordinate(undefined)).toBeNull();
    });

    it('handles zero', () => {
        expect(obfuscateCoordinate(0)).toBe(0);
    });
});
