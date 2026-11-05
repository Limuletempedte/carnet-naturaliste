# Assistant d'identification par IA — exploitation

Plan validé : [`docs/plans/assistant-ia-phase1.md`](../plans/assistant-ia-phase1.md).
Ce document dit **comment mettre en service, gérer et couper** l'assistant.

| Élément | Fichier |
|---|---|
| Tables, droits, fonctions SQL | `supabase/migrations/20261105161500_ai_identification.sql` |
| Fonction Edge | `supabase/functions/ai-identify/index.ts` (appel) et `logic.ts` (règles) |
| Réglage `verify_jwt` | `supabase/config.toml`, section `[functions.ai-identify]` |
| Tests unitaires | `tests/aiIdentifyLogic.test.ts` (lancés par `npm run check`) |
| Tests de sécurité locaux | `tests/security/ai-access-rls.mjs` |

En bref : une personne **demande** l'accès (ligne `pending` dans `ai_access`),
le propriétaire **approuve à la main** dans le tableau de bord Supabase. Chaque
analyse est d'abord **réservée** (accès, consentement, quota de 20 par mois,
budget du mois), puis le coût réel est écrit dans `ai_usage`.

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
`SUPABASE_DB_URL` de la sauvegarde hebdomadaire) :

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
  has_function_privilege('authenticated', 'public.ai_reserve_call(uuid, text, text, numeric, numeric)', 'EXECUTE') as reserver,  -- faux
  has_function_privilege('authenticated', 'public.ai_finalize_call(uuid, text, integer, integer, numeric)', 'EXECUTE') as finaliser, -- faux
  has_function_privilege('anon', 'public.ai_my_status()', 'EXECUTE')        as anon_statut,        -- faux
  has_function_privilege('authenticated', 'public.ai_my_status()', 'EXECUTE') as statut;           -- vrai
```

Tout doit être **faux** sauf la dernière colonne. Puis ouvrir
*Advisors → Security* dans le tableau de bord : aucune alerte nouvelle sur
`ai_access`, `ai_usage` ou les trois fonctions.

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

La fonction **refuse de tourner** (`misconfigured`) si le modèle n'a pas de
prix connu dans `logic.ts`, si l'effort n'est pas `low` ou `medium`, ou si le
budget est illisible. Aucun nom de secret ne doit commencer par `SUPABASE_` ni
par `VITE_`. `ANTHROPIC_BASE_URL` ne sert qu'aux tests locaux : ne jamais le
définir en production.

### 1.5 Déploiement

`--use-api` fait préparer la fonction par Supabase : Docker n'est pas nécessaire.

```bash
npx supabase functions deploy ai-identify --use-api
```

`verify_jwt = true` est lu dans `supabase/config.toml` : la plateforme refuse
déjà toute requête sans jeton, et la fonction vérifie elle-même l'utilisateur.

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

Une personne qui retire son accord supprime sa ligne `ai_access` ; si elle
redemande, elle revient `pending`. Son compteur du mois, lui, ne bouge pas.

---

## 3. Réglages courants

- **Changer de modèle ou d'effort** : modifier `AI_MODEL` ou `AI_EFFORT` dans
  les secrets, puis redéployer la fonction. Un nouveau modèle doit d'abord
  avoir son prix dans `MODEL_PRICES_USD_PER_MTOK` (`logic.ts`), sinon la
  fonction refuse tout.
- **Couper l'assistant immédiatement** : `AI_MONTHLY_BUDGET_USD` = `0`, puis
  redéployer. Tous les appels sont refusés avec `budget_exhausted`.
- **Changer de clé** : créer la nouvelle clé dans la Console, remplacer
  `ANTHROPIC_API_KEY`, redéployer, vérifier une analyse, puis **désactiver
  l'ancienne clé** dans la Console.
- **Changer le texte du consentement** (PR B et suivantes) : changer
  `CONSENT_VERSION` côté fonction **et** côté application. Les accès existants
  sont alors refusés (`consent_outdated`) jusqu'à une nouvelle demande.

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
hypothèses.

---

## 5. Vérification locale

Sur un Supabase **local** uniquement (le script refuse toute autre adresse),
migration appliquée :

```bash
LOCAL_STATUS_FILE=/chemin/local-status.json \
POSTGRES_MODULE=/chemin/node_modules/postgres/src/index.js \
DENO_BIN=$(command -v deno) \
node tests/security/ai-access-rls.mjs
```

- `LOCAL_STATUS_FILE` : sortie de `supabase status -o json`, jamais versionnée.
- `POSTGRES_MODULE` (facultatif) : paquet npm `postgres`, pour les contrôles
  `has_*_privilege`.
- `DENO_BIN` (facultatif) : lance la fonction sur le port 8000 avec un **faux
  serveur Anthropic** local (port 55440) ; aucune clé réelle, aucun appel payant.

Le script crée ses comptes de test par l'API d'administration locale et les
supprime à la fin.
