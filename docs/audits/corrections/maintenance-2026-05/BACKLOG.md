# Backlog — À faire plus tard sur Carnet Naturaliste

> Liste des améliorations identifiées, à traiter **une par une**, chacune avec
> `npm run check` vert avant commit. Aucune n'est bloquante : l'app est saine.
> **Source maître exhaustive** : `docs/audits/v1/00-sommaire.md` (357 constats classés par sévérité).

## 🟠 Maintenabilité / refactorisation (reportées du lot mai 2026)
- [ ] **Hook autocomplétion + enrichissement espèce** (`components/ObservationForm.tsx`) : extraire la logique couplée via refs (`latestSpeciesRequestRef`, `lastAutoImage*Ref`, `skipNextSuggestionsFetchRef`) en hooks dédiés. ⚠️ Renforcer d'abord la couverture de tests, puis extraire.
- [ ] **Cœur stateful de `services/storageService.ts`** : découper namespace / file d'attente / cache / CRUD / `processOfflineQueue` en modules, en centralisant l'état mutable (`storageNamespace`, `processingQueue`) derrière des accesseurs. Très prudent — c'est la synchro hors-ligne.
- [ ] **`App.tsx`** (~1257 l., QT-01) : poursuivre le découpage (extraire des vues, regrouper l'état des filtres/dialogues via `useReducer` ou un contexte).
- [ ] **`components/ObservationList.tsx`** (~754 l.) et **`services/speciesService.ts`** (~775 l., QT-05) : surveiller la croissance, découper au besoin.

## 🟡 Performance (constats d'audit reportés)
- [ ] **Virtualisation des listes** (PE-01) : si un utilisateur a beaucoup d'observations, virtualiser la liste (ex. `react-virtuoso`). Nécessite une nouvelle dépendance.
- [ ] **Bundle `exceljs` (939 Ko)** : envisager un export Excel plus léger ou un Web Worker pour le parsing à l'import (PE-16). Déjà chargé en lazy → pas d'impact au démarrage.
- [ ] **Cache offline localStorage → IndexedDB** (PE-18/21) : si le volume de données / médias devient important.

## 🟢 Propreté / documentation (rapide)
- [ ] **Dérives de doc** : `README.md` mentionne `supabase_migration_phase2.sql` (absent à la racine, migrations désormais dans `supabase/migrations/`) ; `CLAUDE.md`/`AGENTS.md` annoncent « 22 fichiers de tests » → il y en a **37**. À corriger.
- [ ] **11 `any` dans `tests/storageService.test.ts`** : typer proprement les mocks (optionnel, casts légitimes).
- [ ] Vérifier la cohérence `README` ↔ scripts/commandes réels.

## 🔵 Produit / fonctionnel / conformité
- [ ] Reprendre `docs/audits/v1/00-sommaire.md` thème par thème (fonctionnel, UI/UX, sécurité, vie privée/RGPD, accessibilité, compatibilité…) : c'est la liste de référence complète, avec sévérités et recommandations. Prioriser les constats non encore traités (cf. les `RECAP.md` par thème pour l'état d'avancement).

## 🧹 Housekeeping immédiat (administratif)
- [ ] `git push` pour publier les 4 commits du lot mai 2026 (actuellement en local seulement).
- [ ] Supprimer la branche de travail `chore/qualite-mai-2026` une fois la fusion confirmée.
