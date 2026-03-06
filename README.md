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

## Commandes

- `npm run dev` : démarrage local
- `npm run build` : build production
- `npm run test:run` : exécution des tests
- `npm run lint` : lint du code
- `npm run typecheck` : vérification TypeScript
- `npm run check` : gate complet (`typecheck + lint + tests + build`)

## Base de données

- Schéma initial : `supabase_schema.sql`
- Migration phase 2 (index/contraintes/trigger `updated_at`) : `supabase_migration_phase2.sql`
