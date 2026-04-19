import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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
    onAuthStateChangeMock: vi.fn(() => ({
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
    const { user, signOut } = useAuth();
    return (
        <div>
            <div data-testid="user-id">{user?.id ?? 'none'}</div>
            <button data-testid="sign-out" onClick={() => signOut()}>Sign Out</button>
        </div>
    );
};

describe('AuthProvider cache handling', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
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
