# Reproduire les contrôles localement

Ces tests décrivent la version auditée `0041b1c1964251cb6585ce69eef6f43ceb72bc4f`. Plusieurs assertions attendent volontairement une fuite ou l’acceptation d’un fichier : elles servent à reproduire le défaut. Elles devront être inversées après correction.

Les scripts sont conservés avec un suffixe `.txt` pour que les outils TypeScript/Vitest de l’application ne les exécutent pas automatiquement. Copier uniquement les fichiers nécessaires dans le laboratoire et retirer ce suffixe avant utilisation.

## Tests ciblés sans serveur

Dans une **copie jetable** du dépôt au commit audité :

```sh
npm ci
# Copier les deux fichiers audit-*.test.ts.txt (retirer .txt) de ce dossier dans tests/.
npm run test:run -- tests/audit-account-isolation.test.ts tests/audit-injections.test.ts --maxWorkers 2
```

Les tests refusent les fetch externes. Les mocks de session/réseau servent à contrôler les entrelacements et ne prouvent pas les RLS. Voir aussi README-injections.md.

## API Supabase et navigateur

Les paramètres locaux et mots de passe fictifs ne sont pas publiés. Les conteneurs de l’audit sont arrêtés ; les recréer pour rejouer la campagne.

Pour recréer un laboratoire, préparer un dossier contenant `repo/` (copie jetable du commit) et les quatre scripts fournis. Installer Docker, Node 22 et les dépendances verrouillées. Utiliser un `project_id` distinct dans la copie, puis :

```sh
docker network create --driver bridge --opt com.docker.network.bridge.host_binding_ipv4=127.0.0.1 cn_security_audit_20260911
# Depuis repo/ ; adapter les droits Docker sans rendre son socket public.
npx --no-install supabase start --network-id cn_security_audit_20260911 --exclude analytics,vector,studio,imgproxy,realtime,meta
npx --no-install supabase status -o json > ../local-status.json
chmod 600 ../local-status.json
```

Vérifier dans `docker ps` que tous les ports publiés commencent par `127.0.0.1`. Les migrations versionnées sont appliquées automatiquement. Sur un projet neuf avec la CLI auditée, ajouter **uniquement dans la base locale** les privilèges de table observés en production :

```sql
GRANT ALL PRIVILEGES ON public.observations TO anon, authenticated;
GRANT ALL PRIVILEGES ON public.observations TO service_role;
```

Depuis le dossier parent du clone :

```sh
python3 api-tests.py local-status.json api-results.json accounts.json
```

Le script rejette une URL API non loopback, crée des comptes fictifs et détruit un compte témoin pour tester delete-account. Il conserve A/B dans `accounts.json` (0600) pour le navigateur. Ne jamais lui fournir la configuration de production. Résultat observé à l’audit : 35/36 assertions, le refus de lecture par la route média authenticated étant réfuté par le bucket public.

Pour le navigateur, générer `.env.local` **dans la copie** avec API_URL → VITE_SUPABASE_URL et ANON_KEY → VITE_SUPABASE_ANON_KEY à partir du statut local. Puis `npm run build`, lancer `python3 serve.py` depuis le dossier parent et `node browser-audit.mjs` dans un autre terminal. Le serveur écoute uniquement 127.0.0.1:3000. Il reproduit les en-têtes Vercel avec une seule exception connect-src pour le backend loopback. Le navigateur simule toutes les destinations externes et bloque le service worker pour isoler la fuite React.

Installer Playwright et Chromium dans le laboratoire (`npm install playwright`, puis `npx playwright install chromium`). Le script utilise ce paquet par défaut ; `PLAYWRIGHT_MODULE` et `CHROMIUM_PATH` permettent de désigner une installation existante. La capture ne contient que des données fictives.

Après les tests, arrêter uniquement le laboratoire : `npx --no-install supabase stop --no-backup` depuis sa copie. Cette option détruit les données fictives locales ; elle ne doit jamais viser un autre projet. Supprimer ensuite son réseau Docker dédié s’il n’a plus de conteneur.

## Recherche de secrets

```sh
python3 scan-secrets.py /chemin/du/depot secrets-results.json /chemin/du/build/dist
```

Lecture seule, motifs connus, résultats expurgés. Le script ne vérifie aucune clé en ligne. Les résultats sont des candidats à interpréter, pas une preuve exhaustive d’absence de secret.
