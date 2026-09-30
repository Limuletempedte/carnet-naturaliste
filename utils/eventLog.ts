import { captureSessionContext, readAccountValue, writeAccountValue, subscribeSessionChange, type SessionContext } from '../services/sessionScope';

export type EventLogLevel = 'info' | 'warn' | 'error';
export interface EventLogEntry { ts: number; level: EventLogLevel; msg: string }
export const EVENT_LOG_MAX = 50;
export const EVENT_LOG_STORAGE_KEY = 'event-log-v2';
let buffer: EventLogEntry[] = [];
let generation: string | null = null;

/** Catégories définies par le code, jamais de valeurs ou erreurs brutes. */
export const safeLogMessage = (level: EventLogLevel, args: unknown[]): string => {
    const first = typeof args[0] === 'string' ? args[0] : '';
    const category = ['storageService', 'backupService', 'ErrorBoundary', 'Auth', 'excel-import']
        .find(name => first.startsWith(`[${name}]`));
    return `${category ?? 'APP'}_${level.toUpperCase()}`;
};
subscribeSessionChange(() => { buffer = []; generation = null; });

const initialize = (): SessionContext | null => {
    try {
        const ctx = captureSessionContext();
        if (generation !== ctx.sessionGeneration) {
            generation = ctx.sessionGeneration;
            buffer = [];
            const raw: unknown = JSON.parse(readAccountValue(EVENT_LOG_STORAGE_KEY, ctx) || '[]');
            if (Array.isArray(raw)) buffer = raw.filter((e): e is EventLogEntry =>
                e && typeof e.ts === 'number' && ['info', 'warn', 'error'].includes(e.level)
                && typeof e.msg === 'string' && /^(APP|storageService|backupService|ErrorBoundary|Auth|excel-import)_(INFO|WARN|ERROR)$/.test(e.msg)
            ).slice(-EVENT_LOG_MAX);
        }
        return ctx;
    } catch { buffer = []; generation = null; return null; }
};
export const pushEvent = (level: EventLogLevel, args: unknown[]): void => {
    const ctx = initialize();
    if (!ctx) return;
    buffer.push({ ts: Date.now(), level, msg: safeLogMessage(level, args) });
    buffer = buffer.slice(-EVENT_LOG_MAX);
    try { writeAccountValue(EVENT_LOG_STORAGE_KEY, JSON.stringify(buffer), ctx); } catch { /* diagnostic best effort */ }
};
export const getEventLog = (): EventLogEntry[] => { initialize(); return buffer.slice(); };
export const clearEventLog = (): void => {
    const ctx = initialize(); buffer = [];
    if (ctx) { try { writeAccountValue(EVENT_LOG_STORAGE_KEY, '[]', ctx); } catch { /* best effort */ } }
};
export const __resetEventLogForTests = (): void => { buffer = []; generation = null; };
