# Historique des migrations Supabase — 1er octobre 2026

## Résultat et périmètre

Comparaison en lecture seule du projet `xowiezzqehadcfnbkijo` avec
`origin/main` au commit `e0aefeadc2661943e8895a4df53b41081fa98d11`.
Le dépôt contient dix migrations ; la base en enregistre six, toutes sous des
horodatages différents. La migration de privatisation des médias n'est donc pas
le seul écart.

Ce lot renomme les six fichiers correspondants **sans changer un octet de SQL**.
L'ordre d'exécution des dix fichiers reste identique. Aucune requête de mutation,
réparation d'historique, réinitialisation ou migration n'a été exécutée en
production. La fusion de cette PR ne complète pas à elle seule l'historique :
les quatre entrées anciennes restent à régulariser selon la procédure ci-dessous.

Preuve relisible : [instantané des métadonnées et du SQL enregistré](preuves-migrations-2026-10-01.json).
Il ne contient ni secret, ni observation, ni identifiant de compte ou de média.
Les six entrées ont été obtenues par `list_migrations`, puis vérifiées directement
par `SELECT version, name, statements FROM supabase_migrations.schema_migrations`.
Les autres informations proviennent des catalogues PostgreSQL, des paramètres du
bucket et d'un décompte agrégé du libellé taxonomique ancien.

## Correspondances vérifiées

| Migration | Ancienne version du dépôt | Version hébergée et nouveau nom | Comparaison du SQL |
|---|---|---|---|
| phase6_count_breakdown | 20240601000000 | 20260419152657 | Identique hors commentaires et espaces |
| storage_insert_policy_hardening | 20260318100000 | 20260419152704 | Identique hors commentaires et espaces |
| theme5_sync_integrity | 20260404100000 | 20260419152719 | Même résultat attendu ; différence d'idempotence détaillée ci-dessous |
| theme12_observation_fields | 20260420000000 | 20260419152731 | Identique hors commentaires et espaces |
| audit_v2_storage_hardening | 20260611100000 | 20260611093249 | Identique hors commentaires et espaces |
| security_private_media | 20260929142533 | 20260930135528 | Identique hors commentaires et espaces |

Pour `theme5_sync_integrity`, le SQL enregistré entoure quatre ajouts de
contraintes de blocs `DO … EXCEPTION WHEN duplicate_object THEN NULL` : longueur
de `location`, `comment`, `latin_name`, et groupe taxonomique non nul. Le fichier
local ajoute directement ces contraintes. La validation des contraintes, la FK
avec cascade, la règle UPDATE et le trigger sont identiques hors commentaires et
espaces. La version hébergée tolère donc une contrainte déjà présente ; le fichier
local échouerait dans ce cas. Cette différence historique est conservée et
documentée, pas présentée comme une égalité textuelle. Les quatre contraintes
existent et sont validées en production.

Les références aux anciens noms dans les audits datés restent intactes : elles
décrivent les fichiers examinés à l'époque. Aucun script opérationnel ou test ne
référence ces six anciens chemins.

## Quatre fichiers sans entrée hébergée

| Version / migration | État actuel constaté | Limite de la preuve |
|---|---|---|
| 20240101000000_initial_schema | Table et colonnes initiales présentes, PK/FK, RLS, trigger et bucket présents ; protections ultérieures visibles | Le schéma initial a évolué. Il ne faut surtout pas recréer la table ni remettre le bucket public. La date réelle d'application n'est pas connue. |
| 20240201000000_phase2_indexes_constraints | Les quatre contraintes sont validées ; cinq index attendus présents ; trigger remplacé ensuite par theme5 | Le nettoyage historique des lignes n'est pas prouvable rétrospectivement. Rejouer ce fichier écraserait la protection de created_at ajoutée ensuite. |
| 20240325000000_add_weather_condition | Colonne weather_condition de type text, nullable, présente | Aucune preuve de la date ni du chemin d'application. Rejouer l'ADD COLUMN sans garde échouerait. |
| 20240501000000_phase5_neuroptera_label | Zéro ligne portant actuellement Nervoptère | L'absence du libellé ne prouve pas que cet UPDATE précis a été exécuté ; il est aussi possible qu'aucune ligne n'ait nécessité de correction. |

Ces observations justifient une **régularisation déclarative d'un état déjà
satisfait**, pas une affirmation sur l'exécution exacte des scripts en 2024.
Ne pas supprimer les quatre fichiers : ils restent nécessaires à la création
d'une base neuve.

## Protections vérifiées pendant la comparaison

- Bucket `photos` : `public=false`, limite de 20 Mio et liste MIME conservées.
- RLS active sur `public.observations` et `storage.objects`.
- Observations : règles par propriétaire, UPDATE avec `USING` et `WITH CHECK`.
- Médias : lecture/insertion/modification/suppression limitées au préfixe du
  propriétaire ; aucune règle `Public Access` restante. La règle UPDATE n'a pas
  de `WITH CHECK` explicite ; PostgreSQL reprend alors son `USING`.
- Quatorze contraintes présentes et validées ; cinq index applicatifs et la PK.
- Fonction du trigger : mise à jour de `updated_at` et conservation de `created_at`.

Cette vérification porte sur les métadonnées. Elle ne remplace pas l'audit
fonctionnel des médias, de la synchronisation ou des sauvegardes.

## Finalisation proposée après revue et fusion manuelle

La CLI compare les **horodatages**, sans comparer le contenu SQL. La commande
`migration repair --status applied` ajoute une entrée d'historique sans exécuter
le fichier. Voir la [documentation officielle Supabase](https://supabase.com/docs/reference/cli/supabase-migration-repair)
et la [comparaison des versions](https://supabase.com/docs/reference/cli/supabase-migration-list).
Les options ci-dessous ont été vérifiées avec l'aide de la CLI installée 2.109.1.

1. Fusion manuelle de cette PR, puis mise à jour de la copie utilisée pour
   l'administration. Vérifier que le projet lié est bien `xowiezzqehadcfnbkijo`.
   Les identifiants de connexion doivent rester dans les outils locaux, jamais
   dans Git ou le chat.
2. Relire et sauvegarder l'historique courant, puis vérifier à nouveau les
   métadonnées ci-dessus. Arrêter si une nouvelle migration ou une divergence
   apparaît. Faire un essai de régularisation sur une base isolée reproduisant
   cet historique avant l'opération hébergée.
3. Valider explicitement le choix de régulariser ces quatre versions comme
   état de référence déjà satisfait. La commande préparée est :

   ```bash
   ./node_modules/.bin/supabase migration repair --linked --status applied \
     20240101000000 20240201000000 20240325000000 20240501000000
   ```

   **Commande non exécutée dans ce lot.** Ne pas marquer les six anciennes
   versions renommées comme appliquées, et ne supprimer aucune entrée existante.
4. Contrôler avec `supabase migration list --linked` : dix versions présentes
   des deux côtés. Relire les six entrées originales et s'assurer que leur SQL
   est intact. Le contrôle `supabase db push --linked --dry-run` doit annoncer
   zéro migration à appliquer ; ne pas lancer un push réel pour cette opération.
5. Vérifier à nouveau `public=false`, les contraintes, les règles et le trigger.
   Consigner la date de régularisation réelle et les versions ajoutées.

Avant cette finalisation, **ne pas lancer `db push --include-all`** : il tenterait
de rejouer les quatre anciens scripts contre une base existante. Ne pas utiliser
`db reset` ou une réparation globale pour rendre les listes artificiellement
identiques. Pour un autre environnement déjà existant, comparer son propre
historique avant d'y adopter les nouveaux noms.

## Vérifications de ce lot

- Les dix fichiers SQL sont conservés, avec le même contenu et le même ordre.
- Chaque entrée hébergée correspond désormais à un seul fichier local.
- Cinq correspondances ont un SQL identique après retrait des commentaires et
  normalisation des espaces ; la sixième a été relue et qualifiée ci-dessus.
- `npm run check` réussi : TypeScript, ESLint, 514 tests dans 73 fichiers,
  build et génération du service worker PWA. Avertissement de taille des chunks
  au build, sans échec. `git diff --check` réussi.
- Aucun test SQL de reconstruction ni essai de réparation locale réalisé dans
  ce lot de renommage. Ils restent nécessaires avant de finaliser les quatre
  entrées manquantes ; les tests applicatifs ne les remplacent pas.

## Suite : audit fonctionnel

Après clôture de l'historique, préparer un laboratoire avec données fictives et
commencer par les deux délais intermittents documentés dans
[`DEPENDANCES-2026-10-01.md`](../audits/v5/DEPENDANCES-2026-10-01.md) : rechargement
hors ligne et export ZIP au retour du réseau. Ils ne sont pas considérés corrigés.
Puis couvrir observations et filtres, synchronisation/concurrence, médias,
imports/exports, restauration isolée et compatibilité mobile. Les corrections
éventuelles feront l'objet de lots séparés. La MFA reste reportée.
