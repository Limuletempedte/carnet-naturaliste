# Ligne de base — 2026-09-04

Mesures prises sur `main` au commit `fa9fb07`, avant toute modification.
Reproductible avec les commandes indiquées.

## Porte de qualité — `npm run check`

**Verte.** Sortie complète : [`check-output.txt`](./check-output.txt).

| Étape | Résultat |
|---|---|
| TypeScript (`tsc --noEmit`) | ✅ aucune erreur |
| ESLint | ✅ aucun avertissement |
| Vitest | ✅ **459 tests** sur **66 fichiers**, tous verts (24,9 s) |
| Build Vite 8.1.4 + PWA | ✅ construit en 2,19 s, 72 entrées en precache (1 702 Kio) |

## Couverture de tests — `npm run test:coverage`

Sortie complète : [`coverage-output.txt`](./coverage-output.txt).

| Périmètre | Lignes | Branches | Fonctions |
|---|---|---|---|
| **Global** | **64,55 %** | 69,03 % | 74,60 % |
| `utils/` | 91,05 % | 85,44 % | 96,59 % |
| `services/` | 73,55 % | 61,58 % | 85,54 % |
| `hooks/` | 69,69 % | 77,73 % | 90,69 % |
| `components/` | 53,94 % | 65,58 % | 57,89 % |

Les seuils configurés dans `vitest.config.ts` (45 / 55 / 60) sont très en
dessous du réel : ils ne protègent contre aucune régression de couverture.
`App.tsx`, `index.tsx` et `contexts/` sont **hors périmètre de mesure** (cf. ROB-10).

Pratiquement identique au relevé de l'audit v3 (64,34 % le 2026-07-10) : la
couverture n'a ni progressé ni régressé en deux mois.

## Taille du bundle

Les cinq plus gros morceaux, tous chargés à la demande :

| Chunk | Taille | Compressé |
|---|---:|---:|
| `vendor-exceljs` | 930,5 Ko | 256,6 Ko |
| `vendor-jspdf` | 401,2 Ko | 130,1 Ko |
| `vendor-core` | 394,3 Ko | 111,5 Ko |
| `vendor-recharts` | 368,8 Ko | 105,4 Ko |
| `vendor-html2canvas` | 199,6 Ko | 46,8 Ko |

Vite signale que certains morceaux dépassent 500 Ko. Ce n'est **pas** un
problème ici : ils sont tous en `import()` dynamique, exclus du precache du
service worker, et ne sont téléchargés que si l'utilisateur lance un export.

## Vulnérabilités npm — `npm audit`

Sortie brute : [`npm-audit.json`](./npm-audit.json).

**7 vulnérabilités : 5 hautes, 2 modérées, 0 critique.**

| Paquet | Gravité | Vient de | Atteint le navigateur ? |
|---|---|---|---|
| `brace-expansion` | Haute | outillage de dev | Non |
| `browserslist` | Haute | Babel / autoprefixer (build) | Non |
| `fast-uri` | Haute | outillage de dev | Non |
| `js-yaml` | Haute | outillage de dev | Non |
| `nanoid` | Haute | `postcss` (build) | Non |
| `postcss` | Modérée | Tailwind / autoprefixer (build) | Non |
| **`dompurify`** | **Modérée** | **`jspdf@4.2.1`** | **Oui — chunk `purify.es-*.js`** |

`dompurify` est le seul paquet vulnérable réellement livré au navigateur.
Analyse détaillée en SEC-10 (`01-securite.md`) : présent mais jamais exécuté
sur du contenu non fiable dans cet usage.

## Semgrep — les scans applicatifs manquants de l'audit v3

L'audit v3 n'avait conservé aucune sortie pour les packs applicatifs. Ils ont
été rejoués ici. Sortie brute : [`semgrep/app-scan.json`](./semgrep/app-scan.json).

```
semgrep scan --config=p/security-audit --config=p/owasp-top-ten \
             --config=p/react --config=p/typescript --config=p/secrets \
             --exclude=node_modules --exclude=dist --exclude=coverage
```

- Version : semgrep **1.176.0** (Windows, installé via pip pour cet audit)
- **166 règles** exécutées sur **207 fichiers**, 99,9 % des lignes analysées
- **3 constats, tous en infrastructure — zéro sur le code applicatif**

| Constat | Fichier | Renvoie à |
|---|---|---|
| Actions GitHub sur tag mutable | `.github/workflows/ci.yml:19` | SEC-09 |
| Actions GitHub sur tag mutable | `.github/workflows/ci.yml:22` | SEC-09 |
| Dependabot sans période de quarantaine | `.github/dependabot.yml:10` | SEC-11 |

**Aucun constat OWASP Top 10, aucun secret détecté, aucun anti-pattern React ou
TypeScript signalé sur les 207 fichiers du dépôt.** C'est le résultat le plus
rassurant de cet audit, et il comble le trou de couverture laissé par v3.

### Limites de ce scan

Trois réserves, à connaître avant de traiter ce résultat comme une garantie.

**Deux fichiers n'ont pas pu être analysés** :
`docs/audits/v3/evidence/semgrep/raw/thirdparty-elttam.json` (fichier de preuve
contenant du HTML d'erreur — sans conséquence) et `components/Badges.tsx`
(échec sur un caractère accentué ligne 20). Ce dernier a fait l'objet d'une
relecture humaine à la place.

**L'analyse de propagation de données a expiré sur 8 fichiers.** Le champ
`fixpoint_timeouts` de `app-scan.json` liste : `App.tsx`, `MapInput.tsx`,
`ObservationCalendar.tsx`, `ObservationForm.tsx`, `ObservationList.tsx`,
`ObservationMap.tsx`, `excelImportService.ts`, `speciesService.ts`. Sur ces
fichiers, les règles de suivi de données non fiables (`raw-html-concat`,
`cors-misconfiguration`…) n'ont **pas** terminé leur analyse. Ce sont, sans
surprise, les huit plus gros fichiers du dépôt — le lien avec ROB-10 (taille et
couverture d'`App.tsx`) est direct : ce qui est trop gros pour être testé est
aussi trop gros pour être analysé automatiquement.

**32 fichiers de plus de 1 Mo ont été ignorés** par la limite de taille par
défaut de semgrep.

Autrement dit : « zéro constat sur le code applicatif » signifie zéro constat
**parmi ce qui a effectivement été analysé**. C'est un bon signal, pas une preuve
d'absence.
