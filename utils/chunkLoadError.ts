/**
 * Détection des échecs de chargement de chunk dynamique (audit v2, lot C).
 *
 * Scénario : un onglet/PWA resté ouvert pendant un redéploiement demande un
 * `import()` dont le fichier hashé n'existe plus sur le nouveau déploiement
 * → le navigateur rejette avec un message spécifique selon le moteur.
 * Sans détection, l'utilisateur voit une erreur générique alors que la seule
 * action utile est de recharger la page.
 */

const CHUNK_LOAD_PATTERNS = [
    /failed to fetch dynamically imported module/i, // Chrome / Edge
    /error loading dynamically imported module/i,   // Firefox
    /importing a module script failed/i,            // Safari
];

export const isChunkLoadError = (error: unknown): boolean =>
    error instanceof Error && CHUNK_LOAD_PATTERNS.some(pattern => pattern.test(error.message));

export const CHUNK_LOAD_USER_MESSAGE =
    "Une mise à jour de l'application est disponible : rechargez la page, puis réessayez.";
