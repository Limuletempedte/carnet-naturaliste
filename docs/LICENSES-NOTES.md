# Notes sur les licences des dependances

Dernière mise à jour : 2026-04-17 (Thème 10, QT-18/QT-19).

## Objectif

Ce document recense les licences des dépendances tierces utilisées par l'application Carnet Naturaliste, en particulier celles qui demandent une attention particulière en vue d'une commercialisation.

## Commande d'audit

```bash
npm run licenses
```

Utilise `license-checker` pour lister toutes les licences production (hors devDeps).

## Résumé global

La majorité des dépendances sont sous licences permissives (MIT, Apache-2.0, BSD-*), compatibles avec un usage commercial propriétaire.

## Dépendances notables

### MIT
- **React** (`react`, `react-dom`) — MIT, OK commercial.
- **Supabase JS** (`@supabase/supabase-js`) — MIT, OK commercial.
- **Leaflet**, **Leaflet.markercluster** — BSD-2-Clause / MIT, OK commercial.
- **Recharts** — MIT, OK commercial.
- **jsPDF** — MIT, OK commercial.
- **ExcelJS** — MIT, OK commercial.
- **html2canvas** — MIT, OK commercial.
- **jszip** — MIT or GPL-3.0 (dual) — nous utilisons sous MIT, OK commercial.
- **DOMPurify** — Apache-2.0 OR MPL-2.0 — OK commercial sous Apache-2.0.

### Apache-2.0
- **Workbox** (via `vite-plugin-pwa`) — Apache-2.0, OK commercial (attribution requise dans la doc/NOTICE).

### Points de vigilance

#### `file-saver` (2.0.5)
- **Licence** : MIT — OK commercial.
- **Maintenance** : **projet inactif depuis 2016-2018** (dernier commit significatif). Aucun CVE critique recensé à ce jour.
- **Recommandation Thème 10** : conserver pour l'instant (API stable, aucune régression observée). Surveiller les alternatives (`downloadjs`, ou l'API native `<a download>` + `URL.createObjectURL`) si une faille était découverte.
- **Usage** : `services/backupService.ts`, `services/observationExportService.ts`.

#### Polices embarquées (`public/fonts/*`)
- Aucune police tierce embarquée à date (uniquement polices système + CSS). Si on ajoute une police (Google Fonts en asset local, par ex.), il faudra documenter sa licence (OFL, Apache-2.0, etc.) dans ce fichier.

## Génération automatisée

Pour générer un rapport complet à n'importe quel moment :

```bash
npx license-checker --production --summary
```

Pour détecter automatiquement les licences non-conformes (GPL, LGPL, AGPL, SSPL) :

```bash
npx license-checker --production --onlyAllow "MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC;CC-BY-4.0;CC0-1.0;0BSD;Unlicense"
```

Si une licence non whitelist apparaît, le script échoue (code ≠ 0) et doit être investigué.

## Prochaines étapes suggérées (hors thème 10)

- Générer et publier un fichier `THIRD_PARTY_NOTICES.md` listant toutes les attributions (auto-généré via `license-checker --customPath format.json`).
- Ajouter un check CI sur `npm run licenses` pour bloquer l'introduction d'une dépendance avec une licence restrictive.
