import { assertSessionContext, type SessionContext } from './sessionScope';

const PREFIX = 'pending-media:';
const openDb = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
    const request = indexedDB.open('cn-pending-media-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('pending', { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
});
const keyFor = (reference: string, context: SessionContext) => {
    assertSessionContext(context);
    if (!reference.startsWith(`${PREFIX}${context.userId}:`)) throw new Error('Accès au média en attente refusé.');
    return reference;
};
export const isPendingMedia = (reference: string): boolean => reference.startsWith(PREFIX);
export const savePendingMedia = async (blob: Blob, context: SessionContext): Promise<string> => {
    assertSessionContext(context);
    const db = await openDb(); assertSessionContext(context);
    const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif',
        'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'webm', 'audio/mp4': 'mp4', 'audio/x-m4a': 'm4a' } as Record<string, string>)[blob.type];
    if (!extension) { db.close(); throw new Error('Format de média non pris en charge.'); }
    const key = `${PREFIX}${context.userId}:${crypto.randomUUID()}.${extension}`;
    try {
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('pending', 'readwrite');
            tx.objectStore('pending').put({ key, owner: context.userId, blob });
            tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error);
        });
        assertSessionContext(context); return key;
    } finally { db.close(); }
};
export const readPendingMedia = async (reference: string, context: SessionContext): Promise<Blob> => {
    const key = keyFor(reference, context), db = await openDb(); assertSessionContext(context);
    try {
        const entry = await new Promise<{ owner: string; blob: Blob } | undefined>((resolve, reject) => {
            const request = db.transaction('pending').objectStore('pending').get(key);
            request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
        });
        assertSessionContext(context);
        if (!entry || entry.owner !== context.userId) throw new Error('Fichier en attente indisponible.');
        return entry.blob;
    } finally { db.close(); }
};
/** Seulement après abandon explicite de la file, jamais par éviction du cache téléchargé. */
export const clearPendingMedia = async (owner: string): Promise<void> => {
    const db = await openDb();
    try {
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('pending', 'readwrite'), store = tx.objectStore('pending'), request = store.openCursor();
            request.onsuccess = () => { const cursor = request.result; if (cursor) { if (cursor.value.owner === owner) cursor.delete(); cursor.continue(); } };
            tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
        });
    } finally { db.close(); }
};
