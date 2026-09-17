# Compléter les vérifications Auth et PWA

**Exécuté le 17 septembre 2026 :** voir le [complément daté et ses preuves](COMPLEMENT-2026-09-17.md). Les procédures ci-dessous conservent le protocole prévu ; les limites et adaptations effectivement retenues sont précisées dans le complément.

## 1. Paramètres Supabase Auth hébergés

Ouvrir le projet **Carnet naturaliste** dans le [tableau de bord Supabase](https://supabase.com/dashboard/project/xowiezzqehadcfnbkijo), puis ses réglages Authentication. La connexion au tableau de bord peut être nécessaire même si le connecteur SQL fonctionne.

Relever en lecture seule :

| Réglage | Ce qu’il faut établir |
|---|---|
| Email / Password | Longueur et règles de mot de passe, protection contre les mots de passe compromis, confirmation d’email |
| Rate Limits | Valeurs effectives pour connexion, inscription, récupération et renouvellement de jeton |
| Bot Protection | CAPTCHA configuré et effectivement intégré dans les parcours concernés |
| MFA | Facteurs autorisés, possibilités d’inscription et enforcement réel dans les parcours sensibles |
| URL Configuration | Site URL et liste des redirections autorisées ; vérifier les domaines et jokers |
| Sessions | Durée des jetons, rotation des refresh tokens et éventuelles limites de session |

Pour chaque ligne, consigner la valeur, la date, sa provenance et le verdict : conforme, à durcir ou non accessible. Une option disponible dans le tableau de bord n’est pas nécessairement exigée par l’application. Les valeurs de `supabase/config.toml` ne prouvent pas les valeurs hébergées.

Une autre méthode est la lecture `GET /v1/projects/{ref}/config/auth` de la Management API, avec une connexion de gestion autorisée. Ne conserver que les champs utiles et non secrets ; aucun jeton d’administration ne doit être ajouté au dépôt. Le connecteur utilisé lors de l’audit n’exposait pas cet endpoint. Aucun changement de paramètre ni essai de force brute sur le site en ligne n’est requis pour cette revue.

Références : [Rate limits](https://supabase.com/docs/guides/auth/rate-limits), [Password security](https://supabase.com/docs/guides/auth/password-security), [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [MFA](https://supabase.com/docs/guides/auth/auth-mfa).

## 2. Cache PWA et changement d’utilisateur

Reprendre le laboratoire avec deux comptes fictifs A/B et des médias distincts. Cette fois, activer le service worker du **build de production**. Le navigateur doit confirmer qu’il contrôle la page et qu’une lecture de média alimente réellement `supabase-storage-cache`.

Attention au faux test : le motif de cache du projet attend une URL HTTPS de Storage. Tester uniquement une API HTTP locale peut ne jamais déclencher cette règle. Utiliser des origines HTTPS de test routées exclusivement vers le laboratoire, correspondant au motif compilé. Bloquer ou simuler les destinations externes au niveau réseau/proxy, y compris les requêtes émises par le service worker ; l’interception des seules requêtes de page ne suffit pas.

Scénarios :

1. A ouvre une photo et un son fictifs ; vérifier leur présence effective dans le cache et leur consultation hors ligne comme contrôle positif.
2. A se déconnecte. Examiner les caches restants et vérifier si un média précédemment ouvert peut encore être restitué sans session.
3. B se connecte dans le même profil, puis passer hors ligne. Tester l’affichage depuis les vues normales et une URL de média A déjà connue.
4. Répéter après rechargement, fermeture/réouverture de la PWA et bascule réseau. Vérifier que B conserve l’accès à ses propres médias selon le fonctionnement prévu.
5. Lors de la future privatisation, répéter avec URL signée expirée et lien révoqué : le cache ne doit pas permettre à B ou à une session déconnectée de contourner la restriction.

Consigner identité, état réseau, contrôle du service worker, provenance de chaque réponse (réseau/cache), présence de l’objet et résultat visible. Distinguer accès autorisé de A hors ligne, accès intercompte et simple conservation de données sur le disque. Un cache vide qui n’a jamais été alimenté n’est pas une preuve d’isolation.

Les reproductions A/B de l’audit initial bloquaient volontairement le service worker pour isoler le défaut d’état React ; elles restent valides mais ne couvrent pas ce scénario PWA. [Documentation des service workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers).

## Mise à jour du rapport

Ajouter un complément daté avec preuves expurgées, mettre à jour la matrice et rattacher tout nouveau constat au mécanisme concerné. Les constats déjà confirmés et les conditions du premier audit doivent rester traçables. Les corrections applicatives et les changements Supabase feront l’objet de lots séparés.
