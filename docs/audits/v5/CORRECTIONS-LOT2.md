# Lot 2 — médias privés et cache hors ligne

Cette branche dépend du lot 1 (PR #83). Ne pas appliquer la migration hébergée
avant que le frontend compatible soit effectivement déployé.

## Comportement

Les champs `photo_url` et `sound_url` restent inchangés. Leurs anciennes URL sont
interprétées comme des références d'objets du projet, du bucket et du propriétaire
attendus. Le SDK effectue le téléchargement authentifié avec `cache: no-store`.
Les écrans n'affichent que des URL Blob révocables ; les images publiques des
encyclopédies utilisent des sources distinctes et autorisées. Aucun fichier existant
n'est déplacé ni supprimé par la migration.

Le cache IndexedDB des téléchargements est séparé des saisies en attente. Il est
borné à 50 médias, 100 Mio et 30 jours, avec éviction des moins récemment utilisés.
Les contrôles d'expiration s'appliquent au démarrage et à l'accès. Les transitions
de session révoquent les Blob et purgent les médias du compte quitté. Une réponse
tardive ne peut pas réécrire son cache. La purge n'efface pas les fichiers intégrés
aux mutations non synchronisées ; la déconnexion garde son avertissement du lot 1.

L'ancien cache `supabase-storage-cache` est supprimé à l'activation du nouveau
service worker et aux transitions de compte. L'app compilée devient la page de
repli pour permettre son redémarrage hors ligne. Les anciens clients encore hors
ligne restent soumis à leur ancienne version jusqu'à leur mise à jour.

Les sauvegardes ZIP téléchargent les médias privés par le même service et conservent
leurs références historiques dans `data.json`. À la restauration, le MIME est
reconstruit depuis une extension autorisée. Les médias inline sont décodés localement,
sans élargir la CSP pour permettre des requêtes `data:`.

## Vérifications reproductibles

- `npm run check` : TypeScript, lint, tests et compilation.
- `tests/privateMedia.test.ts` : origine, propriétaire, encodages, réponse tardive,
  téléchargement sans cache HTTP et révocation.
- `tests/backupService.test.ts` : archive réelle, restauration et MIME compatible.
- `tests/security/lot2-browser.mjs` : bundle compilé sous les en-têtes Vercel (seule
  l'API loopback est ajoutée à connect-src), véritable Supabase local privé et SW actif.
  Contrôles propriétaire/B/anonyme, anciens liens, affichage photo/son, ZIP, IndexedDB
  réel (50 médias, 100 Mio, LRU, expiration), purge et comptes hors ligne.

Le script utilise les mêmes variables locales que `lot1-browser.mjs`. Il crée ses
propres comptes, objets et profil Chromium, et refuse une cible Supabase distante.
Le bucket du laboratoire doit avoir `public=false`. Aucun test malveillant n'est
exécuté sur la production. Les plafonds de ressources du test sont bornés (120 Mio
de blobs fictifs pour vérifier l'éviction à 100 Mio).

## Ordre de mise en production

1. Fusionner et déployer le lot 1, puis le frontend du lot 2 ; vérifier le commit
   réellement servi et l'accès authentifié aux anciennes photos du propriétaire.
2. Appliquer alors seulement la migration `security_private_media` à Supabase.
   Elle modifie le caractère public du bucket, sans toucher aux objets ni aux
   règles RLS propriétaire déjà présentes.
3. Vérifier un média propriétaire, son ancien lien anonyme refusé et l'absence
   d'accès depuis un autre compte. Vérifier aussi les sons et une sauvegarde ZIP.
4. En cas de problème, conserver le bucket privé et corriger le frontend. Ne pas
   rétablir l'accès public comme solution de contournement.

La préparation locale ne constitue pas une bascule de production. Le passage
hébergé en privé reste en attente du déploiement compatible et de ses vérifications.
