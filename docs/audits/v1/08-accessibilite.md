# Audit Accessibilite - Carnet Naturaliste v5.2

**Date** : 2025-03-28
**Version audit** : v1
**Statut** : Termine

## Resume executif

L'application presente des **lacunes structurelles d'accessibilite** qui la rendent largement inutilisable pour les utilisateurs de technologies d'assistance. Les problemes majeurs sont : (1) **aucune modale n'a de semantique dialog ni de focus trap** (6 composants concernes), (2) **aucun landmark ARIA** (`<main>`, `<nav>`) ni skip-to-content, (3) **~15 boutons icone-seule sans `aria-label`**, et (4) **l'autocomplete especes n'implemente pas le pattern ARIA combobox**. Le contraste de la couleur principale (`#34C759`) est insuffisant pour du texte (ratio 2.3:1).

**Niveau de preuve** : STATIQUE (analyse du code source). Aucun test avec lecteur d'ecran reel.

## Methode et perimetre

- Analyse statique de tous les composants React pour les patterns ARIA, labels, focus, clavier
- Reference : WCAG 2.2 niveau AA (pas de certification, analyse code-level)
- Non couvert : tests avec NVDA/VoiceOver, tests de contraste pixel-par-pixel, audit d'accessibilite mobile natif

## Constats

### Dialogs et modales

| # | Severite | Critere WCAG | Preuve | Fichier:ligne | Constat | Recommandation |
|---|----------|--------------|--------|---------------|---------|----------------|
| AC-01 | CRITIQUE | 4.1.2 Name/Role/Value (A) | STATIQUE | ConfirmationDialog.tsx:22, AdvancedFilterDialog.tsx:76, SyncCenterDialog.tsx:52, ImportPreviewDialog.tsx:44, ExportScopeDialog.tsx:29, StatsExportDialog.tsx:29 | **Aucune des 6 modales** n'a `role="dialog"`, `aria-modal="true"`, ni `aria-labelledby`. Toutes sont de simples `<div className="fixed ...">`. Un lecteur d'ecran ne sait pas qu'une modale est ouverte. | Creer un composant `<Dialog>` reutilisable avec `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointant vers le titre. |
| AC-02 | CRITIQUE | 2.4.3 Focus Order (A) | STATIQUE | Memes 6 fichiers | **Aucun focus trap.** Zero appel a `.focus()`, zero `autoFocus`, zero librairie focus-trap. L'utilisateur clavier peut Tab hors de la modale. | Implementer un focus trap (ou utiliser `focus-trap-react`). Au montage, focus sur le premier element interactif. |
| AC-03 | HAUTE | 2.1.1 Keyboard (A) | STATIQUE | Memes 6 fichiers | **Escape ne ferme aucune modale.** Aucun `onKeyDown` pour Escape dans les 6 dialogs. | Ajouter `useEffect` ecoutant Escape pour appeler `onClose`. |
| AC-04 | HAUTE | 2.4.3 Focus Order (A) | STATIQUE | App.tsx:930-957 | **Pas de retour de focus** a l'element declencheur a la fermeture des modales. Le focus tombe sur `<body>`. | Sauvegarder `document.activeElement` avant ouverture, appeler `.focus()` a la fermeture. |

### Formulaires

| # | Severite | Critere WCAG | Preuve | Fichier:ligne | Constat | Recommandation |
|---|----------|--------------|--------|---------------|---------|----------------|
| AC-05 | CRITIQUE | 4.1.2 Name/Role/Value (A) | STATIQUE | ObservationForm.tsx:537-581 | **Autocomplete especes sans pattern ARIA combobox.** L'input n'a pas `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-autocomplete`, `aria-activedescendant`. La `<ul role="listbox">` existe mais les `<li>` n'ont pas `role="option"` ni `aria-selected`. | Implementer le pattern WAI-ARIA combobox complet. |
| AC-06 | CRITIQUE | 3.3.1 Error Identification (A) | STATIQUE | ObservationForm.tsx:584+ | **Champs en erreur sans `aria-invalid="true"`.** Les messages d'erreur sont de simples `<p>` sans `role="alert"`, sans liaison `aria-describedby` avec le champ. | Ajouter `aria-invalid`, `aria-describedby="fieldname-error"` sur les inputs, `id="fieldname-error"` et `role="alert"` sur les messages d'erreur. |
| AC-07 | CRITIQUE | 1.3.1 Info/Relations (A) | STATIQUE | Login.tsx:57-70 | **Labels email/mot de passe non associes** aux inputs via `htmlFor`/`id`. | Ajouter `htmlFor="login-email"` sur le label, `id="login-email"` sur l'input. Idem mot de passe. |
| AC-08 | HAUTE | 4.1.2 Name/Role/Value (A) | STATIQUE | ObservationForm.tsx:593-612 | **Groupe taxonomique** : boutons faisant office de radio sans `role="radiogroup"`, sans `aria-checked`/`aria-pressed`, sans `aria-label` (seulement `title`). | Envelopper dans `<div role="radiogroup" aria-label="Groupe taxonomique">`, ajouter `role="radio"` + `aria-checked` sur chaque bouton. |
| AC-09 | HAUTE | 4.1.3 Status Messages (AA) | STATIQUE | Login.tsx:49-52 | **Message erreur/succes login** sans `role="alert"` ni `aria-live`. | Ajouter `role="alert"` pour les erreurs, `role="status"` pour les succes. |
| AC-10 | MOYENNE | 1.3.1 Info/Relations (A) | STATIQUE | AdvancedFilterDialog.tsx:97-108, 116-133, StatsExportDialog.tsx:36-51, FilterBar.tsx:42-60 | **Inputs sans label associe** : placeholders utilises comme seul label, pas de `htmlFor`/`id` sur plusieurs paires label/input dans les dialogs et filtres. | Ajouter `aria-label` ou `htmlFor`/`id` sur chaque champ. |
| AC-11 | MOYENNE | 1.3.1 Info/Relations (A) | STATIQUE | ObservationList.tsx:320,581, ObservationRow.tsx:38, ObservationCard.tsx:33 | **Checkboxes sans label accessible** : checkbox "select all", checkboxes de selection par ligne/carte, champ recherche mobile sans `aria-label`. | Ajouter `aria-label` descriptif sur chaque checkbox et input de recherche. |

### Navigation et structure

| # | Severite | Critere WCAG | Preuve | Fichier:ligne | Constat | Recommandation |
|---|----------|--------------|--------|---------------|---------|----------------|
| AC-12 | CRITIQUE | 1.3.1 Info/Relations (A) | STATIQUE | App.tsx:822-1161 | **Aucun landmark ARIA.** Le contenu principal est dans un `<div>` generique, pas de `<main>`. La navigation desktop n'est pas dans un `<nav>`. | Envelopper le contenu dans `<main>`, utiliser `<nav aria-label="Navigation principale">`. |
| AC-13 | CRITIQUE | 2.4.1 Bypass Blocks (A) | STATIQUE | App.tsx:822 | **Pas de lien skip-to-content.** | Ajouter `<a href="#main-content" className="sr-only focus:not-sr-only">Aller au contenu principal</a>` en debut de page. |
| AC-14 | HAUTE | 4.1.2 Name/Role/Value (A) | STATIQUE | BottomNavigation.tsx:33-50, App.tsx:1000-1039 | **Navigation sans semantique tablist.** Les onglets n'ont pas `role="tab"`, `aria-selected`, ni `aria-current="page"`. L'etat actif est transmis uniquement par couleur/echelle. | Utiliser `<nav>` avec `role="tablist"` + `role="tab"` + `aria-selected` sur chaque onglet. |
| AC-15 | HAUTE | 4.1.3 Status Messages (AA) | STATIQUE | App.tsx (global) | **Changements de vue non annonces.** Aucun `aria-live` region ne communique le passage Liste -> Carte -> Stats. | Ajouter `<div aria-live="polite" className="sr-only">` mis a jour au changement de vue. |

### Boutons et composants interactifs

| # | Severite | Critere WCAG | Preuve | Fichier:ligne | Constat | Recommandation |
|---|----------|--------------|--------|---------------|---------|----------------|
| AC-16 | HAUTE | 4.1.2 Name/Role/Value (A) | STATIQUE | App.tsx:833-925 (8 boutons), ObservationList.tsx:265-276 (2 boutons), App.tsx:981 (1 bouton) | **~11 boutons icone-seule avec seulement `title`** mais sans `aria-label`. `title` n'est pas lu de maniere fiable par tous les lecteurs d'ecran. | Ajouter `aria-label` en complement de `title`. Ajouter `aria-hidden="true"` sur les SVG. |
| AC-17 | HAUTE | 2.1.1 Keyboard (A) | STATIQUE | ObservationGallery.tsx:22-24 | **Galerie : `<div onClick>` inaccessible au clavier.** Pas de `tabIndex`, `role="button"`, ni `onKeyDown`. | Remplacer par `<button>` ou ajouter `tabIndex={0}`, `role="button"`, `onKeyDown` pour Enter/Space. |
| AC-18 | HAUTE | 2.1.1 Keyboard (A) | STATIQUE | Auth/UserProfile.tsx:10-73 | **Dropdown UserProfile non navigable au clavier.** Se ferme uniquement sur `mousedown`. Pas de `aria-expanded`, `aria-haspopup`, `role="menu"`, pas de fermeture par Escape. | Ajouter `aria-expanded`, `aria-haspopup="true"`, `role="menu"`, gestionnaire Escape. |

### Focus et clavier

| # | Severite | Critere WCAG | Preuve | Fichier:ligne | Constat | Recommandation |
|---|----------|--------------|--------|---------------|---------|----------------|
| AC-19 | HAUTE | 2.4.7 Focus Visible (AA) | STATIQUE | ObservationList.tsx:325,334,341,351,470, index.css (global) | **`outline-none` sans remplacement** sur 6+ elements dans ObservationList. Aucun style `:focus-visible` global dans index.css. Les inputs du formulaire ont `focus:ring-2` (bien), mais pas les elements de la liste. | Remplacer `outline-none` par `outline-none focus-visible:ring-2 focus-visible:ring-nature-green`. Ajouter une regle globale `:focus-visible` dans index.css. |

### Images et medias

| # | Severite | Critere WCAG | Preuve | Fichier:ligne | Constat | Recommandation |
|---|----------|--------------|--------|---------------|---------|----------------|
| AC-20 | HAUTE | 1.1.1 Non-text Content (A) | STATIQUE | ObservationMap.tsx:244-251 | **Images marqueurs carte sans `alt`** dans le template string HTML du `L.divIcon`. | Ajouter `alt="${obs.taxonomicGroup}"` dans le template. |
| AC-21 | MOYENNE | 1.1.1 Non-text Content (A) | STATIQUE | ObservationMap.tsx:230 | **Clusters sans texte alternatif** : le `L.divIcon` du cluster n'a pas de `role="img"` ni `aria-label`. | Ajouter `role="img" aria-label="${count} observations groupees"`. |
| AC-22 | FAIBLE | 1.1.1 Non-text Content (A) | STATIQUE | ObservationCard.tsx:48,70-76 | **Emojis decoratifs** (🐾, 📍, 📅) lus par les lecteurs d'ecran. Dot de statut (App.tsx:831) sans texte alternatif (label cache sur mobile). | Ajouter `aria-hidden="true"` sur les emojis decoratifs. Rendre le label de statut visible sur mobile. |

### Couleurs et contrastes

| # | Severite | Critere WCAG | Preuve | Fichier:ligne | Constat | Recommandation |
|---|----------|--------------|--------|---------------|---------|----------------|
| AC-23 | HAUTE | 1.4.3 Contrast Minimum (AA) | STATIQUE | tailwind.config.js:18 | **`nature-green` (#34C759) sur blanc : ratio ~2.3:1.** Utilise massivement pour texte de liens, labels actifs, bouton toggle. Echoue le seuil AA de 4.5:1. | Assombrir a `#1B8A2F` (~4.7:1 sur blanc) pour le texte. Garder `#34C759` pour les fonds/boutons avec texte blanc. |
| AC-24 | MOYENNE | 1.4.1 Use of Color (A) | STATIQUE | ObservationRow.tsx:7-14 | **Badges statut (LC, NT, VU, CR)** differencies principalement par la couleur. Le code 2 lettres aide mais un utilisateur daltonien ne distingue pas les niveaux. | Ajouter un indicateur supplementaire (icone, motif, ou `title` descriptif etendu). |
| AC-25 | FAIBLE | 1.4.3 Contrast Minimum (AA) | STATIQUE | Multiples fichiers | **Labels `text-gray-500`** sur fond clair `nature-beige` : ratio ~4.1:1, legerement sous 4.5:1. Dark mode OK (6.4:1). | Utiliser `text-gray-600` (#4B5563) en mode clair. |

### Cibles tactiles

| # | Severite | Critere WCAG | Preuve | Fichier:ligne | Constat | Recommandation |
|---|----------|--------------|--------|---------------|---------|----------------|
| AC-26 | HAUTE | 2.5.8 Target Size (AA) | STATIQUE | App.tsx:833-871 | **Boutons header mobile ~28x28px** (`p-1.5` + icone `w-4 h-4`). Minimum WCAG : 44x44px. | Augmenter le padding a `p-3` minimum ou ajouter `min-w-[44px] min-h-[44px]`. |
| AC-27 | MOYENNE | 2.5.8 Target Size (AA) | STATIQUE | ObservationList.tsx:288-315 | **Boutons action mobile 32px de haut** (`h-8 px-3`). | Augmenter `h-8` a `h-11` (44px). |
| AC-28 | FAIBLE | 2.5.8 Target Size (AA) | STATIQUE | ObservationCard.tsx:83-94, ObservationList.tsx:332, AdvancedFilterDialog.tsx:91 | **Boutons secondaires ~30px** (`px-3 py-1.5 text-xs`). | Augmenter la hauteur a 44px minimum. |

### Annonces dynamiques

| # | Severite | Critere WCAG | Preuve | Fichier:ligne | Constat | Recommandation |
|---|----------|--------------|--------|---------------|---------|----------------|
| AC-29 | MOYENNE | 4.1.3 Status Messages (AA) | STATIQUE | App.tsx:940-946 | **Banniere d'erreur globale** sans `role="alert"`. | Ajouter `role="alert"`. |
| AC-30 | FAIBLE | 4.1.3 Status Messages (AA) | STATIQUE | App.tsx:771,792 | **Ecrans de chargement** sans `role="status"`. | Ajouter `role="status"`. |

## Statistiques

- **Total constats** : 30
- **Critiques** : 7 | **Hautes** : 13 | **Moyennes** : 6 | **Faibles** : 4
- Par critere WCAG : niveau A = 22 | niveau AA = 8
- Par niveau de preuve : STATIQUE 30

## Points positifs

1. **ToastContainer conforme** : `aria-live="polite"`, `aria-relevant="additions"`, `role="alert"` sur chaque toast, `aria-label` sur le bouton fermer (corrige depuis l'audit precedent M3)
2. **Autocomplete clavier fonctionnel** : gestion des fleches haut/bas, Enter, Escape dans `handleSpeciesNameKeyDown`
3. **Boutons filtre taxon (liste)** : `aria-label` et `aria-pressed` correctement implementes dans ObservationList.tsx:536-556
4. **Dark mode contraste OK** : `#F2F2F7` sur `#1C1C1E` = ratio 13.9:1
5. **Zero `dangerouslySetInnerHTML`** : React echappe automatiquement le contenu
6. **ObservationRow** : boutons Modifier/Supprimer ont `aria-label` (un des rares composants corrects)
7. **Formulaire principal** : la plupart des inputs ont des labels associes via `htmlFor`/`id`

## Conclusion

L'accessibilite est le **domaine le plus faible** du projet. La correction la plus impactante serait de creer un **composant `<Dialog>` reutilisable** qui encapsule focus trap, `role="dialog"`, `aria-modal`, retour de focus, et fermeture par Escape -- cela corrigerait 4 constats critiques/hauts (AC-01 a AC-04) sur les 6 modales.

**Top 5 des actions prioritaires :**
1. **Composant Dialog accessible** (AC-01 a AC-04) -- corrige 6 modales d'un coup
2. **Landmarks + skip-to-content** (AC-12, AC-13) -- `<main>`, `<nav>`, lien skip
3. **`aria-label` sur tous les boutons icone-seule** (AC-16) -- ~11 boutons, fix rapide
4. **Pattern ARIA combobox pour l'autocomplete** (AC-05) -- necessaire pour les lecteurs d'ecran
5. **Assombrir `nature-green` pour le texte** (AC-23) -- `#34C759` -> `#1B8A2F`
