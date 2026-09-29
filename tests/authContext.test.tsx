import { useState } from 'react';
import { setSessionIdentity, SESSION_IDENTITY_KEY } from '../services/sessionScope';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    getSessionMock,
    onAuthStateChangeMock,
    signOutMock,
    setStorageNamespaceMock,
    migrateLegacyLocalStorageToScopedMock,
    clearScopedOfflineDataMock
} = vi.hoisted(() => ({
    getSessionMock: vi.fn(),
    onAuthStateChangeMock: vi.fn((_callback: (event: string, session: unknown) => void) => ({
        data: {
            subscription: {
                unsubscribe: vi.fn()
            }
        }
    })),
    signOutMock: vi.fn(),
    setStorageNamespaceMock: vi.fn(),
    migrateLegacyLocalStorageToScopedMock: vi.fn(),
    clearScopedOfflineDataMock: vi.fn()
}));

vi.mock('../supabaseClient', () => ({
    isSupabaseConfigured: true,
    supabase: {
        auth: {
            getSession: getSessionMock,
            onAuthStateChange: onAuthStateChangeMock,
            signOut: signOutMock
        }
    }
}));

vi.mock('../services/storageService', () => ({
    setStorageNamespace: setStorageNamespaceMock,
    migrateLegacyLocalStorageToScoped: migrateLegacyLocalStorageToScopedMock,
    clearScopedOfflineData: clearScopedOfflineDataMock
}));

import { AuthProvider, useAuth } from '../contexts/AuthContext';

const Probe = () => {
    const { user, signOut, passwordRecovery } = useAuth();
    const [draft, setDraft] = useState('');
    return (
        <div>
            <input aria-label="private draft" value={draft} onChange={e => setDraft(e.target.value)} />
            <div data-testid="user-id">{user?.id ?? 'none'}</div>
            <div data-testid="recovery">{String(passwordRecovery)}</div>
            <button data-testid="sign-out" onClick={() => signOut()}>Sign Out</button>
        </div>
    );
};

describe('AuthProvider cache handling', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
        setStorageNamespaceMock.mockImplementation((id: string | null) => setSessionIdentity(id));
        Object.defineProperty(window.navigator, 'onLine', {
            configurable: true,
            value: true
        });
    });

    it('stores a versioned cached session without access token', async () => {
        getSessionMock.mockResolvedValue({
            data: {
                session: {
                    user: { id: 'user-1', email: 'user@example.com' },
                    access_token: 'token-should-not-be-cached'
                }
            }
        });

        render(
            <AuthProvider>
                <Probe />
            </AuthProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('user-id').textContent).toBe('user-1');
        });

        const raw = localStorage.getItem('cached_auth_session');
        expect(raw).toBeTruthy();
        const parsed = JSON.parse(raw || '{}');
        expect(parsed.schema_version).toBe(3);
        expect(parsed.user?.id).toBe('user-1');
        expect(parsed.user?.email).toBeUndefined();
        expect(parsed.access_token).toBeUndefined();
    });

    it('restores user from valid cache when session retrieval fails', async () => {
        getSessionMock.mockRejectedValue(new Error('offline'));
        localStorage.setItem('cached_auth_session', JSON.stringify({
            schema_version: 3,
            cached_at: Date.now(),
            user: { id: 'cached-user', user_metadata: { display_name: 'Test' } }
        }));

        render(
            <AuthProvider>
                <Probe />
            </AuthProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('user-id').textContent).toBe('cached-user');
        });

        expect(setStorageNamespaceMock).toHaveBeenCalledWith('cached-user');
        expect(migrateLegacyLocalStorageToScopedMock).toHaveBeenCalledWith('cached-user');
    });

    it('drops invalid cache payload and falls back to unauthenticated state', async () => {
        getSessionMock.mockRejectedValue(new Error('offline'));
        localStorage.setItem('cached_auth_session', '{invalid-json');

        render(
            <AuthProvider>
                <Probe />
            </AuthProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('user-id').textContent).toBe('none');
        });

        expect(localStorage.getItem('cached_auth_session')).toBeNull();
        expect(setStorageNamespaceMock).toHaveBeenCalledWith(null);
    });

    it('signOut does not throw when supabase.auth.signOut rejects', async () => {
        getSessionMock.mockResolvedValue({
            data: {
                session: {
                    user: { id: 'user-1', email: 'user@example.com' },
                    access_token: 'token'
                }
            }
        });
        signOutMock.mockRejectedValue(new Error('network error'));

        render(
            <AuthProvider>
                <Probe />
            </AuthProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('user-id').textContent).toBe('user-1');
        });

        // Should not throw
        fireEvent.click(screen.getByTestId('sign-out'));

        await waitFor(() => {
            expect(signOutMock).toHaveBeenCalled();
        });
        expect(clearScopedOfflineDataMock).toHaveBeenCalledWith('user-1');
    });
});


describe('AuthProvider — isolation et courses de connexion', () => {
    const sessionFor = (id: string) => ({ user: { id, user_metadata: {} }, access_token: 'fixture-only' });
    beforeEach(() => {
        localStorage.clear(); vi.clearAllMocks();
        setStorageNamespaceMock.mockImplementation((id: string | null) => setSessionIdentity(id));
    });
    it('garde la récupération pendant une revalidation du même compte', async () => {
        getSessionMock.mockResolvedValue({ data: { session: sessionFor('A') } });
        render(<AuthProvider><Probe /></AuthProvider>);
        await waitFor(() => expect(screen.getByTestId('user-id').textContent).toBe('A'));
        const callback = onAuthStateChangeMock.mock.calls[0][0];
        act(() => callback('PASSWORD_RECOVERY', sessionFor('A')));
        act(() => callback('SIGNED_IN', sessionFor('A')));
        act(() => callback('TOKEN_REFRESHED', sessionFor('A')));
        expect(screen.getByTestId('recovery').textContent).toBe('true');
        act(() => callback('SIGNED_IN', sessionFor('B')));
        expect(screen.getByTestId('recovery').textContent).toBe('false');
    });
    it('efface le formulaire A lors de B, mais le garde au refresh de A', async () => {
        getSessionMock.mockResolvedValue({ data: { session: sessionFor('A') } });
        render(<AuthProvider><Probe /></AuthProvider>);
        await screen.findByDisplayValue('');
        await waitFor(() => expect(screen.getByTestId('user-id').textContent).toBe('A'));
        fireEvent.change(screen.getByLabelText('private draft'), { target: { value: 'PRIVATE A' } });
        const callback = onAuthStateChangeMock.mock.calls[0][0];
        act(() => callback('TOKEN_REFRESHED', sessionFor('A')));
        expect((screen.getByLabelText('private draft') as HTMLInputElement).value).toBe('PRIVATE A');
        act(() => callback('SIGNED_IN', sessionFor('B')));
        await waitFor(() => expect(screen.getByTestId('user-id').textContent).toBe('B'));
        expect((screen.getByLabelText('private draft') as HTMLInputElement).value).toBe('');
    });
    it('ignore le bootstrap A reçu après un événement B', async () => {
        let finish!: (value: unknown) => void;
        getSessionMock.mockReturnValue(new Promise(resolve => { finish = resolve; }));
        render(<AuthProvider><Probe /></AuthProvider>);
        act(() => onAuthStateChangeMock.mock.calls[0][0]('SIGNED_IN', sessionFor('B')));
        await waitFor(() => expect(screen.getByTestId('user-id').textContent).toBe('B'));
        await act(async () => { finish({ data: { session: sessionFor('A') } }); });
        expect(screen.getByTestId('user-id').textContent).toBe('B');
        expect(JSON.parse(localStorage.getItem('cached_auth_session')!).user.id).toBe('B');
    });
    it('masque A et relit le SDK lors du changement annoncé par un autre onglet', async () => {
        getSessionMock.mockResolvedValue({ data: { session: sessionFor('A') } });
        render(<AuthProvider><Probe /></AuthProvider>);
        await waitFor(() => expect(screen.getByTestId('user-id').textContent).toBe('A'));
        fireEvent.change(screen.getByLabelText('private draft'), { target: { value: 'PRIVATE A' } });
        getSessionMock.mockResolvedValue({ data: { session: sessionFor('B') } });
        localStorage.setItem(SESSION_IDENTITY_KEY, JSON.stringify({ userId: 'B', sessionGeneration: 'remote-B' }));
        act(() => window.dispatchEvent(new StorageEvent('storage', { key: SESSION_IDENTITY_KEY })));
        await waitFor(() => expect(screen.getByTestId('user-id').textContent).toBe('B'));
        expect((screen.getByLabelText('private draft') as HTMLInputElement).value).toBe('');
    });
});
