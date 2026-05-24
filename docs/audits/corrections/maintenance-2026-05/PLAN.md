# Plan — Améliorations qualité Carnet Naturaliste V5.2 (mai 2026)

## Contexte
Suite à un diagnostic de santé du projet (`npm run check` : typecheck 0 erreur, lint 0 erreur / 15 warnings, 240/240 tests, build OK), on a identifié des améliorations sans bug bloquant mais utiles à la maintenabilité et à la propreté du dépôt. L'objectif de ce lot : **éliminer les warnings inutiles, remettre la doc navigateurs à jour, corriger un découpage de bundle raté, assainir le dépôt, puis découper les deux plus gros fichiers** (`App.tsx` mis à part, déjà entamé) pour faciliter les évolutions futures.

Ces points recoupent des constats d'audit existants : **QT-12** (`no-explicit-any`), **QT-01/QT-02** (god components), **QT-04** (storageService dense), **PE-08/PE-09** (bundle). La refacto se fait **par petits lots**, avec `npm run check` vert (240 tests) après chaque étape — règle du projet : *à la moindre régression, on reverte le lot*.

Périmètre validé : corrections rapides (A) **+** refacto `ObservationForm.tsx` (B) **+** refacto `storageService.ts` (C).

---

## Lot A — Corrections rapides (faible risque)

**A1. ESLint : ignorer le dossier `coverage/`** (supprime 3 warnings « Unused eslint-disable directive »)
- Fichier : `eslint.config.js:8`
- `ignores: ['dist/**', 'node_modules/**']` → `ignores: ['dist/**', 'node_modules/**', 'coverage/**']`

**A2. ESLint : dépendance manquante dans un `useEffect`** (supprime 1 warning `react-hooks/exhaustive-deps`)
- Fichier : `App.tsx` — useEffect de synchro initiale (≈ 211–329), tableau de dépendances ≈ `App.tsx:329`
- Ajouter `pushToast` (un `useCallback([])` stable) au tableau de dépendances → ajout sûr.
- Les 11 `any` de `tests/storageService.test.ts` sont des casts de mocks légitimes : on les **laisse** (règle `warn`).

**A3. Mettre à jour browserslist**
- `npx update-browserslist-db@latest` (met à jour `package-lock.json`). Aucun risque.

**A4. Corriger le double-import de `LegalPages`** (supprime l'avertissement de build, restaure le chunk lazy)
- Cause : `App.tsx:40-42` charge `LegalPages` en `lazy()`, mais `components/Auth/Login.tsx:3` l'importe statiquement.
- Correction dans `Login.tsx` : remplacer l'import statique par des `lazy()` + envelopper les rendus `legalView` (`Login.tsx:85-87`) dans `<Suspense>`.

**A5. Assainir le dépôt via `.gitignore`** (maquettes laissées en place, non listées par `git status`)
- Motifs **ancrés à la racine** (le `/` initial évite d'ignorer les PNG de `public/`, `dist/`) :
  `/boot*.png`, `/gallery*.png`, `/cockpit.png`, `/arsenal.png`, `/current-hero.png`, `/fire-launch.png`, `/mission-sim.png`, `.playwright-mcp/`

**Validation Lot A** : `npm run check` vert ; warnings 15 → 11 ; build sans avertissement LegalPages.

---

## Lot B — Refacto `components/ObservationForm.tsx` (≈ 997 l.)
Une extraction = un commit = un `npm run check`.
1. `components/ObservationForm/observationFormHelpers.ts` — `FormSection`, `getObservationLookupKey`, `normalizeLookupKey`, `createEmptyFormData`, `mapObservationToFormData`. Réutilise `validateObservationForm` (`services/observationFormService.ts`).
2. `hooks/useSpeciesAutocomplete.ts` — debounce + suggestions. Réutilise `hooks/useClickOutside.ts`.
3. `hooks/useSpeciesEnrichment.ts` — fetch info espèce + auto-application + retry. Réutilise `services/speciesService.ts`.
4. `hooks/useObserverTags.ts` — liste d'observateurs.
5. `ObservationForm.tsx` orchestrateur (extraction d'un `ObservationFormContent.tsx` optionnelle).

**Garde-fous** : `tests/observationFormAutocomplete.test.tsx`, `tests/observationFormService.test.ts` verts.

---

## Lot C — Refacto `services/storageService.ts` (≈ 955 l. → barrel + 6 modules)
**Clé anti-risque** : `storageService.ts` devient un **barrel** qui ré-exporte tout → aucun importeur à modifier.
1. `services/storage/storageTypes.ts` — constantes + types.
2. `services/storage/storageHelpers.ts` — utils purs (`extractStoragePath`, `dataUrlToBlob`, `withTimeout`, `isDuplicateKeyError`, `parseJson`…). ⚠️ `isDuplicateKeyError` importé par `App.tsx` → garder le ré-export.
3. `services/storage/storageCacheManager.ts` — cache + namespace + `getOfflineQueueSnapshot`.
4. `services/storage/storageApi.ts` — CRUD `getObservations/saveObservation/updateObservation/deleteObservation`.
5. `services/storage/storageUpload.ts` — `uploadPhoto/uploadSound`.
6. `services/storage/storageQueue.ts` — `processOfflineQueue`.
7. `services/storageService.ts` — barrel (`export … from './storage/…'`), noms exportés identiques.

**Garde-fous** : `tests/storageService.test.ts` (32) et `tests/storageCacheUtils.test.ts` verts sans changement d'import.

---

## Vérification
1. `npm run check` (typecheck + lint + tests + build) → 240/240 verts, build OK.
2. Warnings 15 → 11 ; plus d'avertissement LegalPages.
3. `git status` propre.
4. Smoke test `npm run dev` : pages légales (lazy), création/édition d'observation (autocomplétion, enrichissement, observateurs), synchro hors-ligne.
5. Bundle : chunk `LegalPages` séparé présent.

## Conventions de livraison
- Branche `chore/qualite-mai-2026`.
- Commits conventionnels : `chore(lint):`, `chore(deps):`, `perf(bundle):`, `refactor(form):`, `refactor(storage):`.
- `npm run check` avant chaque commit.
- RECAP final : `docs/audits/corrections/maintenance-2026-05/RECAP.md`.
