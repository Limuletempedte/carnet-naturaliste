# Backlog — À faire plus tard sur Carnet Naturaliste

> Liste des améliorations identifiées, à traiter **une par une**, chacune avec
> `npm run check` vert avant commit. Aucune n'est bloquante : l'app est saine.
> **Source maître exhaustive** : `docs/audits/v1/00-sommaire.md` (357 constats classés par sévérité).

## 🟠 Maintenabilité / refactorisation (reportées du lot mai 2026)
- [x] **Hook autocomplétion + enrichissement espèce** (`components/ObservationForm.tsx`) — ✅ fait (cf. [`RECAP-suite.md`](./RECAP-suite.md)) : logique extraite dans `hooks/useSpeciesLookup.ts` (hook unique car refs partagées), après renfort des tests (240 → 246).
- [ ] **Cœur stateful de `services/storageService.ts`** : découper namespace / file d'attente / cache / CRUD / `processOfflineQueue` en modules, en centralisant l'état mutable (`storageNamespace`, `processingQueue`) derrière des accesseurs. Très prudent — c'est la synchro hors-ligne.
- [ ] **`App.tsx`** (~1257 l., QT-01) : poursuivre le découpage (extraire des vues, regrouper l'état des filtres/dialogues via `useReducer` ou un contexte).
- [ ] **`components/ObservationList.tsx`** (~754 l.) et **`services/speciesService.ts`** (~775 l., QT-05) : surveiller la croissance, découper au besoin.

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

## 🧹 Housekeeping immédiat (administratif)
- [x] `git push` des commits du lot mai 2026 — ✅ fait (`origin/main` à jour).
- [x] Suppression de la branche `chore/qualite-mai-2026` après fusion — ✅ fait.
- [x] Fusionner puis supprimer la branche `chore/doc-et-hook-espece` (suite, cf. `RECAP-suite.md`) — ✅ fait (fusion fast-forward dans `main`, branche supprimée).
