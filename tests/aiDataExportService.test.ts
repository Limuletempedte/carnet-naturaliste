import { beforeEach, describe, expect, it, vi } from 'vitest';
import { captureSessionContext, setSessionIdentity, StaleSessionError } from '../services/sessionScope';

const mocks = vi.hoisted(() => ({
    from: vi.fn(),
    warn: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({ supabase: { from: mocks.from } }));
vi.mock('../utils/logger', () => ({ logger: { warn: mocks.warn, error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import {
    AI_EXPORT_SOURCES,
    buildAiExportFile,
    fetchAiDataForExport,
    type AiExportSource,
} from '../services/aiDataExportService';

type Calls = { table: string; columns?: string; eq?: [string, unknown]; order?: string };

/** Simule `from(table).select(cols).eq(col, val).order(col)` et note les appels. */
const mockTables = (results: Record<string, { data?: unknown; error?: unknown } | (() => never)>) => {
    const calls: Calls[] = [];
    mocks.from.mockImplementation((table: string) => {
        const call: Calls = { table };
        calls.push(call);
        const query = {
            select: (columns: string) => { call.columns = columns; return query; },
            eq: (column: string, value: unknown) => { call.eq = [column, value]; return query; },
            order: async (column: string) => {
                call.order = column;
                const result = results[table];
                if (typeof result === 'function') return result();
                return { data: result?.data ?? null, error: result?.error ?? null };
            },
        };
        return query;
    });
    return calls;
};

describe('aiDataExportService', () => {
    beforeEach(() => {
        localStorage.clear();
        setSessionIdentity('user-1');
        mocks.from.mockReset();
        mocks.warn.mockReset();
    });

    it("lit ai_access et ai_usage de l'utilisateur, colonnes explicites, ordre chronologique", async () => {
        const access = { status: 'approved', consent_version: '2026-11-v1', requested_at: '2026-11-05T10:00:00Z', decided_at: '2026-11-05T11:00:00Z', note: null, monthly_quota: 20 };
        const usage = { created_at: '2026-11-05T12:00:00Z', feature: 'identify', model: 'claude-x', input_tokens: 1200, output_tokens: 300, cost_usd: 0.0123, status: 'ok' };
        const calls = mockTables({ ai_access: { data: [access] }, ai_usage: { data: [usage] } });

        const result = await fetchAiDataForExport(captureSessionContext());

        expect(result.complete).toBe(true);
        expect(result.unavailable).toEqual([]);
        expect(result.sections.acces.rows).toEqual([access]);
        expect(result.sections.utilisations.rows).toEqual([usage]);
        expect(calls.map(c => c.table)).toEqual(['ai_access', 'ai_usage']);
        for (const call of calls) {
            expect(call.eq).toEqual(['user_id', 'user-1']);
            expect(call.columns).not.toContain('*');
            // L'identifiant interne n'a pas à figurer dans l'export.
            expect(call.columns?.split(',')).not.toContain('user_id');
        }
        expect(calls[0].columns).toBe('status,consent_version,requested_at,decided_at,note,monthly_quota');
        expect(calls[1].columns).toBe('created_at,feature,model,input_tokens,output_tokens,cost_usd,status');
        expect(calls[1].order).toBe('created_at');
    });

    it("renvoie des sections vides pour qui n'a jamais utilisé l'assistant", async () => {
        mockTables({ ai_access: { data: [] }, ai_usage: { data: [] } });
        const result = await fetchAiDataForExport(captureSessionContext());
        expect(result.complete).toBe(true);
        expect(Object.keys(result.sections)).toEqual(['acces', 'utilisations']);
        expect(result.sections.acces.rows).toEqual([]);
        expect(result.sections.utilisations.rows).toEqual([]);
    });

    it("signale une table illisible sans faire échouer l'export", async () => {
        mockTables({ ai_access: { data: [] }, ai_usage: { error: { message: 'Failed to fetch' } } });
        const result = await fetchAiDataForExport(captureSessionContext());
        expect(result.complete).toBe(false);
        expect(result.unavailable).toEqual(['ai_usage']);
        expect(result.sections.utilisations.rows).toEqual([]);
        expect(mocks.warn).toHaveBeenCalled();

        const file = buildAiExportFile(result, '2026-11-06T00:00:00.000Z');
        expect(file.complet).toBe(false);
        expect(file.avertissement).toContain('ai_usage');
    });

    it('propage un changement de compte en cours de lecture', async () => {
        mockTables({ ai_access: () => { throw new StaleSessionError(); } });
        await expect(fetchAiDataForExport(captureSessionContext())).rejects.toBeInstanceOf(StaleSessionError);
    });

    it("point d'extension : une source ajoutée apparaît dans l'export", async () => {
        const consents: AiExportSource = {
            key: 'consentements', table: 'ai_consents', columns: ['feature', 'consent_version', 'given_at'],
            orderBy: 'given_at', description: 'Consentements par fonctionnalité.',
        };
        const calls = mockTables({ ai_consents: { data: [{ feature: 'summary', consent_version: 'v1', given_at: '2026-12-01' }] } });
        const result = await fetchAiDataForExport(captureSessionContext(), [...AI_EXPORT_SOURCES, consents]);
        expect(calls.map(c => c.table)).toContain('ai_consents');
        expect(result.sections.consentements.rows).toHaveLength(1);
    });

    it('le fichier exporté porte un titre, une date et une section par source', () => {
        const file = buildAiExportFile(
            { complete: true, unavailable: [], sections: { acces: { table: 'ai_access', description: 'd', rows: [] } } },
            '2026-11-06T00:00:00.000Z',
        );
        expect(file).toMatchObject({ titre: expect.any(String), genereLe: '2026-11-06T00:00:00.000Z', complet: true });
        expect(file).not.toHaveProperty('avertissement');
        expect(file).toHaveProperty('acces');
    });
});
