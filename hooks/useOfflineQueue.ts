import { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { getOfflineQueueSnapshot } from '../services/storageService';
import type { OfflineQueueItem } from '../services/storageQueueUtils';

/**
 * Hook extrait de App.tsx : expose la snapshot de la file d'attente offline
 * et une fonction pour la rafraichir. Vide automatiquement la liste quand
 * aucun utilisateur n'est connecte.
 *
 * Conserve strictement la semantique d'origine :
 *  - si getOfflineQueueSnapshot() jette (ex: parsing cache corrompu), on retourne []
 *  - le refresh est rejoue a chaque changement d'utilisateur
 */
export function useOfflineQueue(user: User | null | undefined) {
    const [offlineQueueItems, setOfflineQueueItems] = useState<OfflineQueueItem[]>([]);

    // Audit v2 (H6) : dépendre de l'identité STABLE `user.id`, pas de l'objet
    // `user`. Supabase émet un nouvel objet user/session à chaque
    // TOKEN_REFRESHED (~1×/h) ; dépendre de l'objet recréait ce callback à
    // chaque refresh, ce qui relançait l'effet de chargement d'App et
    // démontait l'UI (formulaire en cours de saisie compris).
    const userId = user?.id;
    const refreshOfflineQueueSnapshot = useCallback(() => {
        if (!userId) {
            setOfflineQueueItems([]);
            return;
        }
        try {
            setOfflineQueueItems(getOfflineQueueSnapshot());
        } catch {
            setOfflineQueueItems([]);
        }
    }, [userId]);

    useEffect(() => {
        refreshOfflineQueueSnapshot();
    }, [refreshOfflineQueueSnapshot]);

    return { offlineQueueItems, refreshOfflineQueueSnapshot };
}
