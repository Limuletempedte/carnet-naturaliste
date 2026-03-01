import { describe, expect, it } from 'vitest';
import { normalizeSearchText } from '../utils/textUtils';

describe('normalizeSearchText', () => {
    it('normalizes accents, case and extra spaces', () => {
        expect(normalizeSearchText('  Mésange   Charbonnière ')).toBe('mesange charbonniere');
    });

    it('keeps comparable values aligned across accents and punctuation spacing', () => {
        expect(normalizeSearchText('Île   de   France')).toBe('ile de france');
    });
});
