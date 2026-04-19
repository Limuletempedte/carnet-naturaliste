# Recap Correction — Theme 06 : Securite

**Date** : 2026-04-04
**Agent** : Claude Opus 4.6
**Statut** : TERMINE — 13 corrections appliquees, 112/112 tests pass, build OK

---

## Resultat final

- **`npm run check`** : typecheck OK, lint 0 erreurs, 112/112 tests pass, build OK
- **6 batches executes** — tous valides par le quality gate apres chaque batch
- **0 regression** introduite
- **14 nouveaux tests** ajoutes (de 98 a 112)
- **Precache** : 4200 KiB (stable, exceljs exclu du precache)
- **xlsx supprime** : vulnerabilites CVE Prototype Pollution + ReDoS eliminees

---

## Corrections appliquees par batch

### Batch 1 — Headers securite (SE-01, SE-08, SE-14)
| ID | Fichier | Correction |
|----|---------|------------|
| SE-01 | `vercel.json` | Header `Content-Security-Policy` complet : `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https://*.supabase.co https://*.inaturalist.org https://upload.wikimedia.org https://server.arcgisonline.com https://*.tile.openstreetmap.org https://*.tile.opentopomap.org https://*.basemaps.cartocdn.com; connect-src 'self' https://*.supabase.co https://api.inaturalist.org https://api.gbif.org https://nominatim.openstreetmap.org https://api.open-meteo.com; font-src 'self' https://fonts.gstatic.com; worker-src 'self' blob:; manifest-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'` |
| SE-08 | `vercel.json` | Header `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` |
| SE-14 | `package.json` | Override `serialize-javascript` mis a jour de `7.0.4` a `>=7.0.5` |

### Batch 2 — Gardes de validation (SE-15, SE-02, SE-03, SE-20)
| ID | Fichier | Correction |
|----|---------|------------|
| SE-15 | `components/ObservationForm.tsx` | Limite 20 Mo sur les photos avant compression (`file.size > 20*1024*1024`) avec message d'erreur utilisateur |
| SE-02 | `services/storageService.ts` | Whitelist MIME pour upload son : `audio/mpeg, audio/ogg, audio/wav, audio/webm, audio/mp4, audio/x-m4a`. Rejet avec message francais |
| SE-03 | `services/jsonImportValidation.ts` | Helper `asOptionalUrl()` remplace `asOptionalString()` pour photo/sound/wikipediaImage. N'accepte que `http:` et `https:` |
| SE-20 | `tests/observationFormService.test.ts` | 4 tests GPS bounds (validation existante confirmee aux lignes 41-42 de observationFormService.ts) |

### Batch 3 — Utilitaire URL safe (SE-04)
| ID | Fichier | Correction |
|----|---------|------------|
| SE-04 | `utils/urlUtils.ts` (CREE) | Fonction `isSafeImageUrl()` extraite et partagee — accepte http:, https:, blob:, rejette javascript:, data: |
| SE-04 | `components/ObservationMap.tsx` | Suppression fonction locale, import depuis utils |
| SE-04 | `components/ObservationCard.tsx` | Garde isSafeImageUrl sur photo et wikipediaImage |
| SE-04 | `components/ObservationGallery.tsx` | Garde isSafeImageUrl sur imageSrc |
| SE-04 | `components/ObservationRow.tsx` | Garde isSafeImageUrl sur imageSrc |
| SE-04 | `components/ObservationForm.tsx` | Garde isSafeImageUrl sur speciesInfo.imageUrl |

### Batch 4 — Durcissement auth (SE-07, SE-09, SE-17)
| ID | Fichier | Correction |
|----|---------|------------|
| SE-07 | `components/Auth/Login.tsx` | Protection brute force cote client : compteur de tentatives, backoff exponentiel apres 3 echecs (5s, 10s, 20s... max 2min), bouton desactive + countdown visible |
| SE-09 | `contexts/AuthContext.tsx` | Dans le catch de signOut offline, suppression explicite de `sb-<ref>-auth-token` du localStorage (ref derivee dynamiquement de VITE_SUPABASE_URL) |
| SE-17 | `contexts/AuthContext.tsx` | Cache session reduit : stocke uniquement `{id, user_metadata.display_name}` au lieu de l'objet User complet (email, metadata supprimees). Schema_version bump 2→3 (invalidation auto des anciens caches) |

### Batch 5 — Migration xlsx vers exceljs (SE-13)
| ID | Fichier | Correction |
|----|---------|------------|
| SE-13 | `package.json` | `xlsx ^0.18.5` supprime, `exceljs ^4.4.0` installe |
| SE-13 | `services/excelImportService.ts` | Migration complete : lazy loading ExcelJS, `workbook.xlsx.load()` au lieu de `XLSX.read()`, conversion manuelle lignes/cellules avec `normalizeCellValue()`, serial date conversion avec `excelSerialToDate()` |
| SE-13 | `services/observationExportService.ts` | Migration complete : `ExcelJS.Workbook` avec colonnes nommees, `workbook.xlsx.writeBuffer()` + Blob download |
| SE-13 | `vite.config.ts` | `vendor-xlsx` → `vendor-exceljs` dans manualChunks et globIgnores |
| SE-13 | `tests/excelImportService.test.ts` | Helper `createExcelFile` reecrit avec ExcelJS (async) |

### Batch 6 — Documentation (SE-05)
| ID | Fichier | Correction |
|----|---------|------------|
| SE-05 | `services/speciesService.ts` | Commentaire JSDoc sur `stripHtml()` : "best-effort, React echappement = vraie protection XSS" |

---

## Constats deja corriges par les themes precedents (skips)

| ID | Corrige par | Theme |
|----|------------|-------|
| SE-06 (M) | `mapSupabaseAuthError()` dans Login.tsx | Theme 03 (UX-15) |
| SE-10 (H) | `WITH CHECK` dans migration SQL | Theme 05 (SI-19) |
| SE-11 (H) | Documente comme choix intentionnel | Theme 05 (SI-25) |
| SE-12 (I) | Constat positif (RLS correcte) | — |
| SE-16 (F) | Canvas strip EXIF de facto | — |
| SE-18 (M) | Acceptable avec CSP en place | — |

---

## Constats differes (hors scope)

| ID | Severite | Raison |
|----|----------|--------|
| SE-19 | FAIBLE | Self-hosting Google Fonts → Theme 07 (RGPD/Privacy). Lie a VP-20/CO-20. |

---

## Bugs rencontres pendant l'implementation

### 1. Test JSON import — valeurs enum incorrectes (Batch 2)
- **Probleme** : Le test `jsonImportValidation.test.ts` utilisait des labels francais (`'Inconnu'`, `'Non evalue'`) au lieu des valeurs enum reelles (`'Non renseigne'`, `'NE'`)
- **Solution** : Correction des valeurs pour matcher les enums TypeScript
- **Impact** : 0 regression, le test passe correctement

### 2. Test JSON import — format GPS (Batch 2)
- **Probleme** : Le test avait `lat/lon` a plat au lieu de `gps: { lat, lon }` comme attendu par la validation
- **Solution** : Restructure les donnees de test avec l'objet `gps` imbrique
- **Impact** : 0 regression

### 3. Test isSafeImageUrl — string vide (Batch 3)
- **Probleme** : `new URL('', window.location.origin)` ne throw pas, retourne l'URL d'origine (http:) → test attendait `false` mais obtenait `true`
- **Solution** : Ajout d'une garde `if (!value) return false` en debut de fonction
- **Impact** : Meilleure robustesse de la fonction

---

## Points d'attention pour le prochain agent (theme 7+)

### Fichiers modifies par ce theme
- **`vercel.json`** — CSP + HSTS ajoutes
- **`package.json`** — xlsx supprime, exceljs ajoute, serialize-javascript override mis a jour
- **`components/ObservationForm.tsx`** — limite photo 20Mo, import isSafeImageUrl, garde speciesInfo.imageUrl
- **`components/Auth/Login.tsx`** — protection brute force (failedAttempts, lockedUntil, cooldownRemaining)
- **`contexts/AuthContext.tsx`** — cache session minimal (schema v3), signOut token cleanup offline
- **`services/storageService.ts`** — whitelist MIME audio (ALLOWED_AUDIO_TYPES)
- **`services/jsonImportValidation.ts`** — `asOptionalUrl()` helper, remplacement sur photo/sound/wikipediaImage
- **`services/excelImportService.ts`** — Migration complete xlsx → exceljs (lazy loading, normalizeCellValue, excelSerialToDate)
- **`services/observationExportService.ts`** — Migration complete xlsx → exceljs (ExcelJS.Workbook)
- **`services/speciesService.ts`** — Commentaire stripHtml (SE-05)
- **`components/ObservationMap.tsx`** — import isSafeImageUrl depuis utils (supprime fonction locale)
- **`components/ObservationCard.tsx`** — import + garde isSafeImageUrl
- **`components/ObservationGallery.tsx`** — import + garde isSafeImageUrl
- **`components/ObservationRow.tsx`** — import + garde isSafeImageUrl
- **`vite.config.ts`** — vendor-xlsx → vendor-exceljs dans manualChunks + globIgnores
- **`utils/urlUtils.ts`** — CREE : isSafeImageUrl()

### Tests modifies/crees
- **`tests/urlUtils.test.ts`** — CREE : 7 tests isSafeImageUrl
- **`tests/jsonImportValidation.test.ts`** — CREE : 2 tests URL sanitization
- **`tests/observationFormService.test.ts`** — +4 tests GPS bounds
- **`tests/storageService.test.ts`** — +1 test MIME audio rejection
- **`tests/authContext.test.tsx`** — schema_version 2→3, email non cachee
- **`tests/excelImportService.test.ts`** — helper reecrit avec ExcelJS (async)

### Risques de conflit inter-themes
- **Theme 07 (Vie privee)** :
  - SE-19 (Google Fonts self-hosting) est differe a ce theme. Impact : modifier `index.html` (supprimer preconnect/link Google Fonts) + telecharger les fonts localement + modifier CSP `font-src` et `style-src` dans `vercel.json` pour retirer les domaines Google.
  - VP-05 (suppression compte) : le cache session minimal (SE-17) ne stocke plus l'email — pas de PII a supprimer dans le cache.
  - VP-12 (bucket photos) : documente comme intentionnel par theme 05 (SI-25).
- **Theme 08 (Accessibilite)** : Les composants ObservationCard/Gallery/Row/Form ont ete modifies (ajout import + garde isSafeImageUrl). Si l'accessibilite ajoute des props ou restructure les images, les gardes `isSafeImageUrl` devront etre preservees.
- **Theme 09 (Compatibilite)** : La CSP dans `vercel.json` pourrait necessiter des ajustements si de nouvelles sources externes sont ajoutees.
- **Theme 10 (Qualite)** : `excelImportService.ts` a ete significativement reecrit (ExcelJS). Si le theme 10 refactorise le code, noter que le loader est maintenant `loadExcelJS()` (pas `loadXLSX()`).
- **Theme 12 (Valeur)** : Si Darwin Core/SINP export est ajoute, utiliser `exceljs` (deja installe), pas xlsx.

### Patterns utilises
- **`isSafeImageUrl()`** : Validation URL protocol-safe (http/https/blob). Utiliser pour toute image externe.
- **`asOptionalUrl()`** : Validation URL pour import JSON (http/https uniquement, pas blob).
- **`normalizeCellValue()`** : Normalisation cellules ExcelJS (richText, formula results, Date objects).
- **`excelSerialToDate()`** : Conversion date serial Excel → JS Date sans dependance xlsx.
- **`ALLOWED_AUDIO_TYPES`** : Set de MIME types audio autorises.
- **Brute force backoff** : `Math.min(Math.pow(2, attempts - 3) * 5000, 120000)` avec countdown visuel.
- **Cache session minimal** : schema_version bump invalide automatiquement les anciens caches.

### Quality gate
Toujours lancer `npm run check` apres chaque batch. 112 tests doivent passer.

### CSP — domaines autorises
Si une nouvelle API externe ou un nouveau serveur de tuiles est ajoute, il faut mettre a jour la CSP dans `vercel.json`. Les directives actuelles couvrent :
- **connect-src** : Supabase, iNaturalist, GBIF, Nominatim, Open-Meteo
- **img-src** : Supabase storage, iNaturalist photos, Wikipedia images, 4 serveurs de tuiles (OSM, CARTO, Esri, OpenTopoMap)
- **font-src** : Google Fonts gstatic (sera retire en theme 07 lors du self-hosting)

---

## Fichiers crees/modifies par cet agent

| Fichier | Action |
|---------|--------|
| `vercel.json` | Modifie — CSP + HSTS |
| `package.json` | Modifie — exceljs, supprime xlsx, override serialize-javascript |
| `components/ObservationForm.tsx` | Modifie — limite photo, isSafeImageUrl |
| `components/Auth/Login.tsx` | Modifie — brute force protection |
| `contexts/AuthContext.tsx` | Modifie — cache minimal, signOut token cleanup |
| `services/storageService.ts` | Modifie — whitelist MIME audio |
| `services/jsonImportValidation.ts` | Modifie — asOptionalUrl pour URLs media |
| `services/excelImportService.ts` | Modifie — migration xlsx → exceljs |
| `services/observationExportService.ts` | Modifie — migration xlsx → exceljs |
| `services/speciesService.ts` | Modifie — commentaire stripHtml |
| `components/ObservationMap.tsx` | Modifie — import isSafeImageUrl depuis utils |
| `components/ObservationCard.tsx` | Modifie — garde isSafeImageUrl |
| `components/ObservationGallery.tsx` | Modifie — garde isSafeImageUrl |
| `components/ObservationRow.tsx` | Modifie — garde isSafeImageUrl |
| `vite.config.ts` | Modifie — vendor-exceljs |
| `utils/urlUtils.ts` | Cree — isSafeImageUrl() |
| `tests/urlUtils.test.ts` | Cree — 7 tests |
| `tests/jsonImportValidation.test.ts` | Cree — 2 tests SE-03 |
| `tests/observationFormService.test.ts` | Modifie — +4 tests GPS |
| `tests/storageService.test.ts` | Modifie — +1 test MIME |
| `tests/authContext.test.tsx` | Modifie — schema v3 |
| `tests/excelImportService.test.ts` | Modifie — helper ExcelJS async |
| `docs/audits/corrections/theme06-securite/RECAP.md` | Cree — ce fichier |
