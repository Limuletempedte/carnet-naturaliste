// Bilans du mois conservés dans le navigateur, par personne (clé
// `ai-monthly-summaries-v1:<userId>`), pour ne pas repayer une rédaction.
// Jamais envoyés au serveur. 24 mois au plus ; purgés avec le compte
// (services/accountService.ts). Lisibles hors ligne.

import { readAccountValue, writeAccountValue, type SessionContext } from './sessionScope';

export const MONTHLY_SUMMARY_CACHE_PREFIX = 'ai-monthly-summaries-v1';
export const MONTHLY_SUMMARY_CACHE_MAX_MONTHS = 24;

export interface StoredMonthlySummary {
    text: string;
    /** Date ISO de la rédaction. */
    generatedAt: string;
    /** Empreinte des chiffres envoyés (`summaryFingerprint`). */
    fingerprint: string;
    /** Rédigé pendant le mois (chiffres provisoires). */
    provisional: boolean;
}

type CacheContent = Record<string, StoredMonthlySummary>;

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const isStoredSummary = (value: unknown): value is StoredMonthlySummary => {
    if (typeof value !== 'object' || value === null) return false;
    const v = value as Record<string, unknown>;
    return typeof v.text === 'string' && v.text.length > 0 && v.text.length <= 1200
        && typeof v.generatedAt === 'string'
        && typeof v.fingerprint === 'string'
        && typeof v.provisional === 'boolean';
};

/** Lit tous les bilans de la personne. Contenu illisible : ignoré. */
export const readMonthlySummaries = (context?: SessionContext): CacheContent => {
    const raw = readAccountValue(MONTHLY_SUMMARY_CACHE_PREFIX, context);
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw) as { version?: unknown; entries?: unknown };
        if (parsed.version !== 1 || typeof parsed.entries !== 'object' || parsed.entries === null) return {};
        const result: CacheContent = {};
        for (const [month, entry] of Object.entries(parsed.entries as Record<string, unknown>)) {
            if (MONTH_RE.test(month) && isStoredSummary(entry)) result[month] = entry;
        }
        return result;
    } catch {
        return {};
    }
};

export const readMonthlySummary = (month: string, context?: SessionContext): StoredMonthlySummary | null =>
    readMonthlySummaries(context)[month] ?? null;

/** Ne garde que les `max` mois les plus récents. */
export const pruneMonthlySummaries = (entries: CacheContent, max = MONTHLY_SUMMARY_CACHE_MAX_MONTHS): CacheContent => {
    const months = Object.keys(entries).sort().reverse().slice(0, max);
    return Object.fromEntries(months.map(month => [month, entries[month]]));
};

/**
 * Enregistre un bilan. Renvoie false si le navigateur refuse (stockage plein
 * ou interdit) : le texte reste affiché, il ne sera simplement pas conservé.
 */
export const saveMonthlySummary = (month: string, summary: StoredMonthlySummary, context: SessionContext): boolean => {
    if (!MONTH_RE.test(month) || !isStoredSummary(summary)) return false;
    const entries = pruneMonthlySummaries({ ...readMonthlySummaries(context), [month]: summary });
    try {
        writeAccountValue(MONTHLY_SUMMARY_CACHE_PREFIX, JSON.stringify({ version: 1, entries }), context);
        return true;
    } catch {
        return false;
    }
};
