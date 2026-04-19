# Audit Interface Utilisateur / UX - Carnet Naturaliste v5.2

**Date** : 2026-03-28
**Version audit** : v1
**Statut** : Termine

## Resume executif

L'application est **fonctionnellement riche** mais souffre d'un **probleme d'ergonomie terrain** : le formulaire principal presente trop de champs a plat sans hierarchie, les cibles tactiles sont trop petites pour un usage mobile, et la palette de couleurs manque de coherence (melange de couleurs custom `nature-*` et Tailwind standard). Le parcours de saisie est adapte a un usage bureau mais **pas optimise pour le terrain** (soleil, une main, gants, ecran petit). Les messages d'erreur sont souvent techniques, et les actions destructives manquent de previsualisations.

## Methode et perimetre

- **Type** : Audit statique du code UI (JSX, Tailwind classes, structure des composants)
- **Non couvert** : Tests utilisateurs reels, tests terrain, tests avec lecteur d'ecran, mesures de contraste reelles
- **Perspective** : Naturaliste de terrain utilisant l'application sur smartphone en conditions exterieures

---

## Constats

### Formulaire d'observation (parcours principal)

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| UX-01 | CRITIQUE | STATIQUE | ObservationForm.tsx:749-783 | **Surcharge cognitive** : 11 dropdowns (Protocole, Atlas, Sexe, Age, Condition, Comportement, Meteo...) presentes a plat sans hierarchie ni regroupement. Pas d'indication de quels champs sont prioritaires | Un naturaliste terrain a 3-5 champs critiques (espece, lieu, date, nombre). 11 dropdowns identiques creent une paralysie de choix | Regrouper sous une section "Details avances" repliable par defaut |
| UX-02 | HAUTE | STATIQUE | ObservationForm.tsx:682-710 | **7 champs manuels pour la localisation** (lieu-dit, commune, departement, pays, lat, lon, altitude) sans autocomplete administratif. Saisie manuelle de coordonnees GPS = erreurs garanties | En terrain, personne ne tape des coordonnees manuellement. La carte (cachee) devrait etre le mode principal | Faire de la carte le mode par defaut ; remplir les champs automatiquement |
| UX-03 | HAUTE | STATIQUE | ObservationForm.tsx:710-720 | **Carte cachee derriere un bouton** "Localiser sur la carte". Pas d'indication qu'elle remplit automatiquement les champs GPS/adresse. Premiere decouverte non intuitive | Fonctionnalite cle invisible ; les utilisateurs remplissent manuellement ce qui devrait etre automatique | Carte ouverte par defaut ou indication claire de l'auto-remplissage |
| UX-04 | HAUTE | STATIQUE | ObservationForm.tsx:624-676 | **Ventilation male/femelle/indetermine** : pas de feedback temps reel (somme = count). L'erreur n'apparait qu'apres soumission. Le texte d'aide est en `text-xs` (trop petit) | L'utilisateur doit calculer mentalement ; decouvre l'erreur trop tard | Afficher somme en temps reel + barre de progression |
| UX-05 | HAUTE | STATIQUE | ObservationForm.tsx:533-612 | **Selecteur de groupe taxonomique** : 8 boutons-logos larges sans indication claire de la selection active (couleur + ring subtil). Peut etre confus pour daltoniens | Perte de temps a chercher quel groupe est selectionne | Ajouter un checkmark ou un label "selectionne" |
| UX-06 | MOYENNE | STATIQUE | ObservationForm.tsx:725-744 | **Statut IUCN** : spinner "Recherche du statut..." mais l'utilisateur peut soumettre avant la fin. Message "non trouve" en italic gris = invisible | Enrichissement automatique rate silencieusement | Bloquer la soumission pendant la recherche OU rendre le message plus visible |
| UX-07 | MOYENNE | STATIQUE | ObservationForm.tsx:787-805 | **Champ "Son"** : placeholder "Fonctionnalite temporairement indisponible" sans desactivation visuelle (pas de gris, pas de strikethrough) | Utilisateur essaie de cliquer, ne comprend pas pourquoi ca ne marche pas | Masquer completement ou griser avec explication |
| UX-08 | MOYENNE | STATIQUE | ObservationForm.tsx:836-854 | **Boutons Save/Cancel en double** : barre fixe + boutons en bas du formulaire. Sur mobile les deux sont visibles simultanement | Redundance visuelle ; espace gaspille sur petit ecran | Un seul jeu de boutons sticky en bas |
| UX-09 | MOYENNE | STATIQUE | ObservationForm.tsx:559-581 | **Autocomplete especes** : pas d'indicateur de scroll quand la liste est longue (max-h-64). Pas de message "X resultats supplementaires" | Utilisateur ne voit pas tous les resultats ; selectionne un match sous-optimal | Ajouter indicateur de scroll ou compteur |

### Navigation et parcours

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| UX-10 | HAUTE | STATIQUE | App.tsx:322-343 | **Confirmations de suppression generiques** : "Etes-vous sur de vouloir supprimer cette observation ?" sans montrer laquelle (nom d'espece, date) | Risque de supprimer la mauvaise observation | Afficher un apercu : "Supprimer : Merle noir, 28/03/2026 ?" |
| UX-11 | HAUTE | STATIQUE | App.tsx:339-343 | **Suppression en masse** : "Supprimer ces X observations ?" sans liste des elements. Aucun apercu | Suppression accidentelle de mauvais elements sans recours | Afficher les 5 premiers elements selectionnes |
| UX-12 | MOYENNE | STATIQUE | App.tsx:156-161 | **Message quota storage** : "Stockage local plein — les donnees hors-ligne risquent de ne pas etre sauvegardees." sans action proposee | Utilisateur ne sait pas quoi faire | Proposer : "Synchronisez vos donnees" ou "Liberer de l'espace" |
| UX-13 | MOYENNE | STATIQUE | App.tsx:205-215 | **Resultat sync partielle** : "5/10 actions en echec" sans detail (quelles observations, quel type d'echec) | Utilisateur inquiet sans savoir quoi faire | Ajouter lien vers le Centre de sync pour plus de details |

### Authentification et onboarding

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| UX-14 | HAUTE | STATIQUE | Login.tsx:68-77 | **Pas d'indication des exigences mot de passe** (longueur min, caracteres). L'utilisateur decouvre les regles apres echec | Frustration a l'inscription ; tentatives multiples | Afficher les regles inline avant soumission |
| UX-15 | HAUTE | STATIQUE | Login.tsx:49-53 | **Messages d'erreur Supabase bruts** affiches tels quels ("Invalid email format", "User already registered"). Pas de traduction ni reformulation | Messages anglais/techniques pour des utilisateurs francophones | Mapper les erreurs courantes vers des messages francais clairs |
| UX-16 | MOYENNE | STATIQUE | Login.tsx:88-95 | **Bascule inscription/connexion** par lien textuel uniquement. Pas de bouton dedie "Creer un compte" | Nouveaux utilisateurs peuvent rater le lien | Separer visuellement les deux actions |

### Cibles tactiles et ergonomie mobile

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| UX-17 | CRITIQUE | STATIQUE | ObservationCard.tsx:83-94 | **Boutons edit/delete trop petits** : `px-3 py-1.5 text-xs` = ~28px de haut. Minimum iOS/Material = 44x44px | Clics errones sur mobile ; suppression accidentelle possible | Augmenter a min 44x44px |
| UX-18 | HAUTE | STATIQUE | ObservationRow.tsx:83-105 | **Boutons action caches au hover** (`md:opacity-0 md:group-hover:opacity-100`). Sur mobile, icones sans labels = incomprehensibles | Desktop : non-decouvrable. Mobile : icones cryptiques | Toujours afficher avec labels ou tooltips |
| UX-19 | HAUTE | STATIQUE | AdvancedFilterDialog.tsx:76-177 | **Dialogue filtres avances trop complexe sur mobile** : 8 champs input, `px-3 py-2` (~32px). Scroll dans un modal scroll dans la page | Interface inutilisable sur petit ecran | Simplifier ou utiliser un ecran dedie au lieu d'un modal |
| UX-20 | MOYENNE | STATIQUE | ObservationCard.tsx:31-36 | **Checkbox selection** : `w-5 h-5` (20px) sans `<label>`. Cible tactile ~24px | Difficile a cocher sur mobile | Augmenter la zone cliquable |
| UX-21 | MOYENNE | STATIQUE | MapInput.tsx:377-390 | **Resultats recherche carte** : boutons `px-3 py-2` (~28px). Dropdown potentiellement masque par le clavier mobile | Resultats inaccessibles pendant la frappe | Augmenter la taille ; gerer la position par rapport au clavier |
| UX-22 | MOYENNE | STATIQUE | MapInput.tsx:344-390 | **Dropdown recherche** en `absolute top-full max-h-48`. Sur mobile avec clavier ouvert, resultats coupes par le clavier | L'utilisateur ne voit pas les resultats | Ajuster le positionnement ou utiliser une bottom sheet |

### Design visuel et coherence

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| UX-23 | HAUTE | STATIQUE | tailwind.config.js + composants | **Palette de couleurs incoherente** : couleurs custom (`nature-green: #34C759`, `nature-accent: #007AFF`) definies mais non utilisees. Les composants utilisent `blue-600`, `red-500`, `gray-100` standard Tailwind | Pas de langage visuel unifie ; l'app semble "assemblee" plutot que "designee" | Migrer tous les composants vers la palette `nature-*` |
| UX-24 | MOYENNE | STATIQUE | ObservationCalendar.tsx:108-150 | **Mode sombre calendrier incomplet** : regles CSS pour `.dark` mais potentiellement non appliquees si le selecteur parent est different | Texte noir sur fond sombre = illisible | Tester et corriger le mode sombre du calendrier |
| UX-25 | MOYENNE | STATIQUE | ObservationCard.tsx:14-23 | **Badges statut en mode sombre** : `dark:bg-green-900/30` avec opacite 30% = couleurs boueuses, contraste potentiellement insuffisant | Lisibilite reduite en mode sombre | Verifier le ratio de contraste WCAG AA |
| UX-26 | MOYENNE | INFERENCE | ObservationStats.tsx | **Graphiques Recharts** : pas de configuration responsive visible. Taille de police par defaut des axes/tooltips potentiellement trop petite sur mobile | Graphiques illisibles sur petit ecran | Configurer fontSize responsive dans Recharts |

### Dialogues et feedback

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| UX-27 | HAUTE | STATIQUE | ImportPreviewDialog.tsx:51-80 | **Grille stats import** : 5 colonnes sur desktop, empilees sur mobile. Labels en `text-xs uppercase` = difficiles a lire. Pas adapte aux daltoniens (vert/orange/rouge uniquement) | Decision critique (importer ou non) basee sur des stats peu lisibles | Reformuler en texte narratif : "5 lignes, 4 valides, 1 avertissement" |
| UX-28 | HAUTE | STATIQUE | ImportPreviewDialog.tsx:82-113 | **Choix mode conflit** : "Ecrase les observations..." vs "Conserve l'existant..." sans exemples concrets. Termes techniques | Utilisateur ne comprend pas la consequence de son choix | Ajouter un exemple : "Si l'observation #123 existe deja, elle sera remplacee" |
| UX-29 | MOYENNE | STATIQUE | SyncCenterDialog.tsx:110-119 | **Erreurs sync** : meme erreur repetee N fois sans regroupement. 50 echecs identiques = 50 lignes | Modal sature ; utilisateur ne peut pas analyser | Regrouper par type : "Timeout reseau : 12 elements" |
| UX-30 | MOYENNE | STATIQUE | SyncCenterDialog.tsx:143-146 | **Labels queue** : DELETE affiche l'UUID, INSERT/UPDATE affiche le nom d'espece. Inconsistance | UUID incomprehensible pour l'utilisateur | Toujours afficher le nom d'espece si disponible |
| UX-31 | MOYENNE | STATIQUE | ExportScopeDialog.tsx:36-60 | **Options export** : "Selectionnes", "Filtrees", "Toutes" sans explication de ce que "filtrees" signifie en contexte | L'utilisateur ne sait pas si le filtre actif est pris en compte | Preciser : "12 observations (filtre actif : Oiseaux, 2026)" |
| UX-32 | MOYENNE | STATIQUE | ConfirmationDialog.tsx:15-19 | **Couleur bouton destructif** deduite du titre (cherche "suppression"/"delete"). Si le titre change, le bouton n'est plus rouge | Action destructive sans signal visuel de danger | Parametrer `isDestructive` explicitement |
| UX-33 | MOYENNE | STATIQUE | ToastContainer.tsx:27-45 | **Toasts** : duree 4.5s potentiellement trop courte pour les messages longs. Position top-right peu visible sur mobile | Messages rates en usage terrain (attention partagee) | Augmenter la duree pour les erreurs ; position bottom-center sur mobile |

### Responsive et mobile

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| UX-34 | HAUTE | STATIQUE | FilterBar.tsx:28-70 | **Filtre statut absent sur mobile** (`!isMobileView`). Les utilisateurs mobile ne peuvent pas filtrer par statut de conservation | Fonctionnalite cle retiree sur la plateforme principale (terrain = mobile) | Rendre le filtre statut accessible sur mobile |
| UX-35 | MOYENNE | INFERENCE | ObservationRow.tsx:26-111 | **Table 8 colonnes sur mobile** : debordement horizontal. Pas de switch automatique vers vue carte mobile | Scroll horizontal penible ; donnees illisibles | Utiliser ObservationCard sous md: breakpoint |
| UX-36 | MOYENNE | STATIQUE | ObservationGallery.tsx:14,25 | **Galerie mobile** : `grid-cols-1` avec `gap-8` et images `h-56`. Une seule image par ecran, beaucoup de scroll | Parcourir la galerie est lent sur mobile | Reduire gap et hauteur image ; ou 2 colonnes sur sm: |
| UX-37 | FAIBLE | STATIQUE | tailwind.config.js | **Pas de breakpoint custom < 640px** (pas de `xs:`). Appareils tres petits (320px) non optimises | Layout potentiellement casse sur vieux telephones | Ajouter breakpoint xs: 360px |

---

## Statistiques

- **Total constats** : 37
- **Critiques** : 2 (UX-01, UX-17)
- **Hautes** : 15 (UX-02 a UX-05, UX-10/11, UX-14/15, UX-18/19, UX-23, UX-27/28, UX-34)
- **Moyennes** : 17 (UX-06 a UX-09, UX-12/13, UX-16, UX-20 a UX-22, UX-24 a UX-26, UX-29 a UX-33, UX-35/36)
- **Faibles** : 3 (UX-37 et sous-elements)
- Par niveau de preuve : STATIQUE 34 | INFERENCE 3

## Points positifs

- **Autocomplete especes bien concu** : integration iNaturalist/GBIF avec enrichissement automatique, cache, et suggestions pertinentes
- **Mode sombre disponible** : toggle present, la plupart des composants ont des classes `dark:`
- **Navigation bottom bar** : navigation entre les 5 vues (liste, formulaire, carte, stats, calendrier) par barre fixe en bas
- **Carte interactive** : Leaflet avec clustering, recherche, geolocalisation — bien integree quand on la decouvre
- **Filtres rapides** : barre de filtre toujours visible avec recherche, annee, groupe taxonomique
- **Toast notifications** : feedback present pour les operations principales (meme si perfectible)
- **Responsive globalement present** : classes Tailwind `md:`, `lg:` utilisees systematiquement
- **Logos taxonomiques** : 35+ icones SVG/PNG pour chaque groupe — visuellement attractif et distinctif
- **Badges de statut** : code couleur vert/jaune/orange/rouge pour les niveaux de menace IUCN

## Conclusion

L'application a un **bon squelette UX** avec des choix pertinents (bottom navigation, autocomplete especes, carte interactive, filtres rapides). Cependant, pour un usage terrain reel, trois axes majeurs doivent etre travailles :

1. **Simplification du formulaire** (UX-01, UX-02, UX-03) : le formulaire presente trop de champs a plat. Un naturaliste terrain a besoin de saisir rapidement espece + lieu + nombre + photo. Les 11 dropdowns de details doivent etre replaces sous une section "Avance" repliable, et la carte doit devenir le mode de localisation par defaut.

2. **Ergonomie mobile** (UX-17 a UX-22, UX-34) : les cibles tactiles sont systematiquement sous les 44px recommandes. Les boutons d'action sont soit caches (hover), soit trop petits. Le filtre statut est retire sur mobile. C'est critique pour une app de terrain.

3. **Coherence visuelle** (UX-23, UX-24, UX-25) : la palette custom `nature-*` est definie mais non utilisee dans les composants. Le resultat est un melange de couleurs Tailwind standard sans identite visuelle forte.

*Niveau de confiance : STATIQUE — les constats sont bases sur l'analyse du code Tailwind/JSX. Des tests utilisateurs terrain et des mesures de contraste reelles sont necessaires pour valider les inferences.*
