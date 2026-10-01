# Régularisation terminée — 1er octobre 2026

Le point 1 est terminé. À **15 h 02 (Europe/Paris)**, le dépôt et le projet
Supabase `xowiezzqehadcfnbkijo` enregistrent les mêmes dix versions. Aucun fichier
de migration ne reste absent de l'historique hébergé. Le point 2 (délais
intermittents hors ligne / export ZIP) n'a pas été commencé.

## Autorisation et opération

La PR #92 a été fusionnée par l'utilisateur au commit
`ecf832d3bfd9d11d33fbaaeadd91fab2314030fc`. L'utilisateur a ensuite autorisé la
poursuite du point 1, avec arrêt avant le point 2.

Les quatre versions suivantes ont été ajoutées à
`supabase_migrations.schema_migrations`, avec leur nom et le SQL du fichier
enregistré **comme texte, sans l'exécuter** :

- `20240101000000_initial_schema`
- `20240201000000_phase2_indexes_constraints`
- `20240325000000_add_weather_condition`
- `20240501000000_phase5_neuroptera_label`

C'est une régularisation d'un état déjà satisfait, datée du 1er octobre 2026.
Les préfixes 2024 sont les identifiants des fichiers ; ils ne prouvent pas une
exécution réelle à ces dates. Les limites historiques et la différence
d'idempotence de `theme5_sync_integrity` restent décrites dans le
[diagnostic initial](HISTORIQUE-MIGRATIONS-2026-10-01.md).

Le connecteur Supabase authentifié a exécuté le
[SQL exact de régularisation](regularisation-historique-2026-10-01.sql), au lieu
de demander des identifiants de connexion supplémentaires pour la CLI. Ce SQL
réalise les quatre insertions d'historique dans un seul bloc atomique : contrôle
des versions, noms et empreintes SQL préexistants, verrou sur le seul historique
avec délai de cinq secondes, vérification du bucket privé, contrôle du nombre
final et préservation intégrale des six anciennes lignes. Il refuse une seconde
exécution. Aucune migration supplémentaire n'a été créée par `apply_migration`.

## Essai local préalable

Une base temporaire distincte `cn_history_validation_20261001` a été créée sur
le serveur PostgreSQL du laboratoire existant. Le socle Auth/Storage provenait
de son schéma local, sans données ; les règles Storage propres à l'application
ont été retirées de ce socle pour être créées par les migrations elles-mêmes.
Les dix fichiers ont ensuite été exécutés dans l'ordre avec succès. Un compte,
une observation et une entrée de média fictifs ont servi de témoins.

L'historique de six entrées a été reproduit ; le SQL exact destiné à la production
l'a fait passer à dix. Les six anciennes lignes (y compris l'auteur fictif), le
schéma, les politiques, les paramètres du bucket et les empreintes des données
fictives sont restés identiques. Trois essais négatifs ont confirmé le refus et
l'absence de modification persistante : seconde exécution, SQL historique altéré,
bucket rendu public dans la transaction d'essai.

Avec la CLI 2.109.1, `migration list` montre dix correspondances et
`db push --dry-run` répond `Local database is up to date.` sur cette base isolée.
La base temporaire a été supprimée après vérification ; la base du laboratoire
existant n'a pas été réinitialisée. Les journaux locaux sont conservés hors Git
dans `work/history-validation-20261001` à côté de la copie de travail.

## Vérifications en production

- Les métadonnées et les six migrations ont été relues immédiatement avant
  l'opération : état identique au relevé préalable.
- Dix versions et noms concordent avec les dix fichiers du dépôt ; zéro version
  locale manquante et zéro version hébergée supplémentaire.
- Les six anciennes lignes sont intégralement inchangées, tous champs compris.
- Les quatre nouveaux textes enregistrés sont identiques aux fichiers locaux.
- Colonnes, contraintes, index, trigger et fonction, RLS et politiques inchangés.
- Bucket `photos` toujours privé ; limite de 20 Mio et types MIME inchangés.
- Empreintes agrégées des lignes d'observations et des métadonnées des objets
  Storage identiques avant/après. Aucun fichier média n'a été téléchargé pour ce
  contrôle ; les octets des objets n'ont pas été réinspectés.

Preuves : [relevé avant](preuves-regularisation-2026-10-01-avant.json) et
[résultat des comparaisons](preuves-regularisation-2026-10-01-resultat.json).
Elles ne contiennent ni observation, ni secret, ni identifiant de compte/média.

Le contrôle hébergé utilise les requêtes en lecture seule et `list_migrations`
du connecteur. Aucun `db push --dry-run --linked` n'a été exécuté contre la
production ; la simulation CLI a porté sur le laboratoire. Aucun push réel ni
réinitialisation de la base de production n'a eu lieu.

## Livraison et arrêt

La PR de compte rendu ne modifie aucun fichier applicatif ni aucune migration.
Sa fusion n'est pas nécessaire pour activer la régularisation, déjà effectuée.
Elle reste soumise à fusion manuelle. `npm run check` est réussi : TypeScript,
lint, 514 tests dans 73 fichiers, build et service worker PWA. Avertissement de
taille des chunks au build, sans échec. `git diff --check` est réussi.

Arrêt conformément à la demande : aucun diagnostic des deux délais intermittents,
aucun audit fonctionnel supplémentaire et aucune activation de MFA.
