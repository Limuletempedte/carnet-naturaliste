# Notes sur les licences des dependances

Dernière mise à jour : 2026-06-11 (audit v2, lot C — réparation de `licenses:check`).

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

#### `buffers@0.1.1` (transitif via `exceljs` → `unzipper` → `binary`)
- **Licence** : champ `license` absent du package.json (2013) → classé « Custom » par license-checker. Le code source historique (substack/node-bufferlist) est MIT/X11.
- **Décision (audit v2, lot C)** : exclu explicitement du check via `--excludePackages "buffers@0.1.1"`. À réévaluer si exceljs change sa chaîne de dépendances.

#### `glob@11` — BlueOak-1.0.0 (transitif via `vite-plugin-pwa` → `workbox-build`)
- **Licence** : Blue Oak Model License 1.0.0 — licence **permissive** moderne (équivalent MIT), OK commercial.
- **Décision (audit v2, lot C)** : ajoutée à l'allowlist du script `licenses:check`.

#### Paquet racine
- `carnet-naturaliste` est `private: true` sans champ `license` → exclu du check via `--excludePrivatePackages` (c'est notre propre code, pas une dépendance).

#### Résidu npm audit accepté : `uuid@8.3.2` (transitif via `exceljs`)
- 2 vulnérabilités modérées restantes après `npm audit fix` (lot C) : pas de correctif dans la plage de versions d'exceljs, et le « fix » proposé par npm est un downgrade d'exceljs vers 3.x (refusé).
- **Analyse** : le bug d'uuid concerne `v3/v5/v6` avec un buffer fourni ; exceljs utilise `v4()` sans buffer → non exploitable dans notre usage. Accepté, à réévaluer si exceljs publie une nouvelle version.

#### Polices embarquées (`public/fonts/*`)
- Aucune police tierce embarquée à date (uniquement polices système + CSS). Si on ajoute une police (Google Fonts en asset local, par ex.), il faudra documenter sa licence (OFL, Apache-2.0, etc.) dans ce fichier.

## Génération automatisée

Pour générer un rapport complet à n'importe quel moment :

```bash
npx license-checker --production --summary
```

Pour détecter automatiquement les licences non-conformes (GPL, LGPL, AGPL, SSPL) :

```bash
npm run licenses:check
```

(La liste autorisée de référence est celle du script `licenses:check` de `package.json` — y compris BlueOak-1.0.0 et les exclusions documentées ci-dessus.) Si une licence hors liste apparaît, le script échoue (code ≠ 0) et doit être investigué.

## Prochaines étapes suggérées (hors thème 10)

- Générer et publier un fichier `THIRD_PARTY_NOTICES.md` listant toutes les attributions (auto-généré via `license-checker --customPath format.json`).
- Ajouter un check CI sur `npm run licenses` pour bloquer l'introduction d'une dépendance avec une licence restrictive.
