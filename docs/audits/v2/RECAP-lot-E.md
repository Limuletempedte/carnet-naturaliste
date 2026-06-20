# RÉCAP — Lot E (audit v2 : futures améliorations)

> **Dernière mise à jour : 2026-06-20.**
> Synthèse de tout le travail réalisé sur le lot E (bugs + features + légal/RGPD).
> Backlog source : [`lot-e-futures-ameliorations.md`](./lot-e-futures-ameliorations.md).
> Statut global : **tout le lot E est livré et mergé sur `main` (PR #24 → #35)** — y compris la
> finalisation : icônes PWA compressées + tests composants (#33) et docs/récap (#35).
> Il ne reste que des **idées en réserve** (EE-1 à EE-5).

---

## 1. Vue d'ensemble (chronologie des PRs, 18–20 juin 2026)

| PR | Sujet | État |
|---|---|---|
| #24 | Bugs rapides : zoom mobile (E5), carte topo/standard (E1), scroll onglets (E2) | ✅ mergé `main` |
| #25 | Classement automatique « Arbre » (E3) | ✅ mergé `main` |
| #26 | Installation PWA — base (bouton + invite + menu mobile) | ✅ mergé `main` |
| #27 | Installation — guidage navigateurs non compatibles + stabilisation test flaky | ✅ mergé `main` |
| #28 | Mentions légales — éditeur + contact | ✅ mergé `main` |
| #29 | RGPD — région d'hébergement réelle (eu-central-1, UE) | ✅ mergé `main` |
| #30 | Installation discrète et permanente dans le menu + retrait de la notif | ✅ mergé `main` |
| #31 | Invite d'avis utilisateur (mail) | ✅ mergé `main` |
| #32 | Rétablir la notification d'installation (+ garder le bouton du menu) | ✅ mergé `main` |
| #33 | Icônes PWA compressées (1,4 Mo → 7/57 Ko) + tests composants (notif + avis) | ✅ mergé `main` |
| #35 | Docs : ce récap + mise à jour des statuts | ✅ mergé `main` |

> Note historique : la PR #23 (1er « pack bugs ») avait été empilée par erreur sur la
> branche lot D ; on a reparti proprement de `main` avec la **PR #24** (cherry-pick). Le
> lot D était déjà en prod via la **PR #22**. La **PR #34** (finalisation empilée sur la
> branche de #33) a été **fermée** car en conflit, puis refaite proprement en **#35**
> (docs seuls) depuis `main` à jour.

---

## 2. Bugs corrigés

- **BUG-E1 — Carte : fonds topo/standard gris.** Cause : le placeholder rétina `{r}`
  dans les URLs OSM/OpenTopoMap (`components/ObservationMap.tsx`) → le navigateur demandait
  des tuiles `@2x` inexistantes (404) sur écran haute densité. **Fix** : retrait du `{r}`
  (comme `MapInput` qui marchait). *(PR #24)*
- **BUG-E2 — Scroll partagé entre onglets.** `handleViewChange` ne remettait pas le scroll
  en haut. **Fix** : `window.scrollTo({ top: 0 })` (`App.tsx`). *(PR #24)*
- **BUG-E5 — Zoom involontaire mobile (onglet Liste).** *Nouveau bug remonté pendant la
  session.* **Vraie cause (cross-platform iOS + Android)** : débordement horizontal — le
  bandeau d'en-tête mobile avait `-mx-4` (−16 px) alors que le `<main>` mobile n'a que
  `px-2` (8 px) → page 16 px plus large que l'écran. **Fix** : `-mx-2` + garde-fou
  `overflow-x-clip` (mobile). ⚠️ **Leçon** : un zoom identique sur iOS **et** Android = un
  débordement, pas l'auto-zoom iOS des champs < 16 px (1ʳᵉ hypothèse, partielle). *(PR #24)*
- **BUG-E3 — « Arbre » non classé automatiquement.** `mapGBIFToTaxonomicGroup`
  (`services/speciesService.ts`) ne renvoyait jamais `TREE`. **Fix « fiable & ciblé »** :
  gymnospermes (Pinopsida/Gnetopsida/Cycadopsida/Ginkgoopsida) → `TREE` ; `WOODY_FAMILIES`
  (familles franchement ligneuses) → `TREE` ; familles très mixtes (Rosaceae, Fabaceae…)
  **exclues** → restent `BOTANY`, corrigeables à la main (`fieldTouched`). **Forward-only**
  (anciennes données non re-classées). Aucune modif d'enum/DB/import-export. *(PR #25)*
- **BUG-E4 — ZIP de sauvegarde** : ❌ **abandonné** (Eliot : « pas de problème en fait »).

---

## 3. Fonctionnalités ajoutées

### Installation PWA (« Installer l'application »)
État final (après plusieurs allers-retours #26 → #30 → #32) :
- **Notification automatique** d'invitation à installer (`components/InstallPromptHint.tsx`)
  — polie : **3 affichages max, arrêt après 14 jours**, arrêt à l'installation/au rejet.
  Message **adapté au navigateur** via `installMode` (`hooks/useInstallPrompt.ts`) :
  `prompt` (install native), `ios` (consigne Safari), `unsupported` (« ouvrez dans
  Chrome/Edge/Brave/Opera/Samsung Internet »), `pending` (silencieux — on ne dit jamais à
  tort « passez sur Chrome » à un utilisateur déjà sous Chromium).
- **Entrée permanente et discrète** « Installer l'application » dans le menu compte
  (`components/Auth/UserProfile.tsx`, affichée tant que `!isStandalone`, desktop + mobile)
  → filet de **réinstallation** si l'utilisateur a désinstallé.
- **Pas** de bouton flottant desktop (choix d'Eliot).
- État local : `utils/installPromptState.ts` (`shouldShowHint`, clé `install-hint-v1`).
- L'ancien bouton flottant « Sauvegarde ZIP » était redondant avec l'export du menu compte
  → la garde « exclure les images si volumineux » a été déplacée dans `handleExportUserData`.

### Invite d'avis utilisateur
- `components/FeedbackPromptHint.tsx` + `utils/feedbackPromptState.ts`
  (`shouldShowFeedback` : **≥ 5 observations**, **cooldown 35 jours**, « Ne plus demander »).
- Bouton « Donner mon avis » → `mailto:carnetnaturaliste.app@gmail.com`.
- **Cède la priorité à la notif d'installation** (délai + `shouldShowHint`) → jamais les
  deux bannières en même temps. *(PR #31, coordination en #32)*

### Légal / RGPD
- **Mentions légales** : tous les `[A COMPLETER]` remplis (`components/LegalPages.tsx`,
  `docs/legal/registre-traitements.md`). Éditeur = **Eliot SERIVE, particulier non
  commercial**, contact `carnetnaturaliste.app@gmail.com` ; adresse non publiée
  (LCEN art. 6-III-2), SIRET non applicable. *(PR #28)*
- **RGPD région** : région d'hébergement réelle **vérifiée = `eu-central-1` (Francfort,
  UE)**. Les docs disaient à tort « AWS us-east-1 / transfert hors UE » → corrigées
  (`registre-traitements.md`, `LegalPages.tsx`, `infrastructure-regions.md` réécrit).
  **Données personnelles hébergées dans l'UE, aucun transfert hors UE.** *(PR #29)*

### Finalisation (livrée — icônes/tests via #33, docs via #35)
- **Icônes PWA** `pwa-192x192.png` / `pwa-512x512.png` recompressées (1,4 Mo → 7 / 57 Ko).
- **Tests composants** ajoutés : `tests/InstallPromptHint.test.tsx`,
  `tests/FeedbackPromptHint.test.tsx`, `tests/useInstallPrompt.test.tsx`.
- `.gitignore` : captures de bugs locales (`bug-screenshots-local/`, `Photos-*.zip`).

---

## 4. ⚠️ Note importante — pourquoi la notif d'installation peut sembler « absente »

La notif d'installation n'apparaît que si le navigateur **propose** réellement
l'installation (`beforeinstallprompt`), c'est-à-dire : navigateur compatible **+** app
**PAS déjà installée** **+ PAS en navigation privée** (Chrome désactive l'install PWA en
incognito). Sur un appareil où l'app est déjà installée, `beforeinstallprompt` ne se
déclenche plus → mode `pending` → notif silencieuse (**comportement voulu**).
- Pour **voir la notif « installer »** : Chrome **normal**, app désinstallée, données du
  site effacées (DevTools → Application → Clear site data) — pas en incognito.
- Pour **voir la notif « navigateur non compatible »** (déterministe) : ouvrir le site
  dans **Firefox**.
- L'état `install-hint-v1` (localStorage) survit à la désinstallation ; le compte/email
  n'a aucun effet.

---

## 5. Reste à faire (idées en réserve — non commencées)

| # | Idée | Effort |
|---|---|---|
| EE-3 | Code atlas en **liste déroulante** | S |
| EE-5 | **Vrai logo** de l'app | S |
| EE-4 | **Animations** discrètes + finitions visuelles | S→M |
| EE-1 | **Saisir une obs en cliquant sur la carte** (pas via « se repérer ») | M |
| EE-2 | **Vue lecture seule** au clic sur une obs (modif via bouton) | M |

Plus les propositions de l'audit gardées en réserve (météo auto, life list, TAXREF,
partage par lien, Pl@ntNet, sessions eBird, Sentry, backup auto, E2E Playwright…) — voir
le backlog. ❌ Décidés « pas à faire » : audio in-app, comparaison annuelle, « à chercher
en ce moment ».

---

## 6. Repères techniques durables

- **Supabase** : projet « Carnet naturaliste », ref `xowiezzqehadcfnbkijo`, région
  **eu-central-1 (Francfort, UE)** ; colonne `taxonomic_group` = `text` libre.
- **Éditeur** : Eliot SERIVE (particulier non commercial), email app
  `carnetnaturaliste.app@gmail.com`.
- **Contraintes** : tout **gratuit**, Supabase limité (~500 Mo / 1 Go) → privilégier le
  client-only.
- **Tests** : 51 fichiers / 353 tests.
- **Workflow** : petits PRs, `npm run check` vert avant chaque push, pause + récap après
  chaque PR ; le pre-commit (lint-staged) ne lance **pas** les tests.
