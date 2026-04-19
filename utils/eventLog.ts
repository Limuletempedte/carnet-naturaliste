/**
 * SR-17 : buffer tournant d'évènements applicatifs (warn / error).
 *
 * - Taille maxi : `EVENT_LOG_MAX` (50 par défaut).
 * - Persisté dans localStorage sous la clé `event-log-v1` (best effort, non bloquant).
 * - Exposé via `getEventLog()` pour le Sync Center (SR-17) et le backup ZIP (SR-16b).
 *
 * Attention : ce module ne doit PAS dépendre de `logger.ts` ni de `safeStorage.ts`
 * (qui logguent eux-mêmes via `logger`) pour éviter toute boucle infinie
 * lorsque `logger.warn/error` alimente le buffer.
 */

export type EventLogLevel = 'info' | 'warn' | 'error';

export interface EventLogEntry {
    ts: number; // epoch millis
    level: EventLogLevel;
    msg: string;
}

export const EVENT_LOG_MAX = 50;
export const EVENT_LOG_STORAGE_KEY = 'event-log-v1';

let buffer: EventLogEntry[] = [];
let initialized = false;
let writing = false;

const rawGetItem = (key: string): string | null => {
    try {
        if (typeof localStorage === 'undefined') return null;
        return localStorage.getItem(key);
    } catch { return null; }
};

const rawSetItem = (key: string, value: string): void => {
    try {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(key, value);
    } catch { /* best effort */ }
};

const ensureInitialized = (): void => {
    if (initialized) return;
    initialized = true;
    const raw = rawGetItem(EVENT_LOG_STORAGE_KEY);
    if (!raw) return;
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            buffer = parsed
                .filter((e): e is EventLogEntry =>
                    typeof e === 'object' && e !== null
                    && typeof (e as EventLogEntry).ts === 'number'
                    && typeof (e as EventLogEntry).msg === 'string'
                    && ['info', 'warn', 'error'].includes((e as EventLogEntry).level))
                .slice(-EVENT_LOG_MAX);
        }
    } catch { /* corrupted: ignore */ }
};

const persist = (): void => {
    if (writing) return; // défense en profondeur
    writing = true;
    try {
        rawSetItem(EVENT_LOG_STORAGE_KEY, JSON.stringify(buffer));
    } finally {
        writing = false;
    }
};

const stringifyArg = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (value instanceof Error) return value.message || value.name;
    try { return JSON.stringify(value); }
    catch { return String(value); }
};

export const pushEvent = (level: EventLogLevel, args: unknown[]): void => {
    ensureInitialized();
    const msg = args.map(stringifyArg).join(' ').slice(0, 500);
    buffer.push({ ts: Date.now(), level, msg });
    if (buffer.length > EVENT_LOG_MAX) buffer = buffer.slice(-EVENT_LOG_MAX);
    persist();
};

export const getEventLog = (): EventLogEntry[] => {
    ensureInitialized();
    return buffer.slice();
};

export const clearEventLog = (): void => {
    buffer = [];
    initialized = true;
    persist();
};

/**
 * Réinitialise l'état interne (destiné uniquement aux tests).
 */
export const __resetEventLogForTests = (): void => {
    buffer = [];
    initialized = false;
    writing = false;
};
