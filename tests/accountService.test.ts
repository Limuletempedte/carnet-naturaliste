import { setSessionIdentity } from '../services/sessionScope';
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
    setSessionIdentity('user-1');
});

describe('deleteAccount', () => {
    it('throws when not authenticated', async () => {
        getSessionMock.mockResolvedValue({ data: { session: null } });
        await expect(deleteAccount()).rejects.toThrow('Non authentifié');
    });

    it('calls Edge Function with bearer token and clears only the owner data on success', async () => {
        getSessionMock.mockResolvedValue({
            data: { session: { access_token: 'test-jwt-token', user: { id: 'user-1' } } },
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
        expect(localStorage.clear).not.toHaveBeenCalled();
        expect(localStorage.removeItem).toHaveBeenCalledWith('local_observations_cache:user-1');
        expect(signOutMock).toHaveBeenCalled();
    });

    it('throws on Edge Function error', async () => {
        getSessionMock.mockResolvedValue({
            data: { session: { access_token: 'test-jwt-token', user: { id: 'user-1' } } },
        });

        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 500,
            json: () => Promise.resolve({ error: 'Storage cleanup failed' }),
        });

        await expect(deleteAccount()).rejects.toThrow('Storage cleanup failed');
    });
});

it('une suppression A tardive ne déconnecte ni ne nettoie le compte B', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'test-token', user: { id: 'user-1' } } } });
    let finish!: (result: unknown) => void;
    const request = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    globalThis.fetch = request as typeof fetch;
    const pending = deleteAccount();
    const rejected = expect(pending).rejects.toThrow(/compte actif/);
    await vi.waitFor(() => expect(request).toHaveBeenCalled());
    setSessionIdentity('user-2');
    finish({ ok: true });
    await rejected;
    expect(signOutMock).not.toHaveBeenCalled();
    expect(localStorage.clear).not.toHaveBeenCalled();
    expect(localStorage.removeItem).not.toHaveBeenCalled();
});
