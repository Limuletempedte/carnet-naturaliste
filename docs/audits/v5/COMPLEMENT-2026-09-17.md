# Complément de l’audit : Supabase Auth et cache PWA

> **Archive historique, reprise de la PR #82 le 1er octobre 2026.** Les réglages
> et défauts ci-dessous décrivent le 17 septembre, avant les corrections : ils
> ne doivent pas être appliqués ni présentés comme l'état actuel. Le minimum de
> 12 caractères, le CAPTCHA et les médias privés ont été livrés ensuite.
> Voir l'[état de reprise](../../ops/ETAT-REPRISE.md) et la
> [passation vers l'audit fonctionnel](../../ops/REPRISE-AUDIT-FONCTIONNEL.md).

**Date :** 17 septembre 2026. **Révision de référence :** `cf79cebd88efb6219a428a1522e528f58d842c07`, qui ajoute l’audit v5 sans changement de code applicatif depuis `0041b1c`.

Les deux points laissés ouverts ont été examinés : réglages réels de Supabase Auth en lecture seule et comportement du cache dans un navigateur local avec service worker actif. Aucun réglage de production ni code applicatif n’a été corrigé.

## 1. Authentification hébergée : réglages désormais relevés

La session GitHub existante a permis l’accès au tableau de bord du projet **Carnet naturaliste**. Les valeurs ci-dessous proviennent des champs et interrupteurs affichés, et non du fichier de configuration local. La longueur minimale a été confirmée visuellement. Aucun bouton d’enregistrement n’a été utilisé.

| Paramètre | Valeur observée | Lecture de sécurité |
|---|---|---|
| Fournisseur email | Activé | Connexion par email/mot de passe disponible |
| Confirmation d’email | Activée | Vérification requise avant première connexion |
| Inscription publique | Autorisée | Choix fonctionnel ; prévoir des garde-fous contre les abus |
| Connexion anonyme / liaison manuelle | Désactivées | Pas d’ouverture supplémentaire sur ces voies |
| Mot de passe minimal | **6 caractères** | Minimum faible, à renforcer |
| Exigences de caractères | Aucune option sélectionnée | Ne pas confondre complexité et longueur ; privilégier des mots de passe longs |
| Mots de passe compromis | **Protection désactivée** | Option indiquée Pro ou supérieur dans l’interface |
| Changement sécurisé d’email | Activé | Confirmation des anciennes et nouvelles adresses |
| Réauthentification pour changer le mot de passe | Désactivée | Renforcer la protection des changements sensibles |
| Mot de passe actuel requis pour le changement | Désactivé | Une session autorisée suffit actuellement au flux serveur correspondant |
| CAPTCHA | **Désactivé** | Pas de garde CAPTCHA sur Auth ; son ajout doit aussi être intégré dans le site |
| Connexions/inscriptions | **30 / 5 min / IP** | Limite serveur configurée ; pas un test de charge distribué |
| Renouvellements de jetons | **150 / 5 min / IP** | Limite distincte de celle de connexion |
| Vérifications OTP/liens | **30 / 5 min / IP** | Limite serveur configurée |
| Transmission d’IP via clé secrète | Désactivée | Pas d’activation de cette faculté administrative |
| Jeton d’accès | **3 600 secondes** | Durée d’une heure avant renouvellement |
| Détection/révocation des refresh tokens compromis | Activée | Protection de rejeu configurée |
| Fenêtre de réutilisation du refresh token | **10 secondes** | Valeur recommandée affichée par la plateforme |
| Session unique | Désactivée | Plusieurs sessions possibles |
| Durée maximale / inactivité | **0 / 0 : sans expiration forcée par ces règles** | Réglages de session avancés indiqués Pro ou supérieur ; le jeton d’accès expire néanmoins après une heure |
| TOTP (application d’authentification) | Activé, maximum **10 facteurs** | API disponible ; cela n’impose pas à tous les utilisateurs d’enregistrer un facteur |
| SMS MFA | Désactivé | Option indiquée Pro ou supérieur |
| Limite des sessions AAL1 | Activée, vérification sous **15 minutes** dans le flux MFA concerné | Ne remplace pas l’inscription et le challenge MFA dans l’application |
| URL principale | `https://carnet-naturaliste.vercel.app/` | Domaine de production attendu |
| Redirections autorisées | Une seule : même URL, sans joker | Liste étroite observée |
| OTP email | **8 chiffres**, validité **3 600 secondes** | Paramètres de code/lien relevés |

**MFA : distinguer disponibilité et utilisation.** Les sources applicatives examinées ne contiennent pas de parcours `auth.mfa`, d’inscription/challenge TOTP ou d’exigence `aal2`. Le site ne doit donc pas être présenté comme protégé par une double authentification obligatoire. L’authentification du compte administrateur Supabase est distincte de celle des utilisateurs du Carnet.

Ces observations complètent l’audit ; elles ne prouvent pas qu’une attaque par force brute ou un vol de compte a réussi. Aucun essai hostile n’a été mené en production. Les valeurs complètes, chemins de pages et limites sont conservés dans `preuves/complement-2026-09-17/auth-settings.json`, sans mot de passe ni jeton.

**Actions proposées pour le lot Auth :** relever le minimum de longueur ; concevoir l’intégration CAPTCHA si souhaitée ; ajouter un parcours MFA avant toute exigence MFA côté serveur ; protéger les changements de mot de passe. Les fonctions réservées à une formule payante sont signalées comme contraintes, pas activées pendant cette vérification.

Références : [limites Supabase](https://supabase.com/docs/guides/auth/rate-limits), [sécurité des mots de passe](https://supabase.com/docs/guides/auth/password-security), [intégration et enforcement MFA](https://supabase.com/docs/guides/auth/auth-mfa).

## 2. PWA : absence de purge du cache média confirmée

**Résultat :** le cache média peut restituer des données consultées par A après sa déconnexion, puis dans la session B, hors ligne. Le risque de confidentialité locale laissé ouvert dans le premier audit est confirmé. Il complète les constats d’exposition des médias et d’isolation des comptes ; les six constats du rapport initial restent traçables sans être réécrits.

### Environnement et contrôles contre un faux positif

- Bundle réel de l’application et service worker Workbox généré par sa configuration **non modifiée**. Empreinte SHA-256 du worker enregistrée dans les résultats.
- Page servie sur `127.0.0.1:3107`, contexte sécurisé reconnu pour le développement local. En-têtes de `vercel.json` conservés.
- URL HTTPS fictive `audit.supabase.co` injectée à la compilation, qui correspond exactement au motif de cache Storage et à la CSP. Aucun appel n’est envoyé à ce domaine.
- Auth, API et médias simulés par des fixtures, y compris les requêtes **émises par le service worker**. Toutes les autres destinations sont bloquées ; la résolution réseau du navigateur est limitée à la boucle locale. Aucun contournement de certificat TLS.
- État réseau hors ligne appliqué au navigateur ; `navigator.onLine=false` constaté. Un média jamais mis en cache échoue alors que le média témoin déjà chargé fonctionne.
- Profil de navigateur dédié et persistant fermé puis rouvert, afin de distinguer le cache persistant d’une simple image encore présente en mémoire.

La simulation d’Auth sert seulement à faire exécuter les véritables chemins de connexion/déconnexion du client avec A et B. Elle **ne valide pas l’authentification ni les RLS du serveur réel** : ces protections ont été examinées séparément lors du premier audit.

### Scénarios

1. Confirmer le contrôle de la page par le service worker, puis charger une image et les octets d’un son de A.
2. Vérifier leur présence dans `supabase-storage-cache`, puis leur disponibilité hors ligne comme A et l’échec d’un témoin non caché.
3. Déconnecter A ; vérifier la restitution d’un média A sans session, réseau coupé.
4. Connecter B, charger ses propres médias comme contrôle positif, puis vérifier les URL connues de A hors ligne.
5. Recharger la page, fermer et rouvrir le profil B hors ligne ; vérifier la provenance service worker des réponses et l’affichage de l’image A.

La campagne finale comporte **17 assertions : 10 contrôles et 7 reproductions du défaut**, toutes conformes au comportement attendu pour ce test.

Les résultats détaillés distinguent les contrôles positifs des assertions qui reproduisent volontairement le défaut. **Un test de reproduction réussi ne signifie pas que le produit est sécurisé.**

### Nuances de mesure

Les images chargées sans CORS peuvent être conservées comme réponses `opaque` de statut 0. Un `fetch` CORS de ces mêmes images peut échouer, alors qu’un élément `img` les affiche. Ce refus de lecture par `fetch` n’est donc pas une preuve d’isolation des comptes. Le protocole final utilise un véritable élément image pour mesurer l’affichage.

La CSP actuelle ne déclare pas de `media-src` autorisant Supabase : la lecture native d’un audio externe est bloquée par le repli sur `default-src 'self'`. Le test du son porte sur ses **octets récupérables par fetch depuis le cache**, pas sur une lecture audible dans un élément `audio`. Ce point fonctionnel devra être repris séparément ; la CSP n’a pas été assouplie pour faire passer le test.

### Cause, portée et correction proposée

`vite.config.ts` définit un cache commun `supabase-storage-cache` avec 50 entrées et 30 jours. Le chemin de déconnexion nettoie certaines clés `localStorage`, mais ne purge pas ce Cache Storage. Les réponses gardées par Workbox ne sont pas liées à la session qui les a obtenues.

La restitution testée nécessite le **même profil de navigateur**, un média déjà consulté et une requête vers son URL connue depuis une page contrôlée par la PWA. La sonde de test qui affiche l’URL est explicitement instrumentée ; cela ne démontre pas que la galerie normale de B énumère spontanément tous les médias de A. Aucune lecture distante des données de production ni contournement des RLS n’est revendiqué.

**Correction à inclure dans le lot médias/comptes :** définir une politique de conservation hors ligne par propriétaire, purger ou rendre inaccessibles les médias au changement d’identité et à la déconnexion, puis vérifier le cas des anciens liens lors de la privatisation du bucket. L’accès légitime de A hors ligne doit rester testé avant sa déconnexion.

**Reste à tester lors de cette correction :** expiration/révocation de futures URL signées, Safari/iOS et installation PWA sur mobile. Ces variantes ne sont pas présentées comme exécutées ici. Le test actuel couvre le navigateur Chromium de ce poste et le mécanisme de cache réellement compilé.

Références : [routage des requêtes de service workers dans Playwright](https://playwright.dev/docs/service-workers), [fonctionnement des service workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers).

## Suite

Les vérifications complémentaires sont documentées ; les corrections restent à réaliser dans des lots séparés. Les réglages Supabase et le code du site sont inchangés. Les pièces jointes ne contiennent que des métadonnées de configuration non secrètes et des données fictives.
