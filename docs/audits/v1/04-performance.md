# Audit Performance - Carnet Naturaliste v5.2

**Date** : 2025-03-28
**Version audit** : v1
**Statut** : Termine

## Resume executif

L'application presente des **faiblesses structurelles de performance** qui resteront invisibles avec un petit jeu de donnees (<200 observations) mais deviendront problematiques au-dela de 500. Les trois axes critiques sont : (1) **aucune virtualisation** des listes ni lazy-loading des images, (2) **zero `React.memo`** dans tout le projet combine a un composant `App` monolithique (30 `useState`), et (3) **~1 MB de JS charge inutilement** au demarrage (xlsx, jspdf, html2canvas) malgre un code splitting partiel. Le parsing Excel et la compression ZIP s'executent sur le main thread sans Web Worker.

**Niveau de preuve dominant** : STATIQUE (lecture de code) et INFERENCE (pas de mesures Lighthouse/profiling reelles).

## Methode et perimetre

- **Analyse statique** de tous les composants React, services, configuration Vite, et service worker
- **Estimation des poids** de bundle via les chunks configures dans `vite.config.ts`
- **Aucune mesure reelle** : pas de Lighthouse, pas de profiling Chrome DevTools, pas de test avec 1000+ observations
- Les conclusions sur l'impact reel restent au niveau INFERENCE tant qu'elles ne sont pas validees par mesure

## Constats

### Listes et rendu DOM

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| PE-01 | CRITIQUE | STATIQUE | ObservationList.tsx:363,577 | Pas de virtualisation : `.map()` rend toutes les observations en une passe DOM (cards mobile L:363, table desktop L:577). Aucune pagination, aucun `react-window`/`react-virtuoso`. | Avec 500+ obs, DOM lourd (500+ noeuds), scrolling saccade, freeze sur mobile. | Integrer `react-virtuoso` pour ne rendre que ~20-30 elements visibles. |
| PE-02 | CRITIQUE | STATIQUE | ObservationGallery.tsx:14-67 | Pas de virtualisation dans la galerie : `.map()` rend une card avec `<img>` pour chaque observation. Pas de `loading="lazy"` sur les images (L:28). | 500+ images telechargees simultanement, saturation bande passante, freeze mobile. | (1) Ajouter `loading="lazy"` sur `<img>` (fix 1 ligne). (2) Virtualiser avec `react-virtuoso`. |
| PE-03 | HAUTE | STATIQUE | ObservationRow.tsx:26, ObservationCard.tsx:25 | `React.memo` absent sur `ObservationRow` et `ObservationCard`, rendus N fois dans `.map()`. Les callbacks parents (`onEdit`, `onDelete`, `onToggle`) ne sont pas `useCallback` non plus, donc `memo` seul ne suffirait pas. | Chaque `setState` du parent recree tous les rows/cards. | Wrapper dans `React.memo` + `useCallback` sur les handlers parents. |

### Memoisation React

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| PE-04 | HAUTE | STATIQUE | Projet entier | **Zero `React.memo`** dans tout le projet (grep confirme). Aucun composant enfant n'est memoize. | Tout re-render parent cascade sur tous les enfants sans exception. | Priorite : memo sur Row, Card, MetricCard, Badges. |
| PE-05 | HAUTE | STATIQUE | App.tsx:307-533 | ~15 handlers (`handleAddObservation`, `handleEditObservation`, `handleDeleteRequest`, `handleSaveObservation`, `pushToast`, etc.) definis comme fonctions classiques, pas `useCallback`. Le seul `useCallback` est `refreshOfflineQueueSnapshot` (L:131). | Toutes ces fonctions sont recrees a chaque render de App, invalidant toute memoisation eventuelle des enfants. | Wrapper dans `useCallback` avec dependances appropriees. |
| PE-06 | HAUTE | INFERENCE | App.tsx:67-108 | App.tsx contient ~30 `useState`. Chaque `setState` (toggle dark mode, ouverture modale, toast) provoque un re-render complet de l'arbre. | Le filtrage est protege par `useMemo` dans `useObservationFilters`, mais la reconciliation JSX de tout l'arbre reste couteuse. | Extraire les etats modaux (sync center, dialogs, toasts) dans des composants/contextes dedies. |
| PE-07 | MOYENNE | STATIQUE | contexts/AuthContext.tsx:176-179 | `AuthContext.Provider value={{ session, user, loading, isOffline, signOut }}` cree un nouvel objet literal a chaque render, forcant le re-render de tous les consumers. `signOut` (L:167) n'est pas `useCallback`. | Changement de `isOffline` re-rend tous les `useAuth()` consumers inutilement. | `useMemo` sur l'objet `value` + `useCallback` sur `signOut`. |

### Bundle et chargement

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| PE-08 | HAUTE | STATIQUE | services/excelImportService.ts:1 | `import * as XLSX from 'xlsx'` est un import statique top-level. Le chunk `vendor-xlsx` (~420 KB) est charge des que ObservationList est rendu, meme si l'utilisateur n'importe jamais de fichier. Note : `observationExportService.ts:18` fait correctement `await import('xlsx')`. | ~420 KB charges inutilement pour la majorite des sessions. | `const XLSX = await import('xlsx')` dans `parseExcel()` uniquement. |
| PE-09 | HAUTE | STATIQUE | services/statsExportService.ts:1-4 | `import JSZip`, `import { jsPDF }`, `import html2canvas` sont des imports statiques. jsPDF (~383 KB) + html2canvas (~198 KB) charges meme sans export de stats. `backupService.ts:1-2` a le meme probleme avec JSZip + file-saver. | ~680 KB de vendors charges prematurement. | Convertir en dynamic imports dans les fonctions d'export/backup respectives. |
| PE-10 | MOYENNE | STATIQUE | vite.config.ts:114-138 | Pas de chunk vendor separe pour recharts, jszip, file-saver, react-calendar. recharts est inclus dans le chunk ObservationStats (~346 KB combine). | Cache invalidation sous-optimale : mise a jour de recharts invalide tout le chunk Stats. | Ajouter des entrees `manualChunks` pour ces librairies. |
| PE-11 | MOYENNE | STATIQUE | vite.config.ts:104 | `maximumFileSizeToCacheInBytes: 3 MB` dans la config PWA. Le precache Workbox inclut TOUS les chunks (xlsx, jspdf, html2canvas, etc.) soit ~2.5 MB telecharges au premier lancement. | Premier chargement lent, consommation data mobile importante. | Exclure les chunks rarement utilises du precache via `globIgnores`, les servir en runtime cache a la demande. |
| PE-12 | FAIBLE | STATIQUE | index.html:8-12 | Google Fonts charge de maniere bloquante dans `<head>` (Inter 5 weights + Merriweather). `display=swap` est utilise (bien). | Leger retard du FCP. | Acceptable. Self-hosting + subset des caracteres pour optimiser si necessaire. |

### Reseau et API

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| PE-13 | HAUTE | STATIQUE | App.tsx:246-286 | L'enrichissement startup fait jusqu'a 20 appels paralleles-par-3 a `fetchSpeciesInfo()`. Chaque appel enchaine jusqu'a 4 requetes sequentielles (iNat autocomplete, GBIF match, iNat France status, GBIF IUCN). **20 x 4 = ~80 requetes HTTP au demarrage**, meme si l'utilisateur ne consulte pas les fiches especes. | Demarrage lent (10-30s de reseau en arriere-plan), saturation bande passante, consommation data mobile. | Reduire `ENRICHMENT_BATCH_LIMIT` a 5-10. Ou enrichir a la demande (ouverture fiche). Cacher les resultats en IndexedDB. |
| PE-14 | MOYENNE | STATIQUE | services/speciesService.ts:620-668 | `fetchSpeciesInfo()` fait ses 4 appels API de maniere strictement sequentielle. GBIF match et iNat France status pourraient etre lances en parallele. | 2-3s de latence cumulative par espece. | `Promise.all([matchSpecies(...), fetchINatFranceStatus(...)])` pour les appels independants. |
| PE-15 | MOYENNE | INFERENCE | App.tsx:200-204 | `processOfflineQueue()` appele systematiquement au demarrage avant `getObservations()`. Si la queue est vide (cas frequent), un appel `supabase.auth.getUser()` inutile est fait, suivi d'un second dans `getObservations()`. | Double appel auth au demarrage. | Verifier `getQueue().length === 0` avant d'appeler `processOfflineQueue()`. |

### Operations main thread

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| PE-16 | HAUTE | STATIQUE | services/excelImportService.ts:186-406 | Parsing Excel (`XLSX.read()` + `sheet_to_json()` + mapping) entierement sur le main thread. `XLSX.read()` = decompression ZIP + parsing XML. Pour un fichier 10 MB / 5000+ lignes, freeze de 2-10 secondes. Le timeout 20s ne protege pas contre le gel UI (meme thread). | UI figee pendant l'import, apparence de crash, impossible d'annuler. | Deplacer dans un Web Worker. Alternative legere : decouper avec `setTimeout` entre tranches de lignes. |
| PE-17 | MOYENNE | STATIQUE | services/backupService.ts:191-199 | `zip.generateAsync()` de JSZip fait la compression DEFLATE sur le main thread. Avec des dizaines de photos, la compression peut prendre plusieurs secondes. | UI saccadee pendant la generation du ZIP. | Utiliser le callback de progression de JSZip + afficher un indicateur. Ou deplacer dans un Worker. |
| PE-18 | MOYENNE | STATIQUE | services/storageService.ts:292 | `JSON.stringify()` synchrone sur potentiellement des milliers d'observations, suivi de `localStorage.setItem()` (aussi synchrone et bloquant). | Micro-freeze (~50-200ms) apres chaque chargement/sauvegarde pour les gros jeux de donnees. | Migrer le cache observations vers IndexedDB (API asynchrone). |
| PE-19 | MOYENNE | STATIQUE | utils/imageUtils.ts:18 | `reader.readAsDataURL(file)` convertit le fichier entier en base64 (+33% memoire) avant de le dessiner sur Canvas. Pas de verification de taille (deja H1 dans audit precedent). | Pic memoire important pour de grandes photos. Crash possible sur mobile avec images 50 MB+. | Utiliser `URL.createObjectURL(file)` ou `createImageBitmap(file)` (zero copie base64). |

### Cache et stockage

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| PE-20 | MOYENNE | STATIQUE | services/speciesService.ts:37-38 | Le cache `speciesInfoCache` (Map en memoire) n'a pas de limite de taille. TTL 5 min mais pas de purge proactive -- les entrees expirees restent en memoire. | Fuite memoire lente sur les sessions longues avec beaucoup de recherches. | Ajouter un `MAX_CACHE_SIZE` (200 entrees) avec eviction LRU ou purge periodique. |
| PE-21 | MOYENNE | STATIQUE | services/storageService.ts:274-300 | `setLocalCache()` serialise la totalite des observations dans localStorage sans limite preemptive. Seul le catch sur `QuotaExceededError` protege. | Saturation du localStorage (limite ~5-10 MB par origine), ecriture bloquante. | Migrer vers IndexedDB ou limiter le cache aux N dernieres observations. |

### Carte Leaflet

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| PE-22 | HAUTE | STATIQUE | ObservationMap.tsx:255 | Popups DOM crees eagerly pour chaque marqueur via `marker.bindPopup(buildPopupContent(...))` dans le `forEach`. Chaque popup inclut un `<img>` qui declenche une requete reseau. | Avec 1000 obs, 1000 arbres DOM + 1000 requetes images pour des popups jamais ouverts. | Utiliser `marker.bindPopup(() => buildPopupContent(...))` (lazy, supporte depuis Leaflet 1.0). |
| PE-23 | HAUTE | STATIQUE | ObservationMap.tsx:210-278 | Les marqueurs sont detruits et recrees a chaque changement de `[observations, isDarkMode, onEdit]`. `onEdit` (non `useCallback`) change a chaque render parent. Un toggle dark mode recree TOUS les marqueurs. | Freeze notable avec 1000+ marqueurs a chaque re-render. | (1) `useCallback` sur `onEdit`. (2) Stocker `isDarkMode` dans un ref, ne reconstruire que les popups a l'ouverture. |
| PE-24 | MOYENNE | STATIQUE | ObservationMap.tsx:244-251 | `L.divIcon({ html: ... })` cree dans le `forEach` pour chaque observation. Pas de cache par groupe taxonomique -- N icones identiques creees pour N observations du meme taxon. | Creation d'objets redundants. | Cache `Map<string, L.Icon>` par `taxonomicGroup` en dehors de la boucle. |
| PE-25 | MOYENNE | STATIQUE | ObservationMap.tsx:190-207 | Pas de cache offline pour les tuiles de carte. Le service worker ne couvre pas les URLs de tuiles OpenStreetMap. | En mode offline (usage terrain), la carte est vide. Chaque visite retelecharge les tuiles. | Ajouter les tuiles au runtime cache du SW avec strategie `CacheFirst` ou utiliser `leaflet.offline`. |

### CSS et animations

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| PE-26 | MOYENNE | STATIQUE | 21 fichiers .tsx (51 occurrences) | `backdrop-blur-md` / `backdrop-blur-xl` utilise massivement sur cartes, panneaux, overlays. `backdrop-filter: blur()` est une operation GPU couteuse. | Jank potentiel sur mobile et GPU integres quand de nombreux elements blurres sont visibles simultanement (Stats, Gallery). | Reduire le nombre d'elements avec backdrop-blur visibles simultanement. Fallback `bg-white/95` sans blur via `prefers-reduced-motion`. |
| PE-27 | FAIBLE | STATIQUE | ObservationStats.tsx:11-37 | `useCountUp` utilise `requestAnimationFrame` + `setValue()` = re-render a chaque frame pendant 800ms. 3 MetricCards = ~180 re-renders en 800ms. | Impact contenu (seuls les MetricCards re-rendrent, pas le parent). | Utiliser un ref DOM (`textContent` update) au lieu de `setState` pour l'animation. |
| PE-28 | FAIBLE | STATIQUE | ObservationCalendar.tsx:108-183 | Bloc `<style>` de 75 lignes CSS inline dans le JSX, re-insere dans le DOM a chaque render. | Impact mineur -- re-parsing CSS a chaque render. | Deplacer dans un fichier CSS importe. |
| PE-29 | FAIBLE | STATIQUE | utils/statsReportData.ts:186 + Badges.tsx:10 | Les badges sont calcules deux fois : une fois dans `buildStatsReportData` et une fois dans le composant `Badges` avec son propre `useMemo`. | Calcul redondant, faible cout individuel. | Passer `stats.badges` en prop a `Badges` au lieu de recalculer. |

## Statistiques

- **Total constats** : 29
- **Critiques** : 2 | **Hautes** : 9 | **Moyennes** : 13 | **Faibles** : 5
- Par niveau de preuve : STATIQUE 27 | INFERENCE 2

## Points positifs

1. **Lazy loading des vues** : Les 5 vues principales (Form, Map, Stats, Gallery, Calendar) sont correctement lazy-loaded via `React.lazy()` dans App.tsx (L:29-32)
2. **Dynamic import pour l'export** : `observationExportService.ts:18` fait `await import('xlsx')` -- bon pattern, non applique dans l'import
3. **Filtrage memoize** : `useObservationFilters` protege le filtrage/tri via `useMemo` avec les bonnes dependances
4. **Deduplication des requetes especes** : `speciesInfoInFlightRequests` empeche les appels dupliques pour la meme espece
5. **Debounce autocomplete** : 300ms dans ObservationForm.tsx
6. **Timeouts sur les fetch externes** : `withTimeout()` dans speciesService.ts et locationService.ts
7. **Throttling Nominatim** : 1s minimum entre les appels geocoding (respect de la politique d'usage)
8. **Clustering Leaflet** : `MarkerClusterGroup` en place avec configuration appropriee
9. **Concurrence limitee** : Backup (4 workers), import (5 workers), enrichissement (3 workers) ont des limites de concurrence
10. **Carte proprement detruite** : `map.off()` + `map.remove()` dans le cleanup du useEffect, pas de fuite memoire
11. **Animations GPU-composable** : Toutes les transitions CSS utilisent `transform`/`opacity`, pas de layout thrashing
12. **Code splitting vendor** : chunks manuels pour leaflet, xlsx, jspdf, html2canvas (cache longue duree)

## Conclusion

L'application a une **base de code splitting correcte** (lazy loading des vues, chunks vendors) mais souffre de **lacunes fondamentales en optimisation React** (zero memo, callbacks instables, composant monolithique) et de **choix d'import statiques** qui annulent partiellement les benefices du splitting.

**Trois actions a plus fort impact** :
1. **Dynamic imports** pour xlsx/jspdf/html2canvas/jszip (PE-08, PE-09) -- gain ~1 MB, effort faible (30 min)
2. **`loading="lazy"` sur les images galerie** (PE-02) -- fix 1 ligne, gain immediat
3. **`useCallback` + `React.memo`** sur les handlers App.tsx et composants de liste (PE-03, PE-04, PE-05) -- prerequis structurel pour toute optimisation future

**Limite methodologique** : Sans mesures Lighthouse, profiling Chrome DevTools, ni tests avec 1000+ observations sur appareil mobile, tous les impacts estimes restent au niveau INFERENCE. Un test de charge reel est necessaire pour valider les priorites.
