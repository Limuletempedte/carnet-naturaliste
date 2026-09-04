# Audit v4 — Robustesse et fiabilité

- **Date** : 2026-09-04
- **Périmètre** : dépôt `main` au commit `fa9fb07`, lecture seule
- **11 constats** : `ROB-01` à `ROB-11`

Les six premiers touchent tous `services/storageService.ts` et concernent la
perte de données. Ils forment le lot A du rapport de synthèse.

---

## ROB-01 — Le cache local est tronqué à 1000 observations après chaque synchronisation 🟠

**Preuve.** Deux requêtes, dans le même fichier, écrites différemment.

`services/storageService.ts:315-332` — la bonne version, corrigée par SI-29 :

```ts
// SI-29: Supabase PostgREST plafonne une requête non paginée à 1000 lignes
const PAGE_SIZE = 1000;
for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase.from('observations')
        .select('*').eq('user_id', user.id)
        .range(from, from + PAGE_SIZE - 1);
    ...
}
```

`services/storageService.ts:767-772` — la même lecture, 440 lignes plus bas,
sans pagination :

```ts
const { data: refreshData, error: fetchError } = await supabase
    .from('observations')
    .select('*')
    .eq('user_id', user.id)
    .order('date', { ascending: false });
```

Pas de `.range()`. Cette requête retombe donc exactement dans le plafond que le
commentaire de la première décrit.

**Le même bloc porte deux autres défauts.** À la ligne 774 :

```ts
if (!fetchError && refreshData) {
```

Si `fetchError` est renseigné, il n'est **ni journalisé ni remonté** : le
rafraîchissement échoue en silence et le cache reste périmé sans que personne
le sache. Et surtout, cette branche **n'applique pas** `applyPendingQueueToObservations()`,
alors que `getObservations` le fait systématiquement (ligne 334) pour ne pas
faire disparaître les éléments en attente. Seuls les `INSERT` en échec sont
réinjectés (`:776-782`) — **les `UPDATE` et `DELETE` en échec, eux, disparaissent
du cache**.

**Concrètement.** Un utilisateur qui dépasse 1000 observations voit, après chaque
synchronisation, son carnet local ramené aux 1000 plus récentes. Tant qu'il est
en ligne, il ne remarque rien : l'application relit le serveur. Dès qu'il passe
hors ligne — en forêt, précisément le cas d'usage de l'application — **une partie
de son carnet a disparu**. Rien n'est perdu côté serveur, mais l'expérience est
celle d'une perte de données.

**Piste.** Réutiliser la boucle paginée qui existe déjà quinze lignes plus haut,
traiter `fetchError`, et appeler `applyPendingQueueToObservations` comme le fait
`getObservations`. Correction courte, sur un seul bloc.

---

## ROB-02 — Modifier la même observation sur deux appareils en perd une version, sans un mot 🔴

**Preuve.** `services/storageService.ts:431-466`. Le commentaire annonce la
couleur :

```ts
// SI-08: Select updated_at to detect concurrent modifications
```

Et la requête sélectionne bien la colonne :

```ts
.update(effectiveRow)
.eq('id', observation.id)
.eq('user_id', userId)
.select('id, updated_at')
```

Mais la valeur retournée n'est **jamais utilisée**. Le seul usage de `data` en
aval est `assertMutationAffectedRows(Array.isArray(data) ? data.length : 0, 'update')`
(ligne 465) — on compte les lignes touchées, on ne regarde pas leur contenu. Il
n'y a nulle part de `.eq('updated_at', ...)`, de comparaison, ni de verrouillage
optimiste.

**Concrètement.** Le scénario est ordinaire pour cette application. Un
naturaliste saisit une observation sur son téléphone pendant une sortie. Le soir,
sur son ordinateur, il complète le commentaire et l'habitat. Le lendemain, son
téléphone se synchronise et renvoie **sa** version de la ligne — complète, avec
tous les champs, car `mapToRow` émet l'intégralité de l'enregistrement.

Le travail de la veille est écrasé. Aucun avertissement, aucune trace, aucun
moyen de le récupérer.

Les créations ne sont pas concernées : chaque appareil génère son propre UUID,
et l'`upsert` sur `onConflict: 'id'` produit deux lignes distinctes. C'est bien
la modification d'une observation existante qui est en cause.

**Piste.** Deux niveaux possibles. Le minimum : envoyer l'`updated_at` connu
dans la condition et détecter que zéro ligne a été touchée — `assertMutationAffectedRows`
lèvera alors une erreur, qu'il restera à présenter proprement. Le confortable :
proposer un choix à l'utilisateur, ou fusionner champ par champ. Commencer par
le minimum : perdre une modification en le sachant vaut mieux que la perdre en
l'ignorant.

---

## ROB-03 — Une observation saisie hors ligne peut n'être écrite nulle part 🔴

**Preuve.** Trois éléments qui se combinent.

`services/storageService.ts:132-140` — écrire dans la file peut échouer, et
l'échec remonte :

```ts
const setQueue = (queue: OfflineQueueItem[]) => {
    try {
        localStorage.setItem(queueKey, JSON.stringify(queue));
    } catch {
        window.dispatchEvent(new CustomEvent('storage-quota-exceeded'));
        throw new Error("File d'attente hors-ligne pleine. ...");
    }
};
```

`services/storageService.ts:362-368` — et cette écriture a lieu **avant** la mise
en cache :

```ts
if (!navigator.onLine) {
    const offlineObs = { ...observation, id: observation.id || `temp-${generateUUID()}` };
    addToQueue('INSERT', offlineObs);        // <- peut lever une exception
    if (!options.skipCache) {
        upsertObservationInCache(offlineObs); // <- jamais atteint si ça casse
    }
    return offlineObs;
}
```

`components/ObservationForm.tsx:363-372` — et ce qu'on met dans la file est
lourd : hors ligne, la photo compressée est convertie en `data:` URL et stockée
telle quelle. Le cache, lui, écarte les médias au-delà de 250 000 caractères
(`services/storageCacheUtils.ts:12-14`) — **la file n'a aucun filtre équivalent**.

**Concrètement.** Une photo compressée pèse environ 1,5 Mo, soit à peu près 2 Mo
une fois encodée en texte. Le budget `localStorage` d'un navigateur tourne autour
de 5 à 10 Mo. **Trois à cinq photos hors ligne suffisent à saturer.**

Au dépassement, l'utilisateur reçoit bien un message d'erreur — c'est déjà ça.
Mais son observation n'a été écrite **ni dans la file, ni dans le cache**. Elle
n'existe nulle part. Il doit tout ressaisir, en forêt, sur son téléphone. Et la
tentative suivante échouera pareillement, puisque rien n'a été libéré.

**Un second chemin, plus discret.** `addToQueue` (`:143-155`) abandonne
silencieusement si `speciesName` ou `date` manquent :

```ts
logger.warn('[storageService] Payload invalide ignoré ...');
return;
```

Dans ce cas, l'observation est mise en cache — donc **visible à l'écran** — mais
jamais mise en file, donc **jamais synchronisée**. Elle disparaîtra à la
prochaine purge du cache. Le formulaire valide aujourd'hui ces deux champs, ce
qui ferme le passage en pratique ; mais la garde est là pour un cas qu'on
suppose impossible, et elle échoue silencieusement.

**Piste.** Écrire dans le cache **avant** la file, pour qu'une saisie survive
même si la file déborde. Filtrer les `data:` URL dans la file comme le fait déjà
le cache. Et transformer le `return` silencieux de `addToQueue` en erreur visible.

---

## ROB-04 — La file d'attente et le cache sont purgés en silence 🟠

**Preuve.** Deux délais, deux effacements, deux `logger.warn`.

`services/storageService.ts:108` et `:118-124` — les éléments en attente de plus
de **30 jours** sont écartés à chaque lecture de la file :

```ts
const MAX_QUEUE_ITEM_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
...
logger.warn('[storageService] Item de queue expiré (>30j), supprimé:', item.id);
```

`services/storageService.ts:28` et `:169-178` — le cache entier est vidé au-delà
de **90 jours**.

**Concrètement.** Un utilisateur part deux mois en expédition sans réseau
exploitable, ou change simplement de téléphone en oubliant de synchroniser. Ses
observations en attente sont supprimées de son appareil, définitivement, avec
pour seule trace un message dans la console du navigateur — que personne ne lit.

Le mécanisme de purge est légitime : sans lui, une file corrompue grossirait
sans fin. Ce qui manque, c'est **d'en avertir la personne concernée**. L'infrastructure
de notification existe pourtant déjà et est utilisée ailleurs dans le même
fichier : `notifyStorageCorruption`, `storage-quota-exceeded`, `media-stripped-offline`.

**Piste.** Émettre un événement avant de purger, et afficher un message
persistant. Éventuellement porter le délai de la file à 90 jours pour l'aligner
sur celui du cache — rien ne justifie qu'ils diffèrent.

---

## ROB-05 — Hors ligne, la file n'est pas réconciliée avec le cache 🟡

**Preuve.** `services/storageService.ts:305-309`

```ts
const cached = getLocalCache();
if (!navigator.onLine) return { observations: cached, source: 'cache' };
```

La branche en ligne, elle, appelle `applyPendingQueueToObservations()`
(ligne 334), qui fusionne les éléments en attente avec ceux du serveur.

**Concrètement.** Dans le cas normal, le cache contient déjà l'observation en
attente, donc rien ne manque. Mais si l'écriture en cache a échoué — quota
atteint, cf. ROB-03 — l'observation existe dans la file et **n'apparaît pas à
l'écran**. L'utilisateur la croit perdue, alors qu'elle sera bien synchronisée
au retour du réseau. Le remède existe déjà dans le fichier et n'est simplement
pas appelé ici.

**Piste.** Appliquer `applyPendingQueueToObservations(cached)` dans la branche
hors ligne. Une ligne.

---

## ROB-06 — L'échec de suppression d'une photo est invisible 🟡

**Preuve.** `services/storageService.ts:562-565`

```ts
await supabase.storage.from('photos').remove(pathsToRemove).catch(err => {
    logger.warn('[storageService] Échec nettoyage fichiers storage:', err);
});
```

Le SDK Supabase enveloppe cette opération dans `handleOperation`
(`node_modules/@supabase/storage-js/dist/index.mjs:471-484`) :

```js
try {
    return { data: await operation(), error: null };
} catch (error) {
    if (this.shouldThrowOnError) throw error;
    if (isStorageError(error)) return { data: null, error };
    throw error;
}
```

Autrement dit : **une erreur Storage métier — refus de policy, fichier
introuvable, quota — est retournée dans `error` et ne déclenche jamais le
`.catch()`.** Et cet `error` n'est lu nulle part. Seule une panne réseau brute
(`TypeError: Failed to fetch`) est effectivement rejetée et attrapée.

Le `.catch()` n'est donc pas du code mort — nuance par rapport à une lecture
rapide — mais il ne couvre que le cas le moins probable, en laissant passer le
plus courant.

**Concrètement.** Un utilisateur supprime une observation. La ligne disparaît de
la base, l'interface confirme. Si la suppression du fichier a été refusée, la
photo reste dans le bucket — orpheline, publiquement accessible (cf. SEC-01), et
personne n'en saura jamais rien. Le quota Storage se remplit sans explication.

**Piste.** Lire le `error` retourné :
`const { error: removeError } = await supabase.storage...remove(paths);` puis le
journaliser. Garder le `.catch()` pour les pannes réseau.

---

## ROB-07 — Le bandeau « Erreur critique » ne peut jamais s'afficher 🔵

**Preuve.** Trois occurrences dans `App.tsx`, et aucune n'active le bandeau :

```
App.tsx:85    const [criticalError, setCriticalError] = useState<string | null>(null);
App.tsx:874   {criticalError && (
App.tsx:880   onClick={() => setCriticalError(null)}   <- ferme le bandeau
```

`setCriticalError` n'est appelé qu'avec `null`, pour fermer. **Jamais pour
ouvrir.**

**Concrètement.** Le dispositif d'alerte livré sous la référence SR-12 — bandeau
rouge, `role="alert"`, `aria-live="assertive"`, pensé pour signaler une situation
grave à un lecteur d'écran — est inerte depuis sa mise en place. Aucun impact
direct : rien ne casse. Mais c'est un filet de sécurité qu'on croit tendu et qui
ne l'est pas, et il est comptabilisé comme livré dans les récapitulatifs.

**Piste.** Soit le brancher sur les cas qui le méritent — corruption du stockage,
dérive de schéma, échec de synchronisation répété —, soit retirer le code mort.
Le brancher est plus utile : les événements correspondants existent déjà.

---

## ROB-08 — Les exports n'ont aucune limite de volume 🔵

**Preuve.** `services/observationExportService.ts`. Les imports sont plafonnés
(10 000 lignes, 15 Mo, 120 colonnes). Les exports ne le sont pas :

| Export | Ce qui se passe |
|---|---|
| JSON (`:19-30`) | `JSON.stringify(safeData, null, 2)` sur tout le tableau, d'un bloc |
| GeoJSON (`:329-341`) | idem |
| Darwin Core CSV (`:271-280`) | tableau de lignes accumulé puis `join('\n')` — deux copies complètes en mémoire |
| Excel (`:31+`) | `forEach` synchrone sur toutes les observations |
| PDF (`:140-161`) | `forEach` synchrone avec pagination manuelle |

Aucun `Worker`, aucun découpage, aucune respiration du fil d'exécution. Tout se
déroule sur le fil principal.

**Concrètement.** Sur un carnet volumineux, l'onglet se fige pendant l'export —
et l'indicateur de progression ne peut même pas tourner, puisque le fil qui
l'anime est occupé. Si le carnet contient des photos hors ligne encodées en
texte, l'export JSON peut atteindre plusieurs centaines de mégaoctets en mémoire,
avec un risque réel de plantage sur mobile.

**Non mesuré** : ce constat vient de la lecture du code, pas d'un test de charge.

À noter par contraste : la sauvegarde ZIP, elle, est **bien protégée** —
concurrence limitée à 4, estimation de taille préalable, demande de confirmation
au-delà d'un seuil, plafond à la restauration. Le savoir-faire existe dans le
dépôt, il n'a simplement pas été appliqué aux exports.

**Piste.** Reprendre le modèle de `backupService.ts` : estimer, avertir au-delà
d'un seuil, et découper la boucle pour rendre la main au navigateur.

---

## ROB-09 — La sauvegarde n'a jamais été restaurée 🔴

**Preuve.** `docs/ops/RUNBOOK-sauvegarde-restauration.md:204-213`

```
## 5. Journal des vérifications

| Date | Action | Résultat |
|---|---|---|
| | Mise en service (§1, étape D) | |
| | Exercice de restauration (§4) | |
| | Copie hors-ligne trimestrielle | |
```

**Les trois lignes sont vides.** Le runbook se met lui-même en garde, ligne 103 :
« Tant que ce test n'a pas été fait, on n'a pas une sauvegarde : on a un fichier. »

**Ce qui est prouvé** : l'export fonctionne. La PR #68 documente six scénarios
d'échec testés hors ligne, et un lancement réel a produit un `data.sql` de 1,8 Mo.
Le workflow est par ailleurs très bien écrit — `permissions: {}`, actions
épinglées par SHA, chiffrement `age` avant envoi, effacement du fichier en clair
sur le runner, vérification du contenu et pas seulement de son existence.

**Ce qui n'est pas prouvé** : qu'on sache déchiffrer l'archive et remonter la
base. Personne n'a jamais vérifié que la clé privée `age` fonctionne, ni que le
`data.sql` se réinjecte proprement.

**Concrètement.** C'est le constat le plus important du rapport, parce qu'il
conditionne tous les autres. Chaque autre risque — perte de données, corruption,
mauvaise manipulation — est censé être rattrapé par la sauvegarde. Si elle ne
fonctionne pas, il n'y a pas de second filet. Et on ne le découvrirait qu'au pire
moment.

Trois angles morts s'y ajoutent, tous déjà identifiés dans le runbook et aucun
traité :

- **Les photos et les sons ne sont pas sauvegardés** (choix assumé, quota GitHub).
  Après une restauration, toutes les images seraient des liens morts.
- **Aucun signal de vie** : si le workflow cesse de s'exécuter, rien ne le
  signale. Or GitHub désactive les workflows planifiés après 60 jours
  d'inactivité du dépôt.
- **Aucune copie hors ligne.** Les archives ne vivent que sur GitHub, 35 jours.

**Piste.** Dérouler l'exercice de restauration sur un projet Supabase de test.
C'est du temps, pas du code. Marche à suivre dans
[`04-verifications-manuelles.md`](./04-verifications-manuelles.md).

---

## ROB-10 — Le fichier le plus critique n'est pas couvert par les tests 🔵

**Preuve.** `vitest.config.ts` limite la mesure de couverture à
`components/**`, `services/**`, `utils/**` et `hooks/**`. **`App.tsx`,
`index.tsx` et `contexts/` en sont exclus** — et `App.tsx` n'a aucun fichier de
test dédié.

Or `App.tsx` (1109 lignes) orchestre le chargement des données, la
synchronisation au démarrage et l'enrichissement des espèces. Son effet
principal fait à lui seul environ 115 lignes.

Autres zones à **0 %** (relevé du 2026-09-04, `evidence/coverage-output.txt`) :
`SyncCenterDialog.tsx` — c'est-à-dire **l'écran qui sert à résoudre les échecs de
synchronisation** —, `ObservationMap.tsx`, `MapInput.tsx`, `useObservationFilters.ts`
(tout le filtrage et le tri de la liste), `AdvancedFilterDialog.tsx`,
`StatsExportDialog.tsx`.

**Aucun test de bout en bout n'existe.** Pas de Playwright, pas de Cypress. Le
dossier `.playwright-mcp/` ne contient que des journaux d'une session
exploratoire.

**À relativiser.** 459 tests verts sur 66 fichiers, une couverture globale de
64,6 %, et 91 % sur `utils/` : c'est nettement au-dessus de la moyenne pour une
application de cette taille. Le problème n'est pas le volume, c'est la
**répartition** — les parcours les plus critiques (synchronisation hors ligne,
résolution de conflits) sont précisément ceux qui ne sont pas testés, et c'est
aussi là que se concentrent ROB-01 à ROB-06.

**Piste.** Retirer l'exclusion de `App.tsx` de la configuration pour rendre le
trou visible, puis couvrir `useObservationFilters` et `SyncCenterDialog` en
priorité. Les tests de bout en bout méritent un lot à part.

---

## ROB-11 — Les données venant du serveur ne sont pas validées 🟡

**Preuve.** Aucune bibliothèque de validation à l'exécution n'est utilisée (ni
zod, ni yup, ni équivalent). La validation est manuelle, et son niveau varie
énormément selon la source :

| Source | Validation |
|---|---|
| Import Excel / JSON | **Excellente** — types, énumérations, URL, UUID, bornes géographiques |
| Cache local | **Correcte** depuis la version 1 du schéma de cache — garde minimale |
| **Lectures Supabase** | **Aucune** — conversion de type aveugle |

```
services/storageService.ts:330          rows.push(...(data as ObservationRow[]));
services/storage/storageMappers.ts:31   (row.weather_condition || 'Non renseigné') as Observation['weather']
services/storage/storageCacheValidation.ts:52   } as unknown as Observation
```

Le dépôt compte 185 conversions `as <Type>` réparties sur 50 fichiers.

**Concrètement.** Le paradoxe : on se méfie beaucoup du fichier que l'utilisateur
importe, et pas du tout de ce que renvoie la base. Si une migration ajoute une
valeur d'énumération, ou change un type de colonne, la valeur inconnue traverse
tout le code jusqu'à l'affichage. Le résultat n'est pas une erreur claire — c'est
un affichage faux, ou un plantage de rendu rattrapé par la barrière d'erreur.
Difficile à diagnostiquer, difficile à reproduire.

Il existe déjà une tolérance à la dérive de schéma (`withColumnFallback`,
`schema-drift-detected`), ce qui montre que le sujet est connu : elle traite les
colonnes manquantes, pas les valeurs inattendues.

**Piste.** Étendre `sanitizeCachedObservations` — qui fait déjà le bon travail
pour le cache — au chemin serveur, en vérifiant au minimum les énumérations.
Sans introduire de nouvelle dépendance : la fonction existe et fonctionne.
