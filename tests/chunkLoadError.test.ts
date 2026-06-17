import { describe, expect, it } from 'vitest';
import { CHUNK_LOAD_USER_MESSAGE, isChunkLoadError } from '../utils/chunkLoadError';

describe('isChunkLoadError', () => {
    it('détecte les messages d\'échec de chunk des trois moteurs', () => {
        expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://app/assets/vendor-exceljs-abc123.js'))).toBe(true);
        expect(isChunkLoadError(new TypeError('error loading dynamically imported module'))).toBe(true);
        expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    });

    it('ignore les autres erreurs et les valeurs non-Error', () => {
        expect(isChunkLoadError(new Error('Failed to fetch'))).toBe(false);
        expect(isChunkLoadError(new Error('boom'))).toBe(false);
        expect(isChunkLoadError('Failed to fetch dynamically imported module')).toBe(false);
        expect(isChunkLoadError(null)).toBe(false);
        expect(isChunkLoadError(undefined)).toBe(false);
    });

    it('expose un message utilisateur actionnable', () => {
        expect(CHUNK_LOAD_USER_MESSAGE).toContain('rechargez la page');
    });
});
