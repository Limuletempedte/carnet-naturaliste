#!/usr/bin/env python3
"""Régénère les logos des groupes taxonomiques (public/Logo/*.png) en 256 px.

Usage : npm run logos   (ou : python3 scripts/generate-taxon-logos.py)

Les originaux (1024 px, environ 1,5 Mo chacun) ne sont plus dans l'arbre de
travail, mais l'historique git les garde : par défaut, le script les relit
dans le commit ORIGINALS_COMMIT. Pour partir d'un autre dossier d'originaux
(par exemple un logo redessiné) :

    python3 scripts/generate-taxon-logos.py --source /chemin/vers/originaux

Chaque logo est :
  1. mis au carré si besoin, en ajoutant du vide transparent autour (le dessin
     n'est ni recadré ni déformé) ;
  2. réduit à SIZE × SIZE pixels ;
  3. nettoyé : les pixels entièrement transparents sont remis à zéro (ils
     contenaient une couleur invisible qui alourdissait le fichier) ;
  4. enregistré en PNG, sous le même nom de fichier.

Le rendu passe par GdkPixbuf, comme `npm run icons` (déjà présent sur un bureau
Linux GNOME ; sinon installer python3-gi et gir1.2-gdkpixbuf-2.0).
Le test tests/taxonLogos.test.ts vérifie le résultat.
"""
import argparse
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEST = os.path.join(ROOT, 'public', 'Logo')

# Taille utile : 80 px CSS au plus dans l'app (fiche d'une observation) sur un
# écran de densité 3, et 68 px dans l'export PDF (34 px rendus à l'échelle 2).
SIZE = 256

# Dernier commit où public/Logo contient les originaux en 1024 px.
ORIGINALS_COMMIT = '99b73ac'
ORIGINALS_PATH = 'public/Logo'


def _gdk():
    try:
        import gi
        gi.require_version('GdkPixbuf', '2.0')
        from gi.repository import GdkPixbuf, GLib
        return GdkPixbuf, GLib
    except (ImportError, ValueError):
        sys.exit('GdkPixbuf introuvable : installer python3-gi et gir1.2-gdkpixbuf-2.0.')


def originals_from_git(commit):
    """Retourne [(nom, octets)] des PNG de public/Logo dans le commit donné."""
    listing = subprocess.run(
        ['git', '-C', ROOT, 'ls-tree', '-z', '--name-only', f'{commit}:{ORIGINALS_PATH}'],
        check=True, capture_output=True).stdout.decode('utf-8')
    names = sorted(n for n in listing.split('\0') if n.lower().endswith('.png'))
    return [(n, subprocess.run(['git', '-C', ROOT, 'cat-file', 'blob', f'{commit}:{ORIGINALS_PATH}/{n}'],
                               check=True, capture_output=True).stdout) for n in names]


def originals_from_dir(folder):
    names = sorted(n for n in os.listdir(folder) if n.lower().endswith('.png'))
    result = []
    for n in names:
        with open(os.path.join(folder, n), 'rb') as f:
            result.append((n, f.read()))
    return result


def shrink(data, size, GdkPixbuf, GLib):
    """PNG d'origine (octets) → pixbuf carré de size × size, transparence nettoyée."""
    loader = GdkPixbuf.PixbufLoader.new_with_type('png')
    loader.write(data)
    loader.close()
    pb = loader.get_pixbuf()
    if not pb.get_has_alpha():
        pb = pb.add_alpha(False, 0, 0, 0)
    w, h = pb.get_width(), pb.get_height()
    if w != h:
        side = max(w, h)
        square = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, True, 8, side, side)
        square.fill(0x00000000)
        pb.copy_area(0, 0, w, h, square, (side - w) // 2, (side - h) // 2)
        pb = square
    small = pb.scale_simple(size, size, GdkPixbuf.InterpType.HYPER)
    stride = small.get_rowstride()
    pixels = bytearray(small.get_pixels())
    for y in range(size):
        row = y * stride
        for i in range(row, row + 4 * size, 4):
            if pixels[i + 3] == 0:
                pixels[i] = pixels[i + 1] = pixels[i + 2] = 0
    return GdkPixbuf.Pixbuf.new_from_bytes(
        GLib.Bytes.new(bytes(pixels)), GdkPixbuf.Colorspace.RGB, True, 8, size, size, stride)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--source', help='dossier des originaux (par défaut : historique git)')
    parser.add_argument('--commit', default=ORIGINALS_COMMIT, help=f'commit des originaux (défaut : {ORIGINALS_COMMIT})')
    args = parser.parse_args()

    GdkPixbuf, GLib = _gdk()
    originals = originals_from_dir(args.source) if args.source else originals_from_git(args.commit)
    if not originals:
        sys.exit('Aucun original trouvé.')

    before = after = 0
    for name, data in originals:
        out = os.path.join(DEST, name)
        shrink(data, SIZE, GdkPixbuf, GLib).savev(out, 'png', ['compression'], ['9'])
        size = os.path.getsize(out)
        before += len(data)
        after += size
        print(f'{name:28} {len(data) / 1024:7.0f} Ko → {size / 1024:5.1f} Ko')
    print(f'{len(originals)} logos : {before / 1048576:.1f} Mo → {after / 1024:.0f} Ko')


if __name__ == '__main__':
    main()
