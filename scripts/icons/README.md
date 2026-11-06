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
