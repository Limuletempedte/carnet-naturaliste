# Audit v4 — Sécurité et vie privée

- **Date** : 2026-09-04
- **Périmètre** : dépôt `main` au commit `fa9fb07`, lecture seule
- **11 constats** : `SEC-01` à `SEC-11`

Chaque constat suit la même structure : ce qui a été vérifié, ce que ça donne
concrètement pour un utilisateur, et la piste de correction.

---

## SEC-01 — Les photos sont publiques, la page légale dit le contraire 🟠

**Preuve.** `supabase/migrations/20240101000000_initial_schema.sql:135`

```sql
insert into storage.buckets (id, name, public) values ('photos', 'photos', true);
```

Face à quoi `components/LegalPages.tsx:104` promet aux utilisateurs des
« politiques RLS (Row-Level Security) **isolant les données par utilisateur** ».

**C'est vrai pour la table `observations`, faux pour les fichiers.** Les URL de
la forme `/storage/v1/object/public/photos/...` ne passent pas par la RLS : le
serveur les sert sans vérifier qui demande. L'énumération anonyme du bucket a
bien été fermée par l'audit v2 (`20260611100000_audit_v2_storage_hardening.sql`) —
personne ne peut plus obtenir la *liste* des fichiers. Mais toute personne
détenant une URL peut afficher la photo, sans compte.

**Concrètement.** La confidentialité des photos repose entièrement sur le fait
que l'URL est difficile à deviner (`{uuid-utilisateur}/photos/{horodatage}-{uuid}.jpg`).
C'est solide contre le hasard. Ça ne l'est pas contre une fuite : une URL copiée
dans un e-mail, un export, un message ou un journal de serveur reste valable
**pour toujours**, et il n'existe aucun moyen de la révoquer.

Pour un carnet naturaliste, l'enjeu n'est pas théorique : une photo peut trahir
une station d'espèce protégée, ou simplement un lieu que l'utilisateur fréquente.

**Piste.** Passer le bucket en privé et servir les médias par `createSignedUrl()`
avec une durée de vie courte. C'est le seul constat du rapport qui demande un
vrai chantier : il faut adapter `services/storage/storageMedia.ts`, mettre en
place un cache d'URL signées côté client, et vérifier le comportement des
sauvegardes et de l'affichage hors ligne. La cible est déjà décrite dans
`docs/audits/v2/rapport-workflow-brut.json`.

**Nuance honnête.** Ce choix a été assumé trois fois par les audits précédents
(SI-25, SE-11, VP-12). Il n'est pas absurde. Ce qui doit changer, c'est
**l'écart entre ce qui est fait et ce qui est promis** : soit on ferme le bucket,
soit on corrige la phrase des mentions légales. Laisser les deux en l'état est
la seule option à écarter.

---

## SEC-02 — Remplacer une photo laisse l'ancienne accessible à vie 🟠

**Preuve.** Une seule suppression de fichier existe dans tout `services/` :

```
services/storageService.ts:562   await supabase.storage.from('photos').remove(pathsToRemove)
```

Elle se trouve dans `deleteObservation`. La fonction `updateObservation`
(`services/storageService.ts:412-470`) écrit la nouvelle URL dans la base et
**ne touche jamais à l'ancien fichier**.

**Concrètement.** Un utilisateur photographie un oiseau, se trompe, reprend la
photo. L'ancienne image reste dans le bucket, sans plus aucune ligne en base qui
la référence — donc invisible depuis l'application, impossible à supprimer par
l'utilisateur, et toujours accessible publiquement (cf. SEC-01) à qui connaît
son URL. Elle survivra même à la suppression du compte : `delete-account` liste
les fichiers du dossier de l'utilisateur, donc elle serait bien effacée dans ce
cas précis — mais elle échappe à tout le reste du cycle de vie.

Cela contredit directement `components/LegalPages.tsx:63` : « **Photos et sons** :
conservés tant que l'observation associée existe ».

S'y ajoute un passif : la purge des fichiers orphelins accumulés avant juin 2026
n'a **jamais été exécutée**. La procédure existe pourtant, écrite et prête, dans
`docs/audits/v2/purge-orphelins-storage.md`.

**Piste.** Dans `updateObservation`, comparer l'ancienne et la nouvelle URL et
supprimer l'ancienne si elle a changé — la fonction `extractStoragePath` utilisée
par `deleteObservation` fait déjà exactement ce dont on a besoin. Puis dérouler
la purge one-shot documentée.

---

## SEC-03 — La politique de sécurité casse deux éléments en production 🟡

**Preuve.** `vercel.json:34` pose `script-src 'self'` — sans `'unsafe-inline'`
ni `'unsafe-hashes'`. C'est une bonne CSP. Mais deux pages contiennent encore
des gestionnaires d'événements écrits directement dans le HTML, que cette
directive interdit :

- `index.html:26` — `onfocus` / `onblur` sur le lien « Aller au contenu principal »
- `public/offline.html:96` — `onclick="location.reload()"` sur le bouton « Réessayer »

**Concrètement.** Ce n'est pas une faille : c'est la sécurité qui fonctionne un
peu trop bien. Mais les conséquences sont réelles. Le lien d'évitement, qui sert
aux personnes naviguant au clavier ou au lecteur d'écran, **ne devient jamais
visible** — il reste à `left: -9999px`. Et sur la page affichée quand le réseau
est coupé, **le bouton « Réessayer » ne fait rien**.

Ce qui est le plus instructif ici : ces deux éléments n'ont jamais été testés en
conditions réelles depuis la mise en place de la CSP en avril. C'est un angle
mort de la recette, pas seulement deux lignes à corriger.

**Piste.** Déplacer les deux gestionnaires dans un fichier `.js` séparé (ou dans
le bundle), ce qui les remet sous `script-src 'self'`. Éviter d'ajouter
`'unsafe-hashes'` à la CSP : ce serait affaiblir une bonne configuration pour
contourner deux lignes de HTML.

---

## SEC-04 — Durcissement SQL incomplet 🟡

Deux points distincts sur la même table.

**`search_path` non figé.** La fonction `public.set_observations_updated_at()`
(dernière version : `20260404100000_theme5_sync_integrity.sql:43-52`) ne déclare
pas `SET search_path`. Aucun `search_path` n'apparaît dans l'ensemble des
migrations. Le risque reste théorique — la fonction n'est pas `SECURITY DEFINER`
et il faudrait déjà le droit de créer des objets dans `public` pour la détourner —
mais c'est le durcissement standard attendu par les advisors Supabase.

**`created_at` falsifiable à l'insertion.** Le trigger qui protège la date de
création est déclaré `before update` (`20240101000000_initial_schema.sql:110`).
Il n'existe **aucun trigger `before insert`**. Un client porteur d'un jeton
valide peut donc écrire n'importe quelle date de création. L'application ne le
fait pas — `storageMappers.ts` n'émet pas ces colonnes — mais rien ne l'en
empêche côté serveur.

**Concrètement.** Faible portée : un utilisateur ne pourrait falsifier que ses
propres métadonnées. À traiter comme de l'hygiène, pas comme une urgence.

**Piste.** Ajouter `set search_path = ''` à la fonction et un trigger
`before insert` qui force `created_at = now()`.

---

## SEC-05 — Sentry reçoit tout, sans filtre 🟡

**Preuve.** `services/errorReportingService.ts:41-47`. Le `beforeSend` ne filtre
qu'une seule chose : les erreurs de chargement de morceau de code après un
redéploiement. Rien d'autre n'est nettoyé.

La collecte est par ailleurs bien configurée — pas de cookies, pas d'en-têtes,
pas de corps de requête, pas de suivi de session, pas de traçage de performance.
L'intention est claire et bonne. Mais deux trous subsistent.

**Le contenu des messages n'est pas filtré.** `reportError` (`:58-73`) concatène
**toutes** les chaînes qu'on lui passe dans un champ `loggerMessage`, et
`utils/logger.ts:53` appelle `reportError` sur chaque `logger.error`. Un cas
concret existe déjà dans le code :

```
App.tsx:351   logger.error(`Failed to fetch info for ${obs.latinName}`, err);
```

Le nom latin de l'espèce observée part donc chez Sentry. C'est peu — une seule
occurrence dans tout le dépôt — mais le commentaire en tête du fichier affirme
« aucune donnée d'observation ». L'affirmation est fausse, et surtout **rien ne
protège structurellement contre le prochain `logger.error` qui enverra une
coordonnée GPS ou un e-mail**.

**Aucun plafond d'envoi.** `sampleRate` n'est pas défini, donc 100 % des erreurs
partent. Une boucle d'erreur dans un `useEffect` chez un seul utilisateur peut
épuiser le quota Sentry en quelques minutes.

**Piste.** Ajouter au `beforeSend` un nettoyage des motifs sensibles (coordonnées,
e-mails), poser un `sampleRate` autour de `0.5`, et retirer le nom latin du
message de `App.tsx:351`.

---

## SEC-06 — Mot de passe faible et anti-brute-force contournable 🔵

**Preuve.** `components/Auth/Login.tsx:99-107` : après trois échecs, un verrou
exponentiel se déclenche — mais il est tenu dans un `useState` React. Un
rafraîchissement de page, un onglet privé, ou un appel direct à l'API
d'authentification le remettent à zéro.

La seule protection réelle est donc le plafond de requêtes de Supabase, combiné
à une longueur minimale de mot de passe de **6 caractères** dans la configuration
locale (`supabase/config.toml:175`).

**Attention** : ces valeurs viennent du fichier de configuration de la CLI, qui
ne reflète pas nécessairement la production. C'est le premier point à vérifier
dans [`03-supabase-heberge.md`](./03-supabase-heberge.md).

**Concrètement.** Six caractères sans exigence de complexité, c'est faible pour
un compte qui contient des données de localisation. Le verrou côté navigateur
donne une fausse impression de protection.

**Piste.** Porter le minimum à 10 caractères dans le tableau de bord Supabase —
un réglage, pas du code. Le verrou client peut rester : il protège de la faute de
frappe, pas de l'attaque, et c'est déjà utile.

---

## SEC-07 — L'import JSON n'a aucune limite de taille 🔵

**Preuve.** `components/ObservationList.tsx:174-177`

```ts
const text = await file.text();
const parsed = JSON.parse(text) as unknown;
```

Aucun contrôle préalable. Les deux autres formats sont pourtant plafonnés :
15 Mo pour Excel (`excelImportService.ts:73`), 500 Mo pour les sauvegardes ZIP
(`backupService.ts:427`).

**Concrètement.** L'utilisateur choisit lui-même le fichier, donc il ne peut
guère se nuire qu'à lui-même : un fichier énorme fige l'onglet. Le contenu, une
fois analysé, est en revanche **très bien validé** (`jsonImportValidation.ts`
vérifie les types, les énumérations, les URL et les UUID). C'est une incohérence
de garde-fou, pas une faille.

**Piste.** Trois lignes, sur le modèle de `excelImportService.ts:73`.

---

## SEC-08 — Un fichier de schéma périmé qui rouvrirait une faille corrigée 🔵

**Preuve.** `supabase_schema.sql:169` contient encore :

```sql
create policy "Public Access" ...
```

Alors que `supabase/migrations/20260611100000_audit_v2_storage_hardening.sql:13`
la supprime explicitement (`drop policy if exists "Public Access"`).

**Concrètement.** Aucun risque tant que personne n'exécute ce fichier. Mais il
porte un nom qui invite à le faire — c'est le fichier qu'on ouvre pour
« remonter le schéma » après un incident, exactement le moment où l'on est
pressé et où l'on vérifie le moins. Le rejouer réintroduirait l'énumération
anonyme du bucket, corrigée en juin (faille H1 de l'audit v2).

C'est un piège documentaire, et il est d'autant plus vicieux qu'il se déclencherait
pendant une restauration d'urgence — le scénario même de ROB-09.

**Piste.** Soit synchroniser le fichier avec l'état réel des migrations, soit
ajouter un avertissement en tête, soit le supprimer si les migrations font foi.

---

## SEC-09 — La CI ne monte aucune garde de sécurité 🟡

**Preuve.** `.github/workflows/ci.yml`, confirmé indépendamment par semgrep
(constats 2 et 3, cf. `evidence/baseline.md`).

| Point | État | Comparaison |
|---|---|---|
| `npm audit` | ❌ absent | Recommandé par l'audit v2, jamais posé |
| Analyse de sécurité (CodeQL, semgrep) | ❌ absente | Les scans v3 et v4 sont manuels |
| `actions/checkout@v4` (l. 19) | ⚠️ tag mutable | `sauvegarde-base.yml` épingle par SHA |
| `actions/setup-node@v4` (l. 22) | ⚠️ tag mutable | idem |
| Bloc `permissions:` | ❌ absent | `sauvegarde-base.yml` pose `permissions: {}` |
| `runs-on: ubuntu-latest` | ⚠️ non figé | `sauvegarde-base.yml` fige `ubuntu-24.04` |

**Concrètement.** Un tag comme `v4` peut être repointé silencieusement par le
propriétaire de l'action : c'est le vecteur exact des compromissions
`trivy-action` et `kics-github-action`. Le workflow de sauvegarde, écrit plus
récemment, fait **tout** correctement. Celui de la CI, plus ancien, n'a jamais
été repris. L'incohérence entre les deux est le meilleur argument : le bon
modèle existe déjà dans le dépôt, il suffit de l'appliquer.

**Piste.** Épingler les deux actions par SHA, ajouter `permissions: contents: read`,
figer la version d'Ubuntu, et ajouter une étape `npm audit --audit-level=high`.

---

## SEC-10 — `dompurify` vulnérable, présent dans le bundle, jamais exécuté 🔵

**Preuve.** `npm audit` remonte une XSS modérée dans `dompurify` (« IN_PLACE hook
removal leaves a detached subtree executable »). Chaîne de dépendance :

```
jspdf@4.2.1 -> dompurify@3.4.12
```

`jspdf` est une dépendance de **production**, et le fichier
`dist/assets/purify.es-*.js` confirme que DOMPurify **est bien livré au
navigateur**. C'est la seule des sept vulnérabilités npm dans ce cas — les six
autres (`brace-expansion`, `browserslist`, `fast-uri`, `js-yaml`, `nanoid`,
`postcss`) restent dans l'outillage de développement ou de compilation.

**Mais elle n'est pas exploitable ici.** DOMPurify n'est utilisé par jsPDF que
dans `pdf.html()`. Or le code n'appelle jamais cette méthode : les deux usages de
jsPDF passent par `pdf.text()` et `pdf.addImage()`
(`observationExportService.ts:118-119`, `statsExportService.ts:330-346`). Le code
vulnérable est chargé mais jamais atteint par du contenu non fiable.

**Concrètement.** Aucune action urgente. Mais Dependabot continuera à signaler
ce paquet, et l'analyse ci-dessus devra être refaite à chaque alerte tant que la
version n'est pas montée. Un simple bump coûte moins cher que de re-raisonner.

**Piste.** Monter `jspdf` quand une version embarquant `dompurify` corrigé sort.
Sans urgence.

---

## SEC-11 — Dependabot sans période de quarantaine 🔵

**Preuve.** `.github/dependabot.yml:10`, constat remonté par semgrep
(`dependabot-missing-cooldown`). Aucun bloc `cooldown` n'est configuré.

**Concrètement.** Sans quarantaine, Dependabot peut proposer une version publiée
il y a une heure. C'est précisément la fenêtre pendant laquelle un paquet
compromis n'a pas encore été détecté ni dépublié — le mode opératoire des
attaques par chaîne d'approvisionnement npm récentes.

Un élément aggrave le tableau : **20 branches Dependabot sont actuellement
ouvertes** sur le dépôt (`dompurify` en trois versions, `fast-uri` en trois,
`js-yaml` en deux, `ws`, `tmp`, `postcss`…). Les mises à jour s'accumulent sans
être triées, ce qui rend d'autant plus probable qu'une soit fusionnée sans examen
attentif.

**Piste.** Ajouter `cooldown: { default-days: 7 }` sous l'entrée
`package-ecosystem`, et faire le ménage dans les branches ouvertes.

---

## Points non vérifiables depuis le dépôt

Tout ce qui touche au projet Supabase hébergé — longueur réelle des mots de
passe, confirmation d'e-mail, MFA, captcha, plafonds de requêtes, advisors,
index, et vérification que les policies actives correspondent bien aux
migrations — est resté hors de portée : le serveur MCP Supabase répond
`HTTP 401`.

C'est l'objet de [`03-supabase-heberge.md`](./03-supabase-heberge.md), qui te
donne la marche à suivre pour le contrôler toi-même.
