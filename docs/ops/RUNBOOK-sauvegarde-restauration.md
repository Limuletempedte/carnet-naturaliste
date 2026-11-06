# Sauvegarde et restauration de la base

Mode d'emploi de la sauvegarde automatique.

> **Pourquoi ce dispositif** : l'offre gratuite de Supabase ne fournit **aucune
> sauvegarde**. Sans lui, une fausse manipulation ou un incident chez Supabase
> ferait perdre définitivement les observations de tous les utilisateurs.

**En une phrase** : chaque dimanche, une copie de la base est exportée,
vérifiée, chiffrée, puis conservée 35 jours dans l'onglet *Actions* du dépôt
**privé** [`Limuletempedte/carnet-naturaliste-sauvegardes`](https://github.com/Limuletempedte/carnet-naturaliste-sauvegardes).

> 🔴 **Pourquoi un dépôt à part** : une archive déposée dans l'onglet *Actions*
> a la même visibilité que son dépôt. Le dépôt de code `carnet-naturaliste` est
> public, donc n'importe quel compte GitHub pourrait y télécharger les
> sauvegardes. Le workflow tourne donc **uniquement** dans le dépôt privé, qui
> porte aussi le secret et la clé publique. Il vérifie lui-même que son dépôt
> est privé et s'arrête sinon.
>
> Le dépôt de code garde une **copie de référence**, jamais exécutée, de tout
> le contenu du dépôt privé :
> [`docs/ops/depot-sauvegardes/`](./depot-sauvegardes/) (le workflow
> [`sauvegarde-base.yml`](./depot-sauvegardes/.github/workflows/sauvegarde-base.yml)
> et un [`README.md`](./depot-sauvegardes/README.md)). Pour la modifier, voir le §6.

---

## 1. Mise en service (à faire une seule fois)

### Étape 0 — Créer le dépôt privé

Commandes à lancer depuis le dossier du projet, sur un ordinateur où `gh` est
connecté :

```bash
gh repo create Limuletempedte/carnet-naturaliste-sauvegardes --private --description "Sauvegardes chiffrées de la base du Carnet Naturaliste (privé)"
```

```bash
git clone https://github.com/Limuletempedte/carnet-naturaliste-sauvegardes.git ../carnet-naturaliste-sauvegardes
```

Cette commande copie la version de référence publiée sur `main`, quelle que
soit la branche ouverte en local :

```bash
git fetch origin && git archive origin/main:docs/ops/depot-sauvegardes | tar -x -C ../carnet-naturaliste-sauvegardes
```

```bash
git -C ../carnet-naturaliste-sauvegardes add .gitignore README.md .github && git -C ../carnet-naturaliste-sauvegardes commit -m "feat: sauvegarde hebdomadaire chiffrée de la base" && git -C ../carnet-naturaliste-sauvegardes push -u origin HEAD
```

> 🔴 On ajoute les fichiers **par leur nom**, jamais avec `git add -A`. Une
> archive déchiffrée oubliée dans ce dossier serait sinon versionnée, et elle
> resterait dans l'historique bien au-delà des 35 jours. Le `.gitignore` du dépôt
> privé est une liste blanche qui sert de second filet.

Vérifier ensuite sur la page du dépôt que le cadenas **Private** apparaît à
côté de son nom.

### Étape A — Récupérer la chaîne de connexion

1. Ouvrir le projet sur [supabase.com/dashboard](https://supabase.com/dashboard).
2. Cliquer le bouton **Connect**, tout en haut de la page.
3. Choisir la section **Session pooler**.
4. Copier la chaîne affichée. Elle ressemble à :
   `postgresql://postgres.xowiezzqehadcfnbkijo:[MOT-DE-PASSE]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`
5. Remplacer `[MOT-DE-PASSE]` par le mot de passe de la base.

> ⚠️ **Prendre exactement celle-ci**, ne pas la reconstruire à la main.
> - La connexion **directe** (`db.<ref>.supabase.co`) est en IPv6, or les
>   serveurs de GitHub ne parlent qu'IPv4 : elle échouerait systématiquement.
> - Le port **6543** (mode transaction) coupe les exports longs. Il faut le
>   **5432**.
> - Le préfixe `aws-0` / `aws-1` **n'est pas devinable** : s'il est faux,
>   l'erreur affichée (`Tenant or user not found`) fait croire à tort à un
>   mauvais mot de passe.
>
> Le workflow vérifie ces trois points au démarrage et affiche un message clair
> si la chaîne ne convient pas.

> 🔴 **Le mot de passe doit être composé uniquement de lettres et de chiffres.**
> Vérifié en conditions réelles : un mot de passe contenant `#`, `?` ou `%`
> fait échouer l'export avec le message `failed to parse connection string`
> (un `@` passe, lui — d'où le piège). Ces caractères devraient sinon être
> encodés à la main dans l'adresse, ce qui est une source d'erreurs.

**Mot de passe oublié, ou contenant des caractères spéciaux ?** Le réinitialiser
via le bouton *Reset database password* de la fenêtre *Connect* (ou dans
*Project Settings → Database*). C'est sans risque : ce mot de passe n'est
utilisé nulle part ailleurs — l'application n'utilise que `VITE_SUPABASE_URL` et
`VITE_SUPABASE_ANON_KEY`. Après réinitialisation, **penser à mettre à jour le
secret `SUPABASE_DB_URL`** avec la nouvelle chaîne.

### Étape B — Créer la clé de chiffrement

La sauvegarde contient les adresses e-mail et les mots de passe (chiffrés) des
utilisateurs : elle ne doit pas être stockée en clair. On la chiffre avec
l'outil [age](https://github.com/FiloSottile/age).

1. Générer la paire de clés. Le plus simple, sans rien installer : lancer une
   fois le workflow *Sauvegarde de la base* n'est pas possible avant d'avoir la
   clé — utiliser donc un ordinateur avec `age` installé
   (`winget install FiloSottile.age` sous Windows,
   `brew install age` sous macOS, `sudo apt install age` sous Linux) :

   ```bash
   age-keygen -o cle-sauvegarde-privee.txt
   ```

2. Le fichier produit contient deux lignes :
   - `# public key: age1xxxxxxxxxxxxxxxxxxxx…` → la **clé publique**, à copier à
     l'étape C. Elle n'est pas secrète.
   - `AGE-SECRET-KEY-1XXXXXXXX…` → la **clé privée**. C'est elle qui permet de
     relire les sauvegardes.

3. 🔴 **Mettre la clé privée à l'abri** : dans un gestionnaire de mots de passe,
   **et** sur une copie hors ligne (papier ou clé USB). **Si elle est perdue,
   toutes les sauvegardes deviennent définitivement illisibles.**
   Ne jamais la mettre dans le dépôt ni dans les secrets GitHub.

### Étape C — Renseigner les deux valeurs dans GitHub

Dans le dépôt **privé** `carnet-naturaliste-sauvegardes` (jamais dans le dépôt
de code public) → **Settings** → **Secrets and variables** → **Actions**.

| Onglet | Nom | Valeur |
|---|---|---|
| **Secrets** (*New repository secret*) | `SUPABASE_DB_URL` | la chaîne de l'étape A, mot de passe compris |
| **Variables** (*New repository variable*) | `BACKUP_AGE_PUBLIC_KEY` | la clé publique `age1…` de l'étape B |

Équivalent en ligne de commande. `gh` demande la valeur du secret sans
l'afficher, et rien n'est enregistré dans l'historique du terminal :

```bash
gh secret set SUPABASE_DB_URL --repo Limuletempedte/carnet-naturaliste-sauvegardes
```

```bash
gh variable set BACKUP_AGE_PUBLIC_KEY --repo Limuletempedte/carnet-naturaliste-sauvegardes --body "age1..."
```

> ⚠️ Ne jamais coller la chaîne de connexion dans une conversation, un ticket ou
> un message : elle donne un accès complet à la base. Elle se saisit uniquement
> dans la page *Secrets* de GitHub ou dans l'invite masquée de `gh secret set`.

### Étape D — Premier lancement et contrôles

Dans le dépôt privé : onglet **Actions** → *Sauvegarde de la base* → bouton
**Run workflow**. En ligne de commande :

```bash
gh workflow run sauvegarde-base.yml --repo Limuletempedte/carnet-naturaliste-sauvegardes
```

> Si la toute première étape, *Verifier que le depot est prive*, échoue, le
> dépôt est public ou GitHub n'a pas répondu. Vérifier le cadenas **Private**,
> puis relancer.

Puis vérifier, dans l'ordre :

- [ ] Le job est vert et le résumé affiche un nombre d'observations et de comptes
      **cohérent avec le tableau de bord Supabase**. C'est le contrôle qui prouve
      que rien n'a été silencieusement filtré.
- [ ] Noter ici la taille réelle de l'archive (visible dans les journaux) :
      `__________ Mo` (environ 0,25 Mo en octobre 2026). Garder
      `retention-days: 35` : c'est la durée annoncée aux utilisateurs
      (`components/LegalPages.tsx`) et dans le registre des traitements. La
      changer oblige à mettre à jour ces deux textes en même temps.
- [ ] Télécharger l'artefact et **vérifier qu'il se déchiffre** (voir §4). Tant
      que ce test n'a pas été fait, on n'a pas une sauvegarde : on a un fichier.
- [ ] Faire une fois l'exercice de restauration complet (§4) sur un projet
      Supabase de test.

---

## 2. Ce que la sauvegarde contient — et ne contient pas

| Contenu | Sauvegardé ? |
|---|---|
| Observations (table `public.observations`) | ✅ oui |
| Comptes utilisateurs (`auth.users`) | ✅ oui |
| Structure, index, règles de sécurité (RLS), déclencheurs | ✅ oui |
| Rôles de la base | ✅ oui |
| **Photos et sons** (fichiers du stockage) | ❌ **non** |
| Accès et journal de l'assistant IA (`public.ai_access`, `public.ai_usage`) | ✅ oui |
| Fonction *edge* `delete-account` | ❌ non (à redéployer) |
| Fonction *edge* `ai-identify` et ses secrets (`ANTHROPIC_API_KEY`, `AI_MODEL`, `AI_EFFORT`, `AI_MONTHLY_BUDGET_USD`, `ALLOWED_ORIGINS`) | ❌ non (à redéployer et ressaisir, voir [`ASSISTANT-IA.md`](./ASSISTANT-IA.md)) |
| Réglages de la plateforme (URL de redirection, e-mails, SMTP) | ❌ non |

> 🔴 **Les photos ne sont pas dans la sauvegarde.** Seules les *références* aux
> fichiers reviennent : après une restauration, les images seraient des liens
> morts. C'est un choix assumé — copier le stockage (jusqu'à 1 Go) saturerait le
> quota GitHub de 500 Mo et bloquerait la sauvegarde elle-même.
> Filet existant : chaque utilisateur peut exporter ses données **avec ses
> médias** depuis l'application (menu profil → export ZIP).

---

## 3. Surveillance

- **En cas d'échec**, GitHub envoie un e-mail au propriétaire du dépôt.
  **Traiter cet e-mail comme urgent** : c'est le seul filet du projet.
- **Désactivation après 60 jours** : GitHub désactive les workflows planifiés
  d'un dépôt **public** resté 60 jours sans activité. Le dépôt de sauvegarde est
  privé, donc il n'est pas concerné d'après la documentation GitHub. Si un
  e-mail de GitHub annonce malgré tout une désactivation, réactiver le
  workflow depuis l'onglet Actions du dépôt privé.
- ⚠️ **Autre piège** : un projet Supabase gratuit est **mis en pause après ~7
  jours de faible activité**. La sauvegarde échouerait alors bruyamment — ce qui
  est une bonne nouvelle, mais il faut réagir vite.
- **Amélioration recommandée (10 minutes, gratuite)** : créer une surveillance
  externe de type *dead man's switch* (par exemple
  [healthchecks.io](https://healthchecks.io)) qui prévient si aucune sauvegarde
  n'a eu lieu depuis 10 jours. C'est le seul moyen de détecter un arrêt
  silencieux (quota épuisé, workflows désactivés).
- **Une fois par trimestre** : télécharger la dernière archive et la ranger sur
  un disque externe ou un cloud personnel. Tant que le code et les sauvegardes
  vivent dans le même compte GitHub, perdre l'accès au compte ferait tout perdre
  d'un coup. **C'est ce geste, pas le workflow, qui en fait une vraie sauvegarde.**

---

## 4. Restaurer une sauvegarde

### Étape 1 — Récupérer et déchiffrer l'archive

Dans le dépôt privé `carnet-naturaliste-sauvegardes` : onglet **Actions** →
ouvrir l'exécution voulue → télécharger l'artefact `sauvegarde-base-AAAA-MM-JJ`
(puis décompresser le `.zip` que fournit GitHub). Ou bien, en ligne de
commande :

```bash
gh run download --repo Limuletempedte/carnet-naturaliste-sauvegardes --name sauvegarde-base-AAAA-MM-JJ --dir ~/restauration-carnet
```

> ⚠️ Travailler dans un dossier **à part**, comme `~/restauration-carnet` (`cd ~/restauration-carnet`
> avant les commandes ci-dessous). Ne jamais le faire dans le dossier d'un dépôt
> git : une fois déchiffrés, les fichiers contiennent les données personnelles
> en clair. Supprimer ce dossier une fois la restauration terminée.

```bash
age --decrypt -i cle-sauvegarde-privee.txt -o sauvegarde.tar.gz sauvegarde-2026-07-27.tar.gz.age
tar -xzf sauvegarde.tar.gz
```

On obtient `roles.sql`, `schema.sql` et `data.sql`.

### Étape 2 — Préparer la base cible

Créer un nouveau projet Supabase (**région Europe**, `eu-central-1`), puis
récupérer sa chaîne *Session pooler* comme au §1.

### Étape 3 — Restaurer

Les trois fichiers, **dans cet ordre**, en une seule commande :

```bash
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file roles.sql --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql \
  --dbname "postgresql://postgres.<REF>:<MOT-DE-PASSE>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"
```

`session_replication_role = replica` désactive les déclencheurs pendant
l'import. Sans cela, l'ordre des dépendances entre `auth.users` et
`public.observations` fait échouer la restauration.

> Ne jamais découper `data.sql` pour n'en restaurer qu'un morceau : les liens
> entre les tables casseraient.

### Étape 3 bis — Restaurer les droits du stockage privé

Le dump CLI standard omet les policies personnalisées du schéma `storage`.
Sur la **nouvelle cible uniquement**, après restauration SQL et avant de
rebrancher l’application, exécuter le fichier versionné
[`supabase/restore-storage-policies.sql`](../../supabase/restore-storage-policies.sql)
avec `psql --variable ON_ERROR_STOP=1 --file supabase/restore-storage-policies.sql`
et la connexion de cette cible. Il refuse un bucket `photos` absent ou public.
Ne pas rejouer les anciennes migrations ni rendre le bucket public.

Vérifier ensuite avec deux comptes fictifs que chacun ne voit que ses
observations et ses propres médias. Les métadonnées `storage.objects` sont
restaurées par SQL, **pas les octets des photos/sons** : leur récupération
nécessite une copie séparée du stockage ou les ZIP utilisateur.

Les exports de données du workflow excluent désormais les tables internes
`storage.buckets_vectors` et `storage.vector_indexes`, conformément à la
[procédure Supabase](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
Leur présence faisait échouer la restauration avec `permission denied`, même
vides. Le Carnet n'utilise pas le stockage vectoriel ; si cette fonctionnalité
est ajoutée, prévoir sa sauvegarde spécifique avant de l'utiliser. Pour une
ancienne archive, conserver l'original et vérifier ces deux tables avant
toute adaptation de copie ; ne pas retirer d'autres blocs de données.

### Étape 4 — Rebrancher l'application

1. Redéployer les fonctions *edge* : `supabase functions deploy delete-account`
   et `supabase functions deploy ai-identify`. Ressaisir **avant** les secrets
   de `ai-identify` dans le tableau de bord (*Edge Functions → Secrets*,
   liste dans [`ASSISTANT-IA.md`](./ASSISTANT-IA.md) §1.4) : sans eux la
   fonction refuse tout (`misconfigured`). Mettre dans `ALLOWED_ORIGINS`
   l'adresse du site rebranché.
2. Reconfigurer l'authentification (URL du site, redirections) dans le
   tableau de bord.
3. Mettre à jour `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` dans Vercel
   avec les valeurs du **nouveau** projet, puis redéployer. Sans cela,
   l'application continue de pointer vers une base morte.
4. Prévenir les utilisateurs : leurs sessions sont invalidées, ils devront se
   reconnecter. Les photos antérieures ne s'afficheront plus.

---

## 5. Journal des vérifications

À compléter à chaque contrôle, pour garder une trace.

| Date | Action | Résultat |
|---|---|---|
| | Mise en service (§1, étape D) | |
| | Exercice de restauration (§4) | |
| | Copie hors-ligne trimestrielle | |
| | Passage au dépôt privé dédié : premier lancement réussi, archive déchiffrée | |
| | Secret et variable retirés du dépôt de code, anciens artefacts supprimés (§6) | |

---

## 6. Modifier le workflow, et historique du déménagement

### Règle de modification

La version de référence est `docs/ops/depot-sauvegardes/`, dans le dépôt de
code. Le dépôt privé en est une copie **à l'identique**.

1. Modifier la copie de référence par une PR dans le dépôt de code, puis la
   fusionner.
2. Recopier dans le dépôt privé, depuis le dossier du dépôt de code :

   ```bash
   git fetch origin && git archive origin/main:docs/ops/depot-sauvegardes | tar -x -C ../carnet-naturaliste-sauvegardes
   ```

   ```bash
   git -C ../carnet-naturaliste-sauvegardes add .gitignore README.md .github && git -C ../carnet-naturaliste-sauvegardes commit -m "chore: recopie de la version de référence" && git -C ../carnet-naturaliste-sauvegardes push
   ```

   La recopie ajoute et remplace des fichiers, mais **n'en supprime aucun**. Si
   un fichier a été retiré de la référence, le supprimer aussi à la main dans
   le dépôt privé.

3. Lancer une exécution manuelle (§1, étape D) et vérifier qu'elle est verte.

Ne jamais remettre ce workflow dans `.github/workflows/` du dépôt de code. Il
refuserait de tourner (contrôle « dépôt privé »), mais il faudrait aussi y
remettre le secret, ce qu'on veut justement éviter.

### Déménagement de novembre 2026

Jusqu'en novembre 2026, le workflow tournait dans le dépôt de code, qui était
alors privé. Gestes à faire **avant** de rendre ce dépôt public, dans cet ordre
(cocher et dater au §5) :

- [ ] Dépôt privé créé, secret et variable renseignés, premier lancement vert,
      archive téléchargée **et déchiffrée** (§1, étapes 0 à D).
- [ ] Secret `SUPABASE_DB_URL` et variable `BACKUP_AGE_PUBLIC_KEY` supprimés du
      dépôt de code. À partir de là, l'ancien workflow ne peut plus produire
      d'archive.
- [ ] Toutes les exécutions de *Sauvegarde de la base* supprimées du dépôt de
      code, ce qui supprime aussi leurs artefacts. Contrôle :
      `gh api repos/Limuletempedte/carnet-naturaliste/actions/artifacts -q .total_count`
      doit afficher `0`.
- [ ] PR de déménagement fusionnée : le workflow n'est plus dans
      `.github/workflows/` du dépôt de code.
