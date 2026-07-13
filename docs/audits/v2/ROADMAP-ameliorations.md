# ROADMAP — Améliorations en réserve (suite du lot E)

> ✅ **STATUT 2026-07-13 : lots 0 → 8 de cette roadmap TOUS livrés et mergés sur `main`.**
> Feuille de route **bouclée**. La suite (ménage deps/sécu, bucket « réserve »,
> finition design finale) est cadrée dans
> [`SESSION-recap-2026-07-13.md`](./SESSION-recap-2026-07-13.md) — document de suivi vivant.
>
> **Créé le 2026-06-20.** Feuille de route priorisée des évolutions restantes après le
> lot E. Source du backlog : [`lot-e-futures-ameliorations.md`](./lot-e-futures-ameliorations.md)
> et [`RECAP-lot-E.md`](./RECAP-lot-E.md).
> Statut du lot E : **entièrement livré et mergé sur `main`** (PR #24 → #36). Il ne reste
> que les **idées en réserve** ci-dessous.

## Principe

- Priorisation **du plus facile au plus dur**.
- **1 lot = 1 PR** (preview Vercel), exécuté **un à la fois**.
- Workflow par lot : code → `npm run check` **vert** → commit + PR + lien collé dans le chat
  → **pause + récap** → **merge par Eliot** → on repart de `main` à jour.

## Contraintes (rappel)

- Tout doit rester **gratuit** et **client-only** autant que possible (Supabase limité :
  ~500 Mo base / 1 Go fichiers).
- ❌ Décidés « **pas à faire** » (réserve lointaine) : audio in-app, comparaison annuelle,
  « à chercher en ce moment ».

## Décisions de cadrage (2026-06-20)

- **Design (logo EE-5 + animations EE-4) → tout à la fin**, en une passe, pour styliser d'un
  coup les nouveaux écrans (dont la vue lecture seule EE-2).
- **Météo auto → sur la date de l'observation** : Open-Meteo (même fournisseur que
  l'altitude), un appel couvrant le jour même + le passé récent (`past_days` ~92 j) ;
  au-delà, champ manuel (fallback silencieux). Aucun stockage.
- **Logo → les deux familles** : aperçus SVG (dérivé de l'oiseau existant **et** concepts
  neufs), choix sur pièces.
- **Gros morceaux** → bucket « Réserve / plus tard », après les lots 0-8.

---

## Ordre des lots

| Lot | Item | Effort | Valeur naturaliste |
|----|------|:--:|------|
| 0 | Créer cette roadmap (docs) | S | Référence durable |
| 1 | EE-3 — Code atlas en liste déroulante | S | Saisie rapide + données standardisées |
| 2 | « Enregistrer et ajouter une autre » | S | Saisie en série sur le terrain |
| 3 | Météo auto | S | Enrichit chaque obs sans effort |
| 4 | Versionner / valider le cache local | S | Protège les obs offline des bugs de format |
| 5 | EE-1 — Saisir une obs en cliquant sur la carte | M | Workflow terrain naturel |
| 6 | EE-2 — Vue lecture seule (consultation) | M | Consulter sans risque d'éditer par erreur |
| 7 | EE-5 — Vrai logo | S | Identité / écran d'accueil PWA / favicon |
| 8 | EE-4 — Animations + finitions design | S→M | App plus agréable et « finie » |
| — | **Réserve / plus tard** | M→L | cf. dernière section |

---

## Détail des lots

### Lot 0 — Roadmap persistante (S, docs)
- **Fichier :** ce document (`docs/audits/v2/ROADMAP-ameliorations.md`).
- **Pièges :** aucun. Point d'entrée unique pour la suite.

### Lot 1 — EE-3 : Code atlas en liste déroulante (S)
- **Valeur :** au lieu d'un champ libre, une liste des codes de nidification → saisie rapide,
  zéro faute de frappe, données exploitables en stats/export.
- **Fichiers :** `components/ObservationForm.tsx` (champ `atlasCode`, ~ligne 620) ; nouveau
  `utils/atlasCodes.ts` (constantes codes + libellés). `atlasCode` reste un `string`.
- **Pièges :**
  - **Compatibilité rétro** : une obs existante peut contenir un `atlasCode` hors liste →
    l'afficher quand même (option « valeur actuelle », ou select + champ libre). Ne jamais
    perdre une valeur saisie.
  - Codes dépendant du groupe (oiseaux nicheurs). Garder simple : liste oiseaux + option
    « Autre / non concerné », rester permissif pour les autres groupes.
  - Ne pas casser l'import/export Excel (toujours `string`).

### Lot 2 — « Enregistrer et ajouter une autre » (S)
- **Valeur :** plusieurs espèces au même endroit/jour → on garde le contexte, on ne
  ressaisit que l'espèce. Gros gain de temps sur le terrain.
- **Fichiers :** `components/ObservationForm.tsx` (boutons submit ~785-803, `handleSubmit`
  ~277) ; `App.tsx` (`handleSaveObservation` ~399-420 : rester sur `View.FORM` dans ce mode).
- **Pièges :**
  - **On garde** : lieu / commune / dépt / pays / GPS / altitude / date / heure / observateurs
    / groupe taxo. **On vide** : espèce / nombre / sexe / âge / photo / son / commentaire /
    code atlas.
  - Réinitialiser proprement photo/son (`URL.revokeObjectURL`) → pas de fuite mémoire.
  - Toast « Enregistrée, ajoutez la suivante » + scroll en haut.
  - **Garder** le bouton « Sauvegarder » classique (le nouveau est en plus).

### Lot 3 — Météo auto (S)
- **Valeur :** chaque obs enrichie automatiquement → analyses d'activité plus fines, zéro
  effort. Gratuit, pas de stockage.
- **Fichiers :** `services/locationService.ts` (nouvelle `fetchWeather` à côté de
  `fetchAltitude` ~115-128) ; mapping WMO `weathercode` → enum `WeatherCondition`
  (`types.ts:103`) ; `components/ObservationForm.tsx` (`handleLocationChange` ~117-132).
- **Pièges :**
  - **Mapping weathercode → enum** : couvrir au mieux les 11 valeurs.
  - **Date ≠ aujourd'hui** : `past_days` (~92 j) + `forecast_days=1`, choisir l'heure la plus
    proche ; au-delà → fallback manuel silencieux.
  - **Ne pas écraser** un choix manuel (champ « touché » / ≠ `UNKNOWN`). Respecter
    `fieldTouched`.
  - Gérer offline / timeout (comme l'altitude).

### Lot 4 — Versionner / valider le cache local (S, robustesse)
- **Valeur :** quand le format des données évolue (après déploiement), évite les bugs
  silencieux et protège les obs stockées en local (offline).
- **Fichiers :** `services/storageService.ts` (lecture cache ~174) ;
  `services/storageSchema.ts` ; constante `CACHE_VERSION`.
- **Pièges :**
  - **Migration douce** : version inconnue → tenter de valider/garder, n'invalider qu'en
    dernier recours. **Ne jamais effacer** des obs valides.
  - Valider la **forme** (tableau d'`Observation`) avant usage.
  - Ne pas casser la **file de sync offline**.
  - Étendre `tests/storageService.test.ts`.

### Lot 5 — EE-1 : Saisir une obs en cliquant sur la carte (M)
- **Valeur :** repérer un point puis saisir directement, sans passer par « se repérer ».
  Workflow terrain naturel.
- **Fichiers :** `components/ObservationMap.tsx` (ajouter un handler de clic carte —
  actuellement aucun) ; `App.tsx` (`handleAddObservation` ~362 reçoit une position initiale) ;
  `components/ObservationForm.tsx` (accepter une position de départ).
- **Pièges :**
  - **Distinguer** clic « ajouter ici » du clic sur un **marker existant**.
  - **Le bouton « se repérer » ne doit PAS ouvrir le form** (exigence explicite).
  - Réutiliser `reverseGeocode` + `fetchAltitude` pour pré-remplir commune/altitude.
  - **UX anti-accident** : mode explicite (bouton bascule ou appui long) ; tap vs pan/zoom
    sur mobile.

### Lot 6 — EE-2 : Vue lecture seule (M)
- **Valeur :** consulter une obs joliment, sans risque de modif par erreur ; modification via
  un bouton **Modifier** explicite.
- **Fichiers :** nouveau `components/ObservationDetail.tsx` ; `App.tsx` (nouvelle valeur
  `View.DETAIL` + état `selectedObservation` + routage ~917-1042) ; points d'entrée actuels
  (liste / carte / galerie) → rediriger vers le détail au lieu de l'édition directe.
- **Pièges :**
  - **Enum `View`** : 7/8/9/10 déjà pris → index libre (ex. 6).
  - **Ne pas dupliquer** le rendu enrichi ; mini-carte = image statique ou Leaflet read-only.
  - Bouton **Modifier** → `View.FORM` + `editingObservation` (réutiliser
    `handleEditObservation` ~368).
  - **Tous** les `onEdit` doivent pointer vers le détail. Bouton **retour** + scroll top.
  - Style fait dans le lot 8 → livrer fonctionnel « propre mais simple » d'abord.

### Lot 7 — EE-5 : Vrai logo (S, design)
- **Valeur :** identité, écran d'accueil PWA, favicon, crédibilité.
- **Démarrage :** aperçus SVG des **deux familles** (dérivé oiseau + concepts neufs) → choix,
  puis déclinaison.
- **Fichiers :** `public/` (`logo.svg`, `favicon.ico`, `apple-touch-icon.png`,
  `pwa-144/192/384/512.png`) ; `App.tsx` (titre header ~589) ; `index.html` ;
  `vite.config.ts` (icônes manifest ~110) ; éventuel `components/Logo.tsx`.
- **Pièges :**
  - **Toutes les tailles** cohérentes **et légères** (leçon PR #33 : 1,4 Mo → 7/57 Ko).
  - **Lisibilité en petit** (16 px) et sur fond clair **et** sombre.
  - Icône **maskable** Android (zone de sécurité).

### Lot 8 — EE-4 : Animations + finitions design (S→M, design)
- **Valeur :** app plus agréable et « finie », sans refonte.
- **Fichiers :** `index.css` (keyframes — déjà `fadeIn`/`blob`) ; `tailwind.config.js` ;
  composants ciblés (transitions de vue, apparitions, hover) ; emojis → **SVG** ;
  popups/clusters Leaflet au style de l'app ; états vides illustrés. **Inclut le style de la
  vue lecture seule (lot 6).**
- **Pièges :**
  - Respecter `prefers-reduced-motion` (déjà géré → étendre).
  - **Ne pas alourdir le bundle** : CSS/Tailwind d'abord, éviter framer-motion sauf besoin.
  - Cohérence **dark mode** partout.
  - **Découper en 2-3 sous-PR** (8a animations, 8b emojis→SVG, 8c états vides + Leaflet).

---

## Réserve / plus tard (gros morceaux — après les lots 0-8)

À cadrer un par un (tous gratuits / client-only sauf mention) :

- **Sentry** (M) — monitoring d'erreurs, gratuit ~5k évts/mois (externe, pas Supabase).
  Accroches prêtes : `utils/logger.ts`, `components/ErrorBoundary.tsx`. *Pièges :* DSN en var
  d'env, **pas** de données perso (RGPD).
- **Backup auto de la base** (M) — GitHub Action `pg_dump` hebdo. *Pièges :* connection
  string en **secret**, rétention, quota.
- **3-4 tests E2E (Playwright)** (M) — parcours clés. *Pièges :* Supabase mock/preview,
  minutes CI.
- **Vue « Mes espèces » / life list** (M) — client only.
- **Rattachement TAXREF (CD_NOM)** (M) — API INPN gratuite, +1 colonne texte.
- **Partage public d'une obs par lien** (M) — petite table + RLS.
- **Identification plante par photo (Pl@ntNet)** (M) — clé via edge function.
- **Sessions / check-lists de sortie (type eBird)** (L) — nouvelle table.
- ❌ **Pas à faire** : audio in-app, comparaison annuelle, « à chercher en ce moment ».

---

## Suivi

| Lot | PR | État |
|----|----|----|
| 0 | _(cette PR)_ | 🚧 en cours |
| 1 | — | ⚪ à faire |
| 2 | — | ⚪ à faire |
| 3 | — | ⚪ à faire |
| 4 | — | ⚪ à faire |
| 5 | — | ⚪ à faire |
| 6 | — | ⚪ à faire |
| 7 | — | ⚪ à faire |
| 8 | — | ⚪ à faire |
