# Mise en production des corrections — 30 septembre 2026

Ce document complète l'audit historique du 11 septembre sans en modifier les
preuves ni les conclusions à cette date.

## Code livré

Les quatre PR ont été fusionnées par le propriétaire :

| Lot | PR | Protection |
|---|---|---|
| 1 | [#83](https://github.com/Limuletempedte/carnet-naturaliste/pull/83) | Cloisonnement des comptes et opérations asynchrones |
| 2 | [#84](https://github.com/Limuletempedte/carnet-naturaliste/pull/84) | Médias authentifiés, cache hors ligne par propriétaire |
| 3 | [#85](https://github.com/Limuletempedte/carnet-naturaliste/pull/85) | Imports bornés dans un Worker annulable |
| 4 | [#86](https://github.com/Limuletempedte/carnet-naturaliste/pull/86) | Nouveaux mots de passe12 et CAPTCHA |

L'alias `carnet-naturaliste.vercel.app` a été vérifié par l'API Vercel : déploiement
de production `READY`, commit `0f9d94a6483921ddb70633a71d46af617df3fa35`, correspondant
à la fusion de la PR #86, sans erreur d'alias. Le site répond HTTP200. La CSP servie
autorise exactement `https://challenges.cloudflare.com` dans `script-src` et
`frame-src`, sans `unsafe-inline` dans `script-src`.

Les fusions condensées ont nécessité de réconcilier l'historique des branches
suivantes. Avant chaque réconciliation, le contenu de `main` a été comparé au lot
précédent ; le contenu du lot suivant est resté strictement inchangé. Les contrôles
GitHub Node20/Node22 et Vercel étaient réussis avant chaque fusion.

## Réglages réellement activés

| Réglage | État et preuve |
|---|---|
| Bucket `photos` (photos et sons) | `public=false`, relu par SQL après application ; RLS de `storage.objects` active |
| Conservation des fichiers | 8 objets avant et après bascule ; aucun déplacement ni suppression |
| Ancien accès public | Une requête HEAD sans authentification sur l'ancien lien d'un objet existant est refusée avec HTTP400 |
| Accès du propriétaire | Le propriétaire confirme « photo OK » après la bascule ; ce résultat est un retour utilisateur, pas une assertion navigateur automatisée |
| Minimum de mot de passe | 12 enregistré dans Supabase Auth > Email ; réglage rouvert et vérifié visuellement après enregistrement |
| CAPTCHA serveur | Clé secrète saisie directement par le propriétaire dans Supabase ; après rechargement de la page, protection activée, fournisseur `Turnstile by Cloudflare`, aucun changement en attente |

La clé secrète Turnstile n'est présente dans aucun fichier de ce rapport, du code
ou du dépôt. La clé publique correspond au widget limité à
`carnet-naturaliste.vercel.app`, mode `managed`, sans pré-clearance. Aucun achat
ni changement vers une formule payante.

La migration hébergée enregistrée est `20260930135528_security_private_media`.
Son opération est `UPDATE storage.buckets SET public=false WHERE id='photos'`.
Le fichier préparé dans le dépôt reste
`supabase/migrations/20260929142533_security_private_media.sql` : même opération
idempotente, horodatage différent attribué par l'outil d'application hébergée.
Cet écart d'historique doit être pris en compte avant un futur `db push` ; aucune
réparation globale de l'historique des migrations n'a été exécutée ici.

## Vérifications et portée des preuves

- `npm run check` réussi sur le lot4 : **509 tests sur 73 fichiers**, TypeScript,
  ESLint et compilation PWA. Nouvelle exécution avant le commit de réconciliation
  `bce1226dcfbb95578ed2e6cdf6b466d6f6f3c6c2`, dont le contenu est celui livré.
- **34 contrôles d'intégration locaux** réussis sur l'ensemble des lots : 8 pour
  les comptes, 11 pour les médias, 8 pour les imports et 7 pour l'authentification.
  Les contrôles de permissions utilisent un Supabase local réel. Pour le lot4,
  GoTrue réel impose CAPTCHA/minimum12 ; seul le fournisseur CAPTCHA HTTPS est
  simulé sur le réseau Docker du laboratoire.
- Le serveur local refuse les jetons CAPTCHA absents, invalides et réutilisés,
  accepte un jeton valide et conserve la connexion avec un ancien mot de passe
  court. Le parcours complet de récupération par email a réussi localement.
- Sur le site de production, le propriétaire a signalé une connexion fonctionnelle
  avant activation du CAPTCHA serveur, puis « clé enregistrée, photo OK » après.
  Après activation serveur, il confirme également **« Connexion OK et email reçu »**
  pour le contrôle demandé en fenêtre privée. Il s'agit de vérifications manuelles
  déclarées par le propriétaire ; aucun mot de passe n'a été transmis à l'agent.
- Aucun essai de mot de passe invalide, jeton forgé, accès entre comptes, import
  piégé ou saturation n'a été dirigé contre la production ou un service tiers.
  Le HEAD sur l'ancien lien média était la vérification ciblée de lecture anonyme
  prévue dans le plan de déploiement.

Les comptes et profils des tests locaux ont été nettoyés. Les deux conteneurs
CAPTCHA spécifiques ont été supprimés ; le laboratoire Supabase principal reste
disponible. Les scripts de reproduction sont versionnés dans `tests/security/`.

## Limites et suites

- Les anciens clients PWA restés hors ligne n'adoptent le nouveau nettoyage qu'à
  leur prochaine mise à jour. Le bucket serveur reste privé ; ne pas le rendre
  public en cas d'incident d'affichage.
- La revue indépendante du lot3 a été interrompue après la détection d'un écart
  de noms Excel, corrigé et testé. La revue complémentaire et les tests ont été
  effectués par l'agent principal ; ne pas présenter ce lot comme ayant fait
  l'objet d'une revue indépendante complète. Les lots1,2,4 ont leur revue dédiée.
- L'analyse et les mises à jour des dépendances restent une PR distincte. Les
  alertes automatiques ne constituent pas à elles seules une preuve d'exploitation.
- MFA et audit général du fonctionnement restent reportés, comme convenu.

Les bascules sont désormais effectuées ; cela ne constitue pas une garantie
d'absence de toute vulnérabilité ni un audit complet du fonctionnement.
