# Audit fonctionnel — contrôles complémentaires du 8 octobre 2026

La campagne locale prévue a été exécutée sur des données fictives. Elle a
confirmé quatre défauts, corrigés dans trois lots, et un problème de fluidité
à 10 000 observations qui reste ouvert. **Le téléphone réel n’a pas été testé**
(réponse utilisateur : « Pas encore testé »). Ce rapport n’est donc pas un
certificat de bon fonctionnement sur tous les appareils.

Base : `db677f05b7124c3c8b4712a957cf6e6ead2b4c1c` (#97).
Aucune fusion, migration distante, modification de donnée de production ou
relance du workflow de sauvegarde réel. Les PR de correctifs restent à relire : [#98 — données/imports](https://github.com/Limuletempedte/carnet-naturaliste/pull/98),
[#99 — conflits](https://github.com/Limuletempedte/carnet-naturaliste/pull/99),
[#100 — restauration](https://github.com/Limuletempedte/carnet-naturaliste/pull/100).

## Défauts reproduits et lots de correction

| Lot | Avant correction | Correction et preuve |
|---|---|---|
| Données / Excel | `constructor` et `__proto__` dans une cellule pouvaient produire une fonction/un objet via le prototype de la table de synonymes et casser le résultat du Worker. | Recherche limitée aux propriétés propres ; trois tests de régression et import XLSX réel validés. |
| Données anciennes | Un nom latin nul faisait échouer `trim()` à l’ouverture du formulaire. Après normalisation, une heure vide était refusée par PostgreSQL. | Normalisation des champs facultatifs à la lecture, types internes rendus fidèles au schéma nullable, heure vide envoyée comme NULL. Deux tests et édition/enregistrement réels d’une ligne avec champs nuls validés. |
| Synchronisation | Le second de deux onglets écrasait silencieusement la modification récente du premier. | Filtre atomique sur `updated_at`, conservation de la nouvelle version après sauvegarde, message de conflit et maintien du brouillon. Conflit en ligne et conflit au retour réseau reproduits puis validés. |
| Restauration | Le COPY de `storage.buckets_vectors` faisait annuler toute la transaction. Les politiques personnalisées Storage étaient absentes après restauration standard. | Exclusion des deux tables internes vectorielles, complément SQL de restauration des quatre politiques actuelles et runbook complété. Exercice complet réussi sur une seconde instance. |

Le contrôle de concurrence utilise la version déjà chargée. Les anciennes
entrées de cache/file sans `updatedAt` restent compatibles, mais ne permettent
pas de détecter rétroactivement un conflit. Aucun système de fusion automatique
des contenus ni nouvelle API n’a été ajouté. L’utilisateur garde la saisie et
doit comparer/recharger avant de réessayer.

## Sauvegarder et récupérer réellement les données

Source : laboratoire existant `cn_security_fixes_20260918`.
Cible neuve : `cn_restore_audit_20261008`, API locale sur le port 55321.
La base source n’a pas été réinitialisée.

1. Exports `roles.sql`, `schema.sql`, `data.sql` par Supabase CLI 2.109.1,
   avec `--use-copy` pour les données, comme le workflow.
2. Archive tar chiffrée puis déchiffrée avec age 1.1.1 et une clé de test locale ;
   les archives avant/après sont identiques octet pour octet.
3. Première restauration en une transaction : échec sur une table vectorielle
   interne, sans restauration partielle. Les deux tables exclues sont vérifiées
   vides dans le laboratoire ; aucune fonctionnalité vectorielle n’est utilisée.
4. Nouvel export avec exclusions, puis restauration : six observations, deux
   comptes, deux identités, un bucket et deux métadonnées d’objets identiques.
   Comparaisons sur les lignes complètes, empreintes conservées sans divulguer
   les données Auth.
5. Politiques des observations identiques ; policies Storage manquantes
   rétablies avec le complément versionné. Bucket toujours privé.
6. Connexion aux deux comptes restaurés : A voit quatre observations, B deux.
   Upload/lecture d’une photo de test par son propriétaire réussis ; l’autre
   compte et l’accès anonyme sont refusés. Objet temporaire retiré ensuite.

Les octets des anciennes photos/sons ne sont **pas** dans la sauvegarde SQL.
Ils ne sont pas considérés restaurés parce que leurs références existent.
Séparément, un ZIP utilisateur a été restauré dans un compte fictif neuf :
quatre observations, nouveaux IDs en cas de collision, bon propriétaire,
photo/son identiques aux fichiers sources et affichage vérifié.

Les archives réelles de production n’ont été ni téléchargées ni déchiffrées :
cet exercice valide la procédure corrigée sur données fictives, pas leur contenu.
Référence : [procédure Supabase](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

## Parcours complémentaires validés

- Création UI en faune, flore et fonge, date bissextile, rechargement et annulation
  d’une édition sans écriture.
- Recherche, année, statut, groupe et combinaison donnant zéro résultat, puis
  remise à zéro ; carte regroupant les trois observations géolocalisées,
  statistiques, calendrier et galerie sur le même jeu de quatre observations.
- HTTP 503 : modification mise en attente puis reprise, une seule ligne finale.
- Réponse A retardée après déconnexion et connexion de B : aucune donnée de A
  dans l’interface de B.
- Édition hors ligne, annulation de déconnexion et reprise réseau.
- Conflit au retour réseau : version serveur préservée, une entrée en attente,
  brouillon encore visible après rechargement hors ligne.
- Mise à jour du worker proposée pendant une saisie : aucune activation/recharge
  imposée avant l’accord, contenu du formulaire conservé.
- Photo et son ajoutés hors ligne par import ZIP : références durables, rendu
  après rechargement et octets identiques après synchronisation. Le scénario
  média emploie des IDs neufs ; les collisions intercomptes ont été testées
  séparément lors de la restauration en ligne.
- Cache médias : plafond de 50 entrées, plafond de 100 Mio et expiration à
  30 jours contrôlés en IndexedDB réelle, avec données artificielles bornées.
- JSON malformé, vide, invalide, plus de 10 000 lignes et plus de 15 Mio : aucune
  écriture. Le JSON vide peut afficher une prévisualisation sans lignes ;
  confirmer ne produit aucune importation. XLS historique : refus explicite.
- XLSX atypique : import réussi avec valeurs de repli. Ancien JSON sans champs
  récents et avec un identifiant ancien : prévisualisation valide, annulation
  sans écriture. Cela ne certifie pas tous les formats historiques possibles.
- Vrai Worker volontairement muet : annulation effective, puis arrêt automatique
  mesuré à environ 30,1 secondes sur un autre essai, sans écriture.

Les cas déjà validés le 7 octobre (exports réels et parcours hors ligne de base)
sont conservés dans le [rapport initial](AUDIT-FONCTIONNEL-2026-10-07.md).

## Performances : limite à conserver ouverte

| Jeu | Résultat mesuré sur cette machine |
|---|---|
| 1 000 observations | Analyse du fichier : 9,2 s ; import serveur : 61,9 s ; trois rechargements entre 1,95 et 2,05 s ; recherche entre 0,12 et 0,70 s. |
| 10 000 observations | Premier essai arrêté par le budget d’essai de 180 s. Un second essai, borné à 900 s pour l’import d’après la mesure à 1 000, a atteint la vérification des 10 000 lignes serveur, puis échoué sur une action de recherche limitée à 15 s. Durée totale avant échec : 625,4 s. |

Le second rapport ne conserve pas un temps d’import isolé : ne pas présenter
625,4 s comme un temps d’import pur. La trace atteint la recherche après le
contrôle du compte serveur ; les observations temporaires sont ensuite nettoyées.
Les délais de l’application et les anciens délais des tests média n’ont pas
été augmentés.

**PERF-01 reste en échec.** Le composant Liste construit actuellement toutes
les lignes, y compris 10 000 ; c’est une piste de correction concrète, pas une
preuve que tout le ralentissement provient de ce seul facteur. Le changement
d’affichage est décrit dans un [plan distinct](PLAN-PERFORMANCE-GROS-CARNETS.md).
Ces mesures de laboratoire ne constituent pas un engagement de performance mobile.

## Navigateurs et limites

| Environnement | Portée |
|---|---|
| Chromium 153.0.8010.12, Linux, profils persistants neufs | Campagne complète ci-dessus ; simulations réseau et stockage locaux. |
| Microsoft Edge 154.0.4258.62, Linux | Recherche/filtres/vues et proposition de mise à jour PWA pendant une saisie. |
| Firefox 156.0.1, Linux, profil WebDriver neuf | Connexion par session locale, quatre observations et accès aux cinq vues ; pas de campagne hors ligne complète sur Firefox. |
| Téléphone/PWA installé de l’utilisateur | Non testé, utilisateur indisponible pour cette vérification. |
| Safari/iOS et autres appareils | Non disponibles, non testés. |

Les navigateurs d’essai utilisent des profils jetables et bloquent les sorties
Internet. Cartographie distante, fournisseurs taxonomiques et CAPTCHA réels
ne sont pas validés par ces simulations. Aucun cache du téléphone n’a été effacé.

## Validation et preuves

Contrôle combiné des correctifs : `npm run check` réussi, **524 tests dans
74 fichiers**, TypeScript, lint et build PWA. Chaque PR reçoit aussi sa CI
indépendante. Les nombres d’une PR isolée diffèrent du total combiné.

[Synthèse structurée et empreintes](preuves-audit-fonctionnel-2026-10-08.json).
Journaux, fichiers exportés et scripts complets conservés hors dépôt dans
`/home/eliotserive/Documents/Codex/2026-09-11/b/work/functional-audit-20261008`.
Les fichiers `.local`, les clés, dumps et profils ne doivent pas être publiés.
Les erreurs dues aux sélecteurs du scénario (onglet encore en transition,
classe du cluster, champs masqués) sont distinguées des défauts applicatifs.

La clôture complète demande encore le traitement de PERF-01 et la vérification
sur téléphone. Les anciens incidents intermittents hors ligne/ZIP restent
« non reproduits, cause non isolée » ; aucune nouvelle cause commune n’est affirmée.

État final du laboratoire : comptes temporaires retirés, source conservée avec
deux comptes et six observations. La seconde instance est arrêtée, conteneurs
et volumes conservés pour vérification ultérieure.
