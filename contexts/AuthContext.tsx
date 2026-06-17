import React, { createContext, useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { isSupabaseConfigured, supabase } from '../supabaseClient';
import { Session, User } from '@supabase/supabase-js';
import {
    clearScopedOfflineData,
    migrateLegacyLocalStorageToScoped,
    setStorageNamespace
} from '../services/storageService';
import { logger } from '../utils/logger';

const CACHED_SESSION_KEY = 'cached_auth_session';
const CACHED_SESSION_TTL_MS = 2 * 24 * 60 * 60 * 1000;
const CACHED_SESSION_SCHEMA_VERSION = 3;

interface AuthContextType {
    session: Session | null;
    user: User | null;
    loading: boolean;
    isOffline: boolean;
    // True après le clic sur un lien « mot de passe oublié » (événement Supabase
    // PASSWORD_RECOVERY) : l'app doit alors afficher l'écran de nouveau mot de passe.
    passwordRecovery: boolean;
    clearPasswordRecovery: () => void;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    session: null,
    user: null,
    loading: true,
    isOffline: false,
    passwordRecovery: false,
    clearPasswordRecovery: () => { },
    signOut: async () => { },
});

// Cache session to localStorage for offline use
const cacheSession = (session: Session | null) => {
    try {
        if (session) {
            localStorage.setItem(CACHED_SESSION_KEY, JSON.stringify({
                schema_version: CACHED_SESSION_SCHEMA_VERSION,
                user: {
                    id: session.user.id,
                    user_metadata: {
                        display_name: session.user.user_metadata?.display_name
                    }
                },
                cached_at: Date.now()
            }));
        } else {
            localStorage.removeItem(CACHED_SESSION_KEY);
        }
    } catch (e) {
        logger.warn('Failed to cache session:', e);
    }
};

// Restore cached session (creates a minimal user object for offline display)
const getCachedSession = (): { user: User } | null => {
    try {
        const cached = localStorage.getItem(CACHED_SESSION_KEY);
        if (!cached) {
            return null;
        }

        const parsed = JSON.parse(cached) as {
            schema_version?: number;
            cached_at?: unknown;
            user?: User;
        };

        if (parsed.schema_version !== CACHED_SESSION_SCHEMA_VERSION) {
            localStorage.removeItem(CACHED_SESSION_KEY);
            return null;
        }

        const cachedAt = typeof parsed.cached_at === 'number' ? parsed.cached_at : NaN;
        if (!Number.isFinite(cachedAt) || Date.now() - cachedAt >= CACHED_SESSION_TTL_MS) {
            localStorage.removeItem(CACHED_SESSION_KEY);
            return null;
        }

        if (parsed.user?.id) {
            return { user: parsed.user };
        }
    } catch (e) {
        logger.warn('Failed to restore cached session:', e);
        localStorage.removeItem(CACHED_SESSION_KEY);
    }
    return null;
};

// Race a promise against a timeout
const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> => {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error('Auth timeout')), ms)
        )
    ]);
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [isOffline, setIsOffline] = useState(!navigator.onLine);
    const [passwordRecovery, setPasswordRecovery] = useState(false);

    useEffect(() => {
        if (!isSupabaseConfigured) {
            setStorageNamespace(null);
            setLoading(false);
            return;
        }

        // Track online/offline status
        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Try to get session with a timeout (5s) to avoid hanging offline
        const initSession = async () => {
            try {
                const { data: { session } } = await withTimeout(
                    supabase.auth.getSession(),
                    5000
                );
                setSession(session);
                setUser(session?.user ?? null);
                cacheSession(session);
                if (session?.user?.id) {
                    setStorageNamespace(session.user.id);
                    migrateLegacyLocalStorageToScoped(session.user.id);
                } else {
                    setStorageNamespace(null);
                }
            } catch (e) {
                logger.warn('Auth getSession failed (likely offline), trying cache:', e);
                // Fallback to cached session
                const cached = getCachedSession();
                if (cached) {
                    setUser(cached.user);
                    setStorageNamespace(cached.user.id);
                    migrateLegacyLocalStorageToScoped(cached.user.id);
                    logger.info('Restored user from cache for offline mode');
                } else {
                    setStorageNamespace(null);
                }
            } finally {
                setLoading(false);
            }
        };

        initSession();

        // Listen for auth changes (works when back online)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'PASSWORD_RECOVERY') {
                setPasswordRecovery(true);
            }
            setSession(session);
            setUser(session?.user ?? null);
            cacheSession(session);
            if (session?.user?.id) {
                setStorageNamespace(session.user.id);
                migrateLegacyLocalStorageToScoped(session.user.id);
            } else {
                setStorageNamespace(null);
            }
            setLoading(false);
        });

        return () => {
            subscription.unsubscribe();
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const signOut = useCallback(async () => {
        if (user?.id) {
            clearScopedOfflineData(user.id);
        }
        setStorageNamespace(null);
        cacheSession(null);
        try {
            await supabase.auth.signOut();
        } catch (e) {
            logger.warn('signOut failed (likely offline):', e);
            // SE-09: Explicit token cleanup when signOut fails offline
            try {
                const url = import.meta.env.VITE_SUPABASE_URL || '';
                const match = url.match(/https?:\/\/([^.]+)\./);
                if (match?.[1]) {
                    localStorage.removeItem(`sb-${match[1]}-auth-token`);
                }
            } catch { /* ignore */ }
        }
    }, [user]);

    const clearPasswordRecovery = useCallback(() => setPasswordRecovery(false), []);

    const contextValue = useMemo(
        () => ({ session, user, loading, isOffline, passwordRecovery, clearPasswordRecovery, signOut }),
        [session, user, loading, isOffline, passwordRecovery, clearPasswordRecovery, signOut]
    );

    return (
        <AuthContext.Provider value={contextValue}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
