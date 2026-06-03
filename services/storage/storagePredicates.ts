import { asSupabaseError } from './storageHelpers';

/**
 * Prédicats d'erreurs réseau/DB et notification associée. Fonctions pures
 * (sauf notifyRecoverableError qui dispatche un événement), extraites de
 * `storageService`.
 */

/**
 * SI-30: détecte une violation de clé primaire/unique côté Postgres.
 * Code 23505 = unique_violation. Arrive typiquement à l'import quand un UUID
 * exporté pointe vers une ligne qui existe encore en DB sous un autre user_id
 * (orphelin d'un ancien compte). RLS la cache à la vue SELECT, donc la collision
 * n'est détectable qu'au moment de l'INSERT — retry avec un nouvel UUID.
 */
export const isDuplicateKeyError = (error: unknown): boolean => {
    if (!error) return false;
    const err = asSupabaseError(error);
    if (String(err.code || '').trim() === '23505') return true;
    const msg = (err.message || '').toLowerCase();
    return msg.includes('duplicate key') && msg.includes('observations');
};

/**
 * SR-08: detect transient network / server errors that justify falling back
 * to the offline queue instead of throwing (e.g. timeout, 5xx, service unavailable).
 * Business errors (auth, permissions, missing columns, validation) should still throw.
 */
export const isRecoverableNetworkError = (error: unknown): boolean => {
    if (!error) return false;
    if (error instanceof DOMException && error.name === 'AbortError') return true;
    if (error instanceof TypeError) {
        const msg = error.message.toLowerCase();
        if (msg.includes('fetch') || msg.includes('network') || msg.includes('failed to fetch')) return true;
    }
    const err = asSupabaseError(error);
    const code = String(err.code || '').toUpperCase();
    // PostgREST / Supabase-specific transient codes
    if (code === 'PGRST301' || code === 'PGRST002' || code === '57P03') return true;
    const maybeStatus = (error as { status?: number }).status;
    if (typeof maybeStatus === 'number' && maybeStatus >= 500 && maybeStatus < 600) return true;
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('timeout') || msg.includes('délai dépassé') || msg.includes('service unavailable')) return true;
    if (msg.includes('network') || msg.includes('fetch failed') || msg.includes('connect')) return true;
    return false;
};

export const notifyRecoverableError = (action: 'sauvegarde' | 'mise à jour' | 'suppression') => {
    window.dispatchEvent(new CustomEvent('supabase-recoverable-error', { detail: { action } }));
};
