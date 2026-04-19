# Audit Sauvegarde, Recuperation et Tracabilite - Carnet Naturaliste v5.2

**Date** : 2025-03-28
**Version audit** : v1
**Statut** : Termine

## Resume executif

L'application dispose d'un **systeme d'export multi-format fonctionnel** (ZIP, JSON, Excel, PDF) mais presente des **lacunes critiques en recuperation** : (1) **pas de restauration depuis un backup ZIP** -- le backup est a sens unique, (2) **pas d'Error Boundary React** -- une erreur JS non capturee provoque un ecran blanc sans recours, (3) **erreurs Supabase non mises en queue** -- si le serveur est joignable mais echoue, l'observation est perdue, et (4) **corruption localStorage silencieuse** -- le cache et la queue sont integralement supprimes au moindre octet invalide. L'audit trail est inexistant (pas d'historique de modifications).

**Niveau de preuve dominant** : STATIQUE (analyse du code source et du schema).

## Methode et perimetre

- **Analyse statique** des services d'export/import : `backupService.ts`, `observationExportService.ts`, `excelImportService.ts`, `jsonImportValidation.ts`
- **Analyse des mecanismes de recuperation** : `storageService.ts` (cache, queue, sync), `AuthContext.tsx` (session)
- **Recherche d'Error Boundary** : grep `ErrorBoundary`, `componentDidCatch`, `getDerivedStateFromError`
- **Analyse des scenarios de perte de donnees** : crash, corruption, stockage plein, sync partielle
- **Non couvert** : tests de restauration reels, tests de crash navigateur, audit du backup Supabase cote serveur

## Constats

### Export et backup

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| SR-01 | CRITIQUE | STATIQUE | services/ (absent) | **Pas de restauration depuis backup ZIP.** Le ZIP contient `data.json`, `data.csv`, `images/`, `backup_manifest.json` mais aucune fonction `restoreBackupZip()` n'existe. L'utilisateur doit extraire le ZIP manuellement et reimporter le JSON ou Excel. Deja identifie comme L2 dans l'audit precedent. | En cas de perte de donnees, le backup ne peut pas etre utilise pour restaurer l'application. Le "backup" est en realite un simple export. | Implementer `restoreBackupZip(file)` : extraction, parsing data.json, re-upload des images, reconciliation des IDs. |
| SR-02 | HAUTE | STATIQUE | backupService.ts:126-166 | **Photos du backup dependantes du reseau.** Les images sont telechargees depuis les URLs Supabase pendant la creation du ZIP. En cas d'erreur CORS, timeout (15s), ou Supabase indisponible, les photos manquantes sont listees dans `IMAGES_MANQUANTES.txt` mais sans chemin de recuperation. | Backup incomplet si le reseau est instable. Les photos pre-upload (blob URLs locaux) ne sont jamais incluses. | Ajouter un fallback data-URI pour les photos en memoire. Documenter les limitations dans le manifest. |
| SR-03 | HAUTE | STATIQUE | backupService.ts (absent) | **Sons non inclus dans le backup.** Aucun mecanisme d'export des fichiers audio attaches aux observations. | Les enregistrements sonores sont perdus en cas de restauration depuis backup. | Ajouter l'export des sons dans le ZIP. |
| SR-04 | MOYENNE | STATIQUE | backupService.ts:191-200 | **Generation ZIP non-atomique.** Les images sont telechargees en memoire (concurrence 4) puis le ZIP est genere. Si le navigateur crashe pendant le telechargement, les images deja fetchees sont perdues. Si la generation du Blob echoue, pas de reprise possible. | Echec silencieux possible sur des backups volumineux (depassement heap). | Ajouter une verification de taille estimee avant generation. Proposer un export sans images en fallback. |
| SR-05 | MOYENNE | STATIQUE | (absent) | **Pas de backup incremental.** Chaque export est complet -- toutes les observations et toutes les photos. | Pour un utilisateur avec 1000+ observations et photos, le backup peut etre tres volumineux et long. | Optionnel : ajouter un mode "depuis la derniere sauvegarde" base sur `updated_at`. |
| SR-06 | INFO | STATIQUE | observationExportService.ts:5-105 | **4 formats d'export disponibles.** JSON (complet), Excel (25 colonnes), PDF (resume texte sans media), ZIP (JSON + CSV + images). Le PDF ne contient pas les photos. | Bonne couverture des besoins d'export. Le PDF est un resume, pas une reproduction fidele. | Documenter les differences entre formats dans l'UI. |

### Recuperation apres erreur

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| SR-07 | CRITIQUE | STATIQUE | App.tsx (absent) | **Pas d'Error Boundary React.** Aucun `ErrorBoundary`, `componentDidCatch`, ou `getDerivedStateFromError` dans le projet. Les composants lazy-loades (`ObservationForm`, `ObservationMap`, etc.) n'ont pas de fallback en cas d'erreur de rendu. Deja identifie comme C2 dans l'audit precedent. | Une erreur JavaScript non capturee (ex: donnee null inattendue) provoque un ecran blanc total sans message ni option de recuperation. L'utilisateur doit recharger manuellement. | Ajouter un `<ErrorBoundary>` global avec message d'erreur, bouton "Recharger", et persistance du contexte d'erreur. |
| SR-08 | CRITIQUE | STATIQUE | storageService.ts:366-417 | **Erreur Supabase non mise en queue offline.** Si `navigator.onLine === true` mais que Supabase echoue (timeout, 500, maintenance), l'erreur est lancee (`throw new Error(msg)`) sans fallback vers la queue offline. | L'utilisateur en ligne perd son observation si le serveur est temporairement indisponible. Contrairement au mode offline explicite, il n'y a pas de filet de securite. | Ajouter un `catch` autour de l'insert Supabase : si l'erreur est recuperable (timeout, 5xx), mettre en queue au lieu de lancer. |
| SR-09 | CRITIQUE | STATIQUE | storageService.ts:192-199, 242-246 | **Corruption localStorage = perte totale silencieuse.** `parseJson()` retourne `[]` si le JSON est invalide. La queue entiere et le cache entier sont supprimes au moindre octet corrompu, sans avertissement utilisateur. | Les actions offline en attente et le cache d'observations sont irrecuperablement perdus sans que l'utilisateur le sache. | Ajouter un avertissement toast quand le fallback `[]` est utilise. Tenter une recuperation partielle. Envisager IndexedDB comme stockage secondaire. |
| SR-10 | HAUTE | STATIQUE | storageService.ts:695-742 | **Pas de transaction atomique pendant la sync.** `processOfflineQueue` traite les items en boucle sequentielle. Si le navigateur crashe a mi-parcours, les items deja traites sont supprimes de la queue mais le cache n'est pas rafraichi. Deja identifie comme SI-05. | Etat inconsistant entre la base distante et le cache local apres un crash pendant la sync. Doublons possibles au re-traitement. | Mettre a jour la queue apres chaque operation reussie (pas seulement a la fin). |
| SR-11 | HAUTE | STATIQUE | storageService.ts:274-300 | **Stockage plein = degradation silencieuse.** Si `localStorage.setItem` echoue (quota depasse), un event `storage-quota-exceeded` est emis et un toast s'affiche, mais l'operation continue. L'observation est sauvee sur Supabase mais le cache local n'est pas mis a jour. | L'utilisateur voit des donnees obsoletes dans le cache jusqu'au prochain rafraichissement complet. Confusion entre ce qui est sauve et ce qui est affiche. | Forcer un rafraichissement du cache depuis Supabase apres un echec de cache local. |
| SR-12 | MOYENNE | STATIQUE | App.tsx:185-190 | **Erreurs auto-effacees apres 10 secondes.** `setError()` est suivi d'un `setTimeout(() => setError(null), 10000)`. Les messages d'erreur critiques (echec de save, sync echouee) disparaissent automatiquement. | L'utilisateur peut manquer un message d'erreur important s'il ne regarde pas l'ecran au bon moment. | Les erreurs critiques (perte de donnees) ne devraient pas s'auto-effacer. Ajouter un bouton "Fermer" explicite. |
| SR-13 | MOYENNE | INFERENCE | storageService.ts:75-88 | **Schema drift traite par degradation.** Les erreurs de colonnes manquantes (`42703`, `PGRST204`) declenchent un retry avec les colonnes problematiques supprimees. Ce mecanisme mask les divergences de schema. | L'app fonctionne avec un schema degrade sans que l'utilisateur ni le developpeur ne soient alertes. Les donnees des colonnes supprimees sont silencieusement perdues. | Logger un avertissement clair quand une colonne est supprimee du payload. Alerter le developpeur. |

### Tracabilite et audit

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| SR-14 | HAUTE | STATIQUE | types.ts, storageService.ts:121-150 | **Pas de timestamps serveur exploites.** Le schema SQL a `created_at` et `updated_at` (avec trigger) mais `mapToObservation()` ne les mappe pas dans l'objet TypeScript. L'interface `Observation` dans `types.ts` n'inclut pas ces champs. | Impossible de savoir quand une observation a ete creee ou modifiee. Pas de tri par date de modification. Pas de "derniere sync". | Ajouter `created_at` et `updated_at` dans l'interface `Observation` et les mapper depuis Supabase. |
| SR-15 | HAUTE | STATIQUE | (absent) | **Pas d'historique de modifications.** Aucun mecanisme de versioning, de changelog, ni de "undo". Une modification ecrase la version precedente. | Si l'utilisateur modifie une observation par erreur (coordonnees, espece), la version originale est perdue a jamais. | A minima : garder le `updated_at` visible. Idealement : table d'historique (`observation_history`) ou soft-updates. |
| SR-16 | MOYENNE | STATIQUE | 13 fichiers, 49 instances | **Logs non structures et non persistes.** `console.error`/`console.warn` avec prefixes manuels (`[security]`, `[startup-enrichment]`). Les logs sont perdus a la fermeture du navigateur. Deja identifie comme QT-13. | Impossible de diagnostiquer un probleme signale par un utilisateur apres coup. Pas de log exportable. | Implementer un buffer de logs rotatif en localStorage (derniers 100 messages) avec export dans le backup ZIP. |
| SR-17 | FAIBLE | STATIQUE | App.tsx:185-190 | **Erreurs affichees en toast puis perdues.** Les erreurs passent par `setError()` (auto-clear 10s) ou `pushToast()` (auto-dismiss). Aucune persistence des erreurs passees. | En cas de probleme intermittent, l'historique des erreurs est invisible. | Ajouter un mini-log d'erreurs dans le Sync Center ("Derniers evenements"). |

### Scenarios de perte de donnees

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| SR-18 | HAUTE | INFERENCE | storageService.ts | **Cache navigateur efface = queue offline perdue.** Si l'utilisateur vide le cache navigateur (ou si une extension le fait), toutes les actions offline en attente sont irrecuperablement perdues. Les observations deja syncees sur Supabase sont preservees. | Perte de toutes les modifications offline non syncees. Egalement perte des filtres, presets, session. | Avertir dans la doc utilisateur. Envisager IndexedDB comme stockage secondaire pour la queue. |
| SR-19 | MOYENNE | INFERENCE | excelImportService.ts, importPolicy.ts | **Double import = doublons en mode no-overwrite.** Si le meme fichier Excel est importe deux fois avec `conflictMode='no-overwrite'`, chaque observation recoit un nouveau UUID et est inseree comme doublon. Le mode `merge` evite les doublons mais necessite des IDs identiques. | Doublons silencieux si l'utilisateur reimporte le meme fichier. Pas de detection de doublons par contenu (espece + date + lieu). | Ajouter une detection de doublons probable basee sur (espece, date, coordonnees) avec avertissement. |
| SR-20 | FAIBLE | STATIQUE | importPolicy.ts:29-30 | **IDs valides non-existants regeneres.** Un import de backup avec des UUIDs valides mais inconnus de la base genere de nouveaux IDs, cassant les liens vers les photos dans le storage Supabase. Deja identifie comme SI-28. | Restauration de backup incomplete : les photos ne sont plus liees aux observations. | Conserver l'ID original quand il n'entre pas en conflit. |

## Statistiques

- **Total constats** : 20
- **Critiques** : 4 | **Hautes** : 6 | **Moyennes** : 6 | **Faibles** : 2 | **Info** : 2
- Par niveau de preuve : STATIQUE 17 | INFERENCE 3

## Points positifs

1. **4 formats d'export** : JSON, Excel (25 colonnes), PDF, ZIP avec images -- couverture large des besoins
2. **Manifest de backup** : `backup_manifest.json` inclut la date, le nombre d'observations, la version de l'app, et la liste des images manquantes
3. **Deduplication des images** dans le ZIP : `uniqueImages = new Set()` evite les doublons d'URLs
4. **Limitation de concurrence** : telechargement d'images avec concurrence max 4 (`BACKUP_IMAGE_CONCURRENCY = 4`)
5. **Gestion du quota localStorage** : event `storage-quota-exceeded` emis + toast d'avertissement
6. **Cache scope par utilisateur** : le cache et la queue sont isoles par `userId`, evitant les melanges
7. **parseJson avec fallback** : les erreurs de parsing ne crashent pas l'app (meme si le fallback silencieux est un probleme)
8. **Validation d'import robuste** : taille max, timeout, colonnes requises, validation de types, validation de bornes GPS, detection de Prototype Pollution
9. **Trigger `updated_at`** cote base : le champ existe mais n'est pas encore exploite cote client
10. **Offline queue avec retry et backoff** : 3 tentatives avec delais croissants (1s, 3s, 9s)

## Conclusion

L'application a un **systeme d'export fonctionnel et bien pense** (4 formats, manifest, deduplication, validation d'import). Les lacunes critiques sont concentrees sur la **recuperation** : pas de restauration depuis ZIP (SR-01), pas d'Error Boundary (SR-07), pas de fallback offline quand Supabase echoue en ligne (SR-08), et corruption silencieuse du cache (SR-09). La tracabilite est le point le plus faible : aucun historique de modifications, logs non persistes, timestamps serveur non exploites cote client.

**Top 3 des actions prioritaires :**
1. **SR-07** : Ajouter un Error Boundary React global -- empeche les ecrans blancs et offre une option de recuperation
2. **SR-08** : Mettre en queue les erreurs Supabase recuperables -- filet de securite pour les coupures reseau transitoires
3. **SR-01** : Implementer la restauration depuis backup ZIP -- transformer l'export en vrai backup fonctionnel
