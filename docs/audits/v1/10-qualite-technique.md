# Audit Qualite Technique / Maintenabilite - Carnet Naturaliste v5.2

**Date** : 2025-03-28
**Version audit** : v1
**Statut** : Termine

## Resume executif

Le projet a une **base technique solide** : TypeScript strict mode actif, quality gate complete (`npm run check` = typecheck + lint + tests + build), 16 suites de tests avec une excellente couverture des chemins critiques (auth, storage, sync, import). Les faiblesses sont concentrees sur : (1) **App.tsx "god component"** (1165 lignes, ~24 useState), (2) **49 console.log/error en production** sans service de logging structure, (3) **17 usages de `any`** malgre le mode strict, (4) **`xlsx` abandonne** avec risque de securite, et (5) **aucun pipeline CI/CD** -- les checks sont manuels.

**Niveau de preuve dominant** : STATIQUE (analyse du code source) et SEMI-DYN (configuration TypeScript, ESLint, scripts npm).

## Methode et perimetre

- **Analyse statique** de tous les fichiers source : taille, complexite, duplication, nommage
- **Audit TypeScript** : `any`, assertions `as`, `@ts-ignore`, mode strict
- **Audit dependances** : versions, maintenance, licences, vulnerabilites connues
- **Audit tests** : couverture, qualite des assertions, strategie de mocking
- **Audit configuration** : `tsconfig.json`, `eslint.config.js`, `vite.config.ts`, scripts npm
- **Non couvert** : metriques de couverture quantitatives (pas de `vitest --coverage`), analyse de complexite cyclomatique automatisee

## Constats

### Taille et complexite des fichiers

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| QT-01 | HAUTE | STATIQUE | App.tsx (1165 lignes) | **"God component"** : ~24 useState, ~8 useEffect, ~41 handlers. Gere navigation, CRUD, filtres, sync, modals, toasts, mode sombre, enrichissement. | Tres difficile a maintenir, tester unitairement, et faire evoluer. Tout changement risque des effets de bord. | Extraire en hooks : `useObservationData()`, `useFilterPresets()`, `useAppModals()`, `useOfflineQueue()`. |
| QT-02 | HAUTE | STATIQUE | ObservationForm.tsx (859 lignes) | **Composant complexe** : 13 useState, 7 useEffect, 5 useRef. Melange logique de formulaire, enrichissement especes, upload photo, validation. | Difficulte a isoler et tester les sous-fonctionnalites. | Extraire `useSpeciesEnrichment()` et `usePhotoUpload()` en hooks custom. |
| QT-03 | MOYENNE | STATIQUE | ObservationList.tsx (675 lignes) | 12 useState, 11 useEffect. Filtrage, tri, pagination, selection en ligne. | Calculs inline pendant le render, risque de re-renders. | Extraire la logique de tri/filtre dans un hook `useFilteredObservations()`. |
| QT-04 | MOYENNE | STATIQUE | storageService.ts (742 lignes) | Service dense mais bien organise. Logique d'erreur de migration dupliquee en 3 endroits (L:392-410, 445-455, 621-650). | Duplication du pattern `isMissingColumnError` + fallback. | Extraire un helper `withColumnFallback()`. |
| QT-05 | MOYENNE | STATIQUE | speciesService.ts (709 lignes) | Service API + cache + scoring + mapping taxonomique dans un seul fichier. | Fichier dense mais fonctionnellement coherent. L'algorithme de scoring (L:104-151) et le mapping taxonomique (L:460-576) pourraient etre des modules. | Acceptable en l'etat, mais surveiller la croissance. |
| QT-06 | FAIBLE | STATIQUE | excelImportService.ts (635 lignes) | Import Excel avec parsing, validation, coercion de types. | Dense mais bien structure avec constantes nommees (`MAX_IMPORT_ROWS`, `MAX_IMPORT_FILE_BYTES`). | Acceptable. |

### TypeScript et typage

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| QT-07 | HAUTE | STATIQUE | excelImportService.ts:412,525,555,592 | **`any` dans les fonctions de coercion.** 4 parametres `value: any` dans les fonctions de parsing d'enums et de dates. | Pas de validation de type a l'entree -- un bug de type ne sera detecte qu'au runtime. | Remplacer par `unknown` + type guards. |
| QT-08 | HAUTE | STATIQUE | storageService.ts:67,75,92,98,111,114,121,152,353 | **9 `error: any`** dans les blocs catch. Structure de l'objet erreur presumee sans validation. | Fragile face aux changements d'API Supabase. Un changement de format d'erreur casserait la detection silencieusement. | Definir une interface `SupabaseError { message, code, details, hint }` et utiliser des type guards. |
| QT-09 | MOYENNE | STATIQUE | App.tsx:292,516, Login.tsx:34, locationService.ts:119 | **4 `any` supplementaires** dans des catch et callbacks. | Meme risque que QT-08 a moindre echelle. | Utiliser `catch (e: unknown)` partout. |
| QT-10 | MOYENNE | STATIQUE | 8 fichiers (22 instances) | **22 assertions `as`** dans le code. Les plus risquees : `mapToRow(...) as [string, Observation]` (App.tsx:411), `error as Error` (4 fichiers), `event.target as Node` (2 fichiers). | Contournement du systeme de types -- crash runtime si l'assertion est fausse. | Remplacer les `as` risquees par des type guards. Les `as const` et `as keyof` avec garde sont acceptables. |
| QT-11 | INFO | SEMI-DYN | tsconfig.json:20 | **TypeScript strict mode actif.** `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports`. | Configuration plus stricte que 99% des projets TS. | -- |
| QT-12 | INFO | SEMI-DYN | eslint.config.js | **`@typescript-eslint/no-explicit-any: 'off'`** dans la config ESLint. Le mode strict TS ne bloque pas les `any` explicites. | Les 17 `any` ne generent aucun warning ESLint. | Passer a `'warn'` pour forcer la migration progressive. |

### Logging et observabilite

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| QT-13 | HAUTE | STATIQUE | 13 fichiers, 49 instances | **49 `console.error`/`console.warn`/`console.log` en production.** 35 `console.error` (storageService 6x, speciesService 7x, excelImportService multiples), 1 `console.warn` (storageService:297). Deja identifie comme M4 dans l'audit precedent. | Details d'implementation et d'API visibles dans la console utilisateur. Pas de service de suivi d'erreurs. Pas de niveaux de log, pas de filtrage. | Remplacer par un service de logging (`logger.error()`) avec niveau configurable. Integrer Sentry ou equivalent pour la production. |

### Duplication de code

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| QT-14 | MOYENNE | STATIQUE | storageService.ts:392-410, 445-455, 621-650 | **Pattern de fallback migration duplique 3 fois.** `isMissingColumnError(error)` → `stripMissingColumns(row)` → retry insert/update. | Modification du pattern necessite 3 changements synchronises. | Extraire `withColumnFallback(operation)`. |
| QT-15 | MOYENNE | STATIQUE | storageService.ts, App.tsx, AuthContext.tsx, ObservationForm.tsx, MapInput.tsx | **Acces localStorage duplique.** 5+ fichiers avec le pattern `try { localStorage.getItem/setItem } catch`. | Gestion d'erreur inconsistante entre les fichiers. Certains ont un catch, d'autres non. | Centraliser dans un `SafeStorage` wrapper. |
| QT-16 | FAIBLE | STATIQUE | speciesService.ts, locationService.ts | **Pattern fetch + timeout + abort** duplique entre les deux services. | Duplication moderee, chaque service a ses specificites. | Acceptable -- `fetchWithTimeout` existe dans backupService mais n'est pas exporte (deja identifie). |

### Dependances

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| QT-17 | HAUTE | STATIQUE | package.json:32 | **`xlsx` (SheetJS) v0.18.5 abandonne.** Derniere release OSS en 2021. Pas de patches de securite. Import de fichiers Excel non-fiables = surface d'attaque. Deja identifie comme SE-13 dans l'audit securite. | Vulnerabilite non patchee si un 0-day est decouvert. Prototype Pollution et ReDoS connus. | Migrer vers `exceljs` (MIT, actif) ou `sheetjs-ce` (fork communautaire). |
| QT-18 | MOYENNE | STATIQUE | package.json:26 | **`jszip` v3.10.1 sous licence duale MIT OR GPL-3.0.** Si le choix de licence n'est pas explicite, la GPL-3.0 pourrait s'appliquer et imposer la publication du code source. | Risque legal pour une application commerciale proprietaire. | Verifier avec un juriste. Si probleme, considerer `adm-zip` (MIT uniquement). Ou documenter le choix MIT dans les notices legales. |
| QT-19 | MOYENNE | STATIQUE | package.json:24 | **`file-saver` v2.0.5 inactif depuis 2016.** Aucune mise a jour depuis 8 ans. | Risque faible (API simple et stable), mais pas de support en cas de probleme navigateur futur. | Surveiller. Alternatives : `download.js` ou l'API native `showSaveFilePicker`. |
| QT-20 | INFO | STATIQUE | package.json:56 | **Override `serialize-javascript` a 7.0.4** mais le correctif CPU Exhaustion est en 7.0.5. Deja identifie comme SE-14. Build-time uniquement. | Pas de risque runtime. | Mettre a jour l'override. |
| QT-21 | INFO | STATIQUE | package.json | **Toutes les autres dependances actives et a jour.** React 19.1, Supabase 2.86, Vite 6.4, Vitest 3.2, Tailwind 3.4, TypeScript 5.7. Versions recentes, bien maintenues. | Bon hygiene de dependances globale. | -- |

### Licences

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| QT-22 | INFO | STATIQUE | package.json (toutes deps) | **Toutes les dependances runtime sont sous licences permissives** : MIT (React, Supabase, jspdf, html2canvas, file-saver, recharts, react-calendar, leaflet.markercluster, vite-plugin-pwa), BSD-2-Clause (Leaflet), Apache-2.0 (xlsx). Exception : `jszip` (MIT OR GPL-3.0, voir QT-18). | Compatible avec la commercialisation. | Generer un fichier LICENSES.txt automatiquement (`license-checker`). |

### Tests

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| QT-23 | MOYENNE | SEMI-DYN | tests/ (16 fichiers, ~2700 lignes) | **Bonne couverture des chemins critiques** (auth, storage, sync, import, export) mais **couverture UI faible.** `ObservationList.test.tsx` (82 lignes) ne teste que le filtre. `ObservationStats.test.tsx` (83 lignes) est minimal. Aucun test du formulaire complet, du calendrier, de la galerie, ni des dialogs. | Regressions UI non detectees. Les composants les plus complexes (App, ObservationForm) n'ont pas de tests de rendu. | Ajouter des tests de rendu pour ObservationForm (validation, soumission) et les dialogs. |
| QT-24 | MOYENNE | SEMI-DYN | (absent) | **Aucun test d'integration end-to-end.** Pas de test du flux complet : creer observation → upload photo → sync → export. Pas de test offline → online. | Les interactions entre services ne sont pas validees. Un bug d'integration passerait les tests unitaires. | Ajouter au minimum 2-3 tests d'integration des flux critiques. |
| QT-25 | MOYENNE | SEMI-DYN | vitest.config.ts (8 lignes) | **Pas de seuil de couverture configure.** `vitest.config.ts` utilise les defauts sans `coverage.thresholds`. | La couverture peut regresser sans detection. | Ajouter `coverage: { thresholds: { lines: 60 } }` comme baseline. |
| QT-26 | INFO | SEMI-DYN | tests/storageService.test.ts, tests/authContext.test.tsx | **Excellent mocking Supabase.** Mocks sophistiques pour le chainage Supabase (`from().select().eq().order()`), reset entre tests, verification des parametres de securite (user_id). | Les tests valident non seulement le resultat mais aussi que le filtre RLS est applique. | -- |

### CI/CD et automatisation

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| QT-27 | HAUTE | STATIQUE | (absent) | **Aucun pipeline CI/CD.** Pas de `.github/workflows/`, pas de `.gitlab-ci.yml`, pas de `Jenkinsfile`. Le script `npm run check` existe mais doit etre lance manuellement. | Pas de validation automatique avant merge. Un commit avec des tests casses ou du code non-typable peut arriver en production via Vercel auto-deploy. | Creer `.github/workflows/ci.yml` qui execute `npm run check` sur chaque PR. |
| QT-28 | MOYENNE | STATIQUE | (absent) | **Pas de pre-commit hook.** Ni `husky`, ni `lint-staged`, ni `.git/hooks/pre-commit` configure. | Le developpeur peut committer du code non-lint, non-type-check. | Installer `husky` + `lint-staged` pour executer `eslint --fix` et `tsc --noEmit` au commit. |

### Nommage et conventions

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| QT-29 | INFO | STATIQUE | Projet entier | **Conventions coherentes a ~90%.** PascalCase pour les composants, camelCase pour les fonctions/variables, UPPER_SNAKE_CASE pour les constantes. | Bonne lisibilite globale. | -- |
| QT-30 | FAIBLE | STATIQUE | App.tsx:68-69 | **Constantes d'enrichissement definies a l'interieur de la fonction** au lieu du scope module. `ENRICHMENT_BATCH_LIMIT = 20`, `ENRICHMENT_CONCURRENCY = 3`. | Readability reduite, constantes invisibles en haut du fichier. Deja identifie comme M1 dans l'audit precedent. | Deplacer en haut du fichier ou dans un fichier `constants.ts`. |

## Statistiques

- **Total constats** : 30
- **Critiques** : 0 | **Hautes** : 7 | **Moyennes** : 13 | **Faibles** : 3 | **Info** : 7
- Par niveau de preuve : STATIQUE 25 | SEMI-DYN 5

## Points positifs

1. **TypeScript strict mode** : `strict: true` + `noUnusedLocals` + `noUnusedParameters` + `noFallthroughCasesInSwitch` + `noUncheckedSideEffectImports` -- configuration exemplaire
2. **Quality gate complete** : `npm run check` = typecheck + lint + tests + build en une commande
3. **16 suites de tests, ~2700 lignes** : couverture excellente des services critiques (auth, storage, sync, import, export)
4. **Mocking Supabase sophistique** : verification du chainage de methodes ET des parametres de securite (user_id)
5. **Zero `@ts-ignore` / `@ts-expect-error`** dans tout le projet
6. **Code splitting intelligent** : chunks separes pour leaflet, xlsx, jspdf, html2canvas dans `vite.config.ts`
7. **Constantes nommees pour les limites** : `MAX_IMPORT_ROWS`, `MAX_IMPORT_FILE_BYTES`, `IMPORT_PARSE_TIMEOUT_MS` dans l'import Excel
8. **Conventions de nommage coherentes** : PascalCase/camelCase/UPPER_SNAKE_CASE respectes a ~90%
9. **ESLint 9 flat config** avec `react-hooks/rules-of-hooks: 'error'` et `exhaustive-deps: 'warn'`
10. **Dependances globalement a jour** : React 19.1, Vite 6.4, Vitest 3.2, TypeScript 5.7

## Conclusion

Le projet a une **qualite technique superieure a la moyenne** pour un projet de cette taille : mode strict TypeScript, quality gate complete, tests significatifs sur les chemins critiques. Les principaux risques de maintenabilite sont l'**App.tsx god component** (QT-01) qui concentre trop de responsabilites, les **49 console statements en production** (QT-13), et l'**absence de CI/CD** (QT-27) qui rend les checks manuels. La dependance `xlsx` abandonnee (QT-17) est un risque technique et securitaire deja identifie dans l'audit securite.

**Top 3 des actions prioritaires :**
1. **QT-27** : Creer un pipeline CI/CD (`.github/workflows/ci.yml`) pour executer `npm run check` automatiquement -- empeche les regressions en production
2. **QT-01** : Extraire des hooks custom depuis App.tsx (`useObservationData`, `useAppModals`, etc.) -- prerequis pour toute evolution
3. **QT-17** : Remplacer `xlsx` par `exceljs` -- eliminer la dependance abandonnee avec CVEs connues
