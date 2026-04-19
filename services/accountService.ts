import { supabase } from '../supabaseClient';

/**
 * Calls the delete-account Edge Function, clears local data, and signs out.
 * The Edge Function uses service_role to delete Storage files + auth user (CASCADE removes observations).
 */
export async function deleteAccount(): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Non authentifié');

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const res = await fetch(`${supabaseUrl}/functions/v1/delete-account`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
        },
    });

    if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Erreur inconnue' }));
        throw new Error(body.error || `Erreur ${res.status}`);
    }

    // Clear all local data
    localStorage.clear();
    await supabase.auth.signOut();
}
