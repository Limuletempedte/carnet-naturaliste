# Carnet Naturaliste V5.2

Application web PWA de carnet d'observations naturalistes (faune, flore, fonge).

## Stack technique
- React 19 + TypeScript 5.7 (strict mode)
- Vite 8.1 (build + PWA via vite-plugin-pwa)
- Tailwind CSS 3.4
- Leaflet (cartes + clustering)
- Supabase (auth + PostgreSQL + edge functions + storage)
- Recharts (graphiques statistiques)
- ExcelJS / jsPDF / html2canvas (exports)
- Sentry (suivi des erreurs en prod, actif via `VITE_SENTRY_DSN`)

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
- Dernière validation du 5 novembre 2026 : 79 fichiers de tests (632 tests) couvrant composants, services et utils
- Lancer `npm run test:run` pour valider les changements

## Deploiement et pieges a connaitre
- **Hebergement** : Vercel (auto-deploy depuis `main`) + Supabase (region eu-central-1, UE).
- ⚠️ **CSP en liste blanche** : `vercel.json` enumere les domaines autorises
  (`connect-src`). Toute nouvelle API externe (TAXREF/INPN, Pl@ntNet...) marchera
  en local mais **echouera silencieusement en prod** tant que son domaine n'y est
  pas ajoute.
- ⚠️ **Compatibilite des plages semver** : apres une montee majeure de Vite,
  verifier que les bornes basses declarees dans `package.json` supportent la
  nouvelle version (peerDependencies), sinon `npm audit fix` echoue en ERESOLVE.
- ⚠️ **Ne pas surcharger `brace-expansion`** en override global : la v5 change sa
  forme d'export et casse ESLint (`expand is not a function`). Le correctif des
  alertes qui en decoulent passe par la montee majeure d'ESLint.
- **Documents legaux** : ajouter un service tiers implique de mettre a jour
  `components/LegalPages.tsx` ET `docs/legal/` (registre des traitements).
