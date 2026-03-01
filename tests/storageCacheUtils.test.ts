import { describe, expect, it } from 'vitest';
import { sanitizeCachedMediaValue } from '../services/storageCacheUtils';

describe('sanitizeCachedMediaValue', () => {
    it('keeps remote URLs', () => {
        expect(sanitizeCachedMediaValue('https://example.com/photo.jpg')).toBe('https://example.com/photo.jpg');
    });

    it('drops blob URLs', () => {
        expect(sanitizeCachedMediaValue('blob:http://localhost/test')).toBeUndefined();
    });

    it('drops very large data URLs', () => {
        const hugeDataUrl = `data:image/png;base64,${'a'.repeat(260_000)}`;
        expect(sanitizeCachedMediaValue(hugeDataUrl)).toBeUndefined();
    });
});
