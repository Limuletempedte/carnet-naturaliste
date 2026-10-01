# Carnet Naturaliste

Application web React + Vite + TypeScript pour la gestion d'observations naturalistes,
avec authentification et stockage via Supabase.

## Reprendre le projet

Lire l'[état de reprise et les prochaines étapes](docs/ops/ETAT-REPRISE.md).
Cette page distingue les travaux terminés, les investigations encore ouvertes
et les rapports historiques.

## Pré-requis

- Node.js 20.19+ ou 22.12+ (plage déclarée par Vite : `^20.19.0 || >=22.12.0`)
- Un projet Supabase configuré

## Variables d'environnement

Configurer `.env.local`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_TURNSTILE_SITE_KEY` : clé **publique** d'un widget autorisant le domaine
  de développement ou de preview. Sans cette variable, la clé publique intégrée
  est limitée au domaine de production. La clé secrète CAPTCHA se configure
  côté Supabase Auth, jamais dans une variable `VITE_*`. Voir le
  [guide du lot CAPTCHA](docs/audits/v5/CORRECTIONS-LOT4.md).
- `VITE_SENTRY_DSN` *(optionnelle)* : DSN Sentry pour le suivi des erreurs en
  production. Sans cette variable, le suivi d'erreurs est totalement inactif
  (aucune donnée envoyée). Erreurs uniquement : pas de tracing performance ni
  de replay de session.

## Sauvegarde de la base

Le workflow `.github/workflows/sauvegarde-base.yml` prévoit une sauvegarde
hebdomadaire : export chiffré de la base Supabase, conservé en artefact GitHub.
Mise en service, surveillance et **procédure de
restauration** : [`docs/ops/RUNBOOK-sauvegarde-restauration.md`](docs/ops/RUNBOOK-sauvegarde-restauration.md).

## Configuration MCP locale (optionnel)

- Copier `.mcp.example.json` vers `.mcp.json`.
- Renseigner le token MCP Supabase dans `.mcp.json`.
- Ne jamais versionner `.mcp.json` (fichier ignoré par Git).

## Commandes

- `npm run dev` : démarrage local
- `npm run build` : build production
- `npm run test:run` : exécution des tests
- `npm run lint` : lint du code
- `npm run typecheck` : vérification TypeScript
- `npm run check` : gate complet (`typecheck + lint + tests + build`)

## Base de données

- Schéma initial historique : `supabase_schema.sql` (ne pas le rejouer sur une base existante).
- Migrations versionnées : dossier `supabase/migrations/` (appliquées via Supabase).
  Exemple — la phase 2 (index/contraintes/trigger `updated_at`) correspond à
  `supabase/migrations/20240201000000_phase2_indexes_constraints.sql`.
- [État de l'historique et régularisation du 1er octobre 2026](docs/ops/REGULARISATION-MIGRATIONS-2026-10-01.md) : dix versions alignées, aucune régularisation à répéter.
