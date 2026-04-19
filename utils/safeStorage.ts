import { logger } from './logger';

/**
 * Thin wrapper around localStorage that:
 *  - Never throws on read/remove failures (returns null / silently ignores).
 *  - Dispatches a `storage-quota-exceeded` CustomEvent when setItem fails due to quota.
 *  - Rethrows on setItem failure so callers can decide (e.g. persist to queue vs abort).
 *
 * Does not persist any data beyond what localStorage already does.
 */

const isQuotaError = (err: unknown): boolean => {
    if (!(err instanceof Error)) return false;
    const name = err.name;
    return (
        name === 'QuotaExceededError' ||
        name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        /quota/i.test(err.message)
    );
};

export const safeGet = (key: string): string | null => {
    try {
        return localStorage.getItem(key);
    } catch (err) {
        logger.warn(`safeGet(${key}) failed`, err);
        return null;
    }
};

export const safeSet = (key: string, value: string): void => {
    try {
        localStorage.setItem(key, value);
    } catch (err) {
        if (isQuotaError(err)) {
            window.dispatchEvent(new CustomEvent('storage-quota-exceeded'));
        } else {
            logger.warn(`safeSet(${key}) failed`, err);
        }
        throw err;
    }
};

export const safeRemove = (key: string): void => {
    try {
        localStorage.removeItem(key);
    } catch (err) {
        logger.warn(`safeRemove(${key}) failed`, err);
    }
};

/**
 * Remove every key whose name starts with `prefix`. Useful to clear per-user buckets.
 */
export const safeClearPrefix = (prefix: string): void => {
    try {
        const toRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) toRemove.push(key);
        }
        for (const key of toRemove) {
            try { localStorage.removeItem(key); } catch { /* ignore per-key failure */ }
        }
    } catch (err) {
        logger.warn(`safeClearPrefix(${prefix}) failed`, err);
    }
};
