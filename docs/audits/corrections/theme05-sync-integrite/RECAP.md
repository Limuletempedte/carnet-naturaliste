# Recap Correction — Theme 05 : Synchronisation & Integrite des Donnees

**Date** : 2026-04-04
**Agent** : Claude Opus 4.6
**Statut** : TERMINE — 22 corrections appliquees, 98/98 tests pass, build OK

---

## Resultat final

- **`npm run check`** : typecheck OK, lint 0 erreurs, 98/98 tests pass, build OK
- **7 batches executes** — tous valides par le quality gate apres chaque batch
- **0 regression** introduite
- **0 nouveau test** ajoute (corrections sur fichier principal + 2 tests existants adaptes pour TTL)
- **1 migration SQL** creee (non-destructive)

---

## Corrections appliquees par batch

### Batch 1 — Mutex + Capture Namespace (Fondation)
| ID | Fichier | Correction |
|----|---------|------------|
| SI-02 | `services/storageService.ts` | Mutex Promise sur `processOfflineQueue` : variable module-level `processingQueue`, extraction du corps dans `_processOfflineQueueInner`, coalescence des appels concurrents (meme Promise partagee) |
| SI-14 | `services/storageService.ts` | Capture `const capturedNamespace = storageNamespace` au debut de `_processOfflineQueueInner`, warning si le namespace change pendant le traitement |

### Batch 2 — Re-upload Photos + Timeout Upload
| ID | Fichier | Correction |
|----|---------|------------|
| SI-16r | `services/storageService.ts` | Helper `dataUrlToBlob()` + fonction `reUploadDataUrlMedia()` dans `processOneItem` : detecte les `data:` URLs, convertit en Blob, upload via `uploadPhoto`/`uploadSound`, remplace par URL publique. Branches INSERT et UPDATE couvertes. |
| SI-17 | `services/storageService.ts` | Helper `withTimeout()` (Promise.race) avec timeout 30s sur `uploadPhoto` et `uploadSound`. Cleanup du timer dans `finally`. |

### Batch 3 — Durcissement Queue
| ID | Fichier | Correction |
|----|---------|------------|
| SI-03 | `services/storageService.ts` | try/catch sur `localStorage.setItem` dans `setQueue` : attrape `QuotaExceededError`, dispatch event `storage-quota-exceeded`, throw message francais |
| SI-05 | `services/storageService.ts` | Apres chaque item reussi dans la boucle de sync, mise a jour immediate de la queue persistee via `setQueue()`. Protege contre le crash navigateur. |
| SI-06 | `services/storageService.ts` | Validation payload dans `addToQueue` (INSERT/UPDATE : `speciesName` + `date` obligatoires, DELETE : `id` obligatoire). TTL 30 jours dans `getQueue()` : items expires filtres avec warning. |
| SI-07 | `services/storageService.ts` | `assertMutationAffectedRows` ajoute dans la branche UPDATE de `processOneItem`. Un UPDATE sur un ID supprime cote serveur est maintenant traite comme echec. |
| SI-12 | `services/storageService.ts` | Apres le refresh cache serveur, re-injection des observations des `failedItems` INSERT via `bulkUpsertObservationsInCache`. Les observations en attente de retry restent visibles. |

### Batch 4 — Detection Conflits + Nettoyage Storage
| ID | Fichier | Correction |
|----|---------|------------|
| SI-08 | `services/storageService.ts` | `select('id, updated_at')` dans `updateObservation` (approche pragmatique : logging de conflit, pas de rejet automatique). Limitation documentee : last-write-wins reste le comportement. |
| SI-20 | `services/storageService.ts` | `deleteObservation` retourne `photo_url, sound_url` dans le SELECT du DELETE. Apres suppression, extraction du path storage via `extractStoragePath()` et appel `storage.from('photos').remove()` (best-effort). |
| SI-13 | `services/storageService.ts` | Re-verification auth toutes les `REAUTH_CHECK_INTERVAL` (5) items dans la boucle de sync. Si non-authentifie : arret immediat, items restants marques echoues avec raison `'Session expiree'`. |

### Batch 5 — Migrations SQL (Non-destructives)
| ID | Fichier | Correction |
|----|---------|------------|
| SI-18 | `supabase/migrations/20260404100000_theme5_sync_integrity.sql` | FK `user_id` avec `ON DELETE CASCADE` (permet suppression compte RGPD) |
| SI-19 | meme fichier | Policy UPDATE avec `WITH CHECK (auth.uid() = user_id)` (empeche transfert user_id) |
| SI-22 | meme fichier | CHECK constraints longueur : location <= 500, comment <= 5000, latin_name <= 200 (NOT VALID + VALIDATE) |
| SI-23 | meme fichier | `taxonomic_group` : UPDATE NULL → 'Autre', SET DEFAULT 'Autre', CHECK NOT NULL |
| SI-24 | meme fichier | Trigger protege `created_at` : `NEW.created_at = OLD.created_at` |
| SI-29 | meme fichier | DOWN statements en commentaires a la fin du fichier |

### Batch 6 — Schema Reference + Organisation Migrations
| ID | Fichier | Correction |
|----|---------|------------|
| SI-26 | `supabase_schema.sql` | Mis a jour avec : FK CASCADE, taxonomic_group NOT NULL DEFAULT, trigger created_at, WITH CHECK, CHECK constraints longueur, index species_name |
| SI-27 | `supabase/migrations/` | 3 fichiers deplacés via `git mv` : phase2, phase5_neuroptera, phase6_count_breakdown |

### Batch 7 — Corrections Faibles + Documentation
| ID | Fichier | Correction |
|----|---------|------------|
| SI-25 | `supabase_schema.sql` | Commentaire documentant le choix intentionnel de lecture publique du bucket photos |
| SI-28 | `services/importPolicy.ts` | `if (!idAlreadyExists) return originalId` — les UUIDs valides non-conflictuels sont preserves au lieu d'etre regeneres. Tests adaptes. |

---

## Constats deja corriges par les themes precedents (skips)

| ID | Corrige par | Theme |
|----|------------|-------|
| SI-01 (C) | BF-09 : `crypto.randomUUID()` | Theme 02 |
| SI-04 (M) | FO-47/48 : `skippedItems` pour SKIP_TEMP_ID | Theme 01 |
| SI-10 (H) | BF-14 : cache rafraichi apres sync partielle | Theme 02 |
| SI-16 (C) | FO-01 : photo offline en data URL | Theme 01 (re-upload ajoute par ce theme) |

---

## Constats reportes (hors scope)

| ID | Severite | Raison |
|----|----------|--------|
| SI-09 | HAUTE | Soft-delete = ajout colonne `deleted_at` + modification de tous les SELECT/cache/UI. Refactoring architectural. |
| SI-11 | MOYENNE | Polling/Supabase Realtime = nouvelle fonctionnalite, pas un fix. |
| SI-15 | MOYENNE | IndexedDB backup = changement de couche de persistance complet. |
| SI-21 | MOYENNE | Contrainte d'unicite metier : risque avec donnees existantes + pas de regle metier claire. |

---

## Bugs rencontres pendant l'implementation

### 1. Tests TTL (Batch 3)
- **Probleme** : 2 tests `processOfflineQueue` utilisaient des timestamps `1` et `2` (epoch 1970), filtres par le nouveau TTL de 30 jours
- **Solution** : Remplacement par `Date.now()` et `Date.now() + 1` dans les tests
- **Impact** : 0 regression (les tests testent le meme comportement avec des timestamps valides)

### 2. Mock delete + SELECT (Batch 4)
- **Probleme** : Le mock existant ne supportait pas la chaine `.select().eq().eq().single()` necessaire pour un SELECT avant DELETE
- **Solution** : Au lieu d'un SELECT separe, retourne `photo_url, sound_url` directement dans le `select()` du DELETE existant (`select('id, photo_url, sound_url')`). Zero round-trip supplementaire.
- **Impact** : Plus propre que le plan initial (1 requete au lieu de 2)

---

## Points d'attention pour le prochain agent (theme 6+)

### Fichiers modifies par ce theme
- **`services/storageService.ts`** — Modifications majeures : mutex, reUploadDataUrlMedia, withTimeout, extractStoragePath, addToQueue validation, getQueue TTL, setQueue quota, processOneItem (assertMutationAffectedRows UPDATE, reUploadDataUrlMedia INSERT/UPDATE), boucle sync (per-item queue write, reauth check, failed INSERT re-injection), deleteObservation (storage cleanup), updateObservation (select updated_at)
- **`services/importPolicy.ts`** — SI-28 : preservation UUID valides non-conflictuels
- **`supabase_schema.sql`** — Schema de reference mis a jour completement
- **`supabase/migrations/20260404100000_theme5_sync_integrity.sql`** — CREE
- **`supabase/migrations/20240201000000_phase2_indexes_constraints.sql`** — DEPLACE (ex-racine)
- **`supabase/migrations/20240501000000_phase5_neuroptera_label.sql`** — DEPLACE (ex-racine)
- **`supabase/migrations/20240601000000_phase6_count_breakdown.sql`** — DEPLACE (ex-racine)
- **`tests/storageService.test.ts`** — Timestamps mis a jour (Date.now())
- **`tests/importPolicy.test.ts`** — 2 tests adaptes pour la preservation UUID

### Risques de conflit inter-themes
- **Theme 06 (Securite)** : `storageService.ts` massivement modifie. Si SE-10 (RLS WITH CHECK) est dans le theme 06, il est DEJA CORRIGE par SI-19 dans ce theme.
- **Theme 07 (Vie privee)** : VP-05 (suppression compte) fonctionne maintenant grace a SI-18 (FK CASCADE). VP-12 (bucket photos public) est documente comme choix intentionnel (SI-25).
- **Theme 10 (Qualite)** : Si App.tsx est refactore, les appels a `processOfflineQueue` restent inchanges (meme API). Le mutex est transparent.
- **Theme 11 (Sauvegarde)** : `backupService.ts` n'a PAS ete modifie. Le helper `extractStoragePath` pourrait etre utile pour le nettoyage de backups.

### Patterns utilises
- **Mutex Promise** : `processingQueue` coalescence les appels concurrents (pas de queue, partage du resultat)
- **withTimeout** : `Promise.race` generique avec cleanup du timer
- **dataUrlToBlob** : Conversion data URL → Blob pour re-upload
- **extractStoragePath** : Parse les URLs publiques Supabase pour extraire le chemin relatif
- **Per-item queue write** : `setQueue` apres chaque item reussi dans la boucle de sync
- **TTL guard** : Filtrage des items expires dans `getQueue` (30 jours)

### Migration SQL
La migration `20260404100000_theme5_sync_integrity.sql` doit etre executee sur Supabase avant mise en production. Utiliser `NOT VALID` + `VALIDATE` pour les CHECK constraints (zero-downtime). Verifier l'absence de `user_id` orphelins avant d'appliquer CASCADE.

### Quality gate
Toujours lancer `npm run check` apres chaque batch. 98 tests doivent passer.

---

## Fichiers crees/modifies par cet agent

| Fichier | Action |
|---------|--------|
| `services/storageService.ts` | Modifie — corrections majeures sync/integrite |
| `services/importPolicy.ts` | Modifie — preservation UUID (SI-28) |
| `supabase_schema.sql` | Modifie — schema de reference mis a jour |
| `supabase/migrations/20260404100000_theme5_sync_integrity.sql` | Cree — migration SQL |
| `supabase/migrations/20240201000000_phase2_indexes_constraints.sql` | Deplace (git mv) |
| `supabase/migrations/20240501000000_phase5_neuroptera_label.sql` | Deplace (git mv) |
| `supabase/migrations/20240601000000_phase6_count_breakdown.sql` | Deplace (git mv) |
| `tests/storageService.test.ts` | Modifie — timestamps TTL |
| `tests/importPolicy.test.ts` | Modifie — 2 tests adaptes SI-28 |
| `docs/audits/corrections/theme05-sync-integrite/RECAP.md` | Cree — ce fichier |
| `.claude/plans/tranquil-leaping-pancake.md` | Cree — plan de correction |
