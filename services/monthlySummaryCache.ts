// Bilans du mois conservés dans le navigateur, par personne (clé
// `ai-monthly-summaries-v1:<userId>`), pour ne pas repayer une rédaction.
// Jamais envoyés au serveur. Lisibles hors ligne.
//
// Durée : un bilan est gardé **24 mois au plus** après sa rédaction (texte du
// consentement `summary` 2026-11-v1, registre, politique de confidentialité).
// Un bilan plus ancien n'est jamais relu, il est retiré à chaque écriture, et
// `purgeExpiredAiBrowserData` le retire au démarrage pour TOUS les comptes du
// navigateur (y compris un compte supprimé depuis un autre appareil). Au plus
// 24 mois différents sont gardés. Effacés aussi avec le compte, sur l'appareil
// où il est supprimé (services/accountService.ts).

import { AI_STATUS_CACHE_PREFIX, AI_SUMMARY_MAX_CHARS } from './aiAssistService';
import { readAccountValue, writeAccountValue, type SessionContext } from './sessionScope';

export const MONTHLY_SUMMARY_CACHE_PREFIX = 'ai-monthly-summaries-v1';
export const MONTHLY_SUMMARY_CACHE_MAX_MONTHS = 24;
/** Durée de conservation d'un bilan après sa rédaction, en mois. */
export const MONTHLY_SUMMARY_RETENTION_MONTHS = 24;

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
    return typeof v.text === 'string' && v.text.length > 0 && v.text.length <= AI_SUMMARY_MAX_CHARS
        && typeof v.generatedAt === 'string'
        && typeof v.fingerprint === 'string'
        && typeof v.provisional === 'boolean';
};

/** Date limite : un bilan rédigé avant elle est expiré. */
export const retentionCutoff = (now: Date): Date => {
    const cutoff = new Date(now.getTime());
    cutoff.setMonth(cutoff.getMonth() - MONTHLY_SUMMARY_RETENTION_MONTHS);
    return cutoff;
};

const isExpired = (summary: StoredMonthlySummary, now: Date): boolean => {
    const generated = new Date(summary.generatedAt);
    // Date illisible : traitée comme expirée (on ne garde pas sans durée).
    return Number.isNaN(generated.getTime()) || generated < retentionCutoff(now);
};

/** Lit un contenu brut : entrées valides et non expirées seulement. */
const parseContent = (raw: string | null, now: Date): CacheContent => {
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw) as { version?: unknown; entries?: unknown };
        if (parsed.version !== 1 || typeof parsed.entries !== 'object' || parsed.entries === null) return {};
        const result: CacheContent = {};
        for (const [month, entry] of Object.entries(parsed.entries as Record<string, unknown>)) {
            if (MONTH_RE.test(month) && isStoredSummary(entry) && !isExpired(entry, now)) result[month] = entry;
        }
        return result;
    } catch {
        return {};
    }
};

/** Lit tous les bilans de la personne, sans les expirés. Contenu illisible : ignoré. */
export const readMonthlySummaries = (context?: SessionContext, now: Date = new Date()): CacheContent =>
    parseContent(readAccountValue(MONTHLY_SUMMARY_CACHE_PREFIX, context), now);

export const readMonthlySummary = (month: string, context?: SessionContext, now: Date = new Date()): StoredMonthlySummary | null =>
    readMonthlySummaries(context, now)[month] ?? null;

/** Ne garde que les `max` mois les plus récents. */
export const pruneMonthlySummaries = (entries: CacheContent, max = MONTHLY_SUMMARY_CACHE_MAX_MONTHS): CacheContent => {
    const months = Object.keys(entries).sort().reverse().slice(0, max);
    return Object.fromEntries(months.map(month => [month, entries[month]]));
};

/**
 * Enregistre un bilan (les expirés sont retirés au passage). Renvoie false si
 * le navigateur refuse (stockage plein ou interdit) : le texte reste affiché,
 * il ne sera simplement pas conservé.
 */
export const saveMonthlySummary = (month: string, summary: StoredMonthlySummary, context: SessionContext, now: Date = new Date()): boolean => {
    if (!MONTH_RE.test(month) || !isStoredSummary(summary) || isExpired(summary, now)) return false;
    const entries = pruneMonthlySummaries({ ...readMonthlySummaries(context, now), [month]: summary });
    try {
        writeAccountValue(MONTHLY_SUMMARY_CACHE_PREFIX, JSON.stringify({ version: 1, entries }), context);
        return true;
    } catch {
        return false;
    }
};

const isCurrentUtcMonth = (iso: unknown, now: Date): boolean => {
    if (typeof iso !== 'string') return false;
    const at = new Date(iso);
    return !Number.isNaN(at.getTime()) && at.getUTCFullYear() === now.getUTCFullYear() && at.getUTCMonth() === now.getUTCMonth();
};

/**
 * Au démarrage, pour TOUS les comptes connus de ce navigateur : retire les
 * bilans expirés (clé supprimée si plus rien), et le dernier compteur connu
 * d'un mois passé (il ne sert plus : le compteur est remis à zéro chaque mois).
 * Ne lève jamais d'erreur.
 */
export const purgeExpiredAiBrowserData = (now: Date = new Date()): void => {
    let keys: string[] = [];
    try {
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (key) keys.push(key);
        }
    } catch {
        return;
    }
    keys = keys.filter(key => key.startsWith(`${MONTHLY_SUMMARY_CACHE_PREFIX}:`) || key.startsWith(`${AI_STATUS_CACHE_PREFIX}:`));
    for (const key of keys) {
        try {
            const raw = localStorage.getItem(key);
            if (key.startsWith(`${AI_STATUS_CACHE_PREFIX}:`)) {
                let at: unknown = null;
                try { at = (JSON.parse(raw ?? '') as { at?: unknown }).at; } catch { at = null; }
                if (!isCurrentUtcMonth(at, now)) localStorage.removeItem(key);
                continue;
            }
            const entries = pruneMonthlySummaries(parseContent(raw, now));
            if (Object.keys(entries).length === 0) localStorage.removeItem(key);
            else {
                const next = JSON.stringify({ version: 1, entries });
                if (next !== raw) localStorage.setItem(key, next);
            }
        } catch {
            // Clé illisible ou stockage refusé : on passe à la suivante.
        }
    }
};
