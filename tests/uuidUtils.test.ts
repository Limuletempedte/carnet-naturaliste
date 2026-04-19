import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateUUID, isUuid } from '../utils/uuidUtils';

describe('uuidUtils', () => {
    describe('isUuid', () => {
        it('reconnait un UUID v4 valide', () => {
            expect(isUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
        });

        it('rejette les chaines invalides', () => {
            expect(isUuid('not-a-uuid')).toBe(false);
            expect(isUuid('')).toBe(false);
            expect(isUuid(null)).toBe(false);
            expect(isUuid(undefined)).toBe(false);
            expect(isUuid(42)).toBe(false);
        });
    });

    describe('generateUUID', () => {
        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('retourne un UUID v4 valide (passe isUuid)', () => {
            const id = generateUUID();
            expect(isUuid(id)).toBe(true);
        });

        it('retourne 100 valeurs uniques sur 100 appels rapides', () => {
            const ids = new Set<string>();
            for (let i = 0; i < 100; i += 1) {
                ids.add(generateUUID());
            }
            expect(ids.size).toBe(100);
        });

        it('utilise crypto.randomUUID quand disponible (happy path)', () => {
            const spy = vi.spyOn(crypto, 'randomUUID');
            const id = generateUUID();
            expect(spy).toHaveBeenCalledTimes(1);
            expect(isUuid(id)).toBe(true);
        });

        it('tombe sur le fallback getRandomValues si randomUUID est indisponible', () => {
            // Simule un navigateur sans crypto.randomUUID (Safari < 15.2, contexte HTTP)
            const originalRandomUUID = crypto.randomUUID;
            const cryptoMutable = crypto as unknown as Record<string, unknown>;
            cryptoMutable.randomUUID = undefined;

            try {
                const id = generateUUID();
                expect(isUuid(id)).toBe(true);
            } finally {
                // Restaure pour ne pas casser les autres tests
                cryptoMutable.randomUUID = originalRandomUUID;
            }
        });

        it('tombe sur le fallback meme si randomUUID lance une exception', () => {
            vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
                throw new Error('SecurityError: not a secure context');
            });
            const id = generateUUID();
            expect(isUuid(id)).toBe(true);
        });
    });
});
