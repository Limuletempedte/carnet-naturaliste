# Carnet Naturaliste V5.2

Application web PWA de carnet d'observations naturalistes (faune, flore, fonge).

## Stack technique
- React 19 + TypeScript 5.7 (strict mode)
- Vite 6.4 (build + PWA via vite-plugin-pwa)
- Tailwind CSS 3.4
- Leaflet (cartes + clustering)
- Supabase (auth + PostgreSQL + edge functions + storage)
- Recharts (graphiques statistiques)
- ExcelJS / jsPDF / html2canvas (exports)

## Commandes
- `npm run check` : typecheck + lint + tests + build (commande principale, toujours lancer avant un commit)
- `npm run typecheck` : verification TypeScript seule
- `npm run lint` : ESLint seul
- `npm run test:run` : tests Vitest en une passe
- `npm test` : tests Vitest en watch mode
- `npm run build` : build production
- `npm run dev` : serveur de dev

## Structure
- `/components/` : composants React (PascalCase.tsx)
- `/services/` : logique metier, API Supabase, import/export (camelCase.ts)
- `/utils/` : fonctions utilitaires pures (camelCase.ts)
- `/hooks/` : hooks React personnalises
- `/contexts/` : contextes React (AuthContext)
- `/tests/` : tests Vitest, meme nom que le fichier source + `.test.ts(x)`
- `/supabase/` : config, migrations SQL, edge functions
- `/docs/` : documentation et audits
- `/public/` : assets statiques, logos, fonts

## Conventions
- Composants : PascalCase (.tsx)
- Services/utils/hooks : camelCase (.ts)
- Variables inutilisees : prefixer avec `_`
- Alias de chemin : `@/*` mappe a la racine
- Langue du code : anglais
- Langue des commentaires/docs/UI : francais

## Fichiers cles
- `App.tsx` : composant principal (gros fichier, logique centrale)
- `components/ObservationForm.tsx` : formulaire d'observation (gros composant)
- `services/storageService.ts` : gestion du stockage local + sync Supabase
- `services/speciesService.ts` : donnees taxonomiques
- `supabaseClient.ts` : client Supabase initialise

## Tests
- Framework : Vitest + Testing Library React
- 37 fichiers de tests (240 tests) couvrant composants, services et utils
- Lancer `npm run test:run` pour valider les changements
