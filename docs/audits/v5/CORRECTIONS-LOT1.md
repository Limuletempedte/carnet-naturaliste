# Lot 1 — isolation des comptes

## Périmètre

Correctif préparé depuis `cf79ceb`, pour les constats de séparation UI, opérations
asynchrones, journaux et préférences de l'audit v5. Aucune modification des règles
Supabase ou du bucket de production. Les médias et leur cache PWA relèvent du lot 2.

Les opérations privées portent un contexte immuable (utilisateur, génération de
session, signal d'annulation). Une réponse périmée ne peut plus alimenter le cache,
la file de synchronisation ou l'écran du compte suivant. L'arbre React est remonté
au changement de compte/génération, sans perdre une saisie au simple renouvellement
du jeton. Les autres onglets invalident leur état et font confirmer l'identité par
le SDK Auth avant de présenter les données.

Les historiques de carte, filtres et journaux sont séparés par compte. Les journaux
ne conservent que des catégories techniques, sans URL, objet d'observation ou erreur
brute. Les anciennes données partagées sans propriétaire sont abandonnées. Exception
pour l'ancienne file de mutations : sa copie brute est préservée en quarantaine
locale (`cn-unowned-offline-queue-v1`), sans lecture ni attribution par l'application.
Elle nécessite une récupération manuelle ; si sa copie échoue, l'original reste en
place. Les files modernes restent soumises à l'avertissement avant déconnexion.

La revue indépendante du candidat a fait corriger deux régressions : perte de cette
file ancienne, et fermeture du formulaire de récupération lors d'un `SIGNED_IN` ou
`TOKEN_REFRESHED` du même compte.

## Validation

`npm run check` : TypeScript, ESLint, 67 fichiers / 474 tests Vitest et compilation
réussis. Les tests couvrent notamment A → B → A, réponse différée, amorçage Auth
différé, utilisateur SDK incohérent, mode hors ligne, récupération et suppression
de compte différée. Le contrôle positif du renouvellement de session conserve la saisie.

Le script `tests/security/lot1-browser.mjs` utilise le bundle compilé et un véritable
Supabase local avec deux comptes fictifs. Les services externes sont simulés ; les
appels Auth/PostgREST restent réels. Il couvre formulaire A → B, deux onglets,
réponse A retardée, rechargement, refus serveur B → A avec contrôle positif B → B,
saisie hors ligne et annulation de la déconnexion, puis redémarrage du navigateur.
Le service worker est volontairement désactivé dans ce test, et reste à valider
séparément dans le lot 2. Le test n'affirme pas avoir modifié les permissions serveur.

Exécution depuis la racine du dépôt, avec un bundle compilé pour le laboratoire :

```sh
LOCAL_STATUS_FILE=/chemin/local-status.json \
AUDIT_BUILD_DIR=/chemin/bundle/dist \
PLAYWRIGHT_MODULE=/chemin/playwright/index.mjs \
CHROMIUM_EXECUTABLE=/chemin/chromium \
node tests/security/lot1-browser.mjs
```

`local-status.json` provient de `supabase status -o json`. Il contient des clés du
laboratoire : ne jamais le committer. Le script refuse une cible non locale, crée
et supprime ses comptes fictifs, et n'utilise aucune donnée de production.

## Limites et livraison

Ce lot ne rend pas les médias privés, ne borne pas encore les imports et n'ajoute
pas de CAPTCHA. Aucune fusion automatique et aucun réglage de production modifié.
Les tests locaux ne constituent pas une nouvelle vérification des réglages hébergés.
