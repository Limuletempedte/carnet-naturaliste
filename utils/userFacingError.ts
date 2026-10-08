/**
 * Traduit une erreur technique (souvent en anglais : fetch, Supabase, PostgREST)
 * en un message français actionnable pour un public naturaliste non technique
 * (audit v2, UIA-12). Le message brut reste à logger côté dev via logger.error.
 */
export const mapUserFacingError = (error: unknown): string => {
    const raw = error instanceof Error ? error.message : String(error ?? '');
    const lower = raw.toLowerCase();
    if (error instanceof Error && error.name === 'ObservationConflictError') return raw;

    if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('network request failed')) {
        return 'Connexion au serveur impossible. Vérifiez votre connexion Internet et réessayez.';
    }
    if (lower.includes('jwt') || lower.includes('token') && lower.includes('expired')) {
        return 'Votre session a expiré. Reconnectez-vous pour continuer.';
    }
    if (lower.includes('quota') || lower.includes('storage') && lower.includes('full')) {
        return 'Espace de stockage saturé. Libérez de la place puis réessayez.';
    }
    if (lower.includes('timeout') || lower.includes('timed out')) {
        return 'Le serveur met trop de temps à répondre. Réessayez dans un instant.';
    }
    if (lower.includes('not authenticated') || lower.includes('not authorized') || lower.includes('permission')) {
        return 'Action non autorisée. Reconnectez-vous puis réessayez.';
    }

    // Repli : message générique plutôt que d'exposer un message technique brut.
    return raw.trim() ? 'Une erreur est survenue. Veuillez réessayer.' : 'Une erreur inconnue est survenue.';
};
