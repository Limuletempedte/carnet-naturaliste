# Recap Correction — Theme 02 : Bugs & Fiabilite

**Date** : 2026-04-02
**Agent** : Claude Opus 4.6
**Statut** : TERMINE — 19 corrections appliquees, 98/98 tests pass, build OK

---

## Resultat final

- **`npm run check`** : typecheck OK, lint 0 erreurs, 98/98 tests pass, build OK
- **7 batches executes** — tous valides par le quality gate apres chaque batch
- **0 regression** introduite
- **8 nouveaux tests** ajoutes (4 ErrorBoundary, 1 signOut resilience, 3 NaN guards)

---

## Corrections appliquees par batch

### Batch 1 — ErrorBoundary (CRITIQUE)
| ID | Fichier | Correction |
|----|---------|------------|
| BF-01 | `components/ErrorBoundary.tsx` | **CREE** — Class component avec fallback UI, boutons "Retour" et "Recharger la page" |
| BF-01 | `index.tsx` | Wrapper global `<ErrorBoundary>` autour de `<AuthProvider><App />` |
| BF-01 | `App.tsx` | Wrapper section-level autour du `<Suspense>` avec `onReset={() => setView(View.LIST)}` |

### Batch 2 — Collision ID temporaires (CRITIQUE)
| ID | Fichier | Correction |
|----|---------|------------|
| BF-09 | `storageService.ts:383` | `temp-${Date.now()}` → `temp-${crypto.randomUUID()}` — collision impossible |

### Batch 3 — Auth & SignOut (HAUTE)
| ID | Fichier | Correction |
|----|---------|------------|
| BF-02 | `AuthContext.tsx:167-176` | `await supabase.auth.signOut()` enveloppe dans try/catch — deconnexion offline gracieuse |
| BF-03 | `UserProfile.tsx:59-62` | Handler onClick rendu async, `setIsOpen(false)` avant `await signOut()` |
| BF-33 | `App.tsx:194` | Commentaire explicatif : `supabaseConfigError` est une constante module-level, jamais reactive |

### Batch 4 — Dialog & Form robustesse (HAUTE)
| ID | Fichier | Correction |
|----|---------|------------|
| BF-04 | `ConfirmationDialog.tsx:33-40` | Handler async avec try/catch autour de `onConfirm()`, dialog se ferme toujours |
| BF-05 | `observationFormService.ts:61-64` | Gardes `Number.isFinite()` pour altitude, gps.lat, gps.lon — NaN → null |

### Batch 5 — Null guards UI (MOYENNE/FAIBLE)
| ID | Fichier | Correction |
|----|---------|------------|
| BF-23 | `ObservationRow.tsx:67` | `{observation.municipality ?? ''}` au lieu de rendu brut |
| BF-25 | `ObservationMap.tsx:83` | Fallback `'Non renseigne'` si location et municipality sont null |
| BF-27 | `ObservationStats.tsx:106-112` | Early return "Aucune observation" si `observations.length === 0` |
| BF-29 | `speciesService.ts:637` | Ellipsis conditionnel : `d.length > 300 ? d.substring(0,300) + '…' : d` |
| BF-31 | `ToastContainer.tsx:35` | Ajout `break-words` pour les messages longs |
| BF-32 | `ImportPreviewDialog.tsx:54-58` | `.toLocaleString('fr-FR')` pour les grands nombres |

### Batch 6 — Cache (HAUTE/MOYENNE)
| ID | Fichier | Correction |
|----|---------|------------|
| BF-13 | `storageService.ts:309-319` | Deduplication par ID apres `replaceObservationIdInCache` (Set-based filter) |
| BF-14 | `storageService.ts:739-749` | Cache rafraichi depuis le serveur meme apres sync partielle (plus seulement si 0 echecs) |

### Batch 7 — Divers (MOYENNE/FAIBLE)
| ID | Fichier | Correction |
|----|---------|------------|
| BF-12 | `storageService.ts:541-548, 576-582` | Validation `publicUrl` non-null apres `getPublicUrl()` pour photos ET sons |
| BF-17 | `App.tsx:326, 388` | Guards `isImporting` dans handleDeleteRequest (return) et handleSaveObservation (throw) |
| BF-21 | `locationService.ts:47-51` | Suppression du `removeEventListener` redondant (deja gere par `{ once: true }`) |
| BF-34 | `App.tsx:107` | `console.warn` dans le catch du JSON.parse des presets corrompus |

---

## Constats invalides (non corriges)

| ID | Raison |
|----|--------|
| BF-16 | Comportement intentionnel : les UUIDs valides mais inconnus sont regeneres pour protection cross-account (le test existant le confirme explicitement) |
| BF-10 | Le `if (error) throw` a ligne ~410 empeche `mapToObservation(null)` — non-issue |
| BF-11 | L'ordre actuel est correct : `assertMutationAffectedRows` est AVANT `upsertObservationInCache` |
| BF-15 | Le CustomEvent `storage-quota-exceeded` est dans le catch — comportement correct |
| BF-35 | React 19 auto-batch tous les setState dans les events — pas de fix necessaire |
| BF-20 | Deja fixe par theme 01 (FO-12 : `reader.abort()`) |
| BF-24 | Code actuel a deja `obs.latinName \|\| ''` |
| BF-26 | Code actuel a deja `className="truncate"` |
| BF-18 | Retry apres echec in-flight est le bon comportement |
| BF-19 | React 19 ignore setState sur composants demontes — non-issue |
| BF-22 | Le useEffect a un cleanup `removeEventListener`, deps `[]` = 1 seule execution |
| BF-28 | `roundPercentage` garde deja `if (!total) return 0` |
| BF-06 | Comportement correct : le formulaire reste ouvert pour retry apres erreur |
| BF-07 | Tous les casts `(error as Error).message` ont deja des fallbacks |
| BF-08 | Toutes les occurrences de console.error dans App.tsx ont deja un feedback utilisateur (setError/pushToast) |
| BF-30 | `toLocaleDateString('fr-FR')` et `isoToFrDisplay()` sont des choix valides dans leurs contextes respectifs |
| BF-33 | supabaseConfigError est une constante module-level — commentaire ajoute mais pas de changement fonctionnel |

---

## Points d'attention pour le prochain agent (theme 3+)

### Fichiers modifies par ce theme
- `components/ErrorBoundary.tsx` — **CREE** : composant ErrorBoundary reutilisable
- `index.tsx` — import + wrapper global ErrorBoundary
- `App.tsx` — import ErrorBoundary, wrapper section, guards isImporting, commentaire supabaseConfigError, warn presets corrompus
- `contexts/AuthContext.tsx` — try/catch sur signOut
- `components/Auth/UserProfile.tsx` — handler async signOut
- `components/ConfirmationDialog.tsx` — handler async avec try/catch
- `services/observationFormService.ts` — gardes NaN altitude/GPS
- `components/ObservationRow.tsx` — null guard municipality
- `components/ObservationMap.tsx` — fallback lieu popup
- `components/ObservationStats.tsx` — empty observations guard
- `services/speciesService.ts` — truncation conditionnelle Wikipedia
- `components/ToastContainer.tsx` — break-words
- `components/ImportPreviewDialog.tsx` — formatage nombres
- `services/storageService.ts` — UUID temp IDs, dedup cache, refresh partiel, validation publicUrl
- `services/locationService.ts` — cleanup removeEventListener redondant

### Risques de conflit inter-themes
- **Theme 05 (Sync/Integrite)** : `storageService.ts` a ete modifie (dedup cache, refresh partiel, UUID). SI-01 (collision temp ID) est DEJA CORRIGE par BF-09.
- **Theme 11 (Sauvegarde)** : BF-01 (ErrorBoundary) couvre SR-07. Le theme 11 n'a PLUS besoin de creer un ErrorBoundary.
- **Theme 10 (Qualite)** : BF-08 a ete audite mais les console.error ont tous un feedback utilisateur. QT-13 (logger service) reste a faire dans le theme 10.
- **Theme 04 (Performance)** : `ObservationStats.tsx` a un nouvel early return si observations vides — compatible avec d'eventuels changements de virtualisation.
- **Theme 08 (Accessibilite)** : `ConfirmationDialog.tsx` a ete modifie (handler async) — attention si AC-01 modifie aussi ce composant.

### Quality gate
Toujours lancer `npm run check` apres chaque batch. 98 tests doivent passer.

---

## Fichiers crees/modifies par cet agent

| Fichier | Action |
|---------|--------|
| `components/ErrorBoundary.tsx` | Cree |
| `tests/ErrorBoundary.test.tsx` | Cree |
| `docs/audits/corrections/theme02-bugs-fiabilite/RECAP.md` | Cree — ce fichier |
| `.claude/plans/vectorized-riding-pearl.md` | Cree — plan de correction |
| 13 fichiers source modifies | Voir liste ci-dessus |
