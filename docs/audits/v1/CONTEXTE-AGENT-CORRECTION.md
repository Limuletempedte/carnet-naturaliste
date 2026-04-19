# Contexte pour l'Agent de Plans de Correction

> Ce document contient TOUT le contexte necessaire pour concevoir des plans de correction
> pour chaque theme de l'audit. L'agent qui le lit n'a pas besoin d'autre contexte.

---

## 1. Projet

**Nom** : Carnet Naturaliste v5.2
**Chemin** : `C:\Users\eliot\Documents\Nicola\carnet-naturalisteV5.2 - (spécial)\`
**Stack** : React 19.1 + TypeScript 5.7 (strict) + Supabase 2.86 + Vite 6.4 + Tailwind 3.4 + Vitest 3.2
**Type** : PWA offline-first pour naturalistes de terrain (saisie d'observations faune/flore)
**Deploiement** : Vercel (frontend) + Supabase (backend PostgreSQL + Storage + Auth)
**Tests** : 48 tests passent (16 suites, ~2700 lignes), quality gate `npm run check`
**Etat** : app fonctionnelle, pre-commercialisation

## 2. Architecture fichiers cles

```
index.html                    — Point d'entree HTML (20 lignes)
index.tsx                     — Entree React, registration SW (27 lignes)
src/
├── App.tsx                   — God component : 1165 lignes, ~24 useState, ~41 handlers
├── types.ts                  — Interfaces TypeScript (Observation, enums)
├── components/
│   ├── ObservationForm.tsx   — Formulaire : 859 lignes, 13 useState, 7 useEffect
│   ├── ObservationList.tsx   — Liste : 675 lignes, 12 useState, 11 useEffect
│   ├── ObservationMap.tsx    — Carte Leaflet : 514 lignes
│   ├── ObservationGallery.tsx— Galerie images
│   ├── ObservationStats.tsx  — Stats Recharts : 410 lignes
│   ├── ObservationCalendar.tsx— Calendrier heatmap
│   ├── MapInput.tsx          — Saisie GPS carte
│   ├── BottomNavigation.tsx  — Nav mobile fixe
│   ├── FilterBar.tsx         — Barre filtres
│   ├── AdvancedFilterDialog.tsx — Filtres avances (geospatial)
│   ├── ConfirmationDialog.tsx — Dialog confirmation
│   ├── SyncCenterDialog.tsx  — Centre de sync offline
│   ├── ImportPreviewDialog.tsx — Apercu import
│   ├── ExportScopeDialog.tsx — Options export
│   ├── StatsExportDialog.tsx — Export stats
│   ├── ToastContainer.tsx    — Notifications
│   └── Auth/
│       ├── Login.tsx         — Connexion/inscription
│       └── UserProfile.tsx   — Profil utilisateur
├── contexts/
│   └── AuthContext.tsx       — Session Supabase, cache 48h
├── services/
│   ├── storageService.ts     — CRUD Supabase + offline queue : 742 lignes
│   ├── speciesService.ts     — iNaturalist + GBIF : 709 lignes
│   ├── excelImportService.ts — Import Excel : 635 lignes
│   ├── jsonImportValidation.ts— Import JSON
│   ├── importPolicy.ts       — Resolution conflits import
│   ├── backupService.ts      — Export ZIP
│   ├── observationExportService.ts — Export JSON/Excel/PDF
│   ├── statsExportService.ts — Export stats PDF/HTML : 543 lignes
│   └── locationService.ts    — Nominatim + USGS Elevation
├── utils/
│   ├── imageUtils.ts         — Compression photo canvas
│   ├── badgeUtils.ts         — 9 badges gamification
│   ├── dateUtils.ts          — Formatage dates fr
│   ├── csvUtils.ts           — Echappement CSV injection
│   ├── storageQueueUtils.ts  — Helpers queue offline
│   └── observationStatsUtils.ts — Calculs stats
├── hooks/
│   └── useObservationFilters.ts — Hook filtres
├── supabaseClient.ts         — Client Supabase singleton
vite.config.ts                — Config Vite + PWA plugin
tsconfig.json                 — TS strict mode
tailwind.config.js            — Palette nature-*, dark mode class
vercel.json                   — Headers securite (pas de CSP)
supabase_schema.sql           — Schema SQL + RLS + Storage policies
package.json                  — 14 deps runtime, 19 devDeps
tests/                        — 16 suites vitest
```

## 3. Resultats de l'audit

### Statistiques globales

| Theme | Rapport | C | H | M | F | I | Total |
|-------|---------|---|---|---|---|---|-------|
| 01 Fonctionnel | `01-fonctionnel.md` | 4 | 20 | 19 | 7 | 0 | 50 |
| 02 Bugs/Fiabilite | `02-bugs-fiabilite.md` | 2 | 13 | 13 | 7 | 0 | 35 |
| 03 UI/UX | `03-ui-ux.md` | 2 | 15 | 17 | 3 | 0 | 37 |
| 04 Performance | `04-performance.md` | 2 | 9 | 13 | 5 | 0 | 29 |
| 05 Sync/Integrite | `05-sync-integrite.md` | 4 | 5 | 15 | 5 | 0 | 29 |
| 06 Securite | `06-securite.md` | 0 | 4 | 7 | 6 | 3 | 20 |
| 07 Vie privee/Legal | `07-vie-privee-legal.md` | 6 | 9 | 5 | 0 | 3 | 23 |
| 08 Accessibilite | `08-accessibilite.md` | 7 | 13 | 6 | 4 | 0 | 30 |
| 09 Compatibilite | `09-compatibilite.md` | 0 | 5 | 12 | 6 | 6 | 29 |
| 10 Qualite technique | `10-qualite-technique.md` | 0 | 7 | 13 | 3 | 7 | 30 |
| 11 Sauvegarde/Recup | `11-sauvegarde-recuperation.md` | 4 | 6 | 6 | 2 | 2 | 20 |
| 12 Valeur produit | `12-valeur-produit.md` | 3 | 8 | 6 | 2 | 6 | 25 |
| **TOTAL** | | **34** | **114** | **132** | **50** | **27** | **357** |

### Tous les rapports sont dans `docs/audits/v1/`

Chaque rapport contient :
- Resume executif
- Methode et perimetre
- Tableau de constats avec : ID | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation
- Statistiques
- Points positifs
- Top 3 priorites

### Top 10 critiques (bloquants commercialisation)

1. **VP-01/02/03** (Theme 7) : Pas de politique confidentialite, CGU, mentions legales
2. **VP-05** (Theme 7) : Pas de suppression de compte (RGPD art. 17)
3. **BF-01 / SR-07** (Themes 2, 11) : Pas d'Error Boundary React
4. **SI-01** (Theme 5) : ID temporaire `Date.now()` = collisions
5. **SI-16** (Theme 5) : Photos perdues systematiquement offline
6. **SR-08** (Theme 11) : Erreur Supabase non mise en queue offline
7. **AC-01/02** (Theme 8) : 6 modales sans role="dialog" ni focus trap
8. **AC-12/13** (Theme 8) : Aucun landmark ARIA ni skip-to-content
9. **PE-01/02** (Theme 4) : Pas de virtualisation listes/galerie (>500 obs = gel)
10. **VP-11/12** (Theme 12) : Pas d'export Darwin Core / SINP

### Constats recurrents (multi-themes, a corriger une seule fois)

| Pattern | IDs | Correction unique |
|---------|-----|-------------------|
| Error Boundary absent | BF-01, SR-07 | Creer `<ErrorBoundary>` global |
| xlsx abandonne | SE-13, QT-17 | Migrer vers `exceljs` |
| RLS UPDATE sans WITH CHECK | SI-19, SE-10 | ALTER POLICY |
| Photos offline perdues | FO-01, SI-16 | Persister en IndexedDB/base64 |
| console.log production | QT-13, SR-16, M4 | Service logger configurable |
| Google Fonts US (RGPD) | VP-20, CO-20 | Self-host Inter + Merriweather |
| ID temp Date.now() | BF-09, SI-01 | crypto.randomUUID() |
| User-Agent APIs | VP-15, VP-16, VP-17 | Header global fetch wrapper |
| Cibles tactiles < 44px | UX-17, AC-26 | Design system minimum 44px |
| Bucket photos public | SI-25, SE-11, VP-12 | Politique storage privee |

## 4. Contraintes pour les plans de correction

### Regles absolues
- **Ne pas casser les 48 tests existants** : `npm run check` doit passer avant et apres chaque correction
- **Pas de refactoring architectural massif** : les corrections doivent etre incrementales et independantes
- **Priorite au zero-downtime** : pas de migration SQL destructive sur la base de production
- **Chaque correction = 1 commit atomique** testable independamment

### Ordre de priorite suggere
1. **P0 - Legalite** : VP-01 a VP-05 (politique, CGU, mentions, consentement, suppression compte)
2. **P0 - Stabilite** : BF-01/SR-07 (Error Boundary), SI-01 (UUID), SI-16 (photos offline)
3. **P1 - Securite** : SE-01 (CSP), SE-10/SI-19 (RLS WITH CHECK), SE-13/QT-17 (xlsx)
4. **P1 - Accessibilite** : AC-01-04 (dialogs), AC-12-13 (landmarks), AC-23 (contraste)
5. **P2 - Performance** : PE-08-09 (dynamic imports), PE-01-02 (virtualisation)
6. **P2 - UX** : UX-01 (formulaire), UX-17 (cibles tactiles)
7. **P3 - Compatibilite** : CO-01-03 (PWA assets/meta), CO-12 (UUID fallback)
8. **P3 - Qualite** : QT-01 (refactor App.tsx), QT-13 (logger), QT-27 (CI/CD)
9. **P4 - Valeur produit** : VP-11/12 (Darwin Core/SINP), VP-18 (onboarding)

### Ce qui existe deja et ne doit PAS etre recree
- `fetchWithTimeout` existe dans backupService.ts:55 (non exportee → extraire dans utils/)
- `accept="image/*"` existe dans ObservationForm (ne pas modifier, ajouter verification taille en plus)
- Le mode sombre fonctionne a ~95% (ne pas refaire, juste corriger les 5% hardcodes)
- Les tests Supabase ont un excellent mocking (ne pas changer le pattern)

### Fichiers de memoire
- `memory/MEMORY.md` : memoire persistante du projet
- `memory/audit.md` : audit precedent (Codex) avec problemes valides/invalides
- `memory/project_weather_condition_bug.md` : bug column manquante deja corrige
- `memory/local-test-setup.md` : procedure de test local avec Supabase CLI

## 5. Format attendu des plans de correction

Pour chaque theme, le plan de correction devrait contenir :
1. **Liste des constats a corriger** (par priorite, en excluant les INFO et les constats deja corriges)
2. **Regroupement logique** des constats qui peuvent etre corriges ensemble (ex: tous les dialogs accessibles)
3. **Pour chaque groupe** :
   - Fichiers a modifier (avec lignes approximatives)
   - Description precise de la modification
   - Tests a ajouter ou modifier
   - Risques et effets de bord potentiels
4. **Estimation d'effort** par groupe (heures ou jours)
5. **Ordre d'execution** (dependances entre corrections)

## 6. Informations techniques utiles

### Dependencies runtime (package.json)
```
react 19.1, react-dom 19.1
@supabase/supabase-js 2.86
leaflet + leaflet.markercluster 1.5.3
jspdf 4.2.1, html2canvas 1.4.1
xlsx 0.18.5 (A REMPLACER)
jszip 3.10.1 (licence duale MIT/GPL)
file-saver 2.0.5 (inactif)
react-calendar 6.0.0
recharts 3.4.1
vite-plugin-pwa 1.2.0
```

### Config TypeScript
- `strict: true`, `noUnusedLocals`, `noUnusedParameters`
- Target: ES2020, Lib: ES2020 + DOM
- Module: ESNext, JSX: react-jsx

### Config Tailwind
- `darkMode: 'class'`
- Palette: nature-green, nature-dark, nature-beige, nature-dark-surface, nature-dark-text
- Polices: Inter (sans), Merriweather (serif)

### Supabase
- Table `observations` avec RLS par `user_id`
- Bucket `photos` avec politique public read
- Auth email/password
- Schema dans `supabase_schema.sql`

### Vercel
- `vercel.json` avec headers securite (X-Frame-Options, X-Content-Type-Options, etc.)
- Pas de CSP
- Pas de HSTS
