# Audit Bugs et Fiabilite - Carnet Naturaliste v5.2

**Date** : 2026-03-28
**Version audit** : v1
**Statut** : Termine

## Resume executif

L'application presente un **probleme structurel majeur** : l'absence totale d'Error Boundary React (deja identifie dans l'audit precedent comme C2). Toute exception non capturee dans un composant provoque un ecran blanc. Au-dela de ce point critique, l'audit revele **23 console.error/log inappropries** en production (erreurs avalees sans feedback utilisateur), plusieurs **risques de corruption de cache** dans le service de stockage, et des **affichages de "undefined"** pour des champs optionnels non gardes. La fiabilite des services externes (iNaturalist, Nominatim) est correctement geree avec des timeouts, mais le feedback utilisateur en cas de panne est quasi inexistant.

## Methode et perimetre

- **Type** : Audit statique (lecture exhaustive du code) + inferences
- **Fichiers analyses** : Tous les fichiers src/ (composants, services, utils, contexts, hooks)
- **Focus** : Plantages, erreurs silencieuses, etats incoherents, fuites memoire, affichage incorrect
- **Non couvert** : Tests dynamiques en navigateur, reproduction de bugs reels
- **Note** : Les constats purement fonctionnels (logique metier) sont dans le Theme 1. Ici on se concentre sur la fiabilite technique.

---

## Constats

### Plantages et exceptions non gerees

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| BF-01 | CRITIQUE | STATIQUE | index.tsx:20 + App.tsx | **Aucun Error Boundary React** dans toute l'application. Une exception dans n'importe quel composant = ecran blanc | L'application entiere plante sans message ni recovery | Ajouter un ErrorBoundary global + par section |
| BF-02 | HAUTE | STATIQUE | AuthContext.tsx:173 | `supabase.auth.signOut()` peut rejeter (reseau, session invalide) ; aucun catch au site d'appel | Crash du composant au logout si Supabase est injoignable | Wrapper dans try/catch avec toast d'erreur |
| BF-03 | HAUTE | STATIQUE | UserProfile.tsx:60 | `signOut()` appele sans await ni catch dans le handler onClick | Promise rejetee non geree ; composant en etat incoherent | Ajouter await + try/catch |
| BF-04 | HAUTE | STATIQUE | ConfirmationDialog.tsx:33-35 | `onConfirm()` peut throw ; l'erreur n'est pas capturee, le dialog se ferme quand meme | Utilisateur voit le dialog disparaitre sans feedback d'erreur | Wrapper onConfirm dans try/catch |
| BF-05 | HAUTE | STATIQUE | observationFormService.ts:47-70 | Coercion `Number()` sans validation : `Number('')` = NaN, `Number(undefined)` = NaN. GPS et count peuvent etre NaN | Observation avec coordonnees NaN sauvegardee en base | Valider avec `Number.isFinite()` apres coercion |
| BF-06 | MOYENNE | STATIQUE | App.tsx:375-396 | Si `saveObservation()` ou `updateObservation()` throw, l'erreur est loggee mais la vue reste sur le formulaire avec des donnees potentiellement corrompues | Utilisateur peut re-soumettre un formulaire dans un etat invalide | Reset du formulaire ou retour a la liste en cas d'erreur |
| BF-07 | MOYENNE | STATIQUE | MapInput.tsx:315-324 | Cast `(error as Error).message` dans le catch : si l'erreur n'est pas une instance d'Error, `.message` est undefined | Toast affiche "undefined" comme message d'erreur | Utiliser `String(error)` ou verifier le type |

### Erreurs silencieuses (catch qui avalent les erreurs)

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| BF-08 | HAUTE | STATIQUE | *23 occurrences* (voir detail) | **23 `console.error()` sans feedback utilisateur** dans le code de production. Les erreurs sont loggees dans la console (invisible pour l'utilisateur) sans toast ni message visuel | L'utilisateur ne sait pas que quelque chose a echoue ; il croit que l'operation a reussi | Remplacer par des toasts d'erreur via `onToast()` |

**Detail des 23 occurrences inappropriees :**

| Fichier | Ligne | Contexte |
|---------|-------|----------|
| App.tsx | 297 | Erreur chargement observations |
| App.tsx | 333 | Erreur suppression |
| App.tsx | 367 | Erreur suppression en masse |
| App.tsx | 393 | Erreur sauvegarde |
| App.tsx | 520 | Erreur import |
| App.tsx | 551 | Erreur backup |
| MapInput.tsx | 97 | Erreur reverse geocode |
| MapInput.tsx | 187 | Erreur recherche carte |
| MapInput.tsx | 322 | Erreur geolocalisation |
| ObservationForm.tsx | 511 | Erreur envoi formulaire |
| ObservationList.tsx | 104 | Erreur export |
| ObservationList.tsx | 140 | Warning import (console.warn) |
| ObservationList.tsx | 152 | Erreur import |
| ObservationList.tsx | 204 | Erreur generique |
| ObservationMap.tsx | 313 | Erreur carte |
| storageService.ts | 354 | Erreur fetch observations |
| storageService.ts | 404 | Erreur save observation |
| storageService.ts | 455 | Erreur update observation |
| storageService.ts | 488 | Erreur delete observation |
| storageService.ts | 517 | Erreur upload photo |
| storageService.ts | 548 | Erreur upload son |
| storageService.ts | 708 | Erreur processing queue |
| speciesService.ts | (divers) | Erreurs API (appropriees pour certaines, mais aucune remontee utilisateur) |

> **18 console.log/warn/error sont pertinents** et peuvent etre conserves (diagnostics securite, fallback offline, erreurs non-bloquantes dans speciesService).

### Corruption de donnees et etats incoherents

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| BF-09 | CRITIQUE | STATIQUE | storageService.ts:595-630 | Collision temp ID dans `idMap` : si le meme temp-id apparait 2 fois dans la file, le 2e ecrase le 1er mapping. `replaceObservationIdInCache` est appele 2 fois avec des IDs differents | Observations perdues en sync offline | Verifier l'unicite avant insertion dans idMap |
| BF-10 | HAUTE | STATIQUE | storageService.ts:386-413 | Insert avec fallback (colonnes manquantes) : si le fallback echoue, `data` est null mais `mapToObservation(null)` est appele | Crash : TypeError sur null | Verifier data !== null avant mapToObservation |
| BF-11 | HAUTE | STATIQUE | storageService.ts:458-462 | Cache mis a jour AVANT `assertMutationAffectedRows()`. Si l'assertion throw, le cache contient une observation que la BDD n'a pas | Divergence cache/BDD permanente | Deplacer le cache update APRES l'assertion |
| BF-12 | HAUTE | STATIQUE | storageService.ts:521 | `getPublicUrl()` retourne un objet sans verifier si `publicUrl` est valide/null | URL invalide stockee dans l'observation | Valider publicUrl avant utilisation |
| BF-13 | HAUTE | INFERENCE | storageService.ts:302-305 | `replaceObservationIdInCache()` ne verifie pas si `newId` existe deja dans le cache | Doublons d'ID dans le cache local | Verifier l'unicite de newId |
| BF-14 | MOYENNE | INFERENCE | storageService.ts:720-729 | Cache non rafraichi en cas de sync partielle (seulement si 0 echecs). Le cache reste avec les anciennes donnees | Donnees obsoletes affichees apres sync partielle | Rafraichir le cache meme en cas d'echecs partiels |
| BF-15 | MOYENNE | STATIQUE | storageService.ts:274-299 | Quota localStorage depasse : `CustomEvent('storage-quota-exceeded')` dispatche meme si `JSON.stringify` a echoue avant | Event dispatche dans un etat incorrect | Separer les cas d'erreur |
| BF-16 | FAIBLE | INFERENCE | importPolicy.ts:28-33 | Bug logique : `if (!idAlreadyExists) return crypto.randomUUID()` devrait retourner `originalId` (l'ID est valide et n'existe pas = on le garde) | Tous les IDs sont regeneres meme quand l'original est valide | Retourner originalId si !idAlreadyExists |

### Race conditions et concurrence

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| BF-17 | HAUTE | INFERENCE | App.tsx:411-488 | Import concurrent : `observations` lu au debut mais modifiable par d'autres operations pendant le traitement des 5 workers | Etat React diverge de la BDD si save/delete pendant l'import | Verrouiller les mutations pendant l'import |
| BF-18 | MOYENNE | STATIQUE | speciesService.ts:689-702 | In-flight requests : si 2 requetes pour la meme espece partent simultanement, la 2e attend la 1ere. Mais si la 1ere echoue, le `finally` supprime la cle et la 2e relance un appel | Appels API dupliques apres echec | Cacher aussi les echecs temporairement |
| BF-19 | MOYENNE | STATIQUE | App.tsx:257-279 | Enrichissement startup : `fetchSpeciesInfo()` en cours quand le composant se demonte. Le flag `mounted` est verifie apres `await` mais les setter React sont quand meme appeles | Warning React "setState on unmounted" | Utiliser AbortController + check mounted |
| BF-20 | MOYENNE | STATIQUE | excelImportService.ts:189 | FileReader `onload` peut s'executer APRES le timeout. Flag `settled` empeche la double resolution mais le reader continue de parser en arriere-plan | CPU gaspille ; memoire consommee inutilement | Appeler `reader.abort()` dans le handler timeout |

### Fuites memoire

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| BF-21 | MOYENNE | STATIQUE | locationService.ts:40-51 | `addEventListener('abort', ...)` avec `once: true` + `removeEventListener` en finally. Le `once:true` rend le remove redondant mais le pattern est fragile | Si `once:true` est retire lors d'un refactoring, fuite de listeners | Documenter ou simplifier le pattern |
| BF-22 | MOYENNE | STATIQUE | storageService.ts:274-299 | Si quota depasse de maniere repetee, les `CustomEvent` listeners s'accumulent sans nettoyage | Fuite memoire lente avec usage intensif offline | Ajouter un compteur ou limiter les events |

### Affichage incorrect et donnees mal rendues

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| BF-23 | HAUTE | STATIQUE | ObservationRow.tsx:67 | `observation.municipality` affiche sans guard null → affiche "undefined" si le champ est absent | Texte "undefined" visible par l'utilisateur | `{observation.municipality ?? ''}` |
| BF-24 | MOYENNE | STATIQUE | ObservationMap.tsx:68 | Popup carte : `obs.latinName` insere dans le DOM sans verification null | Popup affiche vide ou "undefined" | Fallback `obs.latinName || '(non renseigné)'` |
| BF-25 | MOYENNE | STATIQUE | ObservationMap.tsx:83 | Popup carte : `obs.location || obs.municipality` sans fallback si les deux sont null | Lieu affiche comme vide dans le popup | Ajouter fallback 'Lieu non renseigné' |
| BF-26 | MOYENNE | STATIQUE | ObservationGallery.tsx:62 | Noms de lieux longs debordent des cartes galerie sur mobile | Texte qui depasse le conteneur | Ajouter `truncate` + `title` |
| BF-27 | MOYENNE | STATIQUE | ObservationStats.tsx:94-100 | Pas de skeleton/loading pendant le calcul des stats | Contenu qui "saute" au rendu | Ajouter un etat de chargement |
| BF-28 | MOYENNE | STATIQUE | ObservationStats.tsx (vide) | Si observations.length === 0, les stats calculent quand meme (diviseurs potentiellement a 0) | Stats incorrectes ou NaN affiches | Ajouter early return avec message "Aucune observation" |
| BF-29 | FAIBLE | STATIQUE | speciesService.ts:632 | Description Wikipedia tronquee a 300 chars + "..." ajouté meme si la description fait < 300 chars | Points de suspension trompeurs | Conditionner l'ajout de "..." |
| BF-30 | FAIBLE | STATIQUE | ObservationCalendar.tsx | Format de date inconsistant : `toLocaleDateString('fr-FR')` a certains endroits, `isoToFrDisplay()` a d'autres | Dates affichees differemment selon le contexte | Standardiser avec une seule fonction |
| BF-31 | FAIBLE | STATIQUE | ToastContainer.tsx:35 | Messages toast longs : pas de `word-break` ou `overflow-wrap` | Texte qui depasse le toast sur petit ecran | Ajouter `break-words` |
| BF-32 | FAIBLE | STATIQUE | ImportPreviewDialog.tsx:54 | Grands nombres dans le preview d'import non formates (ex: 10000 au lieu de 10 000) | Lisibilite reduite pour les gros imports | Utiliser `.toLocaleString('fr-FR')` |

### Dependance useEffect et hooks

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| BF-33 | HAUTE | INFERENCE | App.tsx:192-195 | `supabaseConfigError` verifie dans le useEffect mais absent du tableau de dependances | Si l'erreur de config change, l'effet ne se re-execute pas ; ecran d'erreur potentiellement persistant | Ajouter supabaseConfigError aux deps |
| BF-34 | FAIBLE | STATIQUE | App.tsx:102-108 | `JSON.parse()` dans l'initialiseur useState : si localStorage corrompu, catch retourne `[]` silencieusement | Presets de filtres perdus sans indication | Optionnellement informer l'utilisateur |
| BF-35 | FAIBLE | STATIQUE | App.tsx:703-715 | `handleApplyFilterPreset()` appelle 7 setters en sequence sans batching React 19 | Possible flicker entre les mises a jour (React 19 batch auto dans les events, mais incertain dans les callbacks async) | Regrouper dans un seul setter ou useReducer |

---

## Statistiques

- **Total constats** : 35
- **Critiques** : 2 (BF-01, BF-09)
- **Hautes** : 13 (BF-02 a BF-05, BF-08, BF-10 a BF-13, BF-17, BF-23, BF-33)
- **Moyennes** : 13 (BF-06, BF-07, BF-14, BF-15, BF-18 a BF-22, BF-24 a BF-28)
- **Faibles** : 7 (BF-16, BF-29 a BF-35)
- Par niveau de preuve : STATIQUE 28 | INFERENCE 7

## Points positifs

- **Timeouts systematiques** sur les appels API externes (5-15s selon le service)
- **AbortController** bien utilise dans speciesService et locationService
- **Flag `settled`** dans l'import Excel pour eviter les doubles resolutions de promise
- **Retry avec backoff** sur Nominatim (meme si imparfait, le pattern existe)
- **Cache scoped par userId** : pas de melange de donnees entre utilisateurs
- **Logging securite** bien fait dans excelImportService (prefixe `[security]`, messages detailles)
- **try/catch** present autour de la plupart des operations critiques (meme si le catch est souvent trop generique)
- **Gestion du mode offline** globalement robuste avec fallback sur cache local

## Conclusion

La fiabilite de l'application souffre de deux problemes systemiques :

1. **Absence d'Error Boundary** (BF-01) : n'importe quelle exception non geree dans un composant provoque un ecran blanc complet. C'est le probleme le plus urgent a resoudre avant mise sur le marche.

2. **Erreurs silencieuses** (BF-08) : 23 operations critiques (sauvegarde, suppression, import, export, upload, sync) se contentent d'un `console.error()` sans aucun feedback visuel. L'utilisateur croit que l'operation a reussi alors qu'elle a echoue. Ce pattern est systematique et doit etre corrige de maniere transversale.

Les bugs de corruption de cache (BF-09 a BF-13) sont preoccupants pour le mode offline, mais ils ne se manifestent que dans des scenarios de concurrence specifiques. Le risque est reel en usage terrain (connexion intermittente), mais moins frequent qu'en laboratoire.

Les bugs d'affichage (BF-23 a BF-32) sont cosmetiques mais donnent une impression d'inacheve qui peut nuire a la confiance utilisateur.

*Niveau de confiance global : STATIQUE — les bugs identifies sont bases sur la lecture du code. Certains (race conditions, fuites memoire) necesitent des tests dynamiques pour confirmer leur frequence reelle.*
