# Recap Correction — Theme 01 : Fonctionnel

**Date** : 2026-04-01
**Agent** : Claude Opus 4.6
**Statut** : TERMINE — 27 corrections appliquees, 90 tests OK, build OK

---

## Resultat final

- **`npm run check`** : typecheck OK, lint 0 erreurs, 90/90 tests pass, build OK
- **7 batches executes** — tous valides par le quality gate apres chaque batch
- **0 regression** introduite

---

## Corrections appliquees par batch

### Batch 1 — Integrite des donnees (CRITIQUE)
| ID | Fichier | Correction |
|----|---------|------------|
| FO-01 | `ObservationForm.tsx` | Photo offline conservee en data-URL via `FileReader.readAsDataURL()` au lieu d'etre jetee |
| FO-09 | `App.tsx` | Ordre inverse : `setObservations()` (state) avant `bulkUpsertObservationsInCache()` |

### Batch 2 — Filtres geospatiaux (CRITIQUE/HAUTE)
| ID | Fichier | Correction |
|----|---------|------------|
| FO-28 | `AdvancedFilterDialog.tsx` | Validation inline lat/lon/radius/bbox avec bordure rouge + erreur |
| FO-29/30 | `useObservationFilters.ts` | Flag `geoFilterIncomplete` expose quand params GPS invalides/incomplets |
| FO-32 | `AdvancedFilterDialog.tsx` | Warning ambre quand bornes bbox inversees |

### Batch 3 — Robustesse App.tsx (HAUTE/MOYENNE)
| ID | Fichier | Correction |
|----|---------|------------|
| FO-02 | `App.tsx` | `finally { setConfirmation(null) }` dans le handler delete |
| FO-03 | `App.tsx` | Bulk delete : affiche les noms des especes echouees (max 3 + "et N autre(s)") |
| FO-04 | — | **Non-issue** : photo deja correctement mergee via `buildObservationFromForm` |
| FO-14 | — | **Non-issue** : Map<string, Observation> deduplique naturellement par ID |

### Batch 4 — Carte & GPS (HAUTE)
| ID | Fichier | Correction |
|----|---------|------------|
| FO-22 | `MapInput.tsx` | Debounce 2s pour `reverseGeocode` dans `watchPosition` + cleanup timer |
| FO-23 | `MapInput.tsx` | Guard `if (result?.address)` au lieu de `if (result)` |
| FO-24 | `ObservationMap.tsx` | Guard `obs.gps &&` avant acces aux proprietes GPS |
| FO-25 | — | **Deja fixe** : historique limite a 5 via `.slice(0, 5)` |

### Batch 5 — Resilience APIs externes (HAUTE)
| ID | Fichier | Correction |
|----|---------|------------|
| FO-38 | `speciesService.ts` | Callback `onWarning` pour signaler indisponibilite iNaturalist |
| FO-39 | `speciesService.ts` | Cle de dedup composite `latinName|displayName` (preserve especes homonymes) |
| FO-40 | `locationService.ts` | Lecture header `Retry-After` sur reponse 429 Nominatim (cap 10s) |
| FO-11 | `excelImportService.ts` | Warning ventilation enrichi avec valeurs detaillees |

### Batch 6 — Validation formulaire & UX (MOYENNE)
| ID | Fichier | Correction |
|----|---------|------------|
| FO-05 | `ObservationForm.tsx` | Toast info "Le comptage minimum est 1" quand count < 1 est corrige |
| FO-06 | `ObservationForm.tsx` | Validation temps reel de la somme ventilation vs total (erreur rouge inline) |
| FO-34 | `ObservationCalendar.tsx` | Gestion date range : `Array.isArray(date) ? date[0] : date` |
| FO-36 | `StatsExportDialog.tsx` | Validation startDate <= endDate + erreur inline + bouton desactive |
| FO-37 | `ObservationStats.tsx` | Tooltip clamp : `Math.max(8, Math.min(...))` pour eviter le debordement gauche |

### Batch 7 — Sync offline & race conditions (HAUTE/MOYENNE)
| ID | Fichier | Correction |
|----|---------|------------|
| FO-47/48 | `storageService.ts` + `SyncCenterDialog.tsx` | Items SKIP_TEMP_ID collectes dans `skippedItems[]` au lieu de `failedItems`. Nouveau type `SkippedSyncItem`. Section dediee dans SyncCenter avec explication |
| FO-12 | `excelImportService.ts` | `reader.abort()` ajoute avant `safeResolve` dans le timeout handler |
| FO-13 | `backupService.ts` | IMAGES_MANQUANTES.txt enrichi avec la liste numerotee des URLs echouees |
| FO-44 | `ObservationForm.tsx` | Suppression du `setTimeout(120ms)` fragile sur blur — les boutons suggestion utilisent deja `onMouseDown` + `preventDefault` |
| FO-45 | `ObservationForm.tsx` | Blob URLs trackees dans `useRef<Set<string>>()` — revocation uniquement au unmount final |

---

## Constats invalides (non corriges)

| ID | Raison |
|----|--------|
| FO-10 | Validation stricte JSON intentionnelle par design |
| FO-31 | `obs.gps.lat === null` est un null-check correct |
| FO-46 | `clearTimeout(timeoutId)` deja present dans le cleanup |

## Constats FAIBLES reportes

FO-07, FO-08, FO-19, FO-20, FO-21, FO-27, FO-33, FO-43 — severite trop faible pour cette passe.

---

## Points d'attention pour le prochain agent (theme 2+)

### Fichiers modifies par ce theme
- `App.tsx` — handlers delete + import merge (lignes ~322, ~346, ~479)
- `ObservationForm.tsx` — photo offline, blur/click, blob URLs, count/ventilation validation
- `AdvancedFilterDialog.tsx` — validation GPS inline
- `useObservationFilters.ts` — flag geoFilterIncomplete + validation coordonnees
- `MapInput.tsx` — debounce reverseGeocode dans watchPosition
- `ObservationMap.tsx` — guard `obs.gps &&`
- `ObservationCalendar.tsx` — date range handling
- `StatsExportDialog.tsx` — date validation
- `ObservationStats.tsx` — tooltip clamp
- `speciesService.ts` — onWarning callback + dedup composite
- `locationService.ts` — Retry-After header
- `excelImportService.ts` — reader.abort() + warning ventilation
- `backupService.ts` — IMAGES_MANQUANTES.txt enrichi
- `storageService.ts` — type SkippedSyncItem + skippedItems dans OfflineSyncResult
- `SyncCenterDialog.tsx` — section items ignores

### Risques de conflit inter-themes
- **Theme 5 (Sync/Integrite)** travaille aussi sur `storageService.ts` — attention au type `OfflineSyncResult` modifie (ajout `skippedItems`)
- **Theme 4 (Performance)** pourrait toucher `speciesService.ts` — le callback `onWarning` est optionnel donc compatible
- **Theme 11 (Sauvegarde)** touche `backupService.ts` — le format de IMAGES_MANQUANTES.txt a change

### Quality gate
Toujours lancer `npm run check` apres chaque batch. 90 tests doivent passer.

---

## Fichiers crees/modifies par cet agent

| Fichier | Action |
|---------|--------|
| `.claude/plans/reflective-moseying-truffle.md` | Cree — plan de correction detaille |
| `docs/audits/corrections/theme01-fonctionnel/RECAP.md` | Cree puis mis a jour — ce fichier |
