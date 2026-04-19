import { describe, expect, it } from 'vitest';
import { isSafeImageUrl } from '../utils/urlUtils';

describe('isSafeImageUrl (SE-04)', () => {
    it('accepts https URLs', () => {
        expect(isSafeImageUrl('https://example.com/photo.jpg')).toBe(true);
    });

    it('accepts http URLs', () => {
        expect(isSafeImageUrl('http://example.com/photo.jpg')).toBe(true);
    });

    it('accepts blob URLs', () => {
        expect(isSafeImageUrl('blob:http://localhost/abc-123')).toBe(true);
    });

    it('rejects javascript: URLs', () => {
        expect(isSafeImageUrl('javascript:alert(1)')).toBe(false);
    });

    it('rejects data: URLs', () => {
        expect(isSafeImageUrl('data:image/png;base64,abc')).toBe(false);
    });

    it('rejects empty string', () => {
        expect(isSafeImageUrl('')).toBe(false);
    });

    it('rejects malformed URLs that resolve to unsafe protocols', () => {
        expect(isSafeImageUrl('javascript:void(0)')).toBe(false);
    });
});
