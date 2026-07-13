# Audit v3 — preuve de référence

- Date : 2026-07-10 (Europe/Paris)
- Branche locale : `fix/ee4-fab-mobile-taille`
- Commit audité : `72d5b700f16b72ad60acdffadf477ce0243f04b0`
- Référence `origin/main` locale : `86c24b084ce134315c309a27e819be3bf92c10fb`
- Arbre de travail avant audit : propre

## Outils

| Outil | Version |
|---|---:|
| Node.js | 24.14.1 |
| npm | 11.11.0 |
| Vite | 6.4.3 |
| Vitest | 3.2.6 |
| TypeScript | 5.7.3 |
| ESLint | 9.39.3 |

## Gate projet

Commande : `npm run check`

- TypeScript : succès
- ESLint : succès
- Vitest : **64 fichiers, 446 tests réussis**
- Build Vite/PWA : succès, 1127 modules transformés
- Service worker : 53 entrées précachées, 1654,83 KiB
- Avertissement build : chunk `vendor-exceljs` de 939,17 kB (271,08 kB gzip), au-dessus du seuil de 500 kB
- Avertissement tests : plusieurs mises à jour de `ObservationDetail` ne sont pas enveloppées dans `act(...)`

## Couverture

Commande : `npm run test:coverage`

| Mesure | Couverture |
|---|---:|
| Instructions | 64,34 % |
| Branches | 68,82 % |
| Fonctions | 74,23 % |
| Lignes | 64,34 % |

Zones importantes à 0 % relevées par V8 : `AdvancedFilterDialog`, `MapInput`, `ObservationMap`, `ResetPassword`, `LegalPages`, `StatsExportDialog`, `StorageConsentBanner`, `SyncCenterDialog`, `ToastContainer`, `useObservationFilters` et `DetailMiniMap`.

## Interprétation

Le gate vert prouve l'absence de régression détectée par la suite actuelle, mais pas une couverture suffisante des parcours critiques. Les avertissements `act(...)`, les composants critiques à 0 % et la couverture globale de 64,34 % sont repris dans l'audit qualité.
