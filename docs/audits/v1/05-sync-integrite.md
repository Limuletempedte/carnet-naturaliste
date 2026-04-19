# Audit Synchronisation et Integrite des Donnees - Carnet Naturaliste v5.2

**Date** : 2025-03-28
**Version audit** : v1
**Statut** : Termine

## Resume executif

Le systeme de synchronisation offline-first presente des **faiblesses structurelles graves** dans trois domaines : (1) **perte systematique des photos en mode offline** (aucun mecanisme de persistance des blobs), (2) **absence totale de detection de conflits multi-appareils** (last-write-wins silencieux), et (3) **failles d'integrite du schema SQL** (FK sans cascade, RLS UPDATE sans `WITH CHECK`, pas de contraintes d'unicite metier). La file d'attente offline fonctionne correctement dans les cas simples mais est vulnerable aux collisions d'IDs temporaires, a l'execution concurrente, et a la corruption de localStorage.

**Niveau de preuve dominant** : STATIQUE (lecture du code et du schema SQL).

## Methode et perimetre

- **Analyse statique** du moteur de sync (`storageService.ts`, `storageQueueUtils.ts`, `storageCacheUtils.ts`, `importPolicy.ts`)
- **Analyse statique** du schema SQL (`supabase_schema.sql`, toutes les migrations)
- **Analyse des scenarios** multi-appareils, erreur reseau, sync partielle, corruption de queue
- **Non couvert** : tests reels multi-appareils, tests de charge, verification dynamique des RLS policies

## Constats

### File d'attente offline

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| SI-01 | CRITIQUE | STATIQUE | storageService.ts:376 | ID temporaire base sur `Date.now()` (resolution 1ms). Double-clic rapide ou import batch = meme `temp-XXXXX`. `reduceQueue` fusionne les items par ID, donc un INSERT ecrase l'autre. | Perte silencieuse d'observations en mode offline. | Utiliser `crypto.randomUUID()` comme c'est deja fait ligne 261 pour les IDs de queue items. |
| SI-02 | CRITIQUE | INFERENCE | storageService.ts:559 | Pas de mutex sur `processOfflineQueue`. Appele au chargement (App.tsx:204) ET par le bouton "Resynchroniser" (App.tsx:562). Deux executions paralleles lisent/traitent/ecrivent la meme queue. | Duplication d'observations sur Supabase, corruption de la queue locale. | Ajouter un flag mutex (Promise) dans `processOfflineQueue` pour serialiser les executions. |
| SI-03 | HAUTE | STATIQUE | storageService.ts:258-267 | `addToQueue` fait `localStorage.setItem` sans protection quota. Si le quota est depasse, l'action offline est silencieusement perdue (le catch dans `setLocalCache` L:296 n'est pas dans `addToQueue`). | Actions offline perdues sans avertissement si localStorage est plein. | Wrapper `addToQueue` dans try/catch et signaler l'echec a l'appelant. |
| SI-04 | MOYENNE | STATIQUE | storageService.ts:648-649 | `SKIP_TEMP_ID` pour les UPDATE dont l'INSERT parent a echoue : l'item reste dans `failedItems` indefiniment sans diagnostic clair pour l'utilisateur. | Items bloques dans la queue sans moyen de resolution. | Ne pas ajouter les SKIP_TEMP_ID a failedItems (ils seront rejoues via leur INSERT parent). |
| SI-05 | MOYENNE | STATIQUE | storageService.ts:689-717 | La queue est mise a jour en un seul write atomique a la fin du traitement, pas apres chaque operation reussie. Si le navigateur crashe pendant la boucle, les operations reussies seront re-executees -- les INSERT avec temp-ID creeront des doublons. | Doublons potentiels apres crash pendant la sync. | Mettre a jour la queue apres chaque operation reussie. |
| SI-06 | MOYENNE | STATIQUE | storageService.ts:192-199 | `parseJson` n'effectue aucune validation de structure. Un item de queue sans `action` ou `payload` provoquera un crash dans `processOneItem`. Pas de TTL ni de purge des items anciens. | Crash ou items zombies dans la queue apres corruption localStorage. | Valider le schema au chargement. Ajouter un TTL (30 jours). Permettre la suppression individuelle depuis le Sync Center. |
| SI-07 | MOYENNE | STATIQUE | storageService.ts:652-658 | UPDATE dans `processOneItem` ne verifie pas le nombre de lignes affectees (contrairement a `updateObservation` direct L:458). Un UPDATE sur un ID inexistant passe silencieusement. | Modifications perdues sans erreur lors du replay de la queue. | Ajouter `assertMutationAffectedRows` dans processOneItem pour les UPDATE. |

### Synchronisation et conflits

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| SI-08 | HAUTE | STATIQUE | storageService.ts:435-463 | Strategie "last-write-wins" sans detection de conflit. `updateObservation` envoie un UPDATE sans verifier `updated_at`, sans ETag, sans version counter. En multi-appareils, le dernier UPDATE ecrase silencieusement le precedent. | Perte silencieuse de modifications en usage multi-appareils ou multi-onglets. | Ajouter une verification `updated_at` dans la clause WHERE de l'UPDATE. Retourner une erreur de conflit si la ligne a ete modifiee entre-temps. |
| SI-09 | HAUTE | INFERENCE | storageService.ts:671-686 | Conflit delete/update non detecte en multi-appareils. Si un appareil supprime et l'autre modifie la meme observation, l'ordre de sync determine le resultat sans avertissement. Pas de "tombstone" pour empecher la resurrection. | Comportement imprevisible et perte de donnees selon l'ordre de sync. | Implementer un soft-delete (`deleted_at`) pour detecter les conflits delete-vs-update. |
| SI-10 | HAUTE | STATIQUE | storageService.ts:719-729 | Le cache n'est rafraichi depuis le serveur que si **tous** les items ont reussi (`failedItems.length === 0`). Apres sync partielle, les items reussis ont modifie la base distante mais le cache local garde les anciennes versions. | Cache local et base distante divergent silencieusement apres sync partielle. | Toujours rafraichir le cache apres sync, meme partielle. |
| SI-11 | MOYENNE | STATIQUE | storageService.ts:330-364 | Pas de polling periodique ni de subscription Supabase Realtime. Le cache n'est mis a jour qu'au chargement, au refresh manuel, et apres sync. | Cache desynchronise indefiniment entre deux rechargements si modifications depuis un autre appareil. | Polling leger periodique (5 min) ou Supabase Realtime subscriptions. |
| SI-12 | MOYENNE | STATIQUE | storageService.ts:727 | Apres full sync, `setLocalCache(data)` ecrase completement le cache. Les observations en queue d'INSERT (pas encore syncees) disparaissent de l'affichage mais restent dans la queue. | Observations en attente invisibles pour l'utilisateur jusqu'au prochain sync. | Re-injecter les observations en queue dans le cache apres le full sync. |
| SI-13 | MOYENNE | STATIQUE | storageService.ts:586-593 | Token d'auth verifie une seule fois au debut de `processOfflineQueue`. Sur une longue queue avec retries, le token peut expirer pendant le traitement. | Sync partielle avec erreur "JWT expired" peu claire. | Re-verifier l'auth periodiquement ou detecter les erreurs auth pour interrompre la boucle. |
| SI-14 | MOYENNE | STATIQUE | storageService.ts:34 | `storageNamespace` est un singleton mutable global. Si l'utilisateur change de compte pendant un `processOfflineQueue` en cours, les operations ecriront dans le mauvais namespace. | Observations ecrites dans le cache d'un autre utilisateur. | Capturer le namespace au debut de processOfflineQueue et l'utiliser tout au long. |
| SI-15 | MOYENNE | STATIQUE | storageService.ts:242-246 | Si localStorage est efface manuellement (outils dev, extension, etc.), la queue retourne `[]` via le fallback de `parseJson`. Aucune sauvegarde secondaire ni detection. | Perte irrecuperable de toutes les modifications offline en attente. | IndexedDB comme stockage secondaire, ou detection de disparition inattendue de la queue. |

### Medias et photos offline

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| SI-16 | CRITIQUE | STATIQUE | ObservationForm.tsx:492-496, storageCacheUtils.ts:23 | Perte **systematique** des photos en mode offline. Au submit offline, `photoUrl` est remis a `initialData?.photo || undefined` -- la nouvelle photo est explicitement abandonnee. Le Blob compresse n'est jamais persiste. `sanitizeCachedMediaValueWithTracking` strip les blob URLs du cache. | Toute photo prise offline est definitivement perdue. Limitation majeure pour une app de terrain naturaliste. | Convertir le Blob en data URL et le stocker dans le payload de la queue (ou IndexedDB) pour upload au prochain sync. |
| SI-17 | HAUTE | STATIQUE | storageService.ts:500-526 | `uploadPhoto` n'a pas de timeout sur `supabase.storage.upload`. Si la connexion tombe pendant l'upload, le fetch peut bloquer indefiniment. Le Blob n'est stocke qu'en memoire React -- si l'utilisateur quitte la page, la photo est perdue. | Photo perdue si connexion instable pendant l'upload. Aucun mecanisme de reprise. | Ajouter un `AbortController` avec timeout. Si l'upload echoue, persister le blob pour retry. |

### Schema SQL et contraintes

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| SI-18 | CRITIQUE | STATIQUE | supabase_schema.sql:7 | FK `user_id references auth.users` sans clause `ON DELETE`. PostgreSQL applique `RESTRICT` par defaut : la suppression d'un utilisateur sera **bloquee** tant que ses observations existent. | Impossibilite de supprimer un compte (RGPD article 17). Orphelins si contourne. | Ajouter `ON DELETE CASCADE` ou trigger de nettoyage prealable. |
| SI-19 | HAUTE | STATIQUE | supabase_schema.sql:127-128 | RLS UPDATE policy sans `WITH CHECK` : un utilisateur pourrait modifier le `user_id` d'une observation pour la transferer a un autre utilisateur. La clause `USING` verifie la selection mais pas la nouvelle valeur. | Violation de l'isolation des donnees utilisateur. | Ajouter `WITH CHECK (auth.uid() = user_id)` a la policy UPDATE. |
| SI-20 | HAUTE | STATIQUE | storageService.ts:465-496 | `deleteObservation` supprime la ligne mais ne supprime **jamais** le fichier dans le bucket `photos`. Aucun appel a `storage.from('photos').remove(...)`. | Accumulation de fichiers orphelins dans le storage. Cout croissant. | Supprimer le fichier storage avant de supprimer la ligne, ou trigger/Edge Function de nettoyage. |
| SI-21 | MOYENNE | STATIQUE | supabase_schema.sql:5-37 | Aucune contrainte d'unicite metier. Un meme utilisateur peut inserer la meme observation (espece, date, lieu, heure) plusieurs fois. L'import Excel peut creer des doublons si relance. | Doublons silencieux dans la base. | Index unique partiel sur `(user_id, species_name, date, gps_lat, gps_lon, time)` ou deduplication applicative. |
| SI-22 | MOYENNE | STATIQUE | supabase_schema.sql:25-29 | Colonnes `status`, `protocol`, `sexe`, `age` de type `text` sans CHECK constraint. L'app definit des enums TypeScript mais la base accepte n'importe quelle valeur. | Valeurs invalides possibles via import, API directe ou bug client. | Ajouter CHECK constraints : `CHECK (status IS NULL OR status IN ('NE','DD','LC',...))`. |
| SI-23 | MOYENNE | STATIQUE | supabase_schema.sql:10 | `taxonomic_group` nullable sans valeur par defaut. Utilise comme filtre principal et dans les stats. L'index ne couvre pas les NULL. | Observations sans groupe echappent aux filtres et faussent les stats. | `NOT NULL DEFAULT 'Autre'` + migration des existants. |
| SI-24 | MOYENNE | STATIQUE | supabase_schema.sql:35 | `created_at` modifiable par le client. Le trigger protege `updated_at` mais pas `created_at`. | Import ou client malveillant peut fausser les audits chronologiques. | Proteger `created_at` dans le trigger : `new.created_at = old.created_at` sur UPDATE. |
| SI-25 | FAIBLE | STATIQUE | supabase_schema.sql:140-142 | Bucket photos en lecture publique (`SELECT` sans restriction d'auth). N'importe qui avec l'URL peut acceder aux photos de tous les utilisateurs. | Photos potentiellement sensibles (localisation nids d'especes protegees) accessibles publiquement. | Restreindre a `auth.uid()::text = foldername[1]` si la confidentialite est un enjeu, ou documenter comme choix intentionnel. |

### Migrations

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| SI-26 | MOYENNE | STATIQUE | supabase_schema.sql (global) | Schema de reference desynchronise avec les migrations. `weather_condition` (ajoutee par migration) absente du schema de reference. `idx_observations_user_species_name` present dans phase2 mais absent du schema racine. | Developpeur recreant la base depuis le schema obtient un schema incomplet. | Mettre a jour `supabase_schema.sql` pour refleter l'etat reel. |
| SI-27 | MOYENNE | STATIQUE | racine du projet | 3 fichiers de migration (`phase2`, `phase5`, `phase6`) sont a la racine au lieu de `supabase/migrations/`. Pas de timestamp de versionnement. Le Supabase CLI ne les verra pas. | `supabase db push` et `supabase db reset` ne les appliqueront pas. Ordre d'application ambigu. | Deplacer dans `supabase/migrations/` avec timestamps corrects. |
| SI-28 | FAIBLE | STATIQUE | importPolicy.ts:29-30 | IDs UUID valides non-existants regeneres au lieu d'etre conserves. Un import de backup ne preservera pas les IDs originaux, cassant les liens photos/storage. | Restauration de backup incomplete. | Conserver l'ID original quand il est valide et n'entre pas en conflit. |
| SI-29 | FAIBLE | STATIQUE | tous les fichiers *.sql | Aucune migration ne contient de DOWN statement. Aucun mecanisme de rollback. | Rollback manuel sous pression en cas de migration defectueuse. | Ajouter des sections DOWN ou adopter un framework de migration. |

## Statistiques

- **Total constats** : 29
- **Critiques** : 4 | **Hautes** : 5 | **Moyennes** : 15 | **Faibles** : 5
- Par niveau de preuve : STATIQUE 27 | INFERENCE 2

## Points positifs

1. **`reduceQueue` bien concu** : la fusion INSERT+UPDATE, INSERT+DELETE, UPDATE+DELETE est correctement implementee (storageQueueUtils.ts:30-72)
2. **Retry avec backoff** : 3 tentatives avec delais croissants (1s, 3s, 9s) pour les operations en queue
3. **Namespace scope** : la queue et le cache sont scopes par userId, evitant les melanges inter-utilisateurs dans le cas normal
4. **Migration legacy** : transition propre des anciennes cles localStorage vers les cles scopees
5. **CHECK constraints numeriques** : `count >= 1`, `male_count >= 0`, lat/lon ranges, coherence somme des sexes -- bien faites
6. **RLS active** : SELECT/INSERT/UPDATE/DELETE policies presentes sur la table observations
7. **Trigger `updated_at`** : mis a jour automatiquement avant chaque UPDATE
8. **Index performants** : index composite `(user_id, date DESC, created_at DESC)` couvre le tri principal
9. **Durcissement storage** : migration recente (phase 2026) renforce la policy INSERT sur le bucket photos
10. **Concurrence limitee** : import (5 workers) et enrichissement (3 workers) ont des limites de concurrence

## Conclusion

Le moteur de synchronisation fonctionne dans les cas simples mais presente des **failles structurelles** pour un usage terrain reel : perte de photos offline (SI-16), collisions d'IDs temporaires (SI-01), absence de detection de conflits multi-appareils (SI-08/SI-09). Le schema SQL a une base solide (RLS, CHECK numeriques, index) mais manque de contraintes d'integrite essentielles pour la commercialisation : FK sans cascade (SI-18), RLS UPDATE sans WITH CHECK (SI-19), pas de contraintes d'unicite metier (SI-21).

**Top 3 des actions prioritaires :**
1. **SI-16** : Persister les photos offline (data URL ou IndexedDB) -- bloquant pour l'usage terrain
2. **SI-01** : `crypto.randomUUID()` pour les IDs temporaires -- fix trivial, impact critique
3. **SI-19** : Ajouter `WITH CHECK` a la policy RLS UPDATE -- fix 1 ligne, faille de securite
