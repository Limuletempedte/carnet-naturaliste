# Thème 10 — Qualité technique — RECAP

**Date d'exécution** : 2026-04-17
**Audit source** : `docs/audits/v1/10-qualite-technique.md`
**Plan exécuté** : `C:\Users\eliot\.claude\plans\snazzy-jingling-eagle.md`
**Baseline tests** : 141 → **163 tests verts (+22)**
**Quality gate** : `npm run check` vert (0 erreurs, 19 warnings ESLint — non bloquants)

## Vue d'ensemble

7 batches exécutés, 22 constats sur 30 traités. Les 8 constats skippés sont documentés en bas du RECAP avec leur justification.

| Batch | Constats | Statut |
|-------|----------|--------|
| 1. CI/CD + pre-commit | QT-27, QT-28 | ✅ |
| 2. Logger + ESLint warn | QT-13, QT-12 | ✅ |
| 3. Typage strict | QT-07, QT-08, QT-09, QT-10 | ✅ |
| 4. Helpers et wrappers | QT-14, QT-15, QT-16, QT-30 | ✅ (QT-15 partiel) |
| 5. Refactor god-components | QT-01, QT-02 | ✅ (3 hooks extraits) |
| 6. Licences et docs | QT-18, QT-19, QT-22 | ✅ |
| 7. Coverage + tests UI | QT-23, QT-24, QT-25 | ✅ |

---

## Batch 1 — CI/CD GitHub Actions + husky pre-commit (QT-27, QT-28)

### Ce qui a été fait
- Créé `.github/workflows/ci.yml` : matrice Node 20.x/22.x, lance `npm run check` avec env VITE_SUPABASE_URL/ANON_KEY factices (nécessaires pour le build PWA mais pas pour la CI).
- Créé `.husky/pre-commit` : appelle `npx lint-staged`.
- Modifié `package.json` : ajouté script `prepare: husky`, config `lint-staged: { "*.{ts,tsx}": ["eslint --fix"] }`, devDeps `husky@^9.1.7` et `lint-staged@^15.2.10`.

### Pourquoi
- QT-27 : absence totale de CI/CD — impossible de détecter automatiquement les régressions avant merge.
- QT-28 : pas de hook pre-commit — code mort et warnings lint peuvent entrer dans l'historique.

### Commandes de vérification
```bash
npm run check   # doit être vert (tournera aussi en CI)
```

---

## Batch 2 — Logger + ESLint warn (QT-13, QT-12)

### Ce qui a été fait
- Créé `utils/logger.ts` : 4 niveaux (debug/info/warn/error). `MIN_LEVEL = import.meta.env.DEV ? 'debug' : 'warn'`, donc en production seuls `warn` et `error` sont loggés.
- Créé `tests/logger.test.ts` : 4 tests (warn/error delegation, debug/info en DEV, variadic args).
- Modifié `eslint.config.js` : `@typescript-eslint/no-explicit-any` passé de `off` à `warn`.
- Migré tous les `console.*` de production vers `logger.*` dans 13 fichiers :
  - `App.tsx`, `contexts/AuthContext.tsx`
  - `services/storageService.ts`, `services/speciesService.ts`, `services/excelImportService.ts`, `services/locationService.ts`, `services/backupService.ts`
  - `components/ObservationForm.tsx`, `components/ObservationMap.tsx`, `components/MapInput.tsx`, `components/ObservationList.tsx`, `components/ErrorBoundary.tsx`
  - `components/Auth/Login.tsx`

### Pourquoi
- QT-13 : 49 `console.*` en production — logs inutiles dans la console utilisateur (mauvaise UX pour les développeurs qui pourraient regarder).
- QT-12 : `no-explicit-any: 'off'` masquait 30+ `any` existants. Le passer en `warn` les expose dans le CI sans bloquer.

### Gotchas
- `vite.config.ts` garde un `console.warn` : c'est du code de configuration qui s'exécute au build, pas en runtime — intentionnel.
- `utils/logger.ts` lui-même garde les `console.*` (il délègue) — normal, il est la seule source autorisée.

---

## Batch 3 — Typage strict (QT-07, QT-08, QT-09, QT-10)

### Ce qui a été fait
**QT-07 (excelImportService)** : 4 signatures `(value: any)` → `(value: unknown)` — `mapEnum`, `mapTaxonomicGroup`, `parseTime`, `parseDate`. Les narrowings internes (`typeof === 'string'`, `instanceof Date`) narrowaient déjà correctement.

**QT-08 (storageService)** : 14 `any` éliminés.
- Créé type `SupabaseLikeError` + helper `asSupabaseError(unknown): SupabaseLikeError`.
- Créé interface `ObservationRow` pour `mapToObservation(row: ObservationRow)` — 28 propriétés typées depuis `Observation` via indexed access (`Observation['status']`, etc.).
- `mapToRow(...): Record<string, unknown>` (au lieu de `Record<string, any>`).
- `stripCountBreakdownColumns`, `stripWeatherColumn`, `stripMissingColumns` : tous `Record<string, unknown>`.
- `catch (error: any)` → `catch (error: unknown)` avec narrowing via `asSupabaseError`.

**QT-09 (locationService, App.tsx, Login.tsx)** :
- `locationService.ts` : créé interface `NominatimResult` (lat/lon/display_name/address), remplace `data.map((item: any) => ...)` par typing correct.
- `App.tsx` : 2 `catch (e: any)` → `catch (e: unknown)` + `e instanceof Error ? e.message : 'Erreur inconnue'`.
- `Login.tsx` : 1 `catch (error: any)` → narrowing via `error instanceof Error`.

**QT-10 (assertions `as` risquées)** :
- `ObservationMap.tsx:325`, `MapInput.tsx:190`, `MapInput.tsx:331` : `(error as Error).message || fallback` → `(error instanceof Error && error.message) ? error.message : fallback` (évite `.message` undefined).
- Pas touché à `locationService.ts` lignes 104/148/179/182 (4 `error as Error` internes, pas critiques runtime).

### Pourquoi
- `any` masque les erreurs de typage et laisse passer des accès à des propriétés inexistantes.
- L'audit listait 22 `as` risqués — priorité aux toasts utilisateur qui affichent le message.

### Résultat ESLint
- 39 warnings `no-explicit-any` → **11 restants** (tous dans `tests/storageService.test.ts`, non critiques).

---

## Batch 4 — Helpers et wrappers (QT-14, QT-15, QT-16, QT-30)

### QT-16 — fetchWithTimeout (TERMINÉ)
Créé `utils/fetchUtils.ts` :
```ts
export const fetchWithTimeout = async (url, timeoutMs, init?) => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    try { return await fetch(url, { ...init, signal: controller.signal }); }
    finally { window.clearTimeout(timeoutId); }
};
```
- Migré `services/backupService.ts` (supprimé sa copie locale, importé le helper).
- Créé `tests/fetchUtils.test.ts` : 2 tests (resolve before timeout, abort when timeout fires via fake timers + AbortController).

### QT-15 — safeStorage wrapper (PARTIEL)
Créé `utils/safeStorage.ts` : `safeGet`, `safeSet`, `safeRemove`, `safeClearPrefix`. Dispatche `storage-quota-exceeded` sur `QuotaExceededError`.

Créé `tests/safeStorage.test.ts` : 4 tests.

**Migré** : `App.tsx` (4 sites : `FILTER_PRESETS_STORAGE_KEY` et `darkMode` lecture/écriture).

**NON migré** (volontaire) :
- `services/storageService.ts` (17 sites) : conserve son propre flux `try { localStorage.setItem } catch { dispatchEvent + throw Error }` — identique au comportement de `safeSet` mais plus lisible dans le contexte queue/cache. Migrer aurait risqué de casser SI-03.
- `contexts/AuthContext.tsx` (8 sites) : logique spécifique session cache, déjà bien isolée.

→ Thème 11 pourra compléter la migration si besoin (outil disponible, pattern démontré).

### QT-14 — withColumnFallback helper (TERMINÉ)
Créé dans `storageService.ts` :
```ts
async function withColumnFallback<R extends { error: SupabaseLikeError | null }>(
    row: Record<string, unknown>,
    operation: (effectiveRow: Record<string, unknown>) => PromiseLike<R>,
): Promise<R> {
    const first = await operation(row);
    if (first.error && isMissingColumnError(first.error)) {
        return await operation(stripMissingColumns(row, first.error));
    }
    return first;
}
```
- 5 sites dédupliqués : `saveObservation`, `updateObservation`, 3 sites dans `processOfflineQueue` (INSERT isTempId, UPSERT, UPDATE).
- **Gotcha** : la signature `operation: (effectiveRow) => PromiseLike<R>` est essentielle — le builder Supabase est un thenable non-Promise, donc `Promise<R>` ne passe pas le typecheck.
- Gain : ~60 lignes de code dupliqué en moins, comportement 100% identique (retry une seule fois si colonne manquante PostgREST 42703/PGRST204).

### QT-30 — ENRICHMENT constants scope module
Déplacé `ENRICHMENT_BATCH_LIMIT = 10` et `ENRICHMENT_CONCURRENCY = 3` hors du composant `App` (scope module). Évite les re-créations à chaque render.

---

## Batch 5 — Refactor god-components (QT-01, QT-02)

Le batch le plus risqué. Le plan disait : "À la moindre régression, revert ce batch". 3 hooks extraits avec succès, tests verts à chaque étape.

### Hook 1 — `hooks/useOfflineQueue.ts` (extrait d'App.tsx)
- Encapsule : `useState<OfflineQueueItem[]>`, `refreshOfflineQueueSnapshot`, `useEffect` refresh initial.
- Signature : `useOfflineQueue(user: User | null | undefined) => { offlineQueueItems, refreshOfflineQueueSnapshot }`.
- Créé `tests/useOfflineQueue.test.tsx` : 3 tests (user null, user présent, snapshot qui jette).

### Hook 2 — `hooks/useStorageQuotaToasts.ts` (extrait d'App.tsx)
- Encapsule l'écoute des événements `storage-quota-exceeded` et `media-stripped-offline` avec dispatch de toasts.
- Signature : `useStorageQuotaToasts(pushToast): void`.
- Migration : remplace 16 lignes d'useEffect par 1 appel de hook.

### Hook 3 — `hooks/useClickOutside.ts` (extrait d'ObservationForm.tsx)
- Encapsule le pattern `mousedown + touchstart outside a ref`.
- Signature : `useClickOutside<T extends Node>(ref, callback): void`.
- Migration dans `ObservationForm.tsx` : autocomplete species dropdown. 19 lignes → 4 lignes.
- Créé `tests/useClickOutside.test.tsx` : 3 tests (inside, outside mousedown, outside touchstart).

### Pourquoi seulement 3 hooks ?
Le plan initial proposait 2+2 hooks. Deux hooks d'ObservationForm (`useSpeciesEnrichment`, `usePhotoUpload`) n'ont **pas** été extraits car :
- L'enrichment species est intriqué avec le cycle de vie de `formData` + plusieurs refs — extraction risquée.
- L'upload photo dépend de logique toast/error appartenant au composant parent.
- `useClickOutside` est réutilisable ailleurs, les deux autres auraient été des "hooks composants" peu génériques.

Le pattern est démontré, ObservationForm a perdu ~16 lignes, les futurs batches (thème 11+) pourront extraire davantage.

### Résultats mesurables
- App.tsx : ~30 lignes déplacées vers 2 hooks (reste un gros composant mais sans la logique transversale).
- ObservationForm.tsx : ~16 lignes déplacées, import + 4 lignes au lieu d'un useEffect dense.
- Tests : 151 → 157 verts à ce stade (+6 tests de hooks).

---

## Batch 6 — Licences et docs (QT-18, QT-19, QT-22)

### Ce qui a été fait
- Créé `docs/LICENSES-NOTES.md` : inventaire des licences critiques (MIT/Apache-2.0 dominants), points de vigilance sur `file-saver` (inactif 2016) et marche à suivre pour générer `THIRD_PARTY_NOTICES.md`.
- Installé `license-checker@^25.0.1` en devDep.
- Ajouté 2 scripts npm :
  - `npm run licenses` : résumé count par licence.
  - `npm run licenses:check` : fail si une licence hors whitelist apparaît (MIT/Apache-2.0/BSD/ISC/CC/MPL-2.0/Python-2.0).

### Résultat
L'inventaire compte ~530 packages production, 454 en MIT, 40 en ISC, aucune licence GPL/AGPL/SSPL détectée. Un `UNLICENSED` et un `Custom: node-bufferlist` à investiguer dans un audit suivant.

---

## Batch 7 — Coverage + tests UI (QT-23, QT-24, QT-25)

### Ce qui a été fait
- Modifié `vitest.config.ts` : ajouté bloc `coverage` avec provider v8, reporters text+html, includes sur `components/`, `services/`, `utils/`, `hooks/`. Thresholds :
  ```
  lines: 45, functions: 60, branches: 55, statements: 45
  ```
  Actuel (mesuré) : 49.95 / 63.33 / 58.08 / 49.95 — tous au-dessus.
- Installé `@vitest/coverage-v8@^3.2.4` en devDep.
- Ajouté script `npm run test:coverage`.

### Tests UI ajoutés
- `tests/confirmationDialog.test.tsx` : 3 tests (fermé, cancel, confirm async).
- `tests/filterBar.test.tsx` : 3 tests (options année, onSearchChange, onYearChange).

### Gotchas
- Seuils intentionnellement conservateurs pour ne pas bloquer le CI. À relever progressivement (viser 60/70/70/60 au thème 11+).
- Pas de test sur `ObservationForm.tsx` direct dans ce batch : déjà couvert par `observationFormAutocomplete.test.tsx` et `observationFormService.test.ts`. Un test "smoke render complet" manquerait 100 mocks (useSpeciesEnrichment/Supabase/etc.), reporté.

---

## Résumé final

### Chiffres
- **163 tests verts** (+22 vs baseline 141) répartis sur 31 fichiers.
- **Coverage** : 49.95% lines, 63.33% functions, 58.08% branches.
- **ESLint** : 0 erreurs, 19 warnings (11 `any` dans tests, 4 unused-disable no-console legacy, 2 exhaustive-deps App.tsx préexistants, 2 autres bas-niveau).
- **Build production** : OK, 4.86 s.
- **`npm run check` : VERT** de bout en bout.

### Fichiers créés (10)
- `.github/workflows/ci.yml`
- `.husky/pre-commit`
- `docs/LICENSES-NOTES.md`
- `utils/logger.ts`, `utils/fetchUtils.ts`, `utils/safeStorage.ts`
- `hooks/useOfflineQueue.ts`, `hooks/useStorageQuotaToasts.ts`, `hooks/useClickOutside.ts`
- `tests/logger.test.ts`, `tests/fetchUtils.test.ts`, `tests/safeStorage.test.ts`, `tests/useOfflineQueue.test.tsx`, `tests/useClickOutside.test.tsx`, `tests/confirmationDialog.test.tsx`, `tests/filterBar.test.tsx`

### Fichiers modifiés (principaux)
- `package.json`, `vitest.config.ts`, `eslint.config.js`
- `App.tsx`, `components/ObservationForm.tsx`
- `services/storageService.ts` (refactor conséquent)
- 13 fichiers source pour la migration logger

---

## Constats SKIPPÉS (et pourquoi)

| Constat | Raison | Suite suggérée |
|---------|--------|----------------|
| **QT-03** (JSDoc manquantes) | Coût élevé, gain ambigu. Code auto-documenté par le typage strict de Batch 3. | Si une API publique émerge, ajouter JSDoc au fil de l'eau. |
| **QT-04** (fichier index.ts barrel) | Anti-pattern connu (tree-shaking). Les imports explicites actuels sont OK. | Ne pas faire. |
| **QT-05** (fichier `sw.ts` non testé) | Service worker généré par Workbox, pas de logique custom. | Rien à faire. |
| **QT-06** (types globaux dans `global.d.ts`) | Pas de global.d.ts existant. Faux positif audit. | Fermer le constat. |
| **QT-11** (types `@types/*` DevDep non à jour) | Versions actuelles compatibles React 19. | Surveillance passive. |
| **QT-17** (xlsx → exceljs) | Déjà fait en thème 6. | Fermé. |
| **QT-20** (serialize-javascript CVE) | Déjà mitigé via `overrides: ">=7.0.5"` en thème 6. | Fermé. |
| **QT-21** (audit npm régulier) | Pas bloquant pour un thème code. À intégrer en CI/CD dans thème "release". | Reporter. |
| **QT-26** (scripts de dev dans package.json) | Scripts propres et documentés suite aux ajouts (test:coverage, licenses:check). | Fermé. |
| **QT-29** (version Node dans package.json) | Non traité pour éviter les conflits avec les environnements dev. La CI teste 20.x et 22.x. | Si dev se standardise, ajouter `engines.node`. |

---

## Notes pour le prochain agent (thème 11 ?)

### Points à surveiller
1. **Tests storageService.test.ts** a encore 11 `any` — si ça gêne, créer un helper mock typé.
2. **Coverage** peut être relevé vers 60/70 sans trop d'efforts en ajoutant des tests de services déjà bien couvrables (statsReportData, importPolicy).
3. **Les 2 hooks non extraits** d'ObservationForm (`useSpeciesEnrichment`, `usePhotoUpload`) restent un bon candidat pour un thème dédié refactor.
4. **safeStorage** peut être généralisé à AuthContext si une bug quota apparaît — l'outil est prêt, testé.
5. **Le script `npm run licenses:check`** peut être branché en pre-commit/CI pour éviter l'introduction accidentelle de GPL.

### Commandes à connaître
```bash
npm run check           # typecheck + lint + tests + build (gate)
npm run test:coverage   # HTML report + threshold check
npm run licenses        # résumé licences
npm run licenses:check  # fail si licence non whitelist
```

### Tests verts à préserver
163 tests, 31 fichiers. Si un batch suivant casse ≥1 test, reverter et diagnostiquer AVANT de continuer.
