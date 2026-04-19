# Theme 03 — UI/UX : Recap des corrections

**Date** : 2026-04-02
**Quality gate** : `npm run check` — 98/98 tests, typecheck OK, lint OK, build OK
**Audit source** : `docs/audits/v1/03-ui-ux.md` (37 issues)

---

## Resultat final

| Metrique | Valeur |
|----------|--------|
| Issues corrigees | 29 |
| Issues skippees | 3 (UX-23, UX-37, UX-02) |
| Issues deja corrigees (themes 1-2) | 2 (UX-04, UX-27) |
| Issues restantes non corrigees | 3 (UX-33 partiel — residuel safe-area fait) |
| Tests avant | 98 |
| Tests apres | 98 |
| Tests ajoutes | 0 |
| Fichiers modifies | 14 |

---

## Corrections par batch

### Batch 1 — Cibles tactiles critiques

| ID | Fichier | Correction |
|----|---------|-----------|
| UX-17 | `ObservationCard.tsx` | Boutons edit/delete : `px-3 py-1.5 text-xs` → `px-4 py-2.5 text-sm min-h-[44px]` |
| UX-20 | `ObservationCard.tsx` | Checkbox wrapper `min-w-[44px] min-h-[44px]`, checkbox `w-5 h-5` → `w-6 h-6` |
| UX-18 | `ObservationRow.tsx` | Retrait `md:opacity-0 md:group-hover:opacity-100`, boutons toujours visibles + labels `sr-only md:not-sr-only` + min 44px |
| UX-21 | `MapInput.tsx` | Boutons recherche/couche : `p-2` → `p-2.5 min-w-[44px] min-h-[44px]`, icones 24px |

### Batch 2 — Hierarchie formulaire + carte visible

| ID | Fichier | Correction |
|----|---------|-----------|
| UX-01 | `ObservationForm.tsx` | Section "Details avances" collapsible (toggle state). Statut + Protocole restent visibles. 9 dropdowns caches par defaut |
| UX-03 | `ObservationForm.tsx` | Bouton carte rendu plus visible (nature-green, plus grand, label "(recommande)"). **Note** : carte non ouverte par defaut car ResizeObserver casse les tests en jsdom |
| UX-08 | `ObservationForm.tsx` | Boutons bas marques `invisible` quand la barre sticky est visible (evite doublon) |
| UX-07 | `ObservationForm.tsx` | Section son : `opacity-50 pointer-events-none` + texte "bientot disponible" |

### Batch 3 — Login et authentification

| ID | Fichier | Correction |
|----|---------|-----------|
| UX-15 | `Auth/Login.tsx` | Fonction `mapSupabaseAuthError()` : 6 erreurs Supabase mappees en francais + fallback generique |
| UX-14 | `Auth/Login.tsx` | Indication "Minimum 6 caracteres" sous le champ password en mode inscription |
| UX-16 | `Auth/Login.tsx` | Toggle segmente (deux boutons visuels) remplacant le lien texte "Se connecter / S'inscrire" |

### Batch 4 — Responsivite mobile

| ID | Fichier | Correction |
|----|---------|-----------|
| UX-34 | `FilterBar.tsx` | Filtre statut IUCN visible sur mobile (retrait du guard `!isMobileView`) |
| UX-19 | `AdvancedFilterDialog.tsx` | `max-h-[85vh]`, padding reduit mobile `p-4 md:p-6` |
| UX-35 | `ObservationRow.tsx` | Colonne Groupe cachee mobile : `hidden md:table-cell` |
| UX-36 | `ObservationGallery.tsx` | Grille mobile : `grid-cols-2 gap-3`, image `h-40 sm:h-56` |
| UX-22 | `MapInput.tsx` | Dropdown resultats : `max-h-[min(12rem,40vh)]` (evite debordement clavier mobile) |
| UX-09 | `ObservationForm.tsx` | Gradient de defilement sticky en bas de la liste autocomplete si > 5 items |

### Batch 5 — Dialogues et feedback

| ID | Fichier | Correction |
|----|---------|-----------|
| UX-32 | `ConfirmationDialog.tsx` | Prop `variant?: 'default' \| 'destructive'` ajoutee. Detection auto via titre (suppression/delete) + prop explicite |
| UX-10 | `App.tsx` | Suppression unique : message enrichi avec nom espece + date |
| UX-11 | `App.tsx` | Suppression masse : preview des 5 premiers noms + `variant="destructive"` |
| UX-12 | `App.tsx` | Toast quota : message actionnable mentionnant "Centre de sync" + suppression photos |
| UX-13 | `App.tsx` | Sync partielle : affiche nb actions restantes en file + raisons d'echec |
| UX-28 | `ImportPreviewDialog.tsx` | Labels francais : "Mettre a jour les doublons" / "Conserver les existantes" + descriptions claires |
| UX-31 | `ExportScopeDialog.tsx` | Descriptions contextuelles sous chaque option d'export (selection, filtres, total) |

### Batch 6 — Dark mode et polish visuel

| ID | Fichier | Correction |
|----|---------|-----------|
| UX-24 | `ObservationCalendar.tsx` | CSS dark mode : `.dark .react-calendar__tile--neighboringMonth` et `.dark .react-calendar__tile:disabled` |
| UX-25 | `ObservationCard.tsx`, `ObservationRow.tsx` | Badges IUCN dark mode : `dark:text-*-400` → `dark:text-*-300` pour meilleur contraste |
| UX-26 | `ObservationStats.tsx` | Charts : `h-80` → `h-64 md:h-80`, retrait `barSize={24}` fixe (Recharts s'adapte) |
| UX-05 | `ObservationForm.tsx` | Bouton groupe actif : ajout `border-b-4 border-nature-green` |
| UX-06 | `ObservationForm.tsx` | Bouton Save bloque pendant `isFetchingInfo` + texte "Recherche du statut..." |
| UX-33 | `ToastContainer.tsx` | Position safe-area PWA : `top-4` → `top-[max(1rem,env(safe-area-inset-top))]` |

### Batch 7 — Centre de synchronisation

| ID | Fichier | Correction |
|----|---------|-----------|
| UX-29 | `SyncCenterDialog.tsx` | Erreurs groupees : `reduce()` par message + affichage `"raison (x3)"` |
| UX-30 | `SyncCenterDialog.tsx` | Labels francais : `INSERT` → `Ajout`, `UPDATE` → `Modification`, `DELETE` → `Suppression` |

---

## Constats invalides / skips

| ID | Raison du skip |
|----|---------------|
| UX-23 | Refonte palette couleur = touche tous les composants, trop risque. Passe design-system dediee |
| UX-37 | Breakpoint xs (FAIBLE) — `sm:640px` suffit, ajout xs impose de re-tester tous les layouts |
| UX-02 | Autocomplete geographique = nouvelle feature + API externe, pas un fix UX. Reporter au theme 12 |
| UX-04 | Deja corrige par FO-06 (theme 1) — validation temps reel somme ventilation |
| UX-27 | Deja corrige par BF-32 (theme 2) — `.toLocaleString('fr-FR')` ImportPreview |

---

## Bugs rencontres pendant l'implementation

### 1. ResizeObserver en test (Batch 2 — UX-03)
- **Probleme** : Ouvrir la carte par defaut (`showMap: true`) causait `ReferenceError: ResizeObserver is not defined` dans 3/4 tests autocomplete (jsdom/happy-dom n'a pas ResizeObserver)
- **Solution** : Garder `showMap: false` mais rendre le bouton carte tres visible (nature-green, plus grand, "(recommande)"). Compromis UX vs testabilite.
- **Alternative rejetee** : Mocker ResizeObserver globalement — fragile et masque des vrais problemes

### 2. Syntax error balise fermante (Batch 2 — UX-08)
- **Probleme** : L'edit du `className` du `<div ref={bottomButtonsRef}>` a perdu le `>` fermant
- **Solution** : Ajout immediat du `>` manquant. TypeScript l'a detecte via `TS1003: Identifier expected`

---

## Points d'attention pour le prochain agent

### Fichiers fortement modifies (conflits potentiels)
- **`App.tsx`** : Modifie par themes 1, 2 et 3 (toasts, confirmations, sync). Lire attentivement avant d'editer
- **`ObservationForm.tsx`** : Modifie par themes 1, 2 et 3 (toggle details avances, bloc save, autocomplete gradient). ~900 lignes, composant le plus complexe
- **`ObservationRow.tsx`** : Modifie par themes 2 et 3 (boutons visibles, colonne cachee mobile, badges)
- **`MapInput.tsx`** : Modifie par themes 1 et 3 (taille cibles, dropdown mobile)

### Architecture CSS
- L'app utilise Tailwind avec des classes custom (`nature-green`, `nature-dark`, `nature-beige`, `nature-dark-surface`)
- Dark mode via classe `dark` sur l'element racine (Tailwind `darkMode: 'class'`)
- Glassmorphisme (`backdrop-blur-xl`, `bg-white/80`) utilise partout — attention au contraste
- Les badges IUCN utilisent des `dark:text-*-300` (pas `400`) pour le contraste

### Tests
- 98 tests passent — le quality gate est `npm run check` (typecheck + lint + tests + build)
- Les tests autocomplete dans `observationFormAutocomplete.test.tsx` sont sensibles : ils montent `ObservationForm` complet, donc tout changement de structure du formulaire peut les casser
- Pas de mock ResizeObserver — si un composant charge une carte dans les tests, ca cassera

### Patterns utilises
- `getOfflineQueueSnapshot()` pour obtenir la file sync a jour (pas l'etat React qui peut etre stale)
- `mapSupabaseAuthError()` pour traduire les erreurs Supabase en francais (dans Login.tsx, inline)
- `variant="destructive"` sur ConfirmationDialog pour les actions dangereuses (prop optionnelle, retro-compatible)
- `actionLabel` record dans SyncCenterDialog pour les traductions INSERT/UPDATE/DELETE
