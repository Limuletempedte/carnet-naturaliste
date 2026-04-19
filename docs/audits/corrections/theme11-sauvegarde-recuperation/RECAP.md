# Thème 11 — Sauvegarde, Récupération et Traçabilité — RECAP

**Date d'exécution** : 2026-04-18 → 2026-04-19
**Audit source** : `docs/audits/v1/11-sauvegarde-recuperation.md`
**Plan exécuté** : `C:\Users\eliot\.claude\plans\bonjours-j-ai-fais-dans-elegant-church.md`
**Baseline tests** : 163 (fin thème 10) → **190 tests verts (+27)**
**Quality gate** : `npm run check` vert (0 erreurs TypeScript, 0 erreurs ESLint, 19 warnings existants non bloquants)

---

## Vue d'ensemble

7 batches exécutés, **14 constats valides corrigés sur 20**. Les autres sont :
- **5 déjà corrigés** par des thèmes précédents (SR-07, SR-10, SR-16, SR-06, SR-20) — voir section « Déjà réglés ».
- **3 reportés** à des thèmes futurs car architecturaux (SR-05 backup incrémental, SR-15 historique versionné, SR-18 IndexedDB).

| Batch | Constats traités | Sévérité | Statut |
|-------|------------------|----------|--------|
| 1 — Corruption localStorage non silencieuse | SR-09 | CRITIQUE | ✅ |
| 2 — Fallback queue offline si Supabase échoue | SR-08 | CRITIQUE | ✅ |
| 5 — Timestamps serveur + cache quota | SR-14, SR-11 | HAUTE/MOYENNE | ✅ |
| 6 — Taille backup, banner critique, schema drift, doublons | SR-04, SR-12, SR-13, SR-19 | MOYENNE | ✅ |
| 3 — Backup fidèle : data: URLs inline + sons | SR-02, SR-03 | HAUTE | ✅ |
| 4 — Restauration depuis ZIP | SR-01 | CRITIQUE | ✅ |
| 7 — Event log persistant + section Sync Center | SR-17, SR-16b | FAIBLE/OPTIONNEL | ✅ |

Ordre d'exécution choisi : `1 → 2 → 5 → 6 → 3 → 4 → 7` (storage avant backup pour minimiser les conflits de merge, comme recommandé par le plan).

---

## Batch 1 — Corruption localStorage non silencieuse (SR-09)

### Ce qui a été fait
- Modifié `services/storageService.ts` :
  - `parseJson<T>(raw, fallback, onCorrupt?)` : nouvelle signature avec callback optionnel appelé uniquement si `JSON.parse` throw.
  - Ajout d'un helper `notifyStorageCorruption(scope: 'queue' | 'cache')` qui log via `logger.error` et dispatch `window.dispatchEvent(new CustomEvent('storage-corruption-detected', { detail: { scope } }))`.
  - `getQueue()` et `getLocalCache()` passent désormais `(err) => notifyStorageCorruption('queue'|'cache')` en 3ᵉ argument de `parseJson`.
- Créé `hooks/useStorageQuotaToasts.ts` (renommé en `.tsx` pour compat JSX) et l'étoffé pour écouter 3 events :
  - `storage-quota-exceeded` → toast warning existant.
  - `storage-corruption-detected` → toast error persistant « Cache local corrompu, données locales réinitialisées. Reconnectez-vous pour recharger depuis le serveur. »
  - `media-stripped-offline` → toast warning (hérité du thème précédent).
- Créé `tests/useStorageQuotaToasts.test.tsx` : 3 tests (1 par event).
- Ajouté dans `tests/storageService.test.ts` : 2 tests SR-09 qui invalident manuellement le JSON stocké et vérifient que l'event est dispatché + le fallback retourné.

### Pourquoi
Le `parseJson` d'origine (ligne 294-301) faisait un `catch {}` silencieux : toute corruption de `offlineQueue:{userId}` ou `local_observations_cache:{userId}` était interprétée comme « queue/cache vide », effaçant silencieusement des données locales non synchronisées. L'utilisateur n'en voyait rien.

### Gotchas
- Ne PAS logger la corruption depuis `parseJson` directement (lint circular) — passer par le callback.
- Le dispatch fonctionne bien sous jsdom (Vitest), pas besoin de polyfill `CustomEvent`.
- Événement scoped par `detail.scope` pour différencier queue/cache dans les logs.

---

## Batch 2 — Fallback queue offline sur erreur Supabase récupérable (SR-08)

### Ce qui a été fait
- Modifié `services/storageService.ts` :
  - Helper conservateur `isRecoverableNetworkError(error)` : détecte AbortError, TypeError (`fetch failed`), `PGRST301`, `status >= 500`, messages contenant `network`/`timeout`/`fetch`. **Ne détecte pas** les erreurs métier (401/403/42703/RLS).
  - `notifyRecoverableError(action, err)` : log warn + dispatch `supabase-recoverable-error`.
  - `saveObservation`, `updateObservation`, `deleteObservation` : try/catch autour de l'appel Supabase en mode online. Si `isRecoverableNetworkError(err)` :
    - `addToQueue('INSERT'|'UPDATE'|'DELETE', payload)` + `setLocalCache(...)`
    - dispatch event
    - return l'observation locale (temp-id pour INSERT) **sans throw**.
  - Les erreurs métier (RLS, validation, 401, etc.) continuent de throw — on ne camoufle pas les bugs.
- `useStorageQuotaToasts.tsx` : ajout d'un 4ᵉ listener `supabase-recoverable-error` → toast warning « Serveur injoignable, action mise en file d'attente. »
- Tests : +4 tests dans `tests/storageService.test.ts` (save/update/delete en 503 + erreur métier pass-through).

### Pourquoi
Avant ce batch, si `navigator.onLine === true` mais que Supabase timeoutait ou retournait un 503, l'erreur était jetée dans `App.tsx` qui affichait un toast d'erreur mais **perdait l'observation** (pas de queue, pas de cache). Offline-first cassé dès que le serveur hiccupait.

### Gotchas
- `isRecoverableNetworkError` doit rester **conservateur**. Mieux vaut rater un cas de fallback (l'utilisateur re-tente) que de cacher un bug RLS qui devrait remonter à l'UI.
- Pour les tests, il a fallu fournir explicitement `id: ''` sur les observations qui simulent un INSERT (sinon `saveObservation` détecte l'`id` existant et bypass la génération temp-id).
- L'observation retournée pour INSERT porte `temp-<uuid>`, ce qui déclenche le mapping INSERT→UPDATE lors du replay (existant depuis SI-05).

---

## Batch 5 — Timestamps serveur + cache quota (SR-14, SR-11)

### SR-14 — Exposer `createdAt`/`updatedAt`
- `types.ts` : ajouté à `Observation` deux champs optionnels `createdAt?: string; updatedAt?: string;` (ISO 8601). **Non-breaking** — tous les consommateurs existants ignorent les champs manquants.
- `services/storageService.ts` :
  - `ObservationRow` reçoit `created_at?: string; updated_at?: string;`.
  - `mapToObservation` mappe `createdAt: row.created_at ?? undefined, updatedAt: row.updated_at ?? undefined`.
  - `mapToRow` **ne touche pas** à ces colonnes : elles sont remplies côté serveur (trigger SQL existant depuis SI-24). On préserve ce contrat.
- Tests : +2 tests dans `tests/storageService.test.ts` qui vérifient le round-trip.

### SR-11 — Cache non persisté sur quota
- `setLocalCache` (dans `services/storageService.ts`) : quand l'écriture localStorage throw un `QuotaExceededError`, on log maintenant `logger.warn('[storageService] Cache local non persisté (quota) — données volatiles jusqu'au prochain load distant')` en plus du dispatch `storage-quota-exceeded` existant.
- Pas de refresh automatique : cela créerait un risque de boucle (refresh → quota → refresh). L'utilisateur est guidé par le toast vers une action manuelle.

### Pourquoi
SR-14 : l'UI n'avait aucune notion de la date d'enregistrement / dernière modification côté serveur, rendant impossibles les futures features « synchroniser depuis » ou « afficher les modifs récentes ».
SR-11 : le cache local bloqué sans information rendait les prochaines modifs « invisibles » jusqu'à reload.

### Gotchas
- Ajouter des champs optionnels à `Observation` peut casser un `Object.keys(obs).length === N` hard-coded. Aucune occurrence trouvée dans le code.
- Le round-trip `mapToRow(mapToObservation(row))` **perd** `createdAt`/`updatedAt` (comportement voulu — seul le serveur les écrit).

---

## Batch 6 — Taille backup, banner critique, schema drift, doublons (SR-04, SR-12, SR-13, SR-19)

### SR-04 — Confirmation avant backup volumineux
- `services/backupService.ts` :
  - Export `BACKUP_WARN_SIZE_BYTES = 300 * 1024 * 1024`.
  - `estimateBackupSize(observations: Observation[]): number` — additionne `longueur(data:URL)` et un placeholder de 500 Ko par URL http(s) non inline.
  - `createBackup` accepte désormais `options?: BackupOptions = { includeImages?: boolean; includeSounds?: boolean }`. Si `includeImages === false`, pas de fetch, `result.skippedImages = true`.
- `App.tsx` :
  - `handleCreateBackup` appelle `estimateBackupSize` **avant** `createBackup`. Si > 300 Mo, `window.confirm(...)` demande s'il faut exclure les images. Le résultat est passé en `{ includeImages }`.

### SR-12 — Banner d'erreur persistant
- `App.tsx` :
  - Nouveau state `criticalError: string | null` — distinct de l'`error` (toast auto-dismissé).
  - Nouveau banner rouge fixed top-0 z-[60] (au-dessus du reste), avec bouton « Fermer » explicite. Ne disparaît que manuellement.
  - Utilisé pour les cas vraiment graves (restore ZIP échoué, corruption détectée si besoin — non cascadé automatiquement pour l'instant, setter disponible pour usage futur).

### SR-13 — Schema drift visible
- `services/storageService.ts`, `withColumnFallback` : avant le retry, on dispatch désormais `schema-drift-detected` avec `detail.columns` (liste des colonnes strippées).
- `hooks/useStorageQuotaToasts.tsx` : listener `schema-drift-detected` → toast warning « Migration de schéma manquante, des données ne seront pas enregistrées. Colonnes concernées : ... »
- Test : +1 dans `tests/useStorageQuotaToasts.test.tsx`.

### SR-19 — Détection de doublons par contenu à l'import
- `services/importPolicy.ts` :
  - `buildContentKey(obs)` : `${speciesName.toLowerCase()}|${date}|${lat.toFixed(5)}|${lon.toFixed(5)}` (les GPS `null` participent au hash sous forme de chaîne vide, ce qui matche aussi les doublons sans GPS).
  - `detectContentDuplicates(incoming, existing): ContentDuplicate[]` retourne `{ key, incomingId, existingId }[]`.
- Tests : +3 dans `tests/importPolicy.test.ts` (match exact, pas de match si coords différentes, pas de match si espèce différente).

### Pourquoi (bloc)
- SR-04 : un backup de 500 Mo saturait la heap sans warning. Maintenant l'utilisateur choisit.
- SR-12 : un « échec de restauration » affiché 4 secondes est facilement raté. Banner persistant → l'utilisateur doit fermer.
- SR-13 : un drift de schéma (colonne manquante) était transparent, une feature semblait « marcher » puis perdre silencieusement ses données. Toast + logs warn → visible en devtools et sync center.
- SR-19 : importer 2× le même fichier créait des doublons sans alerte. Le helper est exposé pour Batch 4 (et utilisable plus tard par l'UI d'import).

### Gotchas
- `detectContentDuplicates` **n'est pas** encore branché dans l'UI d'import (`ImportPreviewDialog`). Le helper + les tests existent, la section UI est TODO mais le plan initial la marquait « si temps ». L'infrastructure est en place.
- Le banner `criticalError` n'est pas cascadé depuis `storage-corruption-detected` actuellement (le toast suffit pour l'instant). À re-câbler si on veut rendre la corruption localStorage « persistante ».

---

## Batch 3 — Backup fidèle : data: URLs inline + sons (SR-02, SR-03)

### Ce qui a été fait
- `services/backupService.ts`, refonte de la section media :
  - `classifyMediaUrl(url): 'data' | 'http' | 'blob' | 'other'`.
  - `decodeDataUrl(url)` : parse `data:<mime>;base64,<payload>` → `{ mime, bytes: Uint8Array }`.
  - Séparation en 3 listes :
    - `inline` (data:) → décodé localement, pas de fetch, compteur `inlineMediaCount`.
    - `remote` (http/https) → `fetchWithTimeout` comme avant.
    - `blobOnly` (blob:) → listé dans `MEDIAS_MANQUANTS.txt` avec raison explicite.
  - Les sons sont traités **symétriquement** dans un dossier `sounds/` (même chemin de code que images, même classifications).
- `BackupResult` étendu : `downloadedSounds`, `failedSounds`, `inlineMediaCount`, `skippedImages?`, `skippedSounds?`, `blobOnlyAssets?`.
- Manifest (`backup_manifest.json`) enrichi : `includeImages`, `includeSounds`, `downloadedSounds`, `failedSounds`, `failedSoundUrls`, `inlineMediaCount`, `blobOnlyAssets`.
- Renommage `IMAGES_MANQUANTES.txt` → `MEDIAS_MANQUANTS.txt` (couvre images + sons).
- Tests ajoutés à `tests/backupService.test.ts` :
  - SR-02 : data: URL → image inline, `fetch` non appelé.
  - SR-03 : `sound: data:audio/mp3;...` → `sounds/*` présent dans le ZIP.
  - SR-02 : `blob:http://...` → compté en failed, listé dans `MEDIAS_MANQUANTS.txt`.
  - SR-04 : `includeImages: false` → zéro fetch, `skippedImages=true`.
  - SR-04 : `estimateBackupSize` agrège data: URL + placeholder http.

### Pourquoi
Avant, `createBackup` fetchait bêtement `obs.photo` même si c'était un `data:` URL (cas offline) — le fetch échouait parfois, et toutes les photos offline finissaient en « manquantes ». Les sons étaient purement ignorés (pas de dossier `sounds/`).

### Gotchas
- TypeScript : `ReturnType<typeof zip.folder>` se résout vers la mauvaise surcharge JSZip (`JSZipObject[]`). Remplacé par `type ZipFolder = typeof zip | null;`.
- Cast `bytes.buffer as ArrayBuffer` nécessaire car `Uint8Array.buffer` est `ArrayBufferLike` sous TS strict.
- Les helpers `mediaFilenameCandidates(url)` et `blobToDataUrl(blob)` sont réutilisés par Batch 4.

---

## Batch 4 — Restauration depuis ZIP (SR-01)

### Ce qui a été fait
- `services/backupService.ts` :
  - Export `BACKUP_RESTORE_MAX_SIZE_BYTES = 500 * 1024 * 1024`.
  - `readBackupZip(file: File): Promise<ImportResult>` :
    - Throw si `file.size > 500 Mo`.
    - Ouvre le ZIP via `JSZip.loadAsync`. Throw si `data.json` manquant (message explicite).
    - Valide `data.json` via `parseJsonImport` (SI-28 réutilisé).
    - **Ré-injecte les data: URLs** absentes du JSON validé : `parseJsonImport` via `asOptionalUrl` (dans `jsonImportValidation.ts:31-39`) strippe les URLs non-http (sécurité). On lit le JSON brut, on matche par ID, et on restaure `photo`/`wikipediaImage`/`sound` uniquement si les data: URLs sont `data:image/*` ou `data:audio/*` (via `isAllowedDataUrl`).
    - Charge les fichiers `images/*` et `sounds/*` en `Blob`, convertit en data: URL via `blobToDataUrl`, branche sur les observations dont le champ est absent (fallback pour les ZIP créés par createBackup où photos et sons sont externes à `data.json`).
    - Retourne une `ImportResult` standard, compatible avec `ImportPreviewDialog`.
- `components/ObservationList.tsx` :
  - Extension de `handleFileChange` : accepte `.zip` → branche sur `readBackupZip`.
  - `accept=".json,.xlsx,.xls"` → `accept=".json,.xlsx,.xls,.zip"` (les 2 occurrences).
- Le restore passe ensuite par `buildImportPersistencePlan` + `ImportPreviewDialog` + `importPolicy` (flux existant, pas d'écrasement silencieux — l'utilisateur valide).
- Tests : +2 dans `tests/backupService.test.ts` (refus d'archive sans `data.json`, round-trip create → read).

### Pourquoi
Avant ce batch, un backup ZIP pouvait être créé mais **jamais restauré**. Un utilisateur qui écrasait son localStorage ou perdait son compte n'avait aucun chemin de récupération.

### Gotchas
- `asOptionalUrl` de `jsonImportValidation.ts` (ligne 31-39) ne laisse passer que `http://` et `https://`, pas `data:`. C'est **voulu** (sécurité XSS). Pour récupérer les data: URLs d'un backup, on relit le JSON brut **après** validation et on ré-injecte après vérif du MIME prefix.
- Le round-trip parfait (offline → ZIP → restore → upload Supabase) marche parce que les data: URLs ré-injectées seront transmises à INSERT/UPDATE via la queue, et SI-16 (upload automatique depuis data:URL) s'en occupe côté online.
- Garde-fou 500 Mo : au-delà, on rejette au lieu de risquer un OOM dans le JSZip loader.

---

## Batch 7 — Event log persistant + section Sync Center (SR-17, SR-16b)

### Ce qui a été fait
- Créé `utils/eventLog.ts` :
  - Buffer tournant `EventLogEntry[]`, capacity `EVENT_LOG_MAX = 50`, FIFO.
  - Persisté dans localStorage sous `EVENT_LOG_STORAGE_KEY = 'event-log-v1'`.
  - **N'importe PAS** `logger.ts` ni `safeStorage.ts` — utilise `localStorage.getItem/setItem` bruts entourés de try/catch. Raison : `logger.warn` appelle `pushEvent` → `pushEvent` appelle `safeSet` → `safeSet` appelle `logger.warn` en cas de quota. Boucle infinie garantie. Le flag `writing` et l'absence d'import de `logger` coupent les 2 voies.
  - Stringifier défensif (strings, Error → message, JSON.stringify, sinon `String(v)`) tronqué à 500 chars.
  - Export `__resetEventLogForTests` pour le harnais de tests.
- Modifié `utils/logger.ts` : les méthodes `warn` et `error` alimentent le buffer via `pushEvent(level, args)` avant d'écrire en console.
- Modifié `services/backupService.ts` (SR-16b) : `zip.file('event_log.json', JSON.stringify(getEventLog(), null, 2))` — entouré de try/catch pour ne jamais bloquer le backup si le journal échoue.
- Modifié `components/SyncCenterDialog.tsx` :
  - Nouvelle section « Derniers évènements » affichant les 10 dernières entrées en ordre inverse (plus récent en haut).
  - Badge coloré (rouge/ambre/gris) selon `level`, timestamp FR, message tronqué.
  - Scrollable (max-h-60) pour contenir la UI.
- Créé `tests/eventLog.test.ts` : 4 tests (push + stringification, truncation FIFO à `EVENT_LOG_MAX`, persistance/reload localStorage, `clearEventLog`).

### Pourquoi
- SR-17 : les warnings/errors étaient loggés en console mais inaccessibles à l'utilisateur final. Mettre un petit journal dans la Sync Center donne une visibilité rapide (« pourquoi ma sync a raté hier ? »).
- SR-16b : embarquer les logs récents dans le backup aide au support : l'utilisateur envoie son ZIP, l'équipe support lit `event_log.json` pour comprendre le contexte.

### Gotchas
- **Ne jamais** importer `logger` dans `eventLog.ts` (récursion infinie).
- **Ne jamais** importer `safeStorage` dans `eventLog.ts` (safeStorage appelle logger.warn en cas de quota).
- Le flag `writing` garde contre une récursion indirecte si jamais un `setItem` déclenche un event handler qui ré-appellerait `pushEvent`.
- Le test FIFO vérifie que `entry-10` est devant et `entry-{MAX+9}` à la fin — c'est une vérification clé de la rotation correcte.

---

## Déjà réglés par les thèmes précédents

| ID | Sévérité | Réglé par |
|----|----------|-----------|
| **SR-07** (Error Boundary) | CRITIQUE | BF-01 / thème 2 — `components/ErrorBoundary.tsx` wrap `<AuthProvider><App/>` dans `index.tsx`. |
| **SR-10** (sync non atomique) | HAUTE | SI-05 / thème 5 — `setQueue()` après chaque item réussi dans `storageService.ts:912-915`. |
| **SR-16** (logs non structurés) | MOYENNE | QT-13 / thème 10 — `utils/logger.ts` créé, 13 fichiers migrés. Le sous-aspect « buffer persistant / export » est traité ici en SR-16b (Batch 7). |
| **SR-06** (4 formats d'export) | INFO | Constat positif, rien à faire. |
| **SR-20** (IDs regénérés à l'import) | FAIBLE | SI-28 / thème 5 — `importPolicy.ts` préserve les UUIDs non-conflictuels. |

---

## Reportés (architecturaux, hors scope thème 11)

| ID | Sévérité | Motif du report |
|----|----------|------------------|
| **SR-05** — backup incrémental | MOYENNE | C'est une feature produit (changelog persisté, diff calculé). Scope thème dédié. |
| **SR-15** — historique versionné | HAUTE | Nécessite une table SQL dédiée + migrations + UI de diff/restore. Demande 8-12h, plus proche d'un thème à part entière. |
| **SR-18** — queue IndexedDB | HAUTE | Bascule de couche de persistance (localStorage → IndexedDB). Chevauche SI-15 (reporté du thème 5). Un mini-thème « persistence layer » cohérent couvrirait les deux. |

---

## Risques pour le thème 12

- **`types.ts`** : `Observation` a gagné `createdAt?` et `updatedAt?`. Les composants qui copient « toutes les clés » (`Object.keys(obs)` ou destructuring exhaustif) doivent être vérifiés. Les exports (CSV/Excel/JSON) continuent de fonctionner — aucun test n'a régressé.
- **`services/storageService.ts`** : 5 events dispatchés désormais — si thème 12 introduit son propre hook d'écoute, il partagera le bus global `window`. Prévoir un préfixe `carnet-naturaliste:` si on veut scoper plus tard (non bloquant aujourd'hui).
- **`services/backupService.ts`** : très largement refondé. Thème 12 pourrait vouloir ajouter des assets (documents ? exports statistiques attachés ?). Le pattern 3-listes (`inline` / `remote` / `blobOnly`) est réutilisable par analogie.
- **`components/ObservationList.tsx`** : `handleFileChange` accepte maintenant `.zip` — si thème 12 change le mime allow-list ou le flux d'import, tester le round-trip complet.
- **`utils/eventLog.ts`** : un thème qui voudrait ajouter des niveaux `debug`/`info` au buffer doit passer par `logger.ts` pour préserver le découplage (et accepter la même règle : pas de `safeStorage` depuis eventLog).
- **`components/ImportPreviewDialog.tsx`** : `detectContentDuplicates` est exposé mais **pas branché** dans l'UI du dialog. Si le thème 12 touche l'import, profiter-en pour afficher une section repliable « N doublons probables détectés ».

---

## Fichiers créés / modifiés

### Créés
- `docs/audits/corrections/theme11-sauvegarde-recuperation/RECAP.md` (ce fichier)
- `hooks/useStorageQuotaToasts.tsx` (ou étendu si existant dans le thème 5)
- `tests/useStorageQuotaToasts.test.tsx` (5 tests)
- `tests/eventLog.test.ts` (4 tests)
- `utils/eventLog.ts`

### Modifiés
- `App.tsx` — `criticalError` state + banner, `handleCreateBackup` avec `estimateBackupSize`.
- `components/ObservationList.tsx` — branche `.zip` dans `handleFileChange`, `accept` étendu.
- `components/SyncCenterDialog.tsx` — section « Derniers évènements ».
- `services/backupService.ts` — refonte majeure (SR-02, SR-03, SR-04, SR-01, SR-16b).
- `services/importPolicy.ts` — `detectContentDuplicates` (SR-19).
- `services/storageService.ts` — `parseJson` + callback, fallback queue, timestamps, schema drift.
- `tests/backupService.test.ts` — +7 tests.
- `tests/importPolicy.test.ts` — +3 tests.
- `tests/storageService.test.ts` — +8 tests.
- `types.ts` — `Observation.createdAt?` et `.updatedAt?`.
- `utils/logger.ts` — wire `pushEvent` dans `warn`/`error`.

---

## Quality gate final

```
Test Files  33 passed (33)
Tests       190 passed (190)
Duration    ~5 s
Build       ✓ built in ~5 s (PWA 41 precache entries)
ESLint      0 errors, 19 warnings (non-bloquants, hérités)
TypeScript  0 errors (strict mode)
```

Baseline départ : 163 → **190 (+27)**. Aucune régression.

---

## Parcours manuels à re-valider (QA)

Ces scénarios nécessitent une validation humaine en pré-release :

1. **Restore ZIP** : backup de 5 observations + 2 photos + 1 son → vider localStorage → restore → observations/média restaurés.
2. **Offline → online avec Supabase down** : bloquer Supabase via devtools (throttling → Offline ou blocage d'URL), sauver une obs → toast warning « Serveur injoignable », item visible dans Sync Center.
3. **Cache corrompu** : `localStorage.setItem('local_observations_cache:<userId>', 'garbage')` + reload → toast error persistant, cache reconstruit depuis Supabase.
4. **Backup photo offline** : ajouter une obs offline avec photo data: URL → backup → image dans `images/`, absente de `MEDIAS_MANQUANTS.txt`.
5. **Backup son** : idem avec un enregistrement audio → dossier `sounds/` présent.
6. **Timestamps** : ouvrir une observation synchronisée → `createdAt` / `updatedAt` disponibles dans les données (à exposer visuellement plus tard selon besoin).
7. **Doublons import** : importer 2× le même Excel en mode `no-overwrite` → `detectContentDuplicates` retourne les matches (branchement UI à faire en thème 12 ou dédié).
8. **Schema drift** : exécuter l'app contre une base sans colonne X (ex : `atlasCode`) → toast warning + logs console explicites.
9. **Banner critique** : déclencher `setCriticalError('test')` en devtools → banner rouge top-0 persistant jusqu'à clic Fermer.
10. **Event log** : ouvrir Sync Center après quelques warn/error → section « Derniers évènements » affichée, triée par date décroissante.

---

## Effort réel

- **Estimé** : ~16 h
- **Dépensé** : ~13 h (les batches storage ont été plus rapides que prévu grâce à la réutilisation des patterns thème 10 ; le batch 4 restauration a été dans les clous).
- **Tests ajoutés** : +27 (dépassé l'objectif de +18).
