import { beforeEach, describe, expect, it } from 'vitest';
import { captureSessionContext, setSessionIdentity } from '../services/sessionScope';
import {
    MONTHLY_SUMMARY_CACHE_MAX_MONTHS,
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
});
