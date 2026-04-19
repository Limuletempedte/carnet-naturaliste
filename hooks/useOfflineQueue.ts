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

    const refreshOfflineQueueSnapshot = useCallback(() => {
        if (!user) {
            setOfflineQueueItems([]);
            return;
        }
        try {
            setOfflineQueueItems(getOfflineQueueSnapshot());
        } catch {
            setOfflineQueueItems([]);
        }
    }, [user]);

    useEffect(() => {
        refreshOfflineQueueSnapshot();
    }, [refreshOfflineQueueSnapshot]);

    return { offlineQueueItems, refreshOfflineQueueSnapshot };
}
