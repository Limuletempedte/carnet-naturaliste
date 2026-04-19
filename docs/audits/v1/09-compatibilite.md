# Audit Compatibilite - Carnet Naturaliste v5.2

**Date** : 2025-03-28
**Version audit** : v1
**Statut** : Termine

## Resume executif

L'application cible correctement les **navigateurs modernes** (Chrome 92+, Firefox 96+, Safari 15.2+, Edge 92+) mais presente des **lacunes PWA significatives sur iOS** et des **problemes de responsive sur petits ecrans** (320px). Les principaux bloquants sont : (1) **meta tags Apple manquants** empechant le mode standalone sur iOS, (2) **assets PWA references mais absents** (favicon, apple-touch-icon, masked-icon), (3) **min-width excessifs** causant un debordement horizontal sur iPhone SE/petits ecrans, et (4) **aucun `.browserslist`** ni `build.target` explicite dans Vite. Le mode sombre est bien implemente (~410 classes `dark:` sur 22 fichiers) avec une couverture d'environ 95%.

**Niveau de preuve dominant** : STATIQUE (analyse du code, configuration, manifest). Aucun test reel sur appareil.

## Methode et perimetre

- **Analyse statique** des fichiers de configuration : `vite.config.ts`, `tsconfig.json`, `tailwind.config.js`, `index.html`, `vercel.json`
- **Recherche d'APIs Web** a support limite dans tout le code source
- **Analyse CSS** : classes Tailwind responsive, mode sombre, proprietes a support variable
- **Audit manifest PWA** : champs requis, icones, meta tags
- **Audit Service Worker** : strategie de cache, mise a jour, fallback offline
- **Non couvert** : tests reels sur appareils physiques (iOS, Android, tablettes), tests Lighthouse, tests lecteur d'ecran, tests multi-navigateurs dynamiques

## Constats

### PWA et Service Worker

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| CO-01 | HAUTE | STATIQUE | vite.config.ts:81 | **Assets PWA references mais absents.** `includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg']` -- aucun de ces fichiers n'existe dans `/public`. Seuls `pwa-192x192.png` et `pwa-512x512.png` sont presents. | Pas de favicon (404 en console), pas d'icone Apple pour l'ecran d'accueil, pas d'icone masquee Windows. | Creer les assets manquants ou retirer les references de la config. |
| CO-02 | HAUTE | STATIQUE | index.html (absent) | **Meta tags Apple manquants.** Aucun `<meta name="apple-mobile-web-app-capable">`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`, ni `<link rel="apple-touch-icon">`. | Sur iOS Safari, la PWA ne s'ouvrira **pas en mode standalone** -- elle s'ouvrira avec la barre d'adresse et les controles Safari. Pas de nom personnalise sur l'ecran d'accueil. | Ajouter les meta tags Apple dans `index.html`. |
| CO-03 | HAUTE | STATIQUE | index.html (absent) | **Pas de favicon dans le HTML.** Aucune balise `<link rel="icon">`. Les navigateurs tentent `GET /favicon.ico` et obtiennent une 404. | Erreur 404 systematique, onglet sans icone, pollution des logs serveur. | Ajouter `<link rel="icon" href="/favicon.ico">` et creer le fichier. |
| CO-04 | MOYENNE | STATIQUE | vite.config.ts:84 | **Langue du manifest incorrecte.** `lang: 'en'` dans le manifest mais `<html lang="fr">` dans le HTML. | Incoherence pour les installateurs PWA et outils d'accessibilite. | Changer `lang: 'fr'` dans la config manifest. |
| CO-05 | MOYENNE | STATIQUE | vite.config.ts:86,101 | **Couleur du manifest incoherente.** `theme_color: '#ffffff'` et `background_color: '#ffffff'` mais l'app utilise `bg-nature-beige` (beige). | Splash screen blanc puis transition vers interface beige -- discontinuite visuelle sur Android. Barre d'adresse blanche au lieu de la couleur de l'app. | Aligner `theme_color` et `background_color` sur les couleurs reelles de l'app. |
| CO-06 | MOYENNE | STATIQUE | index.tsx:13-18 | **`confirm()` bloquant pour la mise a jour SW.** `onNeedRefresh()` utilise `confirm("Une nouvelle version est disponible...")` qui bloque toute l'interface. | Interruption brutale du workflow utilisateur, surtout pendant la saisie terrain. Sur mobile, le dialog natif est peu ergonomique. | Remplacer par un toast/snackbar non-bloquant avec bouton "Mettre a jour". |
| CO-07 | MOYENNE | INFERENCE | vite.config.ts:47-49 | **Cache SW 30 jours ignore sur iOS.** `maxAgeSeconds: 60*60*24*30` mais Apple impose une **limite de 7 jours** sur les caches Service Worker apres inactivite. | Les utilisateurs iOS perdent leur cache apres 7 jours sans visite, necessitant un re-telechargement complet. Pas documente. | Documenter la limitation iOS. Eventuellement reduire le TTL a 7 jours pour coherence cross-platform. |
| CO-08 | MOYENNE | INFERENCE | vite.config.ts:103-108 | **Pas de page de fallback offline dediee.** Le SW redirige toutes les navigations vers `index.html` mais si le chargement echoue offline, l'utilisateur voit une page blanche ou une erreur reseau. | Experience offline degradee sans indication claire du mode hors-ligne. | Ajouter une page `/offline.html` minimaliste dans le fallback du SW. |
| CO-09 | FAIBLE | STATIQUE | vite.config.ts:87-98 | **Tailles d'icones limitees.** Seules 192x192 et 512x512 sont configurees. Il manque 96x96, 144x144, 256x256. | Distorsion legere sur certains appareils Android qui ont besoin de tailles intermediaires. | Generer les tailles manquantes. |
| CO-10 | FAIBLE | STATIQUE | vite.config.ts:82-102 | **Manifest minimal.** Pas de `categories`, `screenshots`, `shortcuts`, ni `orientation`. | Pas de raccourcis depuis l'ecran d'accueil (ex: "Nouvelle observation"), pas de screenshots pour les stores PWA. | Ajouter `shortcuts` (au minimum "Nouvelle observation") et `categories: ["productivity"]`. |
| CO-11 | INFO | STATIQUE | vite.config.ts:106-107 | **Logos exclus du precache (intentionnel).** `globIgnores: ['**/Logo/*']` avec `StaleWhileRevalidate` en runtime. Les ~30 icones de groupes taxonomiques (~1.4 Mo chacune) ne gonflent pas le precache. | Optimisation correcte. Les logos se chargent a la demande et sont caches pour 30 jours. | -- |

### APIs Web et support navigateur

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| CO-12 | HAUTE | STATIQUE | App.tsx:121, ObservationForm.tsx:501, storageService.ts:261,514,544, importPolicy.ts:29-32, excelImportService.ts:277, jsonImportValidation.ts:191-200 | **`crypto.randomUUID()` utilise sans fallback.** 10+ usages dans le code. Non disponible en contexte non-securise (HTTP), ni sur Safari < 15.2, Firefox < 96, Chrome < 92. | Crash JavaScript sur navigateurs anciens ou si l'app est accedee en HTTP. Concerne la creation d'observations, l'import, la queue offline. | Creer un wrapper `generateUUID()` avec fallback `Math.random()` ou utiliser la lib `uuid`. |
| CO-13 | MOYENNE | STATIQUE | (absent) | **Pas de `.browserslistrc` ni de `build.target` dans Vite.** `tsconfig.json` cible ES2020 mais Vite utilise `esnext` par defaut pour le build. Aucune matrice de support explicite. | Le support navigateur minimum implicite est Chrome 92+ / Firefox 96+ / Safari 15.2+ mais ce n'est documente nulle part. Pas de transpilation garantie pour les navigateurs plus anciens. | Ajouter un `.browserslistrc` et definir `build.target` dans `vite.config.ts`. |
| CO-14 | MOYENNE | STATIQUE | MapInput.tsx:282, ObservationMap.tsx:363 | **`navigator.geolocation` sans detection prealable.** L'API est utilisee directement sans verifier sa disponibilite. | Si l'API n'est pas disponible (navigateur ancien, contexte non-securise), erreur non geree. En pratique, l'app est sur HTTPS via Vercel. | Ajouter une verification `if ('geolocation' in navigator)` avec message d'erreur. |
| CO-15 | MOYENNE | STATIQUE | MapInput.tsx:113-115, ObservationMap.tsx:152-155 | **`ResizeObserver` utilise sans polyfill.** Non disponible sur IE 11 ni Safari < 13.1. | Les cartes ne se redimensionneront pas correctement sur navigateurs anciens. | Acceptable si IE 11 n'est pas cible. Documenter le support minimum. |
| CO-16 | MOYENNE | STATIQUE | ObservationForm.tsx:128 | **`IntersectionObserver` utilise sans polyfill.** Pour la barre sticky du formulaire. Non disponible sur IE 11 ni Safari < 12.1. | Barre sticky non fonctionnelle sur navigateurs anciens. | Acceptable si IE 11 n'est pas cible. |
| CO-17 | FAIBLE | STATIQUE | MapInput.tsx:56,88, ObservationForm.tsx | **`AbortController` utilise sans detection.** Non disponible sur IE 11 ni Safari < 10. Le code utilise correctement le chainage optionnel (`abortCtrl?.signal`). | Annulation de requetes non fonctionnelle sur tres vieux navigateurs mais sans crash grace au `?.`. | Acceptable -- le chainage optionnel protege contre les erreurs. |
| CO-18 | INFO | STATIQUE | tsconfig.json:3,7 | **Target ES2020 + lib ES2020.** Le chainage optionnel (`?.`), nullish coalescing (`??`), et `Promise.allSettled` sont correctement transpiles par Vite. | Support navigateur coherent avec les APIs utilisees. | -- |

### Responsive et ecrans

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| CO-19 | HAUTE | STATIQUE | AdvancedFilterDialog.tsx, MapInput.tsx | **`min-w-[220px]` sur des champs de formulaire.** Sur un ecran de 320px (iPhone SE), un champ de 220px minimum + padding deborde horizontalement. `MapInput` utilise `min-w-[120px]` sur des selects. | Debordement horizontal et scroll lateral sur iPhone SE et petits ecrans. Saisie terrain degradee. | Remplacer les `min-w-[Xpx]` par des largeurs relatives (`min-w-0 w-full`) ou des breakpoints conditionnels. |
| CO-20 | MOYENNE | STATIQUE | index.html:8-12 | **Google Fonts charge depuis CDN externe.** Deja identifie comme VP-20 (vie privee) et SE-19 (securite). Du point de vue compatibilite : dependance a un CDN tiers, pas de fallback si Google Fonts est bloque (pare-feu entreprise, Chine). | Si Google Fonts est inaccessible, l'app s'affiche avec les polices systeme apres un delai de chargement. La directive `display=swap` dans l'URL evite le FOIT. | Self-host les polices Inter et Merriweather. |
| CO-21 | MOYENNE | INFERENCE | index.html:6, App.tsx | **Pas de gestion du safe-area iOS.** Aucune reference a `env(safe-area-inset-*)` dans le CSS ni `viewport-fit=cover` dans la meta viewport. Les iPhone a encoche (X et plus recents) ont une zone non-interactive en haut et en bas. | La navigation du bas (`BottomNavigation`) pourrait etre masquee par la barre Home de l'iPhone en mode standalone. | Ajouter `viewport-fit=cover` et utiliser `env(safe-area-inset-bottom)` pour le padding du bas. |
| CO-22 | FAIBLE | STATIQUE | ObservationMap.tsx:250 | **Hauteur de carte fixe a 600px en desktop.** `h-[600px]` en desktop, `h-[calc(100vh-200px)]` en mobile. La transition entre les deux est abrupte au breakpoint. | Pas de fluidite dans le redimensionnement de la carte. Sur un ecran 1024x600, 600px depasse la hauteur utile. | Utiliser `h-[min(600px,calc(100vh-200px))]` pour un comportement fluide. |

### Mode sombre

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| CO-23 | MOYENNE | STATIQUE | ObservationMap.tsx:98 | **Couleur hardcodee dans les popups Leaflet.** `btn.style.backgroundColor = '#5D7B45'` sans variante sombre. Les popups sont construits via DOM API (hors du systeme Tailwind). | Bouton vert sur fond potentiellement sombre -- contraste insuffisant en mode sombre. | Detecter `isDark` (deja present L:44) et ajuster la couleur du bouton. |
| CO-24 | MOYENNE | STATIQUE | index.css:43 | **Scrollbar hardcodee sans variante sombre.** `.scrollbar-thin::-webkit-scrollbar-thumb` utilise `#5D7B45` fixe. | Scrollbar a peine visible sur fond sombre. | Ajouter `.dark .scrollbar-thin::-webkit-scrollbar-thumb { background-color: #8FAD7A; }`. |
| CO-25 | FAIBLE | STATIQUE | index.css:10-11 | **Couleurs racine hardcodees.** `:root { color: rgba(255,255,255,0.87); background-color: #242424; }` presentes mais ecrasees par Tailwind. | Pas d'impact visible (Tailwind prend le dessus), mais code mort qui pourrait creer des conflits. | Supprimer les declarations ecrasees de `:root`. |
| CO-26 | INFO | STATIQUE | tailwind.config.js:12, App.tsx:110-114 | **Mode sombre bien implemente.** `darkMode: 'class'`, toggle avec persistence localStorage, ~410 classes `dark:` dans 22 fichiers, palette dediee (`nature-dark`, `nature-dark-bg`, `nature-dark-surface`, `nature-dark-text`). | Couverture d'environ 95% des composants. | -- |

### Compatibilite CSS

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| CO-27 | MOYENNE | STATIQUE | index.css:91-92, multiples composants | **`backdrop-filter` utilise massivement.** Classes `.glass-panel`, `.glass-input`, et Tailwind `backdrop-blur-md` / `backdrop-blur-xl` sur panneaux, carte, overlays. Deja identifie comme PE-26 (performance). | Non supporte sur IE 11. GPU-intensif sur mobile. La version CSS inclut `-webkit-backdrop-filter` (bon pour Safari). | Ajouter `@media (prefers-reduced-motion: reduce)` pour desactiver le blur. |
| CO-28 | FAIBLE | STATIQUE | multiples composants | **`gap` en flexbox utilise via Tailwind.** Classes `gap-1.5`, `gap-2`, `gap-3` partout. | Non supporte sur IE 11. Supporte depuis Chrome 84, Firefox 63, Safari 14.1. | Acceptable pour la cible navigateur moderne. |
| CO-29 | INFO | STATIQUE | Projet entier | **Pas d'utilisation de `dvh`/`svh` ni `oklch`.** Les unites de viewport dynamiques et l'espace couleur oklch ne sont pas utilises. `vh` standard est utilise. | Pas de probleme de compatibilite CSS avancee. | -- |

## Matrice de compatibilite

| Environnement | Support estime | Niveau de verification | Commentaire |
|---------------|----------------|------------------------|-------------|
| Chrome desktop 92+ | Complet | STATIQUE | Toutes les APIs utilisees sont supportees |
| Firefox desktop 96+ | Complet | STATIQUE | `crypto.randomUUID()` requis |
| Safari desktop 15.2+ | Complet | STATIQUE | `-webkit-backdrop-filter` present |
| Edge desktop 92+ | Complet | STATIQUE | Base Chromium, meme support que Chrome |
| Chrome Android 92+ | Complet | INFERENCE | PWA install OK, geolocation OK |
| Safari iOS 15.2+ | Partiel | INFERENCE | Manque meta tags Apple (CO-02), cache 7j (CO-07), pas de safe-area (CO-21) |
| PWA installee Android | Fonctionnel | INFERENCE | Manifest minimal mais suffisant |
| PWA installee iOS | Degrade | INFERENCE | Pas de mode standalone sans meta tags Apple |
| Ecran 320px | Degrade | INFERENCE | Debordements min-width (CO-19) |
| Ecran 375-414px | Fonctionnel | INFERENCE | Layout adaptatif correct |
| Ecran 768px (tablette) | Complet | STATIQUE | Breakpoint `md:` active les colonnes |
| Ecran 1024px+ (desktop) | Complet | STATIQUE | Layout 3 colonnes, `max-w-7xl` |
| Ecran 2560px | Acceptable | INFERENCE | Contenu contraint a `max-w-7xl`, pas d'etirement |
| IE 11 | Non supporte | STATIQUE | Manque crypto.randomUUID, ResizeObserver, AbortController, gap, backdrop-filter |
| Mode sombre | ~95% couvert | STATIQUE | 410 classes dark:, quelques hardcodes restants |

## Statistiques

- **Total constats** : 29
- **Critiques** : 0 | **Hautes** : 5 | **Moyennes** : 12 | **Faibles** : 6 | **Info** : 6
- Par niveau de preuve : STATIQUE 23 | INFERENCE 6

## Points positifs

1. **Mode sombre excellent** : `darkMode: 'class'`, toggle avec localStorage, ~410 classes `dark:` sur 22 fichiers, palette dediee coherente
2. **Responsive bien structure** : `hidden md:table-cell` pour les colonnes, grilles adaptatives `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`, `overflow-x-auto` sur les tableaux
3. **Container contraint** : `max-w-7xl` evite l'etirement sur grands ecrans, padding responsive `p-4 md:p-8`
4. **Navigation mobile dediee** : `BottomNavigation` fixe pour mobile, masque en desktop
5. **Detection mobile** : `window.matchMedia('(max-width: 1024px)')` pour adapter le comportement
6. **Glass effects avec prefixes** : `-webkit-backdrop-filter` present en fallback pour Safari
7. **Chainage optionnel protecteur** : `abortCtrl?.signal` evite les crashes sur navigateurs sans `AbortController`
8. **Dialogs responsives** : `max-w-3xl max-h-[90vh]` avec `overflow-y-auto`
9. **Viewport meta correct** : `width=device-width, initial-scale=1.0` present
10. **Logos en cache runtime** : Exclus du precache (evite un gonflement de ~40 Mo) avec `StaleWhileRevalidate` en runtime
11. **display=swap sur Google Fonts** : Evite le Flash of Invisible Text (FOIT) en cas de chargement lent

## Conclusion

L'application est **compatible avec les navigateurs modernes** (2021+) grace au ciblage ES2020 et a l'utilisation raisonnee des APIs Web. Le mode sombre est un point fort avec une couverture quasi-complete. Les faiblesses principales sont concentrees sur **l'experience PWA iOS** (meta tags Apple absents, cache 7 jours, pas de safe-area) et sur les **petits ecrans** (debordements min-width sur 320px). IE 11 n'est pas supporte -- ce qui est acceptable pour une app terrain moderne.

**Top 3 des actions prioritaires :**
1. **CO-02** : Ajouter les meta tags Apple (`apple-mobile-web-app-capable`, `apple-touch-icon`, `status-bar-style`) -- essentiel pour les utilisateurs iOS terrain
2. **CO-01** : Creer les assets PWA manquants (favicon, apple-touch-icon, masked-icon) -- elimine les 404 et ameliore l'installabilite
3. **CO-19** : Remplacer les `min-w-[220px]` par des largeurs relatives -- debordement sur petits ecrans
