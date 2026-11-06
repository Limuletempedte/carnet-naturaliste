# Sauvegardes du Carnet Naturaliste (dépôt privé)

Ce dépôt **doit rester privé**. Il ne contient pas de code d'application :
seulement le workflow qui sauvegarde chaque dimanche la base Supabase du
[Carnet Naturaliste](https://github.com/Limuletempedte/carnet-naturaliste).

- **Ce qui tourne ici** : `.github/workflows/sauvegarde-base.yml`. Il exporte la
  base, vérifie qu'elle contient bien des comptes et des observations, la
  chiffre avec `age`, puis dépose l'archive dans l'onglet **Actions** de ce
  dépôt. GitHub la supprime automatiquement au bout de 35 jours.
- **Pourquoi un dépôt séparé** : une archive déposée dans l'onglet Actions a la
  même visibilité que son dépôt. Le dépôt de code est public, celui-ci ne
  l'est pas. Le workflow vérifie lui-même que le dépôt est privé et s'arrête
  sinon.
- **Réglages** (*Settings → Secrets and variables → Actions*) : le secret
  `SUPABASE_DB_URL` et la variable `BACKUP_AGE_PUBLIC_KEY`.
- **Clé de déchiffrement** : la clé privée `age` n'est **jamais** sur GitHub.
  Elle est chez le responsable du traitement, dans son gestionnaire de mots
  de passe et sur une copie hors ligne.

## Restaurer, en bref

Le mode d'emploi complet est
[`docs/ops/RUNBOOK-sauvegarde-restauration.md`](https://github.com/Limuletempedte/carnet-naturaliste/blob/main/docs/ops/RUNBOOK-sauvegarde-restauration.md),
dans le dépôt de code. On le retrouve aussi dans toute copie locale de ce
dépôt de code.
L'essentiel, au cas où il serait inaccessible :

1. Télécharger l'archive voulue (onglet **Actions** → l'exécution → artefact
   `sauvegarde-base-AAAA-MM-JJ`), puis la décompresser.
2. Déchiffrer :
   `age --decrypt -i cle-sauvegarde-privee.txt -o sauvegarde.tar.gz sauvegarde-AAAA-MM-JJ.tar.gz.age`
   puis `tar -xzf sauvegarde.tar.gz` → `roles.sql`, `schema.sql`, `data.sql`.
3. Sur un **nouveau** projet Supabase (région `eu-central-1`), avec sa chaîne
   *Session pooler* (port 5432) :
   `psql --single-transaction --variable ON_ERROR_STOP=1 --file roles.sql --file schema.sql --command 'SET session_replication_role = replica' --file data.sql --dbname "<chaîne du nouveau projet>"`
4. Restaurer les droits du stockage (`supabase/restore-storage-policies.sql` du
   dépôt de code), redéployer les fonctions *edge*, rebrancher Vercel : voir
   le runbook, §4.

## Modifier le workflow

Ne pas le modifier ici directement. La version de référence est dans le dépôt
de code, `docs/ops/depot-sauvegardes/`. On la modifie là-bas par une PR, puis
on la recopie ici **à l'identique** et on lance une exécution manuelle
(*Actions → Sauvegarde de la base → Run workflow*).
