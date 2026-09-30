import { describe, it, expect, beforeEach, vi } from 'vitest';
import { extractStoragePath, parseJson, scopedKey, dataUrlToBlob } from '../services/storage/storageHelpers';
import { isDuplicateKeyError, isRecoverableNetworkError } from '../services/storage/storagePredicates';

describe('storageHelpers', () => {
    describe('extractStoragePath', () => {
        beforeEach(() => vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co'));
        it('retourne le chemin scopé user pour une URL publique valide', () => {
            const url = 'https://x.supabase.co/storage/v1/object/public/photos/user-1/photos/abc.jpg';
            expect(extractStoragePath(url, 'user-1')).toBe('user-1/photos/abc.jpg');
        });
        it('retourne null si le chemin n\'appartient pas au user', () => {
            const url = 'https://x.supabase.co/storage/v1/object/public/photos/other/photos/abc.jpg';
            expect(extractStoragePath(url, 'user-1')).toBeNull();
        });
        it('retourne null pour une URL non-storage ou nulle', () => {
            expect(extractStoragePath(null, 'user-1')).toBeNull();
            expect(extractStoragePath('https://example.com/x.jpg', 'user-1')).toBeNull();
        });
    });

    describe('parseJson', () => {
        it('parse un JSON valide', () => {
            expect(parseJson('[1,2,3]', [] as number[])).toEqual([1, 2, 3]);
        });
        it('retourne le fallback et notifie sur JSON corrompu', () => {
            let corrupted = false;
            expect(parseJson('{bad', { ok: true }, () => { corrupted = true; })).toEqual({ ok: true });
            expect(corrupted).toBe(true);
        });
        it('retourne le fallback pour une entrée vide', () => {
            expect(parseJson(null, 'fallback')).toBe('fallback');
        });
    });

    describe('scopedKey', () => {
        it('forme une clé préfixe:userId', () => {
            expect(scopedKey('offline_sync_queue', 'user-1')).toBe('offline_sync_queue:user-1');
        });
    });

    describe('dataUrlToBlob', () => {
        it('convertit une data URL en Blob avec le bon type MIME', () => {
            // "hi" en base64 = aGk=
            const blob = dataUrlToBlob('data:text/plain;base64,aGk=');
            expect(blob.type).toBe('text/plain');
            expect(blob.size).toBe(2);
        });
    });
});

describe('storagePredicates', () => {
    describe('isDuplicateKeyError', () => {
        it('détecte le code Postgres 23505', () => {
            expect(isDuplicateKeyError({ code: '23505' })).toBe(true);
        });
        it('détecte le message duplicate key sur observations', () => {
            expect(isDuplicateKeyError({ message: 'duplicate key value ... "observations_pkey"' })).toBe(true);
        });
        it('ignore les autres erreurs', () => {
            expect(isDuplicateKeyError({ code: '42501' })).toBe(false);
            expect(isDuplicateKeyError(null)).toBe(false);
        });
    });

    describe('isRecoverableNetworkError', () => {
        it('considère un TypeError réseau comme récupérable', () => {
            expect(isRecoverableNetworkError(new TypeError('Failed to fetch'))).toBe(true);
        });
        it('considère un 5xx comme récupérable', () => {
            expect(isRecoverableNetworkError({ status: 503 })).toBe(true);
        });
        it('ne considère pas une erreur métier (permission) comme récupérable', () => {
            expect(isRecoverableNetworkError({ code: '42501', message: 'permission denied' })).toBe(false);
            expect(isRecoverableNetworkError(null)).toBe(false);
        });
    });
});
