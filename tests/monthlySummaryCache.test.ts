import { beforeEach, describe, expect, it } from 'vitest';
import { captureSessionContext, setSessionIdentity } from '../services/sessionScope';
import {
    MONTHLY_SUMMARY_CACHE_MAX_MONTHS,
    purgeExpiredAiBrowserData,
    readMonthlySummaries,
    readMonthlySummary,
    saveMonthlySummary,
    type StoredMonthlySummary,
} from '../services/monthlySummaryCache';

const summary = (text: string): StoredMonthlySummary => ({ text, generatedAt: '2026-11-13T10:00:00Z', fingerprint: 'abc-1', provisional: false });

beforeEach(() => {
    localStorage.clear();
    setSessionIdentity('user-1');
});

describe('monthlySummaryCache', () => {
    it('garde un bilan par mois et par personne', () => {
        expect(saveMonthlySummary('2026-10', summary('Octobre.'), captureSessionContext())).toBe(true);
        expect(readMonthlySummary('2026-10')?.text).toBe('Octobre.');
        expect(localStorage.getItem('ai-monthly-summaries-v1:user-1')).not.toBeNull();
        setSessionIdentity('user-2');
        expect(readMonthlySummary('2026-10')).toBeNull();
    });

    it('ne garde que les 24 mois les plus récents', () => {
        const context = captureSessionContext();
        for (let i = 0; i < 30; i += 1) {
            const date = new Date(2024, i, 1);
            const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            saveMonthlySummary(month, summary(`Bilan ${month}`), context);
        }
        const months = Object.keys(readMonthlySummaries()).sort();
        expect(months).toHaveLength(MONTHLY_SUMMARY_CACHE_MAX_MONTHS);
        expect(months[0]).toBe('2024-07');
        expect(months.at(-1)).toBe('2026-06');
    });

    it('ignore un contenu illisible ou malformé', () => {
        localStorage.setItem('ai-monthly-summaries-v1:user-1', '{pas du json');
        expect(readMonthlySummaries()).toEqual({});
        localStorage.setItem('ai-monthly-summaries-v1:user-1', JSON.stringify({ version: 1, entries: { '2026-10': { text: 42 }, 'pas-un-mois': summary('x') } }));
        expect(readMonthlySummaries()).toEqual({});
    });

    it('refuse un mois invalide ou un texte vide', () => {
        const context = captureSessionContext();
        expect(saveMonthlySummary('2026-13', summary('x'), context)).toBe(false);
        expect(saveMonthlySummary('2026-10', summary(''), context)).toBe(false);
    });

    it('n’affiche plus un bilan rédigé il y a plus de 24 mois, et le retire à l’écriture suivante', () => {
        const context = captureSessionContext();
        const old = { ...summary('Octobre 2026.'), generatedAt: '2026-11-13T10:00:00Z' };
        const writtenAt = new Date('2026-11-14T00:00:00Z');
        expect(saveMonthlySummary('2026-10', old, context, writtenAt)).toBe(true);
        // 24 mois plus tard, à quelques jours près : encore là.
        expect(readMonthlySummary('2026-10', undefined, new Date('2028-11-10T00:00:00Z'))).not.toBeNull();
        // 25 mois plus tard : expiré, jamais relu.
        const later = new Date('2028-12-14T00:00:00Z');
        expect(readMonthlySummary('2026-10', undefined, later)).toBeNull();
        saveMonthlySummary('2028-11', { ...summary('Novembre 2028.'), generatedAt: later.toISOString() }, context, later);
        const raw = JSON.parse(localStorage.getItem('ai-monthly-summaries-v1:user-1') ?? '{}');
        expect(Object.keys(raw.entries)).toEqual(['2028-11']);
    });

    it('au démarrage, purge les bilans expirés de tous les comptes du navigateur', () => {
        const now = new Date('2029-01-15T00:00:00Z');
        const entry = (generatedAt: string) => ({ text: 'x', generatedAt, fingerprint: 'f', provisional: false });
        // Compte supprimé depuis un autre appareil : jamais relu, mais purgé.
        localStorage.setItem('ai-monthly-summaries-v1:compte-supprime', JSON.stringify({ version: 1, entries: { '2026-10': entry('2026-11-13T10:00:00Z') } }));
        localStorage.setItem('ai-monthly-summaries-v1:user-1', JSON.stringify({ version: 1, entries: {
            '2026-10': entry('2026-11-13T10:00:00Z'),
            '2028-12': entry('2029-01-02T10:00:00Z'),
        } }));
        localStorage.setItem('ai-status-v1:compte-supprime', JSON.stringify({ remaining: 3, monthlyQuota: 20, at: '2026-11-13T10:00:00Z' }));
        localStorage.setItem('ai-status-v1:user-1', JSON.stringify({ remaining: 3, monthlyQuota: 20, at: '2029-01-10T10:00:00Z' }));
        localStorage.setItem('autre-cle', 'intacte');

        purgeExpiredAiBrowserData(now);

        expect(localStorage.getItem('ai-monthly-summaries-v1:compte-supprime')).toBeNull();
        expect(Object.keys(JSON.parse(localStorage.getItem('ai-monthly-summaries-v1:user-1') ?? '{}').entries)).toEqual(['2028-12']);
        expect(localStorage.getItem('ai-status-v1:compte-supprime')).toBeNull();
        expect(localStorage.getItem('ai-status-v1:user-1')).not.toBeNull();
        expect(localStorage.getItem('autre-cle')).toBe('intacte');
    });
});
