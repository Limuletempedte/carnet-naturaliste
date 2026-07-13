# Carnet Naturaliste

Application web React + Vite + TypeScript pour la gestion d'observations naturalistes,
avec authentification et stockage via Supabase.

## Pré-requis

- Node.js 20+
- Un projet Supabase configuré

## Variables d'environnement

Configurer `.env.local`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SENTRY_DSN` *(optionnelle)* : DSN Sentry pour le suivi des erreurs en
  production. Sans cette variable, le suivi d'erreurs est totalement inactif
  (aucune donnée envoyée). Erreurs uniquement : pas de tracing performance ni
  de replay de session.

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

- Schéma initial : `supabase_schema.sql`
- Migrations versionnées : dossier `supabase/migrations/` (appliquées via Supabase).
  Exemple — la phase 2 (index/contraintes/trigger `updated_at`) correspond à
  `supabase/migrations/20240201000000_phase2_indexes_constraints.sql`.
