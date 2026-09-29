import React, { createContext, useState, useEffect, useContext, useCallback, useMemo, useRef } from 'react';
import { isSupabaseConfigured, supabase } from '../supabaseClient';
import { Session, User } from '@supabase/supabase-js';
import {
    clearScopedOfflineData,
    migrateLegacyLocalStorageToScoped,
    setStorageNamespace
} from '../services/storageService';
import { bindSessionCoordination, getSessionGeneration, getSessionUserId, captureSessionContext } from '../services/sessionScope';
import { clearEventLog } from '../utils/eventLog';
import { logger } from '../utils/logger';

const CACHED_SESSION_KEY = 'cached_auth_session';
const CACHED_SESSION_TTL_MS = 2 * 24 * 60 * 60 * 1000;
const CACHED_SESSION_SCHEMA_VERSION = 3;

interface AuthContextType {
    session: Session | null;
    sessionGeneration: string;
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
    sessionGeneration: 'initial',
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

    const [sessionGeneration, setSessionGeneration] = useState(getSessionGeneration);
    const revision = useRef(0);

    useEffect(() => {
        let mounted = true;
        const applySession = (next: Session | null) => {
            if (!mounted) return;
            if (getSessionUserId() !== (next?.user.id ?? null)) setPasswordRecovery(false);
            setStorageNamespace(next?.user.id ?? null);
            migrateLegacyLocalStorageToScoped(next?.user.id ?? '');
            setSessionGeneration(getSessionGeneration());
            setSession(next);
            setUser(next?.user ?? null);
            cacheSession(next);
            setLoading(false);
        };
        if (!isSupabaseConfigured) { applySession(null); return; }
        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        const startRevision = revision.current;
        void withTimeout(supabase.auth.getSession(), 5000).then(({ data: { session: next } }) => {
            if (mounted && revision.current === startRevision) applySession(next);
        }).catch(() => {
            if (!mounted || revision.current !== startRevision) return;
            const cached = getCachedSession();
            if (cached) {
                setStorageNamespace(cached.user.id);
                migrateLegacyLocalStorageToScoped(cached.user.id);
                setSessionGeneration(getSessionGeneration());
                setUser(cached.user);
                setLoading(false);
            } else applySession(null);
        });
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
            revision.current++;
            applySession(next);
            if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
        });
        const stopCoordination = bindSessionCoordination((nextIdentity) => {
            const expectedUser = nextIdentity.userId;
            const expectedGeneration = nextIdentity.sessionGeneration;
            const currentRevision = ++revision.current;
            setUser(null);
            setSession(null);
            setPasswordRecovery(false);
            setLoading(true);
            setSessionGeneration(expectedGeneration);
            // On relit le SDK hors de son callback synchrone pour éviter un verrou Auth.
            void withTimeout(supabase.auth.getSession(), 5000).then(({ data: { session: next } }) => {
                if (!mounted || revision.current !== currentRevision || getSessionGeneration() !== expectedGeneration) return;
                if ((next?.user.id ?? null) !== expectedUser) { setLoading(false); return; }
                applySession(next);
            }).catch(() => { if (mounted && revision.current === currentRevision) setLoading(false); });
        });
        return () => {
            mounted = false;
            subscription.unsubscribe();
            stopCoordination();
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const signOut = useCallback(async () => {
        try {
            const ctx = captureSessionContext();
            if (ctx.userId !== user?.id || ctx.sessionGeneration !== sessionGeneration) return;
        } catch { return; }
        revision.current++;
        if (user?.id) clearScopedOfflineData(user.id);
        clearEventLog();
        setStorageNamespace(null);
        setSessionGeneration(getSessionGeneration());
        setUser(null);
        setSession(null);
        setPasswordRecovery(false);
        cacheSession(null);
        try {
            await supabase.auth.signOut();
        } catch (e) {
            logger.warn('[Auth] signOut failed', e);
            // Filet local: jamais laisser une identité affichée après déconnexion.
            try {
                const hostname = new URL(import.meta.env.VITE_SUPABASE_URL || '').hostname;
                localStorage.removeItem(`sb-${hostname.split('.')[0]}-auth-token`);
            } catch { /* configuration invalide */ }
        }
    }, [user, sessionGeneration]);

    const clearPasswordRecovery = useCallback(() => setPasswordRecovery(false), []);

    const contextValue = useMemo(
        () => ({ session, sessionGeneration, user, loading, isOffline, passwordRecovery, clearPasswordRecovery, signOut }),
        [session, sessionGeneration, user, loading, isOffline, passwordRecovery, clearPasswordRecovery, signOut]
    );

    return (
        <AuthContext.Provider value={contextValue}>
            {!loading && <React.Fragment key={`${user?.id ?? 'signed-out'}:${sessionGeneration}`}>{children}</React.Fragment>}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
