# Backlog — À faire plus tard sur Carnet Naturaliste

> Liste des améliorations identifiées, à traiter **une par une**, chacune avec
> `npm run check` vert avant commit. Aucune n'est bloquante : l'app est saine.
> **Source maître exhaustive** : `docs/audits/v1/00-sommaire.md` (357 constats classés par sévérité).

## 🟠 Maintenabilité / refactorisation (reportées du lot mai 2026)
- [x] **Hook autocomplétion + enrichissement espèce** (`components/ObservationForm.tsx`) — ✅ fait (cf. [`RECAP-suite.md`](./RECAP-suite.md)) : logique extraite dans `hooks/useSpeciesLookup.ts` (hook unique car refs partagées), après renfort des tests (240 → 246).
- [~] **`services/storageService.ts`** : helpers PURS extraits (juin 2026, lot 2) dans `services/storage/*` (954 → 701 l.). **Cœur stateful NON découpé volontairement** (namespace / file d'attente / cache / CRUD / `processOfflineQueue`) : dépend de l'état mutable `storageNamespace` (28+ fonctions) + mutex `processingQueue` + détection SI-14 ; ré-architecture à ROI négatif en prod. À ne rouvrir que sur réelle nécessité.
- [x] **`App.tsx`** (QT-01) — ✅ découpage **terminé** (juin 2026, cf. [`../maintenance-2026-06/RECAP.md`](../maintenance-2026-06/RECAP.md)) : `useFilterControls`, `useSyncQueue`, `useImportObservations`, `useBulkDelete` extraits + testés. 1371 → 1053 l. (−318). Reste optionnel : extraire des vues si le fichier regrandit.
- [ ] **`components/ObservationList.tsx`** (~797 l.) et **`services/speciesService.ts`** (~886 l., QT-05) : surveiller la croissance, découper au besoin.

## 🟡 Performance (constats d'audit reportés)
- [ ] **Virtualisation des listes** (PE-01) : si un utilisateur a beaucoup d'observations, virtualiser la liste (ex. `react-virtuoso`). Nécessite une nouvelle dépendance.
- [ ] **Bundle `exceljs` (939 Ko)** : envisager un export Excel plus léger ou un Web Worker pour le parsing à l'import (PE-16). Déjà chargé en lazy → pas d'impact au démarrage.
- [ ] **Cache offline localStorage → IndexedDB** (PE-18/21) : si le volume de données / médias devient important.

## 🟢 Propreté / documentation (rapide)
- [x] **Dérives de doc** — ✅ fait (cf. [`RECAP-suite.md`](./RECAP-suite.md)) : `README.md` renvoie désormais vers `supabase/migrations/` ; `CLAUDE.md`/`AGENTS.md` indiquent « 37 fichiers de tests (246 tests) ».
- [x] **11 `any` dans `tests/storageService.test.ts`** — ✅ fait (juin 2026) : mocks typés (`unknown[]`, retour `auth.getUser` typé, `JSON.parse` typé) → **0 warning ESLint**.
- [x] Vérifier la cohérence `README` ↔ scripts/commandes réels — ✅ vérifié : les 6 commandes du README correspondent à `package.json`, aucune divergence.

## 🔵 Produit / fonctionnel / conformité
- [ ] Reprendre `docs/audits/v1/00-sommaire.md` thème par thème (fonctionnel, UI/UX, sécurité, vie privée/RGPD, accessibilité, compatibilité…) : c'est la liste de référence complète, avec sévérités et recommandations. Prioriser les constats non encore traités (cf. les `RECAP.md` par thème pour l'état d'avancement).
- [~] **Quick wins audit (lot juin 2026)** — corrigés : FO-26 (géoloc NaN), FO-33 (doublon tri), FO-49 (listes sync bornées), FO-50 (image cassée). Déjà OK/non-problématiques après vérification : FO-07, FO-25, FO-27, FO-37, FO-43 (déjà corrigés) ; FO-20, FO-21, FO-32 (déjà couverts). Reste de la longue traîne FO-* à reprendre au besoin.

## 🧹 Housekeeping immédiat (administratif)
- [x] `git push` des commits du lot mai 2026 — ✅ fait (`origin/main` à jour).
- [x] Suppression de la branche `chore/qualite-mai-2026` après fusion — ✅ fait.
- [x] Fusionner puis supprimer la branche `chore/doc-et-hook-espece` (suite, cf. `RECAP-suite.md`) — ✅ fait (fusion fast-forward dans `main`, branche supprimée).
