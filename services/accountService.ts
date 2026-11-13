import { captureSessionContext, assertSessionContext, inSession, StaleSessionError, type SessionContext } from './sessionScope';
import { clearScopedOfflineData } from './storageService';
import { supabase } from '../supabaseClient';
import { AI_STATUS_CACHE_PREFIX } from './aiAssistService';
import { MONTHLY_SUMMARY_CACHE_PREFIX } from './monthlySummaryCache';

/** Données par personne gardées dans le navigateur, effacées avec le compte. */
export const ACCOUNT_SCOPED_STORAGE_PREFIXES = [
    'event-log-v2',
    'map-search-history-v2',
    'observation-filter-presets-v2',
    MONTHLY_SUMMARY_CACHE_PREFIX,
    AI_STATUS_CACHE_PREFIX,
] as const;

/**
 * Calls the delete-account Edge Function, clears local data, and signs out.
 * The Edge Function uses service_role to delete Storage files + auth user (CASCADE removes observations).
 */
export async function deleteAccount(context: SessionContext = captureSessionContext()): Promise<void> {
    const { data: { session } } = await inSession(context, () => supabase.auth.getSession());
    if (!session) throw new Error('Non authentifié');
    if (session.user.id !== context.userId) throw new StaleSessionError();

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const res = await fetch(`${supabaseUrl}/functions/v1/delete-account`, {
        method: 'POST',
        signal: context.signal,
        headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
        },
    });

    assertSessionContext(context);
    if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Erreur inconnue' }));
        throw new Error(body.error || `Erreur ${res.status}`);
    }

    // Le résultat tardif de A ne doit jamais effacer les données de B.
    assertSessionContext(context);
    clearScopedOfflineData(context.userId);
    for (const prefix of ACCOUNT_SCOPED_STORAGE_PREFIXES) localStorage.removeItem(`${prefix}:${context.userId}`);
    await supabase.auth.signOut();
}
