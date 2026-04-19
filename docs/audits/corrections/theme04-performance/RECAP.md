# Recap Correction — Theme 04 : Performance

**Date** : 2026-04-04
**Agent** : Claude Opus 4.6
**Statut** : TERMINE — 17 corrections appliquees, 98/98 tests pass, build OK

---

## Resultat final

- **`npm run check`** : typecheck OK, lint 0 erreurs, 98/98 tests pass, build OK
- **7 batches executes** — tous valides par le quality gate apres chaque batch
- **0 regression** introduite
- **0 nouveau test** ajoute (corrections purement structurelles/config)
- **Precache reduit** : 5292 KiB -> 4196 KiB (**-1096 KiB, -20.7%**)

---

## Metriques de build avant/apres

| Metrique | Avant | Apres | Delta |
|----------|-------|-------|-------|
| Precache total | 5292 KiB (31 entries) | 4196 KiB (29 entries) | **-1096 KiB (-20.7%)** |
| ObservationStats chunk | 354 KB | 14 KB | -340 KB (recharts dans vendor-recharts) |
| ObservationCalendar chunk | 43 KB | 4 KB | -39 KB (react-calendar dans vendor-react-calendar) |
| index.js (app principal) | 142 KB | 143 KB | +1 KB (useCallback overhead) |

---

## Corrections appliquees par batch

### Batch 1 — Dynamic Imports (PE-08, PE-09) [HAUTE]
| ID | Fichier | Correction |
|----|---------|------------|
| PE-08 | `services/excelImportService.ts` | Import statique `import * as XLSX` → lazy module-level variable `_XLSX` + `loadXLSX()` async. XLSX charge uniquement quand `parseExcel()` est appele. `_XLSX!.SSF.parse_date_code` pour la fonction `parseDate`. |
| PE-09 | `services/statsExportService.ts` | Imports statiques JSZip, jsPDF, html2canvas, saveAs supprimes. Dynamic imports dans `generatePdfBlob()` (`Promise.all` pour jspdf+html2canvas) et `exportStatsBundle()` (jszip, file-saver). |
| PE-09 | `services/backupService.ts` | Imports statiques JSZip, saveAs supprimes. Dynamic imports dans `createBackup()`. |

### Batch 2 — Images lazy loading (PE-02 partiel) [1-line fix]
| ID | Fichier | Correction |
|----|---------|------------|
| PE-02 | `components/ObservationGallery.tsx` | `loading="lazy"` ajoute sur `<img>` photo/wikipedia (L:30) et logo taxon (L:38) |
| PE-02 | `components/ObservationCard.tsx` | `loading="lazy"` sur les 3 `<img>` (photo L:41, wikipedia L:43, logo taxon L:47) |
| PE-02 | `components/ObservationRow.tsx` | `loading="lazy"` sur `<img>` espece (L:54) |

### Batch 3 — React.memo + useCallback (PE-03, PE-05, PE-07) [HAUTE]
| ID | Fichier | Correction |
|----|---------|------------|
| PE-03 | `components/ObservationRow.tsx` | Composant wrappe dans `React.memo()` |
| PE-03 | `components/ObservationCard.tsx` | Composant wrappe dans `React.memo()` |
| PE-03 | `components/ObservationGallery.tsx` | Composant wrappe dans `React.memo()` |
| PE-05 | `App.tsx` | `useCallback` sur : `removeToast` (deps: []), `pushToast` (deps: []), `handleAddObservation` (deps: []), `handleEditObservation` (deps: [observations]), `handleDeleteRequest` (deps: [observations, isImporting, refreshOfflineQueueSnapshot]), `handleCancel` (deps: []) |
| PE-07 | `contexts/AuthContext.tsx` | `useCallback` sur `signOut` (deps: [user]), `useMemo` sur la valeur du Provider (deps: [session, user, loading, isOffline, signOut]) |

### Batch 4 — Leaflet optimisations (PE-22, PE-23, PE-24) [HAUTE]
| ID | Fichier | Correction |
|----|---------|------------|
| PE-22 | `components/ObservationMap.tsx` | `marker.bindPopup(buildPopupContent(...))` → `marker.bindPopup(() => buildPopupContent(...))` (lazy, popup DOM cree a l'ouverture seulement) |
| PE-23 | `components/ObservationMap.tsx` | `onEdit` et `isDarkMode` stockes dans des `useRef`. Retires des deps du useEffect marqueurs → `[observations]` seul. Les refs sont lus dans le callback lazy du popup. |
| PE-24 | `components/ObservationMap.tsx` | Cache `Map<string, L.Icon>` pour les divIcon par groupe taxonomique. Evite de recreer N icones identiques. |

### Batch 5 — Reseau (PE-13, PE-14, PE-15) [HAUTE/MOYENNE]
| ID | Fichier | Correction |
|----|---------|------------|
| PE-13 | `App.tsx` | `ENRICHMENT_BATCH_LIMIT` reduit de 20 a 10 (max 40 requetes au lieu de 80) |
| PE-14 | `services/speciesService.ts` | Appels GBIF taxonomy (`matchSpecies`) et iNat France red list (`fetchINatFranceStatus`) lances en parallele via `Promise.allSettled`. Fallback GBIF IUCN reste sequentiel. Abort errors correctement propagees. |
| PE-15 | `App.tsx` | `getOfflineQueueSnapshot()` verifie avant `processOfflineQueue()` — skip si queue vide, evite un appel auth inutile |

### Batch 6 — Fixes mineurs (PE-20, PE-28) [MOYENNE/FAIBLE]
| ID | Fichier | Correction |
|----|---------|------------|
| PE-20 | `services/speciesService.ts` | `MAX_SPECIES_CACHE_SIZE = 200`. Eviction FIFO (suppression de la premiere entree Map) quand le cache atteint la limite. |
| PE-28 | `components/ObservationCalendar.tsx` + `calendar.css` | 80 lignes de `<style>` inline extraites dans `calendar.css`. Import CSS au top du composant. |

### Batch 7 — Config Vite (PE-10, PE-11) [MOYENNE]
| ID | Fichier | Correction |
|----|---------|------------|
| PE-10 | `vite.config.ts` | Nouveaux manualChunks : `vendor-recharts` (recharts + d3), `vendor-jszip`, `vendor-file-saver`, `vendor-react-calendar`. Meilleure invalidation de cache CDN. |
| PE-11 | `vite.config.ts` | `globIgnores` etendu : `vendor-xlsx*`, `vendor-jspdf*`, `vendor-html2canvas*`, `vendor-jszip*`, `vendor-file-saver*` exclus du precache Workbox. Charges a la demande via runtime cache. |

---

## Constats invalides / reportes

| ID | Raison du skip |
|----|---------------|
| PE-01 | Virtualisation liste — necessite `react-virtuoso` (nouvelle dep), risque eleve, reporter |
| PE-02 full | Virtualisation galerie — meme raison. `loading="lazy"` applique comme mitigation |
| PE-04 | React.memo sur TOUT le projet — trop large. Row/Card/Gallery suffisent pour le cas courant |
| PE-06 | Extraire etats modaux de App.tsx — refactoring architectural majeur, interdit par contraintes |
| PE-12 | Google Fonts bloquantes — sera traite dans theme 07 (RGPD, self-hosting) |
| PE-16 | Web Worker pour parsing Excel — complexe, gain incertain sans mesure, reporter |
| PE-17 | Web Worker pour compression ZIP — meme raison |
| PE-18/PE-21 | Migration localStorage → IndexedDB — changement architectural majeur |
| PE-19 | `createObjectURL` au lieu de `readAsDataURL` — conflit avec theme 01 FO-01 qui utilise explicitement readAsDataURL pour les photos offline |
| PE-25 | Cache tuiles offline — necessite `leaflet.offline` ou config Workbox avancee, reporter |
| PE-26 | Reduire `backdrop-blur` — changement de design, pas de performance pure |
| PE-27 | countUp via ref DOM — impact negligeable (3 MetricCards), complexifie le code |
| PE-29 | Passer badges en prop — les deux calculs sont memoizes, gain nul |

---

## Bugs rencontres pendant l'implementation

Aucun bug rencontre. Toutes les corrections ont passe le quality gate du premier coup.

---

## Points d'attention pour le prochain agent (theme 5+)

### Fichiers modifies par ce theme
- **`App.tsx`** — useCallback sur 6 handlers, ENRICHMENT_BATCH_LIMIT 20→10, skip processOfflineQueue si queue vide
- **`services/excelImportService.ts`** — import xlsx dynamique (variable module-level `_XLSX`)
- **`services/statsExportService.ts`** — imports dynamiques jspdf, html2canvas, jszip, file-saver
- **`services/backupService.ts`** — imports dynamiques jszip, file-saver
- **`services/speciesService.ts`** — Promise.allSettled pour API paralleles, MAX_SPECIES_CACHE_SIZE=200
- **`components/ObservationRow.tsx`** — React.memo, loading="lazy"
- **`components/ObservationCard.tsx`** — React.memo, loading="lazy"
- **`components/ObservationGallery.tsx`** — React.memo, loading="lazy"
- **`components/ObservationMap.tsx`** — refs onEdit/isDarkMode, lazy popup, icon cache, deps useEffect [observations] seul
- **`components/ObservationCalendar.tsx`** — import calendar.css, suppression `<style>` inline
- **`contexts/AuthContext.tsx`** — useCallback signOut, useMemo contextValue
- **`vite.config.ts`** — 4 nouveaux manualChunks, globIgnores etendu
- **`calendar.css`** — **CREE** : styles calendrier extraits

### Risques de conflit inter-themes
- **Theme 05 (Sync/Integrite)** : `storageService.ts` n'a PAS ete modifie par ce theme. Mais `App.tsx` a ete modifie (useCallback handlers, skip queue). Attention au merge.
- **Theme 06 (Securite)** : `vite.config.ts` modifie (manualChunks + globIgnores). Si CSP est ajoutee dans vercel.json, pas de conflit direct.
- **Theme 08 (Accessibilite)** : Les composants ObservationRow/Card/Gallery ont React.memo. Si l'accessibilite ajoute de nouvelles props, React.memo continuera de fonctionner (shallow comparison).
- **Theme 10 (Qualite)** : Si App.tsx est refactore (extraction du composant monolithique), les useCallback devront etre adaptes.
- **Theme 12 (Valeur)** : `speciesService.ts` a ete modifie (Promise.allSettled + cache limit). Si de nouvelles APIs sont ajoutees, adapter la logique parallele.

### Patterns utilises
- **Lazy module-level variable** pour xlsx : `let _XLSX: typeof import('xlsx') | null = null` + `loadXLSX()`. Permet un dynamic import dans une fonction async tout en rendant le module disponible pour les fonctions synchrones appelees depuis le callback.
- **useRef pattern pour deps useEffect** : `onEditRef.current = onEdit` en dehors du useEffect, utilise dans le callback lazy du popup. Evite de reconstruire les marqueurs quand seul `onEdit` change.
- **Promise.allSettled** au lieu de Promise.all : permet de gerer les erreurs individuellement (abort errors propagees, autres errors ignorees avec fallback).
- **FIFO cache eviction** : `speciesInfoCache.keys().next().value` pour supprimer la plus ancienne entree (Map preserve l'ordre d'insertion).

### Quality gate
Toujours lancer `npm run check` apres chaque batch. 98 tests doivent passer.

---

## Fichiers crees/modifies par cet agent

| Fichier | Action |
|---------|--------|
| `calendar.css` | Cree — styles calendrier extraits de ObservationCalendar.tsx |
| `docs/audits/corrections/theme04-performance/RECAP.md` | Cree — ce fichier |
| `.claude/plans/partitioned-prancing-mitten.md` | Cree — plan de correction detaille |
| 12 fichiers source modifies | Voir liste ci-dessus |
