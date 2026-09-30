# Lot 4 — mots de passe et protection anti-robots

> Mise à jour du 30 septembre 2026 : minimum12 et CAPTCHA activés côté Supabase après déploiement.
> Voir le [bilan de mise en production](MISE-EN-PRODUCTION-2026-09-30.md) pour les preuves et limites. La préparation initiale est conservée ci-dessous.

Date : 30 septembre 2026. Branche empilée sur le lot 3 (PR #85).

## Résultat et limite de déploiement

Le frontend impose désormais 12 caractères Unicode aux nouveaux mots de passe
(inscription et réinitialisation), sans refuser la connexion des comptes existants
dont le mot de passe est plus court. Les trois formulaires — connexion, inscription,
demande de récupération — transmettent un jeton Turnstile à Supabase Auth.

Le comportement est vérifié contre **GoTrue réel v2.192.0 local**, configuré avec
CAPTCHA obligatoire et minimum12. Seul le fournisseur CAPTCHA est simulé, par un
serveur HTTPS local ; le navigateur exécute le véritable bundle compilé.

**La protection serveur de production n'est pas encore activée.** Le fichier
`supabase/config.toml` ne modifie pas les paramètres d'un projet Supabase hébergé.
Aucune fusion, activation CAPTCHA ou modification de mot de passe en production
n'a été effectuée dans ce lot. Il ne faut pas considérer les contrôles de
l'interface comme une protection contre des appels directs à l'API.

## Frontière de sécurité

- Le jeton est gardé uniquement en mémoire, attaché au formulaire courant et
  retiré synchroniquement avant l'appel réseau. Une seconde soumission ne peut
  pas réutiliser ce jeton.
- Expiration, délai dépassé, erreur et changement de formulaire/page invalident
  la vérification. Les callbacks d'un widget obsolète sont ignorés. Un contrôle
  de l'heure à la soumission couvre aussi les onglets dont les timers ont dormi.
- Chaque tentative réseau recrée le widget. Une erreur de chargement présente
  une action de nouvelle tentative, jamais un accès sans CAPTCHA.
- Le script est chargé une fois, avec un délai maximum de 15 secondes. Le widget
  et son délai d'expiration sont nettoyés au démontage, y compris en StrictMode.
- `services/authPolicy.ts` mutualise le minimum12 et contient la **clé publique**
  du widget. La clé secrète n'appartient jamais au code, à une variable `VITE_*`,
  au dépôt ou aux journaux.

Le widget gratuit existant a été relu par API : domaine autorisé uniquement
`carnet-naturaliste.vercel.app`, mode `managed`, `no_clearance`, pas d'option
Enterprise. Aucune clé secrète n'a été affichée ou enregistrée localement.
`VITE_TURNSTILE_SITE_KEY` permet de configurer un widget distinct pour un domaine
de développement autorisé. Une preview Vercel n'est **pas** autorisée par la clé
de production ; cela ne doit pas être contourné par un CAPTCHA facultatif.

La CSP autorise exactement `https://challenges.cloudflare.com` dans `script-src`
et `frame-src`, sans joker ni `unsafe-inline` pour les scripts. La notice de
confidentialité, le registre et le document des régions décrivent les signaux
techniques traités par Cloudflare et la possibilité de traitements hors UE.

## Vérifications

| Surface | Résultat |
|---|---|
| CAPTCHA absent/invalide sur les trois API publiques | Refus `captcha_failed` du vrai serveur, avec la clé anonyme |
| CAPTCHA valide et réutilisation du même jeton | Connexion autorisée, deuxième utilisation refusée par la validation serveur |
| Nouveau mot de passe de 11 / 12 caractères | Refus / acceptation côté interface et serveur |
| Ancien mot de passe court | Connexion autorisée avec CAPTCHA valide |
| Script indisponible, expiration, erreur, changement de formulaire | Soumission bloquée, nouvelle tentative utilisable |
| Connexion erronée puis correcte, rechargement | Nouveau CAPTCHA exigé ; session légitime conservée au rechargement |
| Inscription depuis le navigateur | Consentement, minimum12 et jeton transmis au vrai serveur |
| Récupération | Email réel dans Mailpit local, lien, écran de réinitialisation, changement et reconnexion |
| Chargeur partagé, timeout15s, StrictMode, callback tardif | Tests unitaires dédiés |

Une revue indépendante du candidat n'a confirmé aucun contournement ni régression.
Les limites qu'elle signalait concernant le chargeur et la validation serveur ont
été complétées par les tests du chargeur et le parcours d'intégration ci-dessus.
La décision anti-robots du fournisseur Cloudflare réel n'est pas simulable par ces
tests : une vérification légitime sur le domaine de production restera nécessaire.
Les tests n'envoient aucune tentative d'attaque à un service externe.

Résultats du 30 septembre : `npm run check` réussi (TypeScript, ESLint, **509 tests
sur 73 fichiers**, compilation PWA). Les quatre scripts d'intégration quittent avec
le code0 : lot1 **8**, lot2 **11**, lot3 **8**, lot4 **7**, soit **34 contrôles**.
Le dernier lot3 est ainsi revérifié avec la finalisation partagée des médias en attente.
La compilation conserve son avertissement de taille de certains bundles (>500 ko),
sans erreur de build ; l'optimisation générale reste hors périmètre.

`npm run check` constitue le contrôle global avant commit. Les scripts des lots
1 à 3 utilisent maintenant le widget factice local pour rester exécutables avec
le frontend protégé ; leur laboratoire Auth initial demeure distinct du laboratoire
CAPTCHA, et ne constitue pas une preuve de validation CAPTCHA serveur.

## Rejouer le laboratoire du lot 4

Prérequis : laboratoire Supabase existant `cn_security_fixes_20260918`, réseau du
même nom, API sur `127.0.0.1:54321`, Mailpit sur `127.0.0.1:54324`. Le fichier
de statut local contient les clés du laboratoire et doit rester hors Git, mode0600.
Le script refuse une base ou un réseau inattendu et ne remplace pas un conteneur
existant. Docker, OpenSSL, Python3 et un navigateur Playwright sont nécessaires.

1. Exécuter avec les droits Docker `python3 tests/security/setup-captcha-lab.py
   /chemin/temporaire/neuf`. Ce script démarre seulement deux conteneurs dédiés,
   `cn_captcha_fixture_20260929` et `cn_captcha_auth_20260929`. Il copie la
   configuration du serveur local, applique minimum12/CAPTCHA, redirige les liens
   email vers le proxy local et supprime le fichier d'environnement intermédiaire.
2. Compiler avec `VITE_SUPABASE_URL=http://127.0.0.1:55431` et la clé anonyme locale
   dans `VITE_SUPABASE_ANON_KEY`. Ne jamais utiliser de clé de production.
3. Définir `LOCAL_STATUS_FILE`, `AUDIT_BUILD_DIR`, `PLAYWRIGHT_MODULE` et
   `CHROMIUM_EXECUTABLE`, puis `node tests/security/lot4-browser.mjs`.
   Le script démarre le proxy55431 et le frontend55430, puis nettoie ses comptes
   fictifs et ferme navigateur/serveurs à la fin, même en cas d'échec.
4. Arrêter et supprimer uniquement les deux conteneurs CAPTCHA nommés ci-dessus.
   Conserver la base et le laboratoire principal. Les certificats factices expirent
   après deux jours : recréer ces deux conteneurs pour un test ultérieur.

Le nom `challenges.cloudflare.com` est résolu vers le simulateur **uniquement dans
le réseau Docker du laboratoire**. La confiance du certificat est limitée au
conteneur Auth de test. Ni `/etc/hosts` ni les certificats de l'hôte ne changent.
Le fournisseur factice accepte des jetons `valid-*` à usage unique : ne jamais
déployer cette fixture ni ses paramètres dans un environnement réel.

## Activation après livraison du frontend

1. Fusionner les PR dans l'ordre choisi après revue et vérifier le déploiement
   effectif du frontend compatible sur le domaine de production. Aucune fusion
   automatique. Les PR empilées ne déclenchent pas la CI limitée actuellement à
   une base `main` ; le contrôle local est conservé et la CI devra être verte après
   changement de base avant fusion.
2. Vérifier qu'une personne peut terminer le widget, se connecter et demander un
   email de récupération. Ne pas activer le serveur si le script/widget est bloqué.
3. Renseigner la clé secrète Turnstile directement dans les réglages Supabase Auth,
   fournisseur `turnstile`, puis activer CAPTCHA et minimum de mot de passe12.
   Ne jamais copier la clé dans cette documentation ou dans une PR.
4. Vérifier les trois parcours légitimes et les réglages serveur actifs. Les essais
   malveillants restent locaux. Consigner séparément la preuve de cette bascule.

La bascule des médias privés reste celle du lot 2, après frontend compatible.
En cas d'incident média, conserver le bucket privé. MFA, audit général de santé et
autres alertes de dépendances demeurent des missions distinctes.

## Références

- [CAPTCHA Supabase](https://supabase.com/docs/guides/auth/auth-captcha)
- [Mots de passe Supabase](https://supabase.com/docs/guides/auth/password-security)
- [Widget Turnstile](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/)
- [CSP Turnstile](https://developers.cloudflare.com/turnstile/reference/content-security-policy/)
- [Confidentialité Turnstile](https://www.cloudflare.com/turnstile-privacy-policy/)
