import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { safeGet, safeSet, safeRemove, safeClearPrefix } from '../utils/safeStorage';

describe('safeStorage', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('safeGet returns null if localStorage throws', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('access denied');
        });
        expect(safeGet('any-key')).toBeNull();
    });

    it('safeSet dispatches storage-quota-exceeded event on QuotaExceededError', () => {
        const listener = vi.fn();
        window.addEventListener('storage-quota-exceeded', listener);

        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            const err = new Error('quota exceeded');
            err.name = 'QuotaExceededError';
            throw err;
        });

        expect(() => safeSet('k', 'v')).toThrow();
        expect(listener).toHaveBeenCalledTimes(1);

        window.removeEventListener('storage-quota-exceeded', listener);
    });

    it('safeRemove swallows errors', () => {
        vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
            throw new Error('nope');
        });
        expect(() => safeRemove('k')).not.toThrow();
    });

    it('safeClearPrefix removes only matching keys', () => {
        localStorage.setItem('app:user1:obs', '1');
        localStorage.setItem('app:user1:queue', '2');
        localStorage.setItem('app:user2:obs', '3');
        localStorage.setItem('unrelated', '4');

        safeClearPrefix('app:user1:');

        expect(localStorage.getItem('app:user1:obs')).toBeNull();
        expect(localStorage.getItem('app:user1:queue')).toBeNull();
        expect(localStorage.getItem('app:user2:obs')).toBe('3');
        expect(localStorage.getItem('unrelated')).toBe('4');
    });
});
