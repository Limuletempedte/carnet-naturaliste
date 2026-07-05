import { useEffect } from 'react';

type PushToast = (type: 'info' | 'success' | 'warning' | 'error', message: string, durationMs?: number) => string;

/**
 * Hook extrait de App.tsx : s'abonne aux evenements globaux de saturation du stockage
 * local et affiche un toast utilisateur approprie.
 *
 * - `storage-quota-exceeded` : dispatche par `safeStorage.safeSet` ou storageService
 *   quand localStorage refuse une ecriture (QuotaExceededError).
 * - `media-stripped-offline` : dispatche par storageService quand des medias trop
 *   volumineux sont retires du cache local pour preserver la file d'attente offline.
 * - `storage-corruption-detected` : dispatche par storageService ou App.tsx quand
 *   le JSON du cache / queue / presets est invalide (SR-09).
 * - `supabase-recoverable-error` : dispatche par storageService quand une erreur
 *   reseau transitoire a declenche le fallback vers la queue offline (SR-08).
 * - `schema-drift-detected` : dispatche par storageService quand le serveur
 *   indique qu'une colonne n'existe pas et que la requete est relancee sans (SR-13).
 */
export function useStorageQuotaToasts(pushToast: PushToast): void {
    useEffect(() => {
        const handleQuota = () => pushToast(
            'warning',
            'Espace de stockage presque plein. Synchronisez vos données (Centre de sync) ou supprimez des photos volumineuses pour libérer de l\'espace. Les prochaines modifications nécessitent une synchronisation.',
            10000,
        );
        const handleMediaStripped = (event: Event) => {
            const strippedCount = (event as CustomEvent<{ count?: number }>).detail?.count;
            if (!strippedCount || strippedCount < 1) return;
            pushToast(
                'warning',
                `${strippedCount} photo(s)/son(s) non disponibles hors-ligne (trop volumineuses pour le cache local).`,
                8000,
            );
        };
        const handleCorruption = (event: Event) => {
            const scope = (event as CustomEvent<{ scope?: string }>).detail?.scope ?? 'données locales';
            const label = scope === 'queue' ? 'File d\'attente hors-ligne'
                : scope === 'cache' ? 'Cache d\'observations'
                : scope === 'presets' ? 'Préréglages de filtres'
                : 'Données locales';
            pushToast(
                'error',
                `${label} corrompu(e) — réinitialisé(e). Reconnectez-vous pour recharger depuis le serveur.`,
                0,
            );
        };
        const handleRecoverableError = (event: Event) => {
            const action = (event as CustomEvent<{ action?: string }>).detail?.action ?? 'action';
            pushToast(
                'warning',
                `Serveur injoignable — ${action} mise en file d'attente (réessai automatique).`,
                8000,
            );
        };
        const handleSchemaDrift = (event: Event) => {
            const columns = (event as CustomEvent<{ columns?: string[] }>).detail?.columns ?? [];
            const list = columns.length > 0 ? ` (${columns.join(', ')})` : '';
            pushToast(
                'warning',
                `Migration de base de données manquante${list}. Certaines données ne seront pas enregistrées jusqu'à application de la migration.`,
                10000,
            );
        };

        window.addEventListener('storage-quota-exceeded', handleQuota);
        window.addEventListener('media-stripped-offline', handleMediaStripped);
        window.addEventListener('storage-corruption-detected', handleCorruption);
        window.addEventListener('supabase-recoverable-error', handleRecoverableError);
        window.addEventListener('schema-drift-detected', handleSchemaDrift);

        return () => {
            window.removeEventListener('storage-quota-exceeded', handleQuota);
            window.removeEventListener('media-stripped-offline', handleMediaStripped);
            window.removeEventListener('storage-corruption-detected', handleCorruption);
            window.removeEventListener('supabase-recoverable-error', handleRecoverableError);
            window.removeEventListener('schema-drift-detected', handleSchemaDrift);
        };
    }, [pushToast]);
}
