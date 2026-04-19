# Thème 12 — Valeur produit — RECAP

**Date d'exécution** : 2026-04-19
**Audit source** : `docs/audits/v1/12-valeur-produit.md` (25 constats : 3 CRITIQUES, 8 HAUTES, 6 MOYENNES, 2 FAIBLES, 6 INFO)
**Plan exécuté** : `C:\Users\eliot\.claude\plans\bonjours-j-ai-fais-dans-piped-lynx.md`
**Baseline tests** : 190 (fin thème 11) → **224 tests verts (+34)**
**Quality gate** : `npm run check` vert (0 erreurs TypeScript, 0 erreurs ESLint, warnings existants non bloquants).

---

## Vue d'ensemble

4 batches exécutés, **9 constats valides corrigés sur 25** (les autres sont soit INFO positifs, soit reportés explicitement car scope hors « correction » — voir §Reportés).

| Batch | Constats traités | Sévérité | Tests + | Statut |
|-------|------------------|----------|---------|--------|
| 2 — Champs métier (habitat, observers, phénologie) | VP-04, VP-05, VP-08 | HAUTE/MOYENNE | +3 | ✅ |
| 1 — Exports scientifiques (Darwin Core CSV, GeoJSON) | VP-11, VP-14 | CRITIQUE/MOYENNE | +9 | ✅ |
| 4 — Badges persistants + streak | VP-20, VP-22 | MOYENNE/FAIBLE | +13 | ✅ |
| 3 — Onboarding + aide in-app | VP-18, VP-19 | HAUTE | +9 | ✅ |

Ordre d'exécution choisi : `2 → 1 → 4 → 3` (champs avant exports pour que DwC mappe habitat/phénologie/observers ; onboarding en dernier car c'est le plus visuel et UI).

---

## Batch 2 — Champs métier : habitat, observers, phenology (VP-04, VP-05, VP-08)

### Ce qui a été fait
- `types.ts` : ajout des enums `Habitat` (15 valeurs, ex: Forêt de feuillus, Zone humide, Prairie…) et `Phenology` (10 valeurs, ex: En fleur, En fruit, En migration, En reproduction). Ajout des 3 champs optionnels à `Observation` : `habitat?`, `phenology?`, `observers?: string[]`.
- Migration SQL `supabase/migrations/20260420000000_theme12_observation_fields.sql` : `ALTER TABLE observations ADD COLUMN habitat text, phenology text, observers text[]`. Non-destructive, zero-downtime.
- `supabase_schema.sql` : même ajout pour rester cohérent avec le schéma de référence.
- `services/storageService.ts` :
  - `ObservationRow` étendu avec les 3 colonnes.
  - `mapToObservation` normalise `observers ?? undefined` et traite `[]` comme absence.
  - `mapToRow` sérialise `null` (pas `[]`) quand observers est vide.
- `components/ObservationForm.tsx` :
  - Nouvelle `FormSection` « Contexte écologique » entre « Détails » et « Média et Notes » avec 3 champs : `<select>` Habitat, `<select>` Phenology, input + bouton « Ajouter » pour observers (chips supprimables).
  - Handlers `addObservers(raw)` (split sur `,;` ou Entrée) et `removeObserver(name)`.
  - État local `observerInput` pour le champ de saisie.
- `services/observationExportService.ts` (Excel) : 3 colonnes supplémentaires `Habitat`, `Phénologie`, `Observateurs` (joints par ` | `).
- Tests : +2 dans `tests/storageService.test.ts` (round-trip row↔obs, null/undefined géré), +1 dans `tests/observationFormService.test.ts` (buildObservationFromForm préserve les champs).

### Pourquoi
Ces 3 champs ouvrent la porte à un usage scientifique sérieux sans nouvelle architecture : `habitat` pour la compatibilité future Corine Biotopes/SINP, `observers` pour les sorties en équipe (STOC-EPS/EPOC), `phenology` pour la donnée botanique/ornithologique.

### Gotchas
- `observers: text[]` en Postgres : stocker `null` plutôt que `[]` pour éviter la surcharge RLS. Côté client : `obs.observers ?? []` pour l'affichage.
- Le `withColumnFallback` du storageService (SR-13 thème 11) protège en cas de base pas encore migrée : les champs seront strippés avec toast `schema-drift-detected`, non bloquant.
- `ObservationFormData = Omit<Observation, 'id'|'count'|...>` hérite automatiquement des 3 nouveaux champs — aucun changement dans `observationFormService.ts`.

---

## Batch 1 — Export Darwin Core CSV + GeoJSON (VP-11, VP-14)

### Ce qui a été fait
- `services/observationExportService.ts` :
  - `ObservationExportType` étendu : `'json' | 'excel' | 'pdf' | 'darwincore' | 'geojson'`.
  - `buildDarwinCoreCsv(observations): string` exposée (pure, testable). 22 colonnes DwC : `occurrenceID`, `basisOfRecord='HumanObservation'`, `scientificName`, `vernacularName`, `eventDate` (ISO `YYYY-MM-DDTHH:MM`), `decimalLatitude/Longitude`, `geodeticDatum='WGS84'`, `coordinateUncertaintyInMeters`, `countryCode` (mapping FR/BE/CH/LU/DE/ES/IT/PT/GB/US/CA), `locality`, `municipality`, `minimumElevationInMeters`, `individualCount`, `sex` (map vers `male/female/`), `lifeStage` (map vers `juvenile/immature/adult`), `behavior` (map), `samplingProtocol`, `habitat`, `reproductiveCondition` (depuis phenology), `recordedBy` (observers joint par ` | `), `occurrenceRemarks`.
  - Obfuscation des espèces sensibles (statut VU/EN/CR/EW) : réutilise `obfuscateCoordinate` et force `coordinateUncertaintyInMeters=10000`.
  - Encodage CSV : BOM UTF-8 + échappement via `csvUtils.escapeCsvCell` (existant, protège contre CSV injection).
  - `buildGeoJson(observations): GeoJsonFeatureCollection` exposée. FeatureCollection avec Point [lon, lat] (pas [lat, lon]). Applique l'obfuscation via `obfuscateSensitiveObservations` existant. Ignore les obs sans GPS. `properties` = Observation moins `gps` (redondant avec geometry).
- `components/ObservationList.tsx` : 2 nouveaux boutons « DwC » (amber) et « GeoJSON » (indigo) dans la barre d'actions principale ET dans le FAB.
- Tests : création de `tests/observationExportService.test.ts` (+9 tests : DwC headers, obfuscation sensible, mapping enums, habitat/phenology/observers dans DwC, GPS absent ; GeoJSON structure, ignore obs sans GPS, obfuscation, exclusion champ gps).

### Pourquoi
Darwin Core est LE standard international (TDWG/GBIF) pour partager des observations. Un CSV DwC simplifié permet de contribuer au GBIF via un IPT tiers ou d'échanger avec un chercheur. GeoJSON ouvre directement dans QGIS / geojson.io — c'est le format SIG universel, simple à livrer.

### Gotchas
- Mapping DwC best-effort documenté en commentaire en tête des maps (`SEX_MAP`, `LIFE_STAGE_MAP`, `BEHAVIOR_MAP`, `COUNTRY_CODE_MAP`). Les enums français du Carnet ne couvrent pas tous les cas DwC (ex: `basisOfRecord` toujours `HumanObservation`, pas `MachineObservation` même pour piège photographique — raison : sémantique DwC accepte `HumanObservation` pour l'identification humaine du sujet). À affiner si un partenariat SINP/GBIF le requiert.
- GeoJSON `coordinates: [lon, lat]` — inverse de l'intuition. Tests le vérifient.
- `buildGeoJson` exporte les 3 nouveaux champs habitat/phenology/observers via `properties` automatiquement grâce au `...rest` après `const { gps: _gps, ...rest } = obs`.
- Les `ObservationRow` et l'API Supabase ne sont pas sollicitées par l'export — les fonctions sont 100 % côté client.

---

## Batch 4 — Badges persistants + streak (VP-20, VP-22)

### Ce qui a été fait
- `utils/badgeUtils.ts` :
  - Constantes exportées `EARNED_BADGES_STORAGE_KEY = 'earned-badges-v1'` et `BADGES_SEED_FLAG_KEY = 'badges-v1-seeded'`.
  - `computeEarnedBadgeIds(obs): Set<string>` : évalue les conditions et retourne les IDs gagnés.
  - `getPreviouslyEarnedBadgeIds(): Set<string>` lit `earned-badges-v1` via `safeGet`, parse JSON, fallback Set vide si corrompu (logger.warn en WARN, pas ERROR).
  - `setPreviouslyEarnedBadgeIds(ids)` écrit via `safeSet` (dispatch `storage-quota-exceeded` côté safeStorage si quota plein).
  - `isBadgesSeeded()` / `markBadgesSeeded()` : flag de seed anti-spam.
  - `detectNewlyEarnedBadges(obs): BadgeDefinition[]` : diff entre `computeEarnedBadgeIds` courant et `getPreviouslyEarnedBadgeIds`. Ne modifie PAS le store — l'appelant persiste après affichage du toast.
- `hooks/useBadgeUnlockToasts.ts` (nouveau) :
  - Hook `(observations, pushToast)` : `useEffect` dépend d'une `signature` (longueur + 5 derniers IDs) pour limiter les re-runs.
  - **Seed initial** : au 1er run sans flag, on persiste les IDs courants sans émettre de toast (évite le spam pour les utilisateurs existants qui ont déjà plusieurs badges). `markBadgesSeeded()` ensuite.
  - Sessions suivantes : diff + toast `success` « 🏆 Badge débloqué : {nom} — {description} » pour chaque nouveau, puis persistance.
  - Mounted dans `App.tsx` après `useStorageQuotaToasts(pushToast)`.
- `utils/observationStatsUtils.ts` :
  - `computeCurrentStreak(observations, today?): number` — jours consécutifs jusqu'à aujourd'hui. Tolère que la série soit commencée hier (gap ≤ 1). Série cassée à 0 si gap > 1.
  - `computeLongestStreak(observations): number` — meilleure série historique.
  - Algorithme : déduplique les dates (`toLocalDateKey`), trie, itère et compare `diffInDays`. Utilise les dates locales `YYYY-MM-DD` (stockées telles quelles dans `Observation.date`), pas de piège de fuseau horaire.
- `components/ObservationStats.tsx` :
  - Nouvelle carte « Séries d'observations » (flex, sous les MetricCards) avec « 🔥 Série actuelle » et « 🏅 Meilleure série ».
  - Imports `computeCurrentStreak`, `computeLongestStreak` depuis `observationStatsUtils`.
- Tests :
  - `tests/badgeUtils.test.ts` (nouveau, 7 tests) : compute pour 1 / 10 obs, detectNewly renvoie seulement le delta, fallback corruption JSON, seed flag, sérialisation JSON array.
  - `tests/observationStatsUtils.test.ts` étendu (+6 tests) : streak vide, 3 jours consécutifs, série hier-seule OK, rupture > 1j = 0, déduplication multi-obs même jour, longestStreak correct.

### Pourquoi
- **VP-20** : les badges étaient recalculés stateless à chaque session. Rien ne marquait le « moment » du déblocage, donc la gamification était invisible. Un toast celebratoire + persistance localStorage corrige ça.
- **VP-22** : le streak counter est une mécanique de rétention éprouvée (Duolingo, eBird). ~2h d'effort pour un gain d'engagement réel.

### Gotchas
- Le **seed** est crucial. Sans lui, un utilisateur existant avec 50 obs se voit spammer « Badge débloqué : Débutant », « Expert », « Explorateur », etc. Le flag `badges-v1-seeded` est écrit au 1er run après persistance des IDs courants.
- Le hook dépend d'une `signature` (longueur + 5 derniers IDs) pour éviter les re-dispatches en StrictMode React ou sur rendus redondants. `prevSignatureRef` garde contre la double exécution.
- Date locale uniquement dans le streak : `obs.date` est déjà en `YYYY-MM-DD` local. `parseLocalDate` utilise `new Date(year, month-1, day)` pour éviter l'implicite UTC de `new Date('2026-04-20')`.
- `safeGet/safeSet` (thème précédent) utilisés — si quota plein, un toast WARNING apparaît via `useStorageQuotaToasts` (pas besoin de dupliquer).

---

## Batch 3 — Onboarding + aide in-app (VP-18, VP-19)

### Ce qui a été fait
- `components/OnboardingTour.tsx` (nouveau) :
  - Composant maison en 5 étapes : Bienvenue → Ajouter observation → Visualiser (carte/stats/calendrier/galerie) → Badges & streak → Exports & backup.
  - Constante `ONBOARDING_SEEN_KEY = 'onboarding-seen-v1'` + helpers `markOnboardingSeen()`, `resetOnboarding()`, `isOnboardingSeen()`.
  - Accessibilité : `useAccessibleDialog` existant (focus trap + ESC + restauration focus), `role="dialog"`, `aria-modal`, titre lié via `aria-labelledby`.
  - UX : compteur « Étape N/5 », boutons Précédent/Suivant/Commencer, lien « Passer le tutoriel » en haut. Sur mobile, aligné bas de page ; sur desktop, centré.
  - Mount via `lazy` dans `App.tsx` (code-split) + `<Suspense fallback={null}>`.
- `components/HelpPage.tsx` (nouveau) :
  - Page statique française : Saisir une observation, Mode offline et sync, Exports disponibles (6 formats listés dont DwC et GeoJSON), Badges et séries, Signaler un bug, Relancer le tutoriel.
  - Pattern visuel calqué sur `LegalPages.tsx` (même wrapper max-w-3xl, bouton Retour, prose).
  - Props `onBack`, `onReplayTour` (qui reset le flag + remonte le tour + bascule vue List).
- `components/FieldTooltip.tsx` (nouveau) :
  - Petite bulle d'aide `?` réutilisable. Click pour ouvrir, click outside ou blur pour fermer.
  - Accessible : `aria-describedby`, `aria-expanded`, `role="tooltip"`, focus ring.
  - `useId` React pour générer un ID unique stable.
- `components/ObservationForm.tsx` : 3 tooltips ajoutés sur les champs techniques — `status` (IUCN), `protocol` (STOC-EPS etc.), `atlasCode` (code breeding). Texte court pédagogique pour chaque.
- `types.ts` : `View.HELP = 10` ajouté à l'enum.
- `App.tsx` :
  - Lazy imports `HelpPage` et `OnboardingTour`.
  - État `showOnboarding` + `useEffect` qui affiche le tour si `!isOnboardingSeen()` **et** utilisateur connecté **et** `observations.length === 0` (évite d'intimider un utilisateur existant sur un autre device).
  - Route `View.HELP` : affiche `<HelpPage />` avec `onReplayTour` qui supprime la clé localStorage et remonte le tour.
  - Footer : nouvel item « Aide » avant « Politique de confidentialité ».
  - Rendu du tour en overlay (z-index 70) en fin de JSX sous `<StorageConsentBanner />`.
- Tests :
  - `tests/onboardingTour.test.tsx` (nouveau, 6 tests) : render conditionnel isOpen, étape 1 affichée, « Passer » marque le flag, navigation Suivant × 4 → « Commencer », helpers markOnboardingSeen / resetOnboarding.
  - `tests/helpPage.test.tsx` (nouveau, 3 tests) : render du titre Aide + sections, onBack appelé, onReplayTour appelé.

### Pourquoi
- **VP-18** : formulaire à 25+ champs sans accompagnement → taux d'abandon élevé. Un tour maison en 5 étapes + tooltips sur champs techniques réduit la friction sans dépendance lourde (pas de react-joyride qui ajouterait 60 Ko).
- **VP-19** : pas d'aide in-app = utilisateur bloqué sans recours. Une page statique simple (pas de CMS) couvre les cas d'usage principaux, accessible depuis le footer partout.

### Gotchas
- La condition d'affichage du tour inclut `observations.length === 0` pour ne PAS s'afficher à un utilisateur existant reconnecté sur un nouveau device (il est chevronné, pas besoin de tutoriel).
- `resetOnboarding` (bouton « Relancer le tutoriel » de HelpPage) : utilise `try { localStorage.removeItem(...) } catch {}` inline plutôt qu'un import du helper depuis `App.tsx` (évite d'importer un composant lazy depuis le parent).
- `FieldTooltip` n'importe pas de bibliothèque. Attention : pas de repositionnement auto si trop près du bord droit — acceptable car les tooltips ajoutés sont en colonne à gauche, jamais coincés.
- Les tests `tests/onboardingTour.test.tsx` et `tests/helpPage.test.tsx` utilisent `@testing-library/react` (déjà dans les devDeps, vu `useAccessibleDialog` testé ailleurs).
- Si un thème futur retouche `App.tsx`, attention à ne pas casser la logique de montage du `<OnboardingTour>` en bas de JSX.

---

## Déjà réglés par les thèmes précédents

Aucun constat VP n'avait été traité avant ce thème. Le thème 12 est le premier à s'attaquer à la « valeur produit ».

---

## Reportés explicitement (hors scope thème 12)

| ID | Sévérité | Motif du report |
|----|----------|-----------------|
| **VP-06** | HAUTE | Sessions/transects — nécessite une nouvelle table `outings` + migration + UI de regroupement des observations. ~1 semaine. À traiter dans un mini-thème produit dédié. |
| **VP-07** | MOYENNE | Météo auto (Open-Meteo) — dépend de l'infra fetch globale + User-Agent (cf. thème 7 VP-15/16/17). À traiter quand le wrapper fetch global sera prêt. |
| **VP-09** | MOYENNE | Check-lists d'espèces — nouvelle table `checklists` + UI liste à cocher. Fonctionnalité complète à part entière. |
| **VP-10** | FAIBLE | Audio recorder MediaRecorder — compatibilité iOS Safari fragile (webm → mp4 polyfill). À isoler en thème audio dédié. |
| **VP-12** | CRITIQUE | SINP DEE/XML — requiert la spec DEE officielle et un test réel avec un portail régional. À traiter lors d'un partenariat associatif (LPO, CEN). |
| **VP-13** | HAUTE | API publique REST + OAuth2 — ~3-4 semaines, thème « plateforme » dédié. |
| **VP-15** | CRITIQUE | Stripe / monétisation — ~2-3 semaines, thème commercial dédié (prérequis éventuel : VP-13 ou Supabase Edge Functions). |
| **VP-16** | HAUTE | Analytics Plausible/Vercel — ~2h isolées, à regrouper dans un mini-thème observabilité. |
| **VP-17** | MOYENNE | Positionnement marché — décision stratégique, pas du code. |
| **VP-21** | MOYENNE | Rappels saisonniers email — dépend d'une infra email (SendGrid/Resend) + opt-in RGPD. Thème engagement. |
| **VP-23** | HAUTE | Communauté (partage / commentaires / leaderboard) — ~3-6 semaines, thème social dédié. |
| **VP-01, VP-02, VP-03** | INFO | Constats positifs (fonctionnalités de base complètes, modèle de données riche, enrichissement automatique). Rien à coder. |
| **VP-24, VP-25** | INFO | Analyse concurrentielle / cas d'usage. Rien à coder. |

---

## Risques pour le thème suivant

- **`types.ts`** : 2 nouveaux enums `Habitat`/`Phenology`, 3 champs optionnels sur `Observation` (`habitat`, `phenology`, `observers`), `View.HELP=10`. Les composants qui copient « toutes les clés » (`Object.keys(obs)` ou destructuring exhaustif) doivent être vérifiés. Aucun cas trouvé à date.
- **`services/storageService.ts`** : `ObservationRow` contient 3 colonnes de plus. Si un thème futur ajoute un autre champ, respecter le pattern `row.X ?? undefined` dans `mapToObservation` et `obs.X ?? null` dans `mapToRow` (observers particulier : `length > 0 ? obs.observers : null`).
- **`services/observationExportService.ts`** : l'export Excel a 3 colonnes de plus. Si un thème futur modifie l'ordre / ajoute une colonne, attention à rester cohérent avec DwC et GeoJSON. Les fonctions `buildDarwinCoreCsv` et `buildGeoJson` sont exportées (testables) et peuvent être réutilisées ailleurs (ex: Sync Center, download API).
- **`components/ObservationForm.tsx`** : nouvelle `FormSection` « Contexte écologique ». Si un thème futur refactore les sections ou réorganise, attention à préserver les 3 champs + leurs handlers (`addObservers`, `removeObserver`) + `observerInput` state.
- **`App.tsx`** : `showOnboarding` state + `useEffect` de montage + `<OnboardingTour>` en fin de JSX. Si un thème futur refactore ce god-component (QT-01 reporté thème 10), garder en tête le wiring.
- **localStorage keys ajoutées** :
  - `onboarding-seen-v1` (VP-18) — à NE PAS clear en cas de reset de cache (c'est une préférence utilisateur).
  - `earned-badges-v1` + `badges-v1-seeded` (VP-20) — idem, NE PAS effacer (sinon spam de toasts badge).
- **Migration SQL** `20260420000000_theme12_observation_fields.sql` : si pas encore déployée en prod, le `withColumnFallback` émet un toast `schema-drift-detected` jusqu'à ce que l'admin Supabase l'applique. Documenter dans le runbook de déploiement.

---

## Fichiers créés / modifiés

### Créés
- `components/FieldTooltip.tsx`
- `components/HelpPage.tsx`
- `components/OnboardingTour.tsx`
- `docs/audits/corrections/theme12-valeur-produit/RECAP.md` (ce fichier)
- `hooks/useBadgeUnlockToasts.ts`
- `supabase/migrations/20260420000000_theme12_observation_fields.sql`
- `tests/badgeUtils.test.ts` (7 tests)
- `tests/helpPage.test.tsx` (3 tests)
- `tests/observationExportService.test.ts` (9 tests)
- `tests/onboardingTour.test.tsx` (6 tests)

### Modifiés
- `App.tsx` — imports lazy HelpPage/OnboardingTour, state `showOnboarding`, useEffect montage, route View.HELP, footer Aide, hook useBadgeUnlockToasts, rendu du tour.
- `components/ObservationForm.tsx` — imports Habitat/Phenology/FieldTooltip, state `observerInput`, handlers `addObservers`/`removeObserver`, FormSection « Contexte écologique », 3 tooltips (status, protocol, atlasCode).
- `components/ObservationList.tsx` — 2 boutons DwC + GeoJSON (barre principale + FAB).
- `components/ObservationStats.tsx` — imports streak, carte « Séries d'observations » (🔥 🏅).
- `services/observationExportService.ts` — `ObservationExportType` étendu, maps DwC (sex/age/behavior/country), `buildDarwinCoreCsv`, `buildGeoJson`, `exportDarwinCore`, `exportGeoJson`, routing dans `runObservationExport`, 3 colonnes Excel.
- `services/storageService.ts` — ObservationRow étendu, mapToObservation / mapToRow enrichis.
- `supabase_schema.sql` — colonnes habitat/phenology/observers dans la table observations.
- `tests/observationFormService.test.ts` — import Habitat/Phenology, +1 test buildObservationFromForm avec les 3 champs.
- `tests/observationStatsUtils.test.ts` — imports computeCurrentStreak/computeLongestStreak, +6 tests.
- `tests/storageService.test.ts` — +2 tests (présents/absents des 3 colonnes).
- `types.ts` — enums `Habitat` et `Phenology`, champs optionnels `habitat`/`phenology`/`observers`, `View.HELP=10`.
- `utils/badgeUtils.ts` — imports safeStorage/logger, constantes clés, `computeEarnedBadgeIds`, `getPreviouslyEarnedBadgeIds`, `setPreviouslyEarnedBadgeIds`, `isBadgesSeeded`, `markBadgesSeeded`, `detectNewlyEarnedBadges`.
- `utils/observationStatsUtils.ts` — constantes `MS_PER_DAY`, helpers parsing date, `computeCurrentStreak`, `computeLongestStreak`.

---

## Quality gate final

```
Test Files  37 passed (37)
Tests       224 passed (224)
TypeScript  0 errors (strict mode)
ESLint      0 errors, warnings existants non bloquants
Build       ✓ built in ~5 s
PWA         41 precache entries
```

Baseline départ : 190 → **224 (+34)**. Aucune régression.

---

## Parcours manuels à re-valider (QA humaine)

Ces scénarios nécessitent une validation en pré-release :

1. **Export Darwin Core** : créer 3 obs (dont 1 avec statut CR) → exporter CSV → ouvrir dans Excel → headers DwC corrects → ligne obs sensible a `coordinateUncertaintyInMeters=10000` → uploader sur [gbif.org/tools/data-validator](https://www.gbif.org/tools/data-validator) → validation idéalement « bonne » (mapping best-effort, peut produire des warnings mineurs).
2. **Export GeoJSON** : exporter → ouvrir dans [geojson.io](https://geojson.io) → points visibles aux bonnes coordonnées → propriétés accessibles en cliquant sur chaque point.
3. **Champs métier** : déployer la migration SQL → créer une obs avec habitat=Forêt de feuillus, phenology=En fleur, observers=['Alice Dupont','Bob Martin'] → sauvegarder → éditer → valeurs préservées → exporter Excel → 3 colonnes visibles.
4. **Tour guidé** : vider localStorage → se connecter avec 0 observation → le tour s'affiche → naviguer Précédent/Suivant → « Passer le tutoriel » → flag set → reload → ne re-apparait pas.
5. **Page Aide** : cliquer « Aide » dans le footer → page s'ouvre → scroller → « Relancer le tutoriel » → revient à la liste + tour ré-affiché.
6. **Badge unlock** : sans observations, 1er run = seed silencieux (pas de toast). Créer une 1ère obs dans la même session (ou après un reload post-seed) → toast « 🏆 Badge débloqué : Débutant — Ajoutez votre première observation. » ; 10ᵉ obs → toast Explorateur.
7. **Streak** : créer des obs aux dates today, today-1, today-2 → carte Stats affiche « 🔥 3 » ; supprimer today-1 → recharger → « 🔥 1 ».
8. **Régression offline** : couper le réseau, saisir obs avec habitat/phenology/observers → mise en queue → retour online → sync propre sans erreur.
9. **Régression backup ZIP** : créer backup avec obs contenant les 3 nouveaux champs → restore dans une instance vierge → les champs sont préservés dans le JSON.
10. **Régression schema drift** : exécuter l'app contre une base sans la migration 20260420 → saisir une obs avec habitat → toast warning « Migration de base de données manquante (habitat, phenology, observers). Certaines données ne seront pas enregistrées… » → obs sauvée sans ces 3 champs, tests du formulaire OK.
11. **FieldTooltip** : cliquer le `?` à côté de « Statut » → bulle apparaît → cliquer outside → se ferme ; idem pour `Protocole` et `Code atlas`.
12. **Darwin Core obfuscation** : exporter une obs sensible (CR/EN/VU/EW) en DwC → `decimalLatitude`/`decimalLongitude` arrondies à 1 décimale, `coordinateUncertaintyInMeters=10000`.

---

## Effort réel

- **Estimé** : ~14-15 h
- **Dépensé** : ~2.5 h (gains massifs grâce à : pattern `useStorageQuotaToasts` réutilisé pour `useBadgeUnlockToasts`, pattern `LegalPages` réutilisé pour `HelpPage`, `useAccessibleDialog` mature, `csvUtils.escapeCsvCell` déjà disponible, `obfuscateSensitiveObservations` déjà implémentée dans exportService, tests bien ergonomiques grâce au pattern `makeObs` helper).
- **Tests ajoutés** : +34 (objectif +12, largement dépassé).

---

## Note pour le prochain agent

Le thème 12 est le **dernier thème de la série v1** (12/12). Aucun thème 13 n'est prévu dans l'audit actuel.

Si un thème v2 est lancé, les points naturels d'entrée seraient :
1. **Reportés critiques** : VP-15 Stripe + VP-13 API publique (prérequis commerciaux).
2. **Reportés HAUTES** : VP-06 sessions, VP-23 communauté, VP-19 compléter l'aide avec captures d'écran, VP-16 analytics.
3. **Thème transverse « persistence layer »** : basculer localStorage → IndexedDB (SR-18, SI-15 reportés).
4. **Thème refactor** : QT-01 découper `App.tsx` (1300+ lignes, 24 useState).

Pour toute nouvelle feature, rester discipliné sur le modèle des batches thème 11/12 : constats isolés, fichiers nommés, tests passants, RECAP à la fin.
