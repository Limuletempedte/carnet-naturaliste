# Assistant IA — exploitation

Plans validés : [`assistant-ia-phase1.md`](../plans/assistant-ia-phase1.md)
(aide à l'identification par photo) et
[`assistant-ia-phases-2-4.md`](../plans/assistant-ia-phases-2-4.md)
(fonctionnalités texte : bilan du mois, puis note → fiche et recherche).
Ce document dit **comment mettre en service, gérer et couper** l'assistant.
Les sections 1 à 5 décrivent le socle et la photo ; la section 6, la fonction
texte `ai-text`.

| Élément | Fichier |
|---|---|
| Tables, droits, fonctions SQL | `supabase/migrations/20261105161500_ai_identification.sql` (socle, photo) et `supabase/migrations/20261106220000_ai_text_features.sql` (consentements texte, `ai_reserve_call` à 6 arguments) |
| Retour arrière SQL du lot texte | `docs/ops/retour-arriere-ai-text-features.sql` (hors `migrations/`, voir §6.6) |
| Fonctions Edge | `supabase/functions/ai-identify/` (photo) et `supabase/functions/ai-text/` (texte) : `index.ts` (appel) et `logic.ts` (règles) |
| Réglage `verify_jwt` | `supabase/config.toml`, sections `[functions.ai-identify]` et `[functions.ai-text]` |
| Application | `services/aiAssistService.ts`, `components/AiAccessDialog.tsx` (point central « Assistant IA » : accès, compteur, consentements), `components/AiButton.tsx` (bouton IA commun), `components/AiConsentCard.tsx` (accord au premier usage), `components/AiIdentificationPanel.tsx`, bouton dans `components/ObservationForm.tsx`, entrée du menu du compte ; bilan du mois : `utils/monthlySummaryStats.ts` (chiffres), `components/MonthlySummaryCard.tsx` (onglet Stats), `services/monthlySummaryCache.ts` (bilans gardés dans le navigateur, purge des expirés) |
| Tests unitaires | `tests/aiIdentifyLogic.test.ts`, `tests/aiTextLogic.test.ts`, `tests/aiAssistService.test.ts`, `tests/AiAccessDialog.test.tsx`, `tests/AiIdentificationPanel.test.tsx`, `tests/observationFormAiAssist.test.tsx`, `tests/AiButton.test.tsx`, `tests/AiConsentCard.test.tsx`, `tests/MonthlySummaryCard.test.tsx`, `tests/monthlySummaryStats.test.ts`, `tests/monthlySummaryCache.test.ts`, `tests/aiColorContrast.test.ts` (lancés par `npm run check`) |
| Tests de sécurité locaux | `tests/security/ai-access-rls.mjs` (Supabase local) et `tests/security/ai-text-bench.mjs` (`ai-text` seule, sans Supabase) |

En bref : une personne **demande** l'accès (ligne `pending` dans `ai_access`),
le propriétaire **approuve à la main** dans le tableau de bord Supabase. Chaque
analyse est d'abord **réservée** (accès, consentement, quota de 20 par mois,
budget du mois), puis le coût réel est écrit dans `ai_usage`. La photo et
les fonctionnalités texte partagent l'accès, le quota de 20 utilisations par
mois et le budget ; chaque fonctionnalité texte demande en plus son propre
consentement (table `ai_consents`).

---

## 1. Mise en service (une seule fois)

### 1.1 Console Anthropic

1. Créer un **espace de travail dédié** au Carnet, avec un plafond de dépense
   mensuel de **20 $**. Le plafond ne se règle pas sur l'espace par défaut.
2. Créer un **second espace de travail** pour les essais, plafonné à 2–5 $.
3. Créer une clé API dans chacun. Les noter **uniquement** dans le
   gestionnaire de mots de passe : jamais dans un fichier, un terminal ou une
   conversation.

Quand le plafond est atteint, l'API refuse les appels : la fonction répond
alors `upstream_unavailable` (aucune analyse comptée à l'utilisateur).

### 1.2 Migration

La CLI Supabase est fournie par le projet (`npx supabase`, version figée dans
`package-lock.json`) : rien à installer. Sur un poste neuf, la connecter puis
relier le dossier au projet (le mot de passe de la base peut être demandé : le
taper soi-même ; **ne pas le réinitialiser** sans mettre à jour le secret GitHub
`SUPABASE_DB_URL` de la sauvegarde hebdomadaire, dans le dépôt privé
`carnet-naturaliste-sauvegardes`) :

```bash
npx supabase login
```

```bash
npx supabase link --project-ref xowiezzqehadcfnbkijo
```

Puis, depuis le dossier du projet :

```bash
npx supabase migration list --linked
```

```bash
npx supabase db push --linked --dry-run
```

Le `--dry-run` doit lister **exactement un** fichier :
`20261105161500_ai_identification.sql`. Si ce n'est pas le cas, s'arrêter.

```bash
npx supabase db push --linked
```

Ne jamais utiliser `--include-all` ni `db reset --linked`. Ne pas appliquer la
migration par le tableau de bord ni par l'outil MCP `apply_migration` : ils
enregistrent un autre horodatage (voir
[`REGULARISATION-MIGRATIONS-2026-10-01.md`](./REGULARISATION-MIGRATIONS-2026-10-01.md)).

### 1.3 Vérifications en lecture seule (éditeur SQL du tableau de bord)

```sql
select
  has_table_privilege('authenticated', 'public.ai_access', 'UPDATE')        as maj_acces,          -- faux
  has_column_privilege('authenticated', 'public.ai_access', 'status', 'INSERT') as choisir_statut, -- faux
  has_table_privilege('authenticated', 'public.ai_usage', 'DELETE')         as effacer_journal,    -- faux
  has_table_privilege('anon', 'public.ai_access', 'SELECT')                 as anon_lit,           -- faux
  has_function_privilege('authenticated', 'public.ai_reserve_call(uuid, text, text, numeric, numeric, text)', 'EXECUTE') as reserver,  -- faux
  has_function_privilege('authenticated', 'public.ai_finalize_call(uuid, text, integer, integer, numeric)', 'EXECUTE') as finaliser, -- faux
  has_function_privilege('anon', 'public.ai_my_status()', 'EXECUTE')        as anon_statut,        -- faux
  has_function_privilege('authenticated', 'public.ai_my_status()', 'EXECUTE') as statut;           -- vrai
```

Tout doit être **faux** sauf la dernière colonne. La signature à 6 arguments
de `ai_reserve_call` est celle posée par la migration texte ; avant elle,
c'était `(uuid, text, text, numeric, numeric)`. Les contrôles propres au lot
texte (`ai_consents`, version unique de `ai_reserve_call`) sont au §6.2. Puis
ouvrir *Advisors → Security* dans le tableau de bord : aucune alerte nouvelle
sur `ai_access`, `ai_usage`, `ai_consents` ou les trois fonctions.

### 1.4 Secrets de la fonction

À saisir dans le tableau de bord : *Edge Functions → Secrets*. Jamais dans le
terminal (l'historique les garderait) ni dans une conversation.

| Secret | Valeur | Rôle |
|---|---|---|
| `ANTHROPIC_API_KEY` | clé de l'espace de travail dédié | appel à Claude |
| `AI_MODEL` | `claude-sonnet-5-5` | modèle ; `claude-haiku-5-5` possible |
| `AI_EFFORT` | `low` ou `medium` | **obligatoire**, choisi après l'essai réel |
| `AI_MONTHLY_BUDGET_USD` | `18` | budget du mois ; `0` coupe l'assistant |
| `ALLOWED_ORIGINS` | `https://carnet-naturaliste.vercel.app` | sites autorisés, séparés par des virgules |
| `AI_TEXT_MODEL` | `claude-sonnet-5-5` ou `claude-haiku-5-5` | modèle des fonctionnalités texte (`ai-text`) ; **obligatoire**, sans valeur par défaut |
| `AI_DISABLED_FEATURES` | ex. `summary` ; absent = rien de coupé | fonctionnalités texte coupées, séparées par des virgules (`summary`, `note`, `search`) |

Les secrets valent pour **tout le projet** : `ANTHROPIC_API_KEY`, `AI_EFFORT`,
`AI_MONTHLY_BUDGET_USD` et `ALLOWED_ORIGINS` servent aux deux fonctions, et le
budget est commun (somme `cost_usd` du mois, toutes fonctionnalités).

Chaque fonction **refuse de tourner** (`misconfigured`) si son modèle n'a pas
de prix connu dans son `logic.ts`, si l'effort n'est pas `low` ou `medium`, ou
si le budget est illisible ; `ai-text` aussi si `AI_TEXT_MODEL` est absent ou
si `AI_DISABLED_FEATURES` contient un nom inconnu (faute de frappe). Aucun nom de secret ne doit commencer par `SUPABASE_` ni
par `VITE_`. `ANTHROPIC_BASE_URL` ne sert qu'aux tests locaux : ne jamais le
définir en production.

### 1.5 Déploiement

`--use-api` fait préparer la fonction par Supabase : Docker n'est pas nécessaire.

```bash
npx supabase functions deploy ai-identify --use-api
```

La fonction texte se déploie de la même façon (voir §6.2) :
`npx supabase functions deploy ai-text --use-api`.

`verify_jwt = true` est lu dans `supabase/config.toml` : la plateforme refuse
déjà toute requête sans jeton, et chaque fonction vérifie elle-même l'utilisateur.

Contrôle sans frais (aucun jeton, aucune photo, aucun appel à Claude) : un
`POST` sans jeton doit répondre **401** ; une requête préalable CORS (`OPTIONS`)
depuis `https://carnet-naturaliste.vercel.app` doit répondre **204** avec
`access-control-allow-origin` ; depuis une autre origine, **403**.

Pour vérifier les secrets sans les afficher, `npx supabase secrets list` donne
l'empreinte SHA-256 de chaque valeur : la comparer à celle de la valeur attendue
(`printf '%s' 'claude-sonnet-5-5' | sha256sum`). Ne jamais le faire pour
`ANTHROPIC_API_KEY`.

### 1.6 Premier essai

1. S'approuver soi-même (section 2), puis lancer une analyse depuis le site.
2. Contrôler la ligne dans `ai_usage` (statut `ok`, tokens, coût) et la
   dépense affichée dans la Console Anthropic.

---

## 2. Gérer les demandes (éditeur SQL du tableau de bord)

Le propriétaire n'est pas prévenu automatiquement : la personne envoie un
e-mail après sa demande.

**Demandes en attente** — vérifier que `consent_version` vaut bien la version
en vigueur (`CONSENT_VERSION` dans `logic.ts`, aujourd'hui `2026-11-v1`) :

```sql
select a.user_id, u.email, a.consent_version, a.requested_at
from public.ai_access a join auth.users u on u.id = a.user_id
where a.status = 'pending'
order by a.requested_at;
```

**Approuver** (remplacer l'adresse) :

```sql
update public.ai_access
set status = 'approved', decided_at = now(), note = null
where user_id = (select id from auth.users where email = 'personne@exemple.fr');
```

**Refuser** ou **révoquer** — la note est **lue par la personne** : rester
neutre et poli.

```sql
update public.ai_access
set status = 'refused', decided_at = now(), note = 'Accès limité pour le moment.'
where user_id = (select id from auth.users where email = 'personne@exemple.fr');
-- Révoquer : même requête avec status = 'revoked'.
```

**Changer le quota d'une personne** (20 par défaut, entre 0 et 1 000) :

```sql
update public.ai_access set monthly_quota = 40
where user_id = (select id from auth.users where email = 'personne@exemple.fr');
```

**Dépense du mois** (à comparer avec la Console ; les lignes `pending` comptent
pour leur coût maximum, environ 0,043 $) :

```sql
select status, count(*) as appels, sum(cost_usd) as dollars
from public.ai_usage
where created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
group by rollup (status);
```

**Usage par personne ce mois-ci** :

```sql
select u.email, count(*) filter (where g.status <> 'failed') as analyses, sum(g.cost_usd) as dollars
from public.ai_usage g left join auth.users u on u.id = g.user_id
where g.created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
group by u.email order by analyses desc;
```

**Usage par fonctionnalité ce mois-ci** (`identify` = photo, `summary` =
bilan, `note`, `search`) :

```sql
select feature, status, count(*) as appels, sum(cost_usd) as dollars
from public.ai_usage
where created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
group by rollup (feature, status)
order by feature, status;
```

**Consentements texte donnés** (une ligne par personne et par fonctionnalité) :

```sql
select u.email, c.feature, c.version, c.given_at
from public.ai_consents c join auth.users u on u.id = c.user_id
order by u.email, c.feature;
```

Une personne qui retire son accord supprime sa ligne `ai_access` ; si elle
redemande, elle revient `pending`. Son compteur du mois, lui, ne bouge pas.
Retirer l'accès photo ne retire pas ses consentements texte (ils restent
inutiles tant que l'accès n'est pas de nouveau approuvé) ; ils disparaissent
quand elle les retire un par un ou supprime son compte.

---

## 3. Réglages courants

- **Changer de modèle ou d'effort** : modifier `AI_MODEL` ou `AI_EFFORT` dans
  les secrets, puis redéployer la fonction. Un nouveau modèle doit d'abord
  avoir son prix dans `MODEL_PRICES_USD_PER_MTOK` (`logic.ts`), sinon la
  fonction refuse tout.
- **Couper l'assistant immédiatement** : `AI_MONTHLY_BUDGET_USD` = `0`, puis
  redéployer **les deux** fonctions. Tous les appels sont refusés avec
  `budget_exhausted`.
- **Couper une seule fonctionnalité texte** : l'ajouter à
  `AI_DISABLED_FEATURES` (ex. `summary`), puis redéployer `ai-text`. Elle
  répond `feature_disabled` ; la photo et les autres continuent.
- **Changer de clé** : créer la nouvelle clé dans la Console, remplacer
  `ANTHROPIC_API_KEY`, redéployer, vérifier une analyse, puis **désactiver
  l'ancienne clé** dans la Console.
- **Changer le texte du consentement** (`AiConsentText` dans
  `components/AiAccessDialog.tsx`) : changer `CONSENT_VERSION` côté fonction
  (`logic.ts`) **et** `AI_CONSENT_VERSION` côté application
  (`services/aiAssistService.ts`) ; un test vérifie qu'elles sont égales.
  Mettre à jour les textes légaux si le fond change. Les accès existants sont
  alors refusés (`consent_outdated`) : chacun voit « Renouveler mon accord »,
  puis repasse en attente de validation.
- **Changer le texte d'un consentement texte** : changer la version de cette
  fonctionnalité dans `CONSENT_VERSIONS` (`supabase/functions/ai-text/logic.ts`)
  **et** côté application (`AI_TEXT_CONSENT_VERSIONS`, livrée en PR B), puis
  redéployer `ai-text`. Seule cette fonctionnalité redemande l'accord ;
  l'approbation (`ai_access`) n'est pas touchée.

---

## 4. Comment la fonction décide

Ordre : CORS → identité → photo (JPEG, 2 Mo et 1 280 px au plus) →
configuration → réservation → appel à Claude → coût réel → réponse.

| Code renvoyé | HTTP | Sens |
|---|---|---|
| `unauthenticated` | 401 | pas connecté |
| `origin_not_allowed` | 403 | site absent de `ALLOWED_ORIGINS` |
| `not_approved` / `consent_outdated` | 403 | pas d'accès, ou consentement à renouveler |
| `payload_too_large` | 413 | corps de plus de 2 Mo |
| `invalid_image` / `invalid_request` | 400 | pas un JPEG valide, photo trop grande, contexte invalide |
| `busy` | 429 | une analyse est déjà en cours (moins de 3 minutes) |
| `quota_exceeded` | 429 | 20 analyses ce mois-ci |
| `budget_exhausted` | 503 | budget du mois atteint, ou assistant coupé |
| `misconfigured` | 503 | secret manquant ou invalide |
| `upstream_unavailable` | 503 | Claude indisponible ou plafond de la Console atteint |
| `model_refused` | 422 | Claude a refusé de répondre |
| `invalid_output` | 502 | réponse inexploitable |

**Ce qui compte dans le quota** : toutes les analyses du mois (UTC) sauf les
échecs `failed` (Claude indisponible, réseau). Un refus ou une réponse
inexploitable compte, car Claude l'a facturée.

**Ce qui compte dans le budget** : la somme `cost_usd` du mois, comptes
supprimés compris. Une ligne restée `pending` (fonction coupée) garde le coût
maximum. Une coupure après 50 s d'attente est enregistrée `failed` au coût
maximum, car Anthropic a pu la facturer.

**Conservation** : les lignes de `ai_usage` de plus de 3 mois sont effacées à
chaque nouvelle réservation. Supprimer un compte supprime sa ligne
`ai_access` et rend anonymes ses lignes `ai_usage` (le budget ne baisse pas).

**Journaux** de la fonction : id de la ligne d'usage, statut, modèle, tokens,
coût, type d'erreur. Jamais l'utilisateur, la photo, le prompt ni les
hypothèses. Règles propres à `ai-text` : §6.5.

---

## 5. Vérification locale

Sur un Supabase **local** uniquement (le script refuse toute autre adresse),
les deux migrations appliquées (`supabase db reset`) :

```bash
LOCAL_STATUS_FILE=/chemin/local-status.json \
POSTGRES_MODULE=/chemin/node_modules/postgres/src/index.js \
DENO_BIN=$(command -v deno) \
node tests/security/ai-access-rls.mjs
```

- `LOCAL_STATUS_FILE` : sortie de `supabase status -o json`, jamais versionnée.
- `POSTGRES_MODULE` (facultatif) : paquet npm `postgres`, pour les contrôles
  `has_*_privilege`.
- `DENO_BIN` (facultatif) : lance `ai-identify` puis `ai-text` sur le port
  8000 avec un **faux serveur Anthropic** local (port 55440) ; aucune clé
  réelle, aucun appel payant.

Le script couvre aussi le lot texte : droits et RLS de `ai_consents`,
réservation à 6 arguments, consentement par fonctionnalité, anti double-clic
par fonctionnalité, quota partagé, `feature` enregistrée, `ai-identify`
inchangée sur la base migrée, une seule version de `ai_reserve_call`, et
`ai-text` de bout en bout (401, CORS, 413, 400, `feature_disabled`,
`misconfigured`, coût réel, journaux sans texte saisi).

**Sans Supabase local ni Docker**, un banc plus léger fait tourner `ai-text`
seule contre un faux Supabase et un faux serveur Anthropic (enchaînement de
`index.ts`, arguments de la réservation, appel envoyé à Claude, finalisation,
codes d'erreur, journaux) :

```bash
DENO_BIN=$(command -v deno) node tests/security/ai-text-bench.mjs
```

Le script crée ses comptes de test par l'API d'administration locale et les
supprime à la fin.

---

## 6. Fonctions texte (`ai-text`)

Une seule fonction pour les trois fonctionnalités texte, choisie par le champ
`feature` du corps : `summary` (bilan du mois, livré en premier), puis `note`
et `search`. `ai-identify` n'est **pas** modifiée : un défaut côté texte ne
peut pas casser la photo.

### 6.1 Ce que change la migration `20261106220000_ai_text_features.sql`

- `ai_usage.feature` accepte `identify`, `summary`, `note` et `search`.
- Nouvelle table `ai_consents` : une ligne par personne et par fonctionnalité
  texte (`version`, `given_at` posé par le serveur). L'utilisateur peut la
  lire, la supprimer (retrait) et l'insérer pour lui seul ; jamais la
  modifier. Supprimée avec le compte.
- `ai_reserve_call` reçoit un 6ᵉ argument `p_feature` (`identify` par
  défaut) : consentement de la fonctionnalité exigé, anti double-clic par
  fonctionnalité, quota et budget toujours communs. L'`ai-identify` en service
  continue de fonctionner sans redéploiement.
- `ai_my_status()` ajoute `used_by_feature` (détail du compteur) et
  `consents` (versions acceptées). Les champs existants sont inchangés.

C'est la **seule** migration des phases 2 à 4 : la note et la recherche n'en
auront pas.

### 6.2 Mise en production du lot (propriétaire, dans l'ordre)

1. **Repère de retour arrière** : poser le tag `ai-identify-v1` sur la
   version d'`ai-identify` en service (commit `a8cddfa`, le seul qui ait
   modifié ce dossier) :

   ```bash
   git tag ai-identify-v1 a8cddfa
   ```

   ```bash
   git push origin ai-identify-v1
   ```

2. **Migration** (même règles qu'au §1.2) :

   ```bash
   npx supabase migration list --linked
   ```

   ```bash
   npx supabase db push --linked --dry-run
   ```

   Le `--dry-run` doit lister **exactement un** fichier :
   `20261106220000_ai_text_features.sql`. Sinon, s'arrêter.

   ```bash
   npx supabase db push --linked
   ```

3. **Vérifications en lecture seule** (éditeur SQL), en plus du §1.3 :

   ```sql
   select
     has_table_privilege('anon', 'public.ai_consents', 'SELECT')                     as anon_lit,          -- faux
     has_table_privilege('authenticated', 'public.ai_consents', 'UPDATE')            as modifier,          -- faux
     has_column_privilege('authenticated', 'public.ai_consents', 'given_at', 'INSERT') as choisir_date,    -- faux
     has_table_privilege('authenticated', 'public.ai_consents', 'TRUNCATE')          as vider,             -- faux
     has_function_privilege('anon', 'public.ai_reserve_call(uuid, text, text, numeric, numeric, text)', 'EXECUTE') as anon_reserver, -- faux
     has_function_privilege('service_role', 'public.ai_reserve_call(uuid, text, text, numeric, numeric, text)', 'EXECUTE') as service_reserver, -- vrai
     (select count(*) from pg_proc where proname = 'ai_reserve_call' and pronamespace = 'public'::regnamespace) as versions_reserver; -- 1
   ```

   Puis *Advisors → Security* : aucune alerte nouvelle. Enfin, faire une
   analyse photo depuis le site : elle doit marcher comme avant (ligne
   `ai_usage` avec `feature = 'identify'`).

4. **Secrets** (*Edge Functions → Secrets*, jamais dans un terminal ni une
   conversation) : `AI_TEXT_MODEL` (valeur provisoire jusqu'à l'essai du §6.3,
   par exemple `claude-haiku-5-5`) et `AI_DISABLED_FEATURES` = `summary` tant
   que l'application (PR B) n'est pas en ligne : la fonction est alors
   déployée mais fermée.

5. **Déploiement** puis contrôles sans frais :

   ```bash
   npx supabase functions deploy ai-text --use-api
   ```

   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' -X POST https://xowiezzqehadcfnbkijo.supabase.co/functions/v1/ai-text
   ```

   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' -X OPTIONS -H 'Origin: https://carnet-naturaliste.vercel.app' -H 'Access-Control-Request-Method: POST' https://xowiezzqehadcfnbkijo.supabase.co/functions/v1/ai-text
   ```

   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' -X OPTIONS -H 'Origin: https://pirate.example' -H 'Access-Control-Request-Method: POST' https://xowiezzqehadcfnbkijo.supabase.co/functions/v1/ai-text
   ```

   Attendu : **401**, **204**, **403**. Ce premier déploiement éprouve aussi
   `--use-api` sans aucun risque. Le 401 ne prouve pas à lui seul que
   `verify_jwt` est actif (la fonction refuse aussi d'elle-même) : vérifier
   dans le tableau de bord (*Edge Functions → ai-text → Details*) que
   « Verify JWT » est activé.

### 6.3 Essai et choix du modèle (avant la PR B)

**Outil** : `tests/security/ai-text-trial.mjs`. Il appelle l'API Anthropic avec
les prompts, le schéma, le plafond de sortie et la validation de la fonction
(importés de `logic.ts`), sans passer par Supabase : ni quota, ni consentement.
Les appels sont **payants** : utiliser la clé de l'espace d'**essai** (plafond
de 5 $), jamais celle de la production.

1. **Clé d'essai**, dans un fichier hors du dépôt
   (`~/.config/carnet-naturaliste/essai.env`). Pour la saisir sans qu'elle
   passe par l'historique du terminal (zsh), lancer cette commande **seule**,
   puis coller la clé **quand l'invite apparaît** (rien ne s'affiche pendant le
   collage) :

   ```bash
   read -rs "CLE?Colle la clé puis Entrée : "; echo; if [[ $CLE == sk-ant-* ]]; then mkdir -p ~/.config/carnet-naturaliste && printf '%s=%s\n' ANTHROPIC_API_KEY "$CLE" > ~/.config/carnet-naturaliste/essai.env && chmod 600 ~/.config/carnet-naturaliste/essai.env && echo "OK : clé de ${#CLE} caractères enregistrée."; else echo "Raté : ce qui a été collé ne ressemble pas à une clé."; fi; unset CLE
   ```

   > ⚠️ Une clé collée sur la ligne de commande elle-même part en clair dans
   > `~/.zsh_history` : la révoquer dans la Console, en créer une autre, et
   > retirer la ligne de l'historique.

2. **Essai à blanc** (aucun appel, aucune clé) : valide les entrées et affiche
   le coût maximum.

   ```bash
   deno run --no-config --allow-env --allow-read tests/security/ai-text-trial.mjs --feature summary --inputs tests/security/fixtures/ai-text-trial-summary.json --dry-run
   ```

3. **Essai réel**. Le dossier `--out` reste hors du dépôt : les textes citent
   les espèces des entrées.

   ```bash
   deno run --no-config --env-file="$HOME/.config/carnet-naturaliste/essai.env" --allow-env --allow-net=api.anthropic.com --allow-read --allow-write tests/security/ai-text-trial.mjs --feature summary --inputs tests/security/fixtures/ai-text-trial-summary.json --out "$HOME/essai-ai-text"
   ```

   Le script annonce le coût maximum avant le premier appel et refuse de
   démarrer au-delà de `--max-usd` (1 $ par défaut). `--models` limite l'essai
   à certains modèles. Il écrit `resultats.json` et `rapport.md` (tableau, puis
   les textes de chaque modèle, à **lire** : la validation ne voit pas tout).

**Entrées** : `tests/security/fixtures/ai-text-trial-summary.json` contient 12
mois inventés (mois vide, saisons, mois en cours, plafonds atteints, consignes
cachées dans des noms d'espèces). On peut y ajouter ses **propres** mois réels,
dans un second fichier hors du dépôt (`--inputs a.json,b.json`). Ne jamais
utiliser les observations d'un autre compte.

#### Essai du 13 novembre 2026 : bilan du mois

15 entrées (les 12 inventées et 3 mois réels du propriétaire), effort `low`.

| | Sonnet 5.5 | Haiku 5.5 |
|---|---|---|
| Réponses acceptées par la validation | 15 sur 15 | 15 sur 15 |
| **Bilans faux ou cassés, à la lecture** | **0** | **2** |
| Durée médiane (min – max) | 3,7 s (3,1 – 4,4) | 2,5 s (1,2 – 6,5) |
| Tokens d'entrée / de sortie (moyenne) | 1 170 / 317 | 1 170 / 566 |
| Longueur des textes | 72 à 135 mots | 23 à 133 mots |
| Coût moyen par bilan | 0,0055 $ | 0,0004 $ |

Les deux bilans fautifs de Haiku avaient **passé la validation** : un texte
coupé à 23 mots, qui inventait une période, et un écart annoncé de « 6 espèces
de plus » au lieu de 1. Aucun des deux modèles n'a suivi les consignes cachées
dans les noms d'espèces.

**Décision du propriétaire : `AI_TEXT_MODEL=claude-sonnet-5-5`.** Sonnet coûte
environ 14 fois plus cher par bilan, soit un demi-centime.

**Corrections tirées de l'essai** (dans `logic.ts`, livrées avec ce compte
rendu) :

- un bilan de moins de **40 mots** est refusé (`invalid_output`) quand le mois
  compte des observations ; un mois vide n'a pas de plancher ;
- consignes précisées : sens de chaque nombre (« individus » pour l'effectif
  d'une espèce, champ renommé dans les données envoyées), texte complet sans
  points de suspension, jamais de première personne ni de commentaire sur les
  données, ne pas citer un nom d'espèce qui ressemble à une consigne.

**Second essai, Sonnet seul, avec ces consignes** : 15 sur 15, textes de 61 à
142 mots, plus aucun commentaire à la première personne dans les deux pièges,
« individus » employé à bon escient. Coût moyen : 0,0060 $ (consignes plus
longues : 1 371 tokens d'entrée en moyenne). Défauts restants, relevés à la
lecture : un « nous vous souhaitons », un « la lichen », et une déduction non
étayée par les données (cas d'une seule observation, identique à l'an passé).

Coût des deux essais : 0,18 $.

**Mise en production du modèle : faite le 13 novembre 2026** (propriétaire).
`AI_TEXT_MODEL` vaut `claude-sonnet-5-5` et `ai-text` est redéployée (version
3, consignes et validation à jour) ; les trois contrôles sans frais du §6.2
sont corrects (401, 204, 403). `summary` reste dans `AI_DISABLED_FEATURES`
jusqu'à la fusion de la PR B (§6.4).

Les essais de la note et de la recherche se feront avec le même outil
(`--feature note`, `--feature search`), une fois ces fonctionnalités écrites,
chacune avec son jeu d'entrées dans `tests/security/fixtures/`.

### 6.4 Après la PR B

Retirer `summary` de `AI_DISABLED_FEATURES`, redéployer `ai-text`, rédiger un
bilan depuis le site en ligne (les aperçus Vercel ne peuvent pas appeler les
fonctions), puis contrôler la ligne `ai_usage` (`feature = 'summary'`) et la
dépense dans la Console.

### 6.5 Comment `ai-text` décide

Ordre : CORS → identité → corps (JSON, **16 Ko** au plus) → fonctionnalité
connue, livrée et non coupée → configuration → validation de la charge utile
(au-delà d'une limite : **refus**, jamais de troncature) → réservation →
appel à Claude → coût réel → réponse `{ result, remaining }`.

Corps attendu : `{ "feature": "summary", "payload": { … } }`. Pour le bilan,
la charge utile ne contient que le mois (`YYYY-MM`), des totaux, la
répartition par groupe, au plus 15 espèces les plus observées et 30 espèces
nouvelles (« + N autres »), et la comparaison avec l'an passé. Tout autre
champ (lieu, GPS, commentaire…) est ignoré et n'atteint jamais Claude.

Codes : ceux du §4 (sauf `invalid_image`), plus **`feature_disabled`
(503)** : fonctionnalité coupée par `AI_DISABLED_FEATURES`. Une fonctionnalité
pas encore livrée (`note`, `search` aujourd'hui) répond `invalid_request`
(400).

Réponse du bilan refusée (`invalid_output`, comptée car facturée) si le texte
dépasse 1 200 caractères ou cite un nombre absent des chiffres fournis.

**Journaux** : id de la ligne d'usage, fonctionnalité, statut, modèle,
tokens, coût, type d'erreur. Jamais l'utilisateur, la note, la phrase, les
chiffres ni le texte produit.

### 6.6 Retour arrière

- **Couper le texte sans rien défaire** : `AI_DISABLED_FEATURES` (une
  fonctionnalité) ou `AI_MONTHLY_BUDGET_USD` = `0` (tout l'assistant), puis
  redéployer.
- **`ai-identify`** n'est pas modifiée par ce lot. Si elle l'était un jour :
  `git checkout ai-identify-v1 -- supabase/functions/ai-identify`, puis
  `npx supabase functions deploy ai-identify --use-api`.
- **SQL**, seulement en cas de problème sérieux : couper d'abord `ai-text`,
  puis passer d'un bloc, dans l'éditeur SQL,
  [`retour-arriere-ai-text-features.sql`](./retour-arriere-ai-text-features.sql).
  Il remet `ai_reserve_call` à 5 arguments et `ai_my_status` de la phase 1 à
  l'identique, dans une transaction. Il **garde** `ai_consents` (preuves de
  consentement ; suppression définitive en décommentant la ligne prévue) et
  la contrainte élargie de `ai_usage.feature` (l'ancienne échouerait dès
  qu'une ligne `summary` existe). Il ne touche pas l'historique des
  migrations : toute correction ultérieure passe par une **nouvelle**
  migration.
