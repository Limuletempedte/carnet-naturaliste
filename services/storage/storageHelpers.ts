import type { SupabaseLikeError } from './storageTypes';
import { privateMediaPath } from '../mediaReference';

/**
 * Helpers purs du stockage — aucune dépendance à l'état mutable du module
 * `storageService` (namespace, file d'attente). Extraits pour alléger le cœur.
 */

const ONLINE_AUTH_ERROR = 'User not authenticated';

/** Extrait le chemin relatif (scopé user) d'une URL publique Supabase Storage. */
export const extractStoragePath = (publicUrl: string | null, userId: string): string | null => {
    try { return publicUrl ? privateMediaPath(publicUrl, userId) : null; } catch { return null; }
};

/** Convertit une data URL (`data:...;base64,...`) en Blob. */
export const dataUrlToBlob = (dataUrl: string): Blob => {
    const [header, base64] = dataUrl.split(',');
    const mime = header.match(/:(.*?);/)?.[1] || 'application/octet-stream';
    const bytes = atob(base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mime });
};

/** Course une promesse contre un délai maximal (rejette si dépassé). */
export const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${label} : délai dépassé (${ms / 1000}s)`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
};

/** Forme une clé localStorage scopée par utilisateur. */
export const scopedKey = (keyPrefix: string, userId: string): string => `${keyPrefix}:${userId}`;

/** Valide le userId pour une mutation en ligne (tolère le mode hors-ligne). */
export const assertOnlineUserId = (userId?: string): string => {
    if (!navigator.onLine) {
        return userId || 'offline-user';
    }
    if (!userId) {
        throw new Error(ONLINE_AUTH_ERROR);
    }
    return userId;
};

/** Normalise une erreur inconnue en forme d'erreur Supabase exploitable. */
export const asSupabaseError = (error: unknown): SupabaseLikeError => {
    if (error && typeof error === 'object') return error as SupabaseLikeError;
    return {};
};

/** Parse du JSON de façon robuste, avec valeur de repli + callback de corruption. */
export const parseJson = <T,>(raw: string | null, fallback: T, onCorrupt?: (err: unknown) => void): T => {
    if (!raw) return fallback;
    try {
        return JSON.parse(raw) as T;
    } catch (err) {
        onCorrupt?.(err);
        return fallback;
    }
};
