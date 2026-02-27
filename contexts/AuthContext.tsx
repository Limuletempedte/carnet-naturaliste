import React, { createContext, useState, useEffect, useContext } from 'react';
import { isSupabaseConfigured, supabase } from '../supabaseClient';
import { Session, User } from '@supabase/supabase-js';
import {
    clearScopedOfflineData,
    migrateLegacyLocalStorageToScoped,
    setStorageNamespace
} from '../services/storageService';

const CACHED_SESSION_KEY = 'cached_auth_session';

interface AuthContextType {
    session: Session | null;
    user: User | null;
    loading: boolean;
    isOffline: boolean;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    session: null,
    user: null,
    loading: true,
    isOffline: false,
    signOut: async () => { },
});

// Cache session to localStorage for offline use
const cacheSession = (session: Session | null) => {
    try {
        if (session) {
            localStorage.setItem(CACHED_SESSION_KEY, JSON.stringify({
                user: session.user,
                access_token: session.access_token,
                cached_at: Date.now()
            }));
        } else {
            localStorage.removeItem(CACHED_SESSION_KEY);
        }
    } catch (e) {
        console.warn('Failed to cache session:', e);
    }
};

// Restore cached session (creates a minimal user object for offline display)
const getCachedSession = (): { user: User } | null => {
    try {
        const cached = localStorage.getItem(CACHED_SESSION_KEY);
        if (cached) {
            const parsed = JSON.parse(cached);
            // Accept cache up to 30 days old
            if (Date.now() - parsed.cached_at < 30 * 24 * 60 * 60 * 1000) {
                return { user: parsed.user };
            }
        }
    } catch (e) {
        console.warn('Failed to restore cached session:', e);
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
                console.warn('Auth getSession failed (likely offline), trying cache:', e);
                // Fallback to cached session
                const cached = getCachedSession();
                if (cached) {
                    setUser(cached.user);
                    setStorageNamespace(cached.user.id);
                    migrateLegacyLocalStorageToScoped(cached.user.id);
                    console.log('Restored user from cache for offline mode');
                } else {
                    setStorageNamespace(null);
                }
            } finally {
                setLoading(false);
            }
        };

        initSession();

        // Listen for auth changes (works when back online)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
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

    const signOut = async () => {
        if (user?.id) {
            clearScopedOfflineData(user.id);
        }
        setStorageNamespace(null);
        cacheSession(null);
        await supabase.auth.signOut();
    };

    return (
        <AuthContext.Provider value={{ session, user, loading, isOffline, signOut }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
