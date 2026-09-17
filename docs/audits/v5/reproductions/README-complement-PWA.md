# Rejouer le test PWA du 17 septembre

Test local uniquement. Le site compilé et son service worker sont réels ; le transport Auth/API/médias est simulé. Ce test ne démontre pas les permissions du backend. Il reproduit volontairement l’absence de purge des médias, donc des assertions réussies décrivent un défaut.

1. Préparer un dossier `laboratoire/` avec une copie du dépôt au commit `cf79cebd88efb6219a428a1522e528f58d842c07` dans `laboratoire/audit-complements/` et un dossier `laboratoire/auth-pwa/`.
2. Dans la copie du dépôt, installer les dépendances verrouillées avec `npm ci`, puis compiler avec ces valeurs **fictives** :

```sh
VITE_SUPABASE_URL=https://audit.supabase.co VITE_SUPABASE_ANON_KEY=placeholder-local-pwa npm run build
```

3. Copier `complement-pwa-tests.mjs.txt` dans `auth-pwa/pwa-tests.mjs` et `complement-serve.py.txt` dans `auth-pwa/serve.py`.
4. Installer Playwright dans `auth-pwa` (`npm install playwright` puis `npx playwright install chromium`), ou indiquer un module et un navigateur existants avec `PLAYWRIGHT_MODULE` et `CHROMIUM_PATH`.
5. Lancer `python3 auth-pwa/serve.py`, puis dans un autre terminal `node auth-pwa/pwa-tests.mjs`.

Le serveur écoute uniquement sur `127.0.0.1:3107`. Le navigateur utilise un profil neuf. Le script intercepte les requêtes des pages **et du service worker**, sert les fixtures de `audit.supabase.co` sans connexion TLS réelle et bloque les autres hôtes. Il n’a besoin ni de Docker ni de compte Supabase réel. Aucun contournement de certificat n’est utilisé.

Résultat observé : **17 assertions satisfaites**, dont 10 contrôles et 7 reproductions du défaut. Vérifier également que le JSON ne contient aucune erreur de runner et que tous les champs `ok` valent `true` : le code de sortie seul ne suffit pas pour les assertions de catégorie `finding`.

Les images sont vérifiées via un élément `img`, car une réponse opaque en cache peut être affichable sans pouvoir être lue avec un fetch CORS. L’audio est vérifié par ses octets récupérés via fetch ; la CSP actuelle n’autorise pas sa lecture native distante.

Les fichiers générés `pwa-results.json`, `pwa-tests.log` si redirigé, et `pwa-b-offline.png` utilisent uniquement des identités et médias fictifs. Les dossiers `browser-profile-*` sont jetables et ne doivent pas être versionnés. Le script ferme son navigateur ; arrêter ensuite le serveur Python et supprimer uniquement ces profils de test si souhaité.

Le worker testé est conservé dans `../preuves/complement-2026-09-17/sw-tested.js.txt` ; son empreinte est enregistrée dans le JSON de résultats. Son contenu dépend des chemins de build et de la version verrouillée : vérifier la règle HTTPS Storage et le cache ciblé lors d’une adaptation à une autre version.
