# Logo et icônes

Logo « Oiseau sur sa feuille » (novembre 2026) : un oiseau blanc posé sur une
feuille vert anis, près d'une pousse crème, sur une tuile vert vif. Il est
dessiné à la main en SVG, d'après un croquis d'Eliot Serive.

## Les sources

Ce sont les seuls fichiers à modifier :

| Fichier | Rôle |
|---|---|
| `public/logo.svg` | Logo complet, sur une tuile arrondie. Il est affiché sur l'écran de connexion, le chargement et l'écran hors-ligne, et sert aux icônes PWA « any ». |
| `public/favicon.svg` | L'oiseau seul, avec son œil et son aile : favicon SVG, et favicon 32 et 48 px. |
| `scripts/icons/logo-16.svg` | Version 16 px : la silhouette et l'œil seulement. |
| `scripts/icons/logo-maskable.svg` | Version plein cadre, avec le dessin réduit à 80 % pour rester dans la zone de sécurité des icônes « maskable » d'Android. |
| `scripts/icons/logo-apple.svg` | Version plein cadre pour `apple-touch-icon` : c'est iOS qui arrondit les coins. |

Les cinq fichiers partagent les mêmes tracés (oiseau, aile, feuille, pousse).
Si tu modifies un tracé, reporte la modification dans chacun d'eux.

## Regénérer les PNG et le favicon.ico

```bash
npm run icons
```

Le script `scripts/generate-icons.py` régénère dans `public/` :

- les icônes PWA `pwa-*.png` (144, 192, 384 et 512 px), dont les versions
  `pwa-maskable-*.png` ;
- `apple-touch-icon.png` (180 px) ;
- `favicon.ico`, qui contient trois tailles : 16, 32 et 48 px.

Il fonctionne sous Linux, sans rien installer de plus : le rendu passe par
librsvg via GdkPixbuf, déjà présents sur un bureau GNOME (Pop!_OS, Ubuntu…).
S'ils manquent, il faut installer les paquets `python3-gi`,
`gir1.2-gdkpixbuf-2.0` et `librsvg2-common`. Le test `tests/pwaIcons.test.ts`
vérifie la présence, les dimensions et le poids des fichiers générés.

## Logos des groupes taxonomiques (`public/Logo/`)

Les 32 logos des groupes (Oiseaux, Odonates, Fourmis…) sont des PNG
transparents de 256 × 256 px, de 3 à 24 Ko chacun (460 Ko en tout). Ils sont
affichés au plus à 80 px CSS (fiche d'une observation), ce qui reste net sur un
écran de densité 3, et à 68 px dans l'export PDF des statistiques.

Les originaux (1024 px, 1,5 Mo chacun, 45 Mo en tout) ne sont plus dans le
dossier, mais l'historique git les garde (commit `99b73ac`). Pour regénérer les
logos à partir de ces originaux :

```bash
npm run logos
```

Pour partir d'autres originaux, par exemple un logo redessiné en grand, les
mettre dans un dossier hors du dépôt (avec le même nom de fichier que dans
`public/Logo/`), puis :

```bash
python3 scripts/generate-taxon-logos.py --source /chemin/vers/originaux
```

Le script `scripts/generate-taxon-logos.py` met chaque logo au carré (en
ajoutant du vide transparent, sans recadrer le dessin), le réduit à 256 px et
l'enregistre sous le même nom. Il utilise GdkPixbuf, comme `npm run icons`.
Les noms contiennent des espaces et des accents : ils sont gardés tels quels,
car `constants.tsx` (`TAXON_LOGOS`) y fait référence. Le test
`tests/taxonLogos.test.ts` vérifie que chaque groupe a son fichier, en 256 px,
de moins de 40 Ko, et que le dossier pèse moins de 1 Mo.
