/** Frontière commune des opérations privées, y compris entre onglets. */
export interface SessionContext {
    readonly userId: string;
    readonly sessionGeneration: string;
    readonly signal: AbortSignal;
}

type Identity = { userId: string | null; sessionGeneration: string };
export const SESSION_IDENTITY_KEY = 'cn-session-identity-v1';
let identity: Identity = { userId: null, sessionGeneration: 'initial' };
let controller = new AbortController();
const listeners = new Set<() => void>();

export class StaleSessionError extends Error {
    constructor() { super('Opération annulée : le compte actif a changé.'); this.name = 'StaleSessionError'; }
}

const readIdentity = (): Identity | null => {
    try {
        const value = JSON.parse(localStorage.getItem(SESSION_IDENTITY_KEY) || 'null');
        return value && (typeof value.userId === 'string' || value.userId === null)
            && typeof value.sessionGeneration === 'string' ? value : null;
    } catch { return null; }
};

const adopt = (next: Identity) => {
    if (next.userId === identity.userId && next.sessionGeneration === identity.sessionGeneration) return;
    controller.abort();
    controller = new AbortController();
    identity = next;
    for (const listener of listeners) listener();
};

export const setSessionIdentity = (userId: string | null): void => {
    const normalized = userId?.trim() || null;
    const shared = readIdentity();
    if (shared?.userId === normalized) { adopt(shared); return; }
    const next = { userId: normalized, sessionGeneration: crypto.randomUUID() };
    // L'écriture partagée précède toute publication de la nouvelle identité.
    try { localStorage.setItem(SESSION_IDENTITY_KEY, JSON.stringify(next)); } catch { /* pas de stockage disponible */ }
    adopt(next);
};

export const subscribeSessionChange = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};

export const getSessionGeneration = (): string => identity.sessionGeneration;
export const getSessionUserId = (): string | null => identity.userId;

export const captureSessionContext = (): SessionContext => {
    const shared = readIdentity();
    if (shared && (shared.userId !== identity.userId || shared.sessionGeneration !== identity.sessionGeneration)) {
        controller.abort();
        throw new StaleSessionError();
    }
    if (!identity.userId) throw new StaleSessionError();
    return Object.freeze({ userId: identity.userId, sessionGeneration: identity.sessionGeneration, signal: controller.signal });
};

export const isSessionCurrent = (context: SessionContext): boolean => {
    const shared = readIdentity();
    return !context.signal.aborted && context.userId === identity.userId
        && context.sessionGeneration === identity.sessionGeneration
        && (!shared || (shared.userId === context.userId && shared.sessionGeneration === context.sessionGeneration));
};

export const assertSessionContext = (context: SessionContext): void => {
    if (!isSessionCurrent(context)) throw new StaleSessionError();
};

export const inSession = async <T>(context: SessionContext, operation: () => PromiseLike<T>): Promise<T> => {
    assertSessionContext(context);
    const query = operation();
    const abortable = query as PromiseLike<T> & { abortSignal?: (signal: AbortSignal) => PromiseLike<T> };
    const request = abortable.abortSignal ? abortable.abortSignal(context.signal) : query;
    let onAbort: () => void = () => {};
    try {
        const value = await Promise.race([
            Promise.resolve(request),
            new Promise<never>((_, reject) => {
                onAbort = () => reject(new StaleSessionError());
                context.signal.addEventListener('abort', onAbort, { once: true });
                if (context.signal.aborted) onAbort();
            }),
        ]);
        assertSessionContext(context);
        return value;
    } finally { context.signal.removeEventListener('abort', onAbort); }
};

export const bindSessionCoordination = (onInvalidated: (next: Readonly<Identity>) => void): (() => void) => {
    const handleStorage = (event: StorageEvent) => {
        if (event.key !== SESSION_IDENTITY_KEY) return;
        const next = readIdentity();
        if (!next || (next.userId === identity.userId && next.sessionGeneration === identity.sessionGeneration)) return;
        adopt({ userId: null, sessionGeneration: next.sessionGeneration });
        // Le SDK Auth doit confirmer l'identité; un simple message ne connecte personne.
        onInvalidated(next);
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
};

export const removeUnownedLegacyState = (): void => {
    // Une file peut être l'unique copie de saisies : la préserver sans l'exposer
    // ni l'attribuer au premier utilisateur connecté. Récupération manuelle uniquement.
    try {
        const queue = localStorage.getItem('offline_sync_queue');
        if (queue !== null) {
            const key = 'cn-unowned-offline-queue-v1';
            if (localStorage.getItem(key) === null) localStorage.setItem(key, queue);
            if (localStorage.getItem(key) === queue) localStorage.removeItem('offline_sync_queue');
        }
    } catch { /* conserver l'original si la copie échoue */ }
    for (const key of ['local_observations_cache', 'map_search_history', 'observation-filter-presets-v1', 'event-log-v1']) {
        try { localStorage.removeItem(key); } catch { /* pas de données accessibles */ }
    }
};

export const readAccountValue = (prefix: string, context?: SessionContext): string | null => {
    try { const ctx = context ?? captureSessionContext(); assertSessionContext(ctx); return localStorage.getItem(`${prefix}:${ctx.userId}`); }
    catch { return null; }
};

export const writeAccountValue = (prefix: string, value: string, context: SessionContext): void => {
    assertSessionContext(context);
    localStorage.setItem(`${prefix}:${context.userId}`, value);
};
