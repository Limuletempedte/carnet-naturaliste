#!/usr/bin/env python3
"""Génère les icônes PNG et le favicon.ico à partir des SVG sources du logo.

Usage : npm run icons   (ou : python3 scripts/generate-icons.py)

Le rendu passe par librsvg, via GdkPixbuf. Les deux sont déjà présents sur un
bureau Linux GNOME (Pop!_OS, Ubuntu…). S'ils manquent, installer les paquets
python3-gi, gir1.2-gdkpixbuf-2.0 et librsvg2-common.

Sources (voir scripts/icons/README.md) :
  public/logo.svg                  → icônes PWA « any » (tuile arrondie)
  public/favicon.svg               → favicon 32 et 48 px
  scripts/icons/logo-16.svg        → favicon 16 px (simplifié)
  scripts/icons/logo-maskable.svg  → icônes PWA « maskable » (zone de sécurité 80 %)
  scripts/icons/logo-apple.svg     → apple-touch-icon (plein cadre)
"""
import os
import shutil
import struct
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, 'public')
ICONS = os.path.join(ROOT, 'scripts', 'icons')

LOGO = os.path.join(PUBLIC, 'logo.svg')
FAVICON = os.path.join(PUBLIC, 'favicon.svg')
TINY = os.path.join(ICONS, 'logo-16.svg')
MASKABLE = os.path.join(ICONS, 'logo-maskable.svg')
APPLE = os.path.join(ICONS, 'logo-apple.svg')

PNG_TARGETS = [
    (LOGO, 144, 'pwa-144x144.png'),
    (LOGO, 192, 'pwa-192x192.png'),
    (LOGO, 384, 'pwa-384x384.png'),
    (LOGO, 512, 'pwa-512x512.png'),
    (MASKABLE, 192, 'pwa-maskable-192x192.png'),
    (MASKABLE, 512, 'pwa-maskable-512x512.png'),
    (APPLE, 180, 'apple-touch-icon.png'),
]
ICO_FRAMES = [(TINY, 16), (FAVICON, 32), (FAVICON, 48)]


def _renderer():
    """Retourne une fonction svg → png, avec GdkPixbuf, ou rsvg-convert à défaut."""
    try:
        import gi
        gi.require_version('GdkPixbuf', '2.0')
        from gi.repository import GdkPixbuf

        def render(svg, png, size):
            pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_scale(svg, size, size, False)
            pixbuf.savev(png, 'png', ['compression'], ['9'])
        return render
    except (ImportError, ValueError):
        pass
    if shutil.which('rsvg-convert'):
        def render(svg, png, size):
            subprocess.run(['rsvg-convert', '-w', str(size), '-h', str(size), '-o', png, svg], check=True)
        return render
    sys.exit('Aucun moteur de rendu SVG trouvé : installer python3-gi, '
             'gir1.2-gdkpixbuf-2.0 et librsvg2-common (ou librsvg2-bin).')


def write_ico(path, frames):
    """Conteneur ICO qui embarque des PNG (format accepté par tous les navigateurs)."""
    header = struct.pack('<HHH', 0, 1, len(frames))
    offset = 6 + 16 * len(frames)
    entries, blobs = b'', b''
    for size, data in frames:
        dim = 0 if size >= 256 else size
        entries += struct.pack('<BBBBHHII', dim, dim, 0, 0, 1, 32, len(data), offset)
        blobs += data
        offset += len(data)
    with open(path, 'wb') as f:
        f.write(header + entries + blobs)


def main():
    render = _renderer()
    for svg, size, name in PNG_TARGETS:
        out = os.path.join(PUBLIC, name)
        render(svg, out, size)
        print(f'{name:28} {size:>4} px  {os.path.getsize(out) / 1024:5.1f} Ko')

    frames = []
    with tempfile.TemporaryDirectory() as tmp:
        for svg, size in ICO_FRAMES:
            png = os.path.join(tmp, f'{size}.png')
            render(svg, png, size)
            with open(png, 'rb') as f:
                frames.append((size, f.read()))
    ico = os.path.join(PUBLIC, 'favicon.ico')
    write_ico(ico, frames)
    print(f'{"favicon.ico":28} 16/32/48  {os.path.getsize(ico) / 1024:5.1f} Ko')


if __name__ == '__main__':
    main()
