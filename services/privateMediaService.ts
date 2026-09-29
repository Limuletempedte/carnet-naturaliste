import { supabase } from '../supabaseClient';
import { privateMediaPath } from './mediaReference';
import { assertSessionContext, captureSessionContext, getSessionUserId, inSession, isSessionCurrent, subscribeSessionChange, type SessionContext } from './sessionScope';

export const MEDIA_CACHE_LIMIT = 50;
export const MEDIA_CACHE_BYTES = 100 * 1024 * 1024;
export const MEDIA_MAX_BYTES = 20 * 1024 * 1024;
export const MEDIA_CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
const DB_NAME = 'cn-private-media-v1';
type Entry = { key: string; owner: string; blob: Blob; size: number; created: number; accessed: number };
type Lease = { url: string; release: () => void };
const urls = new Set<string>();
const pending = new Map<string, { blob: Blob; context: SessionContext }>();
let dbPromise: Promise<IDBDatabase> | undefined;
let cacheBarrier: Promise<void> = Promise.resolve();
let lastOwner = getSessionUserId();

const openDb = (): Promise<IDBDatabase> => {
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore('media', { keyPath: 'key' });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    return dbPromise;
};

/** Une transaction sérialise purge, lecture et éviction, y compris entre onglets. */
const transaction = async <T>(change: (entries: Entry[], store: IDBObjectStore) => T): Promise<T> => {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('media', 'readwrite');
        const store = tx.objectStore('media');
        const request = store.getAll();
        let result: T;
        let failure: unknown;
        request.onsuccess = () => {
            try { result = change(request.result as Entry[], store); }
            catch (error) { failure = error; tx.abort(); }
        };
        tx.oncomplete = () => resolve(result);
        tx.onerror = tx.onabort = () => reject(failure ?? tx.error ?? new Error('Cache média indisponible.'));
    });
};

const revokeAll = () => { for (const url of urls) URL.revokeObjectURL(url); urls.clear(); pending.clear(); };
export const purgePrivateMedia = (departedOwner: string | null = null): Promise<void> => {
    revokeAll();
    cacheBarrier = cacheBarrier.catch(() => {}).then(async () => {
        if (typeof caches !== 'undefined') await caches.delete('supabase-storage-cache');
        await transaction((entries, store) => {
        const owner = getSessionUserId();
        for (const entry of entries) if (!owner || entry.owner !== owner || entry.owner === departedOwner || Date.now() - entry.created >= MEDIA_CACHE_TTL) store.delete(entry.key);
        });
    }).catch(() => { /* Stockage indisponible : les lectures privées restent contrôlées par le contexte. */ });
    return cacheBarrier;
};
subscribeSessionChange(() => {
    const departedOwner = lastOwner;
    lastOwner = getSessionUserId();
    void purgePrivateMedia(departedOwner);
});

const validateBlob = (blob: Blob): Blob => {
    if (blob.size > MEDIA_MAX_BYTES || blob.size === 0 || !/^(image\/(jpeg|png|webp|gif|avif)|audio\/(mpeg|ogg|wav|webm|mp4|x-m4a))$/i.test(blob.type.split(';')[0])) {
        throw new Error('Format ou taille de média non autorisé.');
    }
    return blob;
};

/** Les aperçus des nouveaux fichiers restent distincts du cache téléchargé. */
export const registerPendingMedia = (blob: Blob, context = captureSessionContext()): Lease => {
    assertSessionContext(context); validateBlob(blob);
    const url = URL.createObjectURL(blob); urls.add(url); pending.set(url, { blob, context });
    return { url, release: () => releasePendingMedia(url) };
};

export const releasePendingMedia = (url: string): void => { pending.delete(url); urls.delete(url); URL.revokeObjectURL(url); };

export const downloadPrivateMedia = async (reference: string, context = captureSessionContext()): Promise<Blob> => {
    assertSessionContext(context);
    if (reference.startsWith('blob:')) {
        const entry = pending.get(reference);
        if (!entry || entry.context.userId !== context.userId || !isSessionCurrent(entry.context)) throw new Error('Aperçu expiré.');
        return entry.blob;
    }
    if (reference.startsWith('data:')) {
        if (reference.length > Math.ceil(MEDIA_MAX_BYTES * 4 / 3) + 128) throw new Error('Média trop volumineux.');
        const match = /^data:([^;,]+);base64,([a-zA-Z0-9+/]*={0,2})$/.exec(reference);
        if (!match) throw new Error('Média intégré invalide.');
        const binary = atob(match[2]);
        const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
        return validateBlob(new Blob([bytes], { type: match[1] }));
    }
    const objectPath = privateMediaPath(reference, context.userId);
    const key = `${context.userId}:${objectPath}`;
    await cacheBarrier;
    assertSessionContext(context);
    try {
        const cached = await transaction((entries, store) => {
            assertSessionContext(context);
            const entry = entries.find(item => item.key === key && item.owner === context.userId);
            if (!entry) return undefined;
            if (Date.now() - entry.created >= MEDIA_CACHE_TTL) { store.delete(key); return undefined; }
            store.put({ ...entry, accessed: Date.now() });
            return entry.blob;
        });
        assertSessionContext(context);
        if (cached) return validateBlob(cached);
    } catch { assertSessionContext(context); }
    if (!navigator.onLine) throw new Error('Ce média n’est pas disponible hors ligne.');
    const { data, error } = await inSession(context, () => supabase.storage.from('photos').download(objectPath, {}, { cache: 'no-store', signal: context.signal }));
    if (error || !data) throw new Error('Média privé indisponible.');
    const blob = validateBlob(data);
    try {
        await transaction((entries, store) => {
            assertSessionContext(context);
            const now = Date.now();
            const keep = entries.filter(entry => {
                const valid = entry.owner === context.userId && now - entry.created < MEDIA_CACHE_TTL && entry.key !== key;
                if (!valid) store.delete(entry.key);
                return valid;
            }).sort((a, b) => a.accessed - b.accessed);
            let bytes = keep.reduce((sum, entry) => sum + entry.size, 0);
            while (keep.length >= MEDIA_CACHE_LIMIT || bytes + blob.size > MEDIA_CACHE_BYTES) {
                const oldest = keep.shift(); if (!oldest) break;
                bytes -= oldest.size; store.delete(oldest.key);
            }
            store.put({ key, owner: context.userId, blob, size: blob.size, created: now, accessed: now } satisfies Entry);
        });
    } catch { assertSessionContext(context); }
    assertSessionContext(context);
    return blob;
};

export const acquirePrivateMedia = async (reference: string, context = captureSessionContext()): Promise<Lease> => {
    const blob = await downloadPrivateMedia(reference, context);
    assertSessionContext(context);
    const url = URL.createObjectURL(blob); urls.add(url);
    return { url, release: () => { urls.delete(url); URL.revokeObjectURL(url); } };
};
