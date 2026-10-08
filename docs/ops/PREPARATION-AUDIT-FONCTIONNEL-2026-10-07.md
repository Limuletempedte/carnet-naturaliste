# Préparation de l’audit fonctionnel — 7 octobre 2026

La préparation puis les deux passes locales sont documentées dans le
[rapport du 7 octobre](AUDIT-FONCTIONNEL-2026-10-07.md) et le
[rapport complémentaire du 8 octobre](AUDIT-FONCTIONNEL-2026-10-08.md).
Les correctifs du 8 octobre sont proposés en PR, sans fusion.
**Restent ouverts : PERF-01 à 10 000 observations et les essais sur le téléphone réel.**
Les sections de préparation ci-dessous restent historiques ; la matrice
résume les résultats cumulés, avec les limites propres à chaque essai.

## Signalements utilisateur ajoutés le 7 octobre 2026

Ces quatre points sont ajoutés à la demande de l’utilisateur. Ils ont été examinés dans la première passe ; voir les résultats dans le rapport.
L’utilisateur précise utiliser la PWA installée sur téléphone, probablement
via Chrome. Le modèle et la version restent inconnus.

| ID | Signalement | Vérification prévue / attendu |
|---|---|---|
| SIG-01 | Le bouton « Enregistrer et ajouter une autre » prend trop de place sur téléphone. | Vérifier le bas du formulaire sur petit écran, avec et sans clavier ; garder les actions lisibles, accessibles et compactes, sans débordement. |
| SIG-02 | Avec le système en mode sombre, les barres de recherche de la carte et d’autres vues deviennent noires et détonnent avec l’interface. | Inventorier les champs concernés ; comparer thème système clair/sombre et thème de l’application ; vérifier fond, texte et contraste cohérents. |
| SIG-03 | Dans l’onglet Carte, le mode « auto » affiche un fond portant un message d’absence d’API. | Identifier le fournisseur et relever le message exact et les réponses réseau ; vérifier le choix automatique du fond et le comportement si une clé ou un fournisseur est indisponible. Ne pas conclure d’avance à une clé manquante. |
| SIG-04 | L’utilisateur soupçonne que le hors ligne ne fonctionne plus. | Priorité de diagnostic : chargement en ligne puis mode avion, rechargement et réouverture, lecture du carnet, médias déjà chargés, nouvelle saisie et synchronisation au retour réseau. Préserver les données et caches avant diagnostic. |

SIG-04 reste une **régression suspectée**, distincte du défaut du dispositif
de test PWA décrit ci-dessus et des anciens délais hors ligne/ZIP. Aucun lien
causal n’est établi entre ces trois sujets. La disponibilité hors ligne des
fonds cartographiques externes doit aussi être distinguée de celle du carnet.

## Code et PR vérifiés

- [PR #96](https://github.com/Limuletempedte/carnet-naturaliste/pull/96) :
  `MERGED`, fusion le 1er octobre 2026 à 16 h 35, heure de Paris.
  CI Node 20 et 22 et contrôle Vercel de la PR réussis.
- `origin/main` récupéré le 7 octobre :
  `8a614628edf83e8bdb4ff40553a84a30e0ddb16d`, commit de fusion de #96.
  Les sept pièces brutes du manifeste `preuves-reprise-pr82-2026-10-01.json`
  ont la bonne empreinte SHA-256 sur ce code.
- Copie utilisée : `/home/eliotserive/Documents/Codex/2026-09-11/b/work/security-fixes`.
  Branche locale : `codex/functional-audit-preparation-20261007`, sans branche
  distante de suivi. La branche de passation et les notes locales sont conservées.
- La PR #82 reste ouverte ; aucune fermeture ni fusion effectuée.
- Aucun commit, push, déploiement, changement de dépendance ou accès aux données
  de production. Les consultations GitHub concernent les métadonnées des PR.

## Laboratoire effectivement préparé

Sept conteneurs existants `supabase_*_cn_security_fixes_20260918` redémarrés :
`db`, `inbucket`, `auth`, `rest`, `storage`, `pg_meta`, `kong`.
Volumes conservés, aucune réinitialisation, migration ou régularisation rejouée.
`edge_runtime` reste arrêté, comme avant cette préparation.

PostgreSQL a détecté l’arrêt précédent et terminé sa récupération automatique.
Les refus de connexion au tout début correspondent à cette récupération ;
`pg_is_in_recovery()` vaut ensuite `false` et les API répondent.
Les six services possédant un contrôle de santé Docker sont `healthy` ;
REST n’en possède pas et a été vérifié par des requêtes authentifiées réelles.
Le bucket `photos` reste privé et RLS est activé sur `observations`.

La base était vide avant préparation : zéro compte, observation et objet média.
Les nouvelles données appartiennent exclusivement à cette campagne.

| Élément | État préparé |
|---|---|
| API utilisée | `http://127.0.0.1:54321` |
| PostgreSQL | port local `54322` |
| Boîte mail de test | `http://127.0.0.1:54324` |
| Comptes A et B | Deux adresses aléatoires `@example.test`, mots de passe fictifs aléatoires |
| Compte A | Quatre observations : faune, flore, fonge, sans GPS ; une date au 29 février 2024 |
| Compte B | Deux observations distinctes : faune et flore |
| Médias | Une image JPEG artificielle et un WAV silencieux, stockés dans le bucket privé |
| Import à préparer | JSON valide de quatre observations, JSON vide, JSON invalide |
| Volume | JSON de 10 000 observations fictives, conservé sur disque et non importé |
| Build | Bundle PWA compilé pour le labo, sans chargement des fichiers `.env` du projet |

Les ports Docker préexistants sont publiés sur toutes les interfaces de l’hôte ;
leur configuration n’a pas été changée. « Local » signifie ici indépendant de
la production, pas un réseau Docker dépourvu de tout accès extérieur.
Les scripts imposent exactement l’API `http://127.0.0.1:54321` et refusent
les redirections. Les contrôles navigateur utilisent un profil neuf, un proxy
qui refuse les sorties externes, et les fixtures CAPTCHA déjà présentes.
Le serveur temporaire écoute uniquement sur `127.0.0.1` et restreint
`connect-src` à lui-même et à l’API locale.

Le CAPTCHA simulé permet les parcours de préparation, mais ne valide pas le
vrai fournisseur ni la configuration CAPTCHA de production. Les intégrations
externes, les e-mails réels et la suppression via Edge Function restent hors
de cette vérification. Aucun secret de production n’a été demandé ni utilisé.

## Preuves et commandes locales

Répertoire de travail hors dépôt :
`/home/eliotserive/Documents/Codex/2026-09-11/b/work/functional-audit-20261007`.

- `pr96.json` : état GitHub et contrôles de la PR.
- `health-before.json`, `health-after.json` : état Docker, récupération et compteurs SQL.
- `build.log` : compilation PWA et contrôle du bundle. Aucune clé administrative
  locale ni URL Supabase hébergée détectée dans les fichiers JS/HTML.
- `preparation.json` : comptes/volumes créés, relecture par compte et empreintes des fixtures.
- `smoke-browser.json`, `smoke-browser.log` : dernier contrôle navigateur,
  en échec sur la prise de contrôle du worker.
- `laboratoire-pret.png` : capture du premier essai réussi, avant correction
  du décodage des chemins du serveur de test ; certains pictogrammes y manquent.
- `accounts.local.json` : identifiants **fictifs**, fichier privé mode `0600`,
  hors dépôt ; ne pas copier son contenu dans un rapport.
- `fixtures/` : fichiers à utiliser dans les futurs parcours d’import/médias/volume.

Depuis ce répertoire :

```sh
node build-local.mjs
node user-reports-after.mjs
node offline-full.mjs
node functional-flows.mjs
```

Le contrôle navigateur ouvre et ferme son serveur et son profil temporaires.
Le laboratoire Docker reste démarré et les comptes fictifs restent disponibles.
`prepare-fixtures.mjs` a déjà été exécuté : il refuse d’écraser le manifeste
des comptes existants. **Ne pas le relancer pour commencer l’audit.**
Après l’audit, `node cleanup-fixtures.mjs` retire seulement les objets recensés
et les deux comptes de cette campagne, après vérification de leurs identités.
Il ne supprime aucun volume et n’arrête aucun autre service.

Le premier essai de préparation a rencontré un refus de lecture administrative
de `observations` : les contrôles utilisent désormais les comptes authentifiés,
sans modifier les permissions. L’image PNG initiale a été refusée par la liste
des formats du bucket ; elle a été remplacée par un JPEG, sans modifier cette
liste. Le compte partiel de cet essai a été nettoyé avant la préparation finale.

### Résultats de préparation obtenus

- Build PWA réussi : 77 entrées précachées, environ 2 690 Kio.
- Relecture API réussie : quatre observations pour A, deux pour B, chaque
  réponse ne contenant que les observations du compte concerné.
- Chromium Linux `153.0.8010.12` : connexion à A et affichage de ses quatre
  observations, témoin de B absent, aucune erreur JavaScript non interceptée
  pendant ce parcours. Ce résultat ne valide pas tout le rendu graphique.
- Le premier contrôle du worker sans renavigation a expiré. Un essai avec
  activation puis rechargement a réussi. La capture a révélé un défaut du
  serveur de test : les chemins avec accents/espaces n’étaient pas décodés.
  Ce défaut du serveur temporaire est corrigé, sans modifier l’application.
- Les contrôles suivants échouent en 15 secondes : worker `activated`, scope
  correct, mais `navigator.serviceWorker.controller` absent après rechargement
  et aussi après ouverture d’un nouvel onglet. Les diagnostics sont conservés
  dans `smoke-browser-reload-diagnostic.*` et `smoke-browser.json`.
  Cause non isolée ; examiner en priorité les interactions entre routage
  Playwright, proxy local et service worker. Ne pas augmenter les délais ni
  transformer le succès intermédiaire en validation PWA finale. Aucun lien
  n’est établi avec les deux anciens incidents hors ligne/ZIP.
- Contrôle SQL final : deux comptes, six observations, deux objets média,
  bucket privé et RLS toujours actifs ; PostgreSQL hors récupération.
- Node `22.23.2`, CLI Supabase `2.109.1`, dépendances existantes conservées.

`npm run check` n’a pas été relancé : aucun code applicatif n’a changé et aucun
commit n’est créé. La compilation réussie et le contrôle navigateur partiel
ci-dessus sont des vérifications fraîches ; les 514 tests cités dans la passation restent le
résultat historique du 1er octobre.

## Matrice de suivi

Pour chaque parcours, conserver : commit du build, jeu de données, étapes,
attendu, obtenu, capture/journal/fichier produit et limites. Distinguer `PASS`,
`FAIL`, `BLOQUÉ` et `NON EXÉCUTÉ`. Les résultats ci-dessous distinguent les contrôles de la première passe
et ceux qui restent à exécuter ; PASS désigne uniquement le périmètre local décrit.

| ID | Parcours / données | Attendu | Preuve à conserver | Résultat / limite |
|---|---|---|---|---|
| OBS-01 | Créer faune/flore/fonge puis recharger | Champs et comptages conservés | Capture et relecture API du compte | PASS local : créations UI des trois groupes et date bissextile |
| OBS-02 | Modifier une observation, annuler une autre saisie | Modification persistée ; annulation sans effet | Avant/après et rechargement | PASS local : édition et annulation sans écriture |
| OBS-03 | Supprimer puis annuler une suppression | Seule la confirmation efface l’observation choisie | Liste et API | PASS local : annulation puis confirmation vérifiées |
| OBS-04 | Détails, recherche, filtres combinés et remise à zéro | Résultats cohérents avec le jeu connu | IDs attendus/obtenus | PASS Chromium/Edge : recherche, année, statut, groupe et combinaisons |
| OBS-05 | Carte, galerie, calendrier et statistiques | Même ensemble de données, totaux justes, absence de GPS gérée | Captures et calcul indépendant | PASS local sur quatre observations : carte, galerie, calendrier, statistiques |
| OBS-06 | Champs serveur facultatifs nuls, date bissextile | Formulaire exploitable sans erreur ni perte | Jeu dédié et capture | Défaut confirmé puis corrigé en PR : champs nuls et heure vide |
| UI-01 / SIG-01 | Bouton « Enregistrer et ajouter une autre » sur téléphone | Actions compactes et accessibles, sans débordement | Captures avec/sans clavier et dimensions écran | Corrigé et vérifié 320–430 px ; clavier réel non testé |
| UI-02 / SIG-02 | Recherches carte et autres vues, système clair/sombre | Couleurs cohérentes avec le thème de l’application et texte lisible | Captures comparatives des champs concernés | Corrigé et vérifié sur liste/carte |
| MAP-01 / SIG-03 | Fond de carte en mode « auto » | Fond utilisable, gestion explicite d’un fournisseur indisponible | Message exact, fournisseur et statuts réseau sans clés | Corrigé ; URL/attribution/thème vérifiés, tuiles externes non chargées |
| SYN-01 | Créer/modifier hors ligne, revenir en ligne | File vidée ; ni perte ni doublon | IndexedDB, réseau et API | PASS local : création et édition, déconnexion annulée, reprise |
| SYN-02 | Erreur HTTP 503 / délai pendant sauvegarde | Saisie conservée et erreur compréhensible | Journal borné, puis relecture | PASS local : 503 et réponse retardée |
| SYN-03 | Deux onglets modifient une observation | Comportement de conflit explicite, données vérifiables | Chronologie et valeur finale | Défaut confirmé puis corrigé en PR : contrôle atomique de version |
| SYN-04 | Déconnexion puis connexion B ; requête A retardée | Aucune donnée de A visible ou écrite dans B | Captures et IDs par compte | PASS local : passage A/B avec réponse A retardée |
| PWA-01 | Fermer/rouvrir le profil hors ligne après chargement | Carnet et médias déjà chargés disponibles | Profil dédié et capture | PASS local : fermeture/réouverture hors ligne, observations et médias |
| PWA-03 / SIG-04 | Mode avion, rechargement/réouverture, saisie puis retour réseau sur téléphone | Carnet utilisable selon les capacités prévues, saisies conservées et synchronisées | Étapes exactes, version navigateur/PWA et état du worker | Téléphone NON TESTÉ ; parcours local validé seulement |
| PWA-02 | Mise à jour du worker pendant une saisie | Proposition de mise à jour ; saisie préservée avant accord | Deux builds locaux, vidéo/captures | PASS Chromium/Edge : proposition et saisie préservée avant accord |
| MED-01 | Photo/son en ligne, ancien format de référence | Chargement authentifié, aucune ouverture publique | Capture, lecture binaire et réseau | PASS local : photo/son via références historiques, bucket privé |
| MED-02 | Média ajouté hors ligne puis synchronisé | Média envoyé une fois et référence finale persistée | File média, API et SHA-256 | PASS local : nouveaux médias ZIP hors ligne, rechargement et synchronisation |
| MED-03 | Quota/expiration du cache | Éviction prévue ; message clair ; observation préservée | État IndexedDB borné | PASS local : 50 entrées, 100 Mio, expiration 30 jours |
| IO-01 | Export JSON puis import dans un compte neuf | Équivalence des champs, comptages et dates | JSON et comparaison structurée | PASS local via ZIP/JSON dans un compte neuf ; champs essentiels vérifiés |
| IO-02 | Export XLSX/PDF/CSV/GeoJSON/Darwin Core | Fichiers lisibles, lignes et colonnes cohérentes | Lecture réelle des fichiers | PASS local : JSON/XLSX/PDF/DwC CSV/GeoJSON réellement ouverts |
| IO-03 | ZIP avec photo/son puis restauration | Références résolues et médias identiques | ZIP ouvert, empreintes et rendu | PASS local : compte neuf, collision d’ID traitée, octets médias identiques |
| IO-04 | Ancienne sauvegarde, champs nuls, fichier vide/invalide | Acceptation explicable ou refus sans écriture partielle | Rapport d’import et compteurs | PASS sur corpus fictif ancien/vide/invalide ; XLS refusé explicitement |
| IO-05 | Import volumineux et annulation | Limites respectées ; interface réactive ; annulation effective | Mesures et compteurs | Limites et annulation PASS ; persistance 10 000 atteinte puis recherche en échec |
| IO-06 | En-têtes Excel `__proto__` / `constructor` | Lecture maîtrisée sans erreur ni altération inattendue | Classeur fictif et résultat | Défaut confirmé puis corrigé en PR : valeurs constructor/__proto__ |
| BAK-01 | Consulter l’état des sauvegardes GitHub | Dates, réussite, artefacts disponibles documentés | Métadonnées des exécutions | PASS métadonnées : 4 exécutions réussies, artefact du 04/10 disponible |
| BAK-02 | Sauvegarder puis restaurer les données fictives | Comptes/observations/RLS retrouvés sur une cible séparée | Dump fictif, journaux et comparaisons | Défauts corrigés en PR ; chaîne chiffrée/restauration fictive vérifiée |
| BAK-03 | Restaurer références et fichiers média | Distinguer sauvegarde SQL et sauvegarde des fichiers | Comparaison SQL + Storage + ZIP | PASS SQL et politiques ; octets médias récupérés séparément par ZIP |
| PERF-01 | 1 000 puis 10 000 observations | Temps, mémoire et fluidité mesurés sans prétendre à un SLA | Mesures sur même matériel | ÉCHEC : recherche dépasse 15 s à 10 000 ; plan distinct |
| COMP-01 | Vue mobile/tactile puis appareils disponibles | Formulaires, dialogues, clavier et défilement utilisables | Captures et version navigateur | Partiel : émulation mobile seulement ; téléphone/clavier réels non testés |
| COMP-02 | Firefox, Safari/iOS, Android installé | Résultat par plateforme effectivement disponible | Versions et preuves dédiées | Chromium/Edge testés ; Firefox vues principales ; Safari/iOS non disponibles |

Priorité ajoutée après les signalements : qualifier le dispositif PWA puis
reproduire SIG-04 ; examiner ensuite SIG-01 à SIG-03 dans les parcours associés.
Ordre général : observations → synchronisation → PWA/médias → import/export
→ restauration → volume/compatibilité. Ne pas réexécuter les anciens scripts
de reproduction des failles historiques. En cas de délai hors ligne/ZIP,
réutiliser les diagnostics existants, garder leurs limites temporelles et
qualifier l’incident avant tout correctif. Aucun lot applicatif à modifier
implicitement pendant cette préparation.

Références : [passation](REPRISE-AUDIT-FONCTIONNEL.md),
[diagnostic hors ligne](DIAGNOSTIC-HORS-LIGNE-2026-10-01.md),
[runbook sauvegarde/restauration](RUNBOOK-sauvegarde-restauration.md),
[documentation Supabase locale](https://supabase.com/docs/guides/local-development/cli/getting-started).
