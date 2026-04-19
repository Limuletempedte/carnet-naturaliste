import { describe, expect, it, vi, beforeEach } from 'vitest';

const { getSessionMock, signOutMock } = vi.hoisted(() => ({
    getSessionMock: vi.fn(),
    signOutMock: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({
    supabase: {
        auth: {
            getSession: getSessionMock,
            signOut: signOutMock,
        },
    },
}));

import { deleteAccount } from '../services/accountService';

beforeEach(() => {
    vi.restoreAllMocks();
    getSessionMock.mockReset();
    signOutMock.mockReset();
    globalThis.localStorage = {
        clear: vi.fn(),
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        length: 0,
        key: vi.fn(),
    } as unknown as Storage;
});

describe('deleteAccount', () => {
    it('throws when not authenticated', async () => {
        getSessionMock.mockResolvedValue({ data: { session: null } });
        await expect(deleteAccount()).rejects.toThrow('Non authentifié');
    });

    it('calls Edge Function with bearer token and clears localStorage on success', async () => {
        getSessionMock.mockResolvedValue({
            data: { session: { access_token: 'test-jwt-token' } },
        });
        signOutMock.mockResolvedValue({});

        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ success: true }),
        });
        globalThis.fetch = fetchMock;

        await deleteAccount();

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toContain('/functions/v1/delete-account');
        expect(options.headers.Authorization).toBe('Bearer test-jwt-token');
        expect(localStorage.clear).toHaveBeenCalled();
        expect(signOutMock).toHaveBeenCalled();
    });

    it('throws on Edge Function error', async () => {
        getSessionMock.mockResolvedValue({
            data: { session: { access_token: 'test-jwt-token' } },
        });

        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 500,
            json: () => Promise.resolve({ error: 'Storage cleanup failed' }),
        });

        await expect(deleteAccount()).rejects.toThrow('Storage cleanup failed');
    });
});
