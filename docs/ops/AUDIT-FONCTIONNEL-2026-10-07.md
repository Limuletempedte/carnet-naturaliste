# Audit fonctionnel — première passe du 7 octobre 2026

**Trois problèmes d’interface corrigés localement. Le parcours hors ligne
complet testé fonctionne au laboratoire ; le problème signalé sur téléphone
reste à reproduire.** Aucune fusion ni modification de production effectuée.
Les trois corrections ont ensuite été publiées dans la [PR #97](https://github.com/Limuletempedte/carnet-naturaliste/pull/97),
commit `807bd40a7c1705bca762b72c77cab5668e240421`, branche
`codex/mobile-ui-map-fixes`. Cette PR contient six fichiers de correctifs UI et
de mentions des fournisseurs ; les présents documents d’audit restent locaux.
Ce rapport ne clôt pas l’ensemble de la matrice d’audit général.

Base : `8a614628edf83e8bdb4ff40553a84a30e0ddb16d`, PR #96 déjà fusionnée.
Branche locale : `codex/functional-audit-preparation-20261007`.
Les changements sont disponibles dans la copie active `security-fixes`.

## Signalements et corrections

| Signalement | Diagnostic / changement | Validation actuelle |
|---|---|---|
| SIG-01 — bouton trop encombrant | À 390 px, la barre empilait les trois boutons sur 197 px de hauteur. Libellé mobile « Sauver + », nom accessible complet, marges compactes ; libellé complet conservé sur grand écran. | Barre de 61 px sur des vues de 320, 360, 390 et 430 px ; boutons sur une ligne, cibles d’au moins 44 px ; contrôle supplémentaire avec hauteur de fenêtre de 420 px. Le vrai clavier du téléphone n’est pas émulé. |
| SIG-02 — recherches noires | `color-scheme: light dark` suivait le système tandis que React pilotait son propre thème. Le filtre de carte avait un fond `rgb(59,59,59)` avec du texte sombre. Le schéma natif est désormais clair par défaut, sombre uniquement avec le thème sombre de l’application. | Champ clair malgré un système sombre, puis champ sombre après activation du thème sombre de l’application. Liste et carte contrôlées dans Chromium. |
| SIG-03 — fond Auto demandant une API | Le mode Auto appelait CARTO sans clé. CARTO documente désormais le filigrane « API key required ». Auto utilise maintenant OpenStreetMap, déjà présent en Standard ; le thème sombre filtre uniquement les tuiles, sans filtrer les marqueurs/photos. | URL des tuiles, attribution, maxZoom 19, absence de suffixe retina `@2x`, filtre en Auto sombre et absence de filtre en Standard vérifiés localement. Les vraies tuiles distantes n’ont pas été chargées pendant les tests automatisés. |
| SIG-04 — hors ligne possiblement cassé | Signalement concernant la PWA installée, probablement via Chrome. Modèle du téléphone et version du navigateur non connus. Aucun correctif applicatif hors ligne appliqué faute de panne reproduite. | Rechargement, saisies, fermeture complète, réouverture et synchronisation réussis dans un profil Chromium persistant. À confirmer sur la PWA du téléphone, sans effacer ses données. |

Sources du diagnostic cartographique : [CARTO — clé Basemaps](https://www.carto.com/basemaps/apikey/)
et [politique des tuiles OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/).
L’URL OSM canonique a été ajoutée à la CSP et le domaine CARTO retiré.
Les mentions dans `LegalPages.tsx` et `docs/legal/api-terms-summary.md` suivent
ce changement. Aucun nouveau fournisseur ni abonnement créé ; aucun dispositif
de préchargement de cartes hors ligne ajouté.

## Parcours exécutés sur données fictives

### Hors ligne et synchronisation

Chromium `153.0.8010.12`, profil persistant neuf, vue 390 × 844 avec tactile
émulé, véritable Supabase local et worker PWA actif :

1. Charger quatre observations et une photo/un son privés en ligne.
2. Couper le réseau du navigateur et recharger : carnet disponible.
3. Saisir une observation via « Sauver + » : formulaire réinitialisé, lieu/date
   conservés ; saisir une deuxième observation via « Sauvegarder ».
4. Vérifier les deux entrées de la file d’attente locale.
5. Fermer complètement le navigateur puis le rouvrir avec le même profil,
   toujours hors ligne : session, saisies, photo et son disponibles.
6. Rétablir le réseau : deux observations relues sur Supabase local, comptage
   conservé, aucun doublon et file d’attente vidée.
7. Retirer uniquement les deux observations fictives ajoutées pour cet essai.

Ce scénario ne simule pas l’éviction du stockage par Android, une session
très ancienne/expirée, un ancien worker installé sur le téléphone ou une
installation depuis l’icône système. Les deux délais historiques hors ligne/ZIP
conservent leur qualification : non reproduits, cause non isolée.

### Imports, exports et observations

- JSON : fichier téléchargé, quatre observations et IDs attendus vérifiés.
- Excel : classeur ouvert avec ExcelJS, quatre lignes de données et espèces vérifiées.
- PDF : document réellement extrait avec `pdftotext`, présence des quatre espèces.
- Darwin Core : CSV ouvert, en-tête et quatre identifiants vérifiés.
- GeoJSON : trois entités géolocalisées ; l’observation sans GPS est exclue.
- ZIP utilisateur : quatre observations dans `data.json` ; photo et son
  comparés octet pour octet aux fichiers fictifs sources.
- Import JSON : prévisualisation annulée sans écriture ; confirmation d’un
  second essai donnant une seule observation réellement enregistrée.
- Modification de cette observation depuis l’interface, relue dans la base.
- Annulation de suppression sans effet, puis suppression confirmée en base.

Ces contrôles ne constituent pas une restauration complète du ZIP ni une
comparaison exhaustive de chaque colonne d’un export.

## Corrections du dispositif de test

Les échecs préparatoires ne doivent pas être attribués au site sans preuve :

- Le serveur temporaire devait décoder les chemins contenant accents/espaces
  pour servir les pictogrammes locaux ; correction limitée au serveur de test.
- La prise de contrôle du worker était variable dans le contexte jetable,
  y compris après retrait de l’interception générale. Le simple retrait des
  routes n’a donc **pas** démontré à lui seul la cause. Un worker minimal
  fonctionne avec et sans proxy ; les parcours finaux utilisent un profil
  persistant, sans interception générale du réseau. Le comportement exact du
  contexte jetable reste une limite de l’outillage.
- Les médias préparés utilisaient un format de référence et un dossier non
  conformes à `mediaReference.ts`. Ils ont été remplacés par des références
  historiques dans les dossiers `photos/` et `sounds/`. Ce sont des identifiants
  traités par le client ; le téléchargement reste authentifié et le bucket
  reste privé. Aucune protection n’a été relâchée pour réussir le test.
- Les sélecteurs du scénario ont été ajustés aux onglets et aux champs de
  localisation placés derrière « Afficher les détails avancés ».

Les sessions des parcours finaux proviennent de l’API Auth **locale** et sont
installées une seule fois au démarrage du profil. Elles ne sont pas réinjectées
après réouverture hors ligne. Cette méthode ne teste ni le CAPTCHA réel, ni
l’inscription, ni les mails de récupération de compte.
Le proxy bloque les sorties Internet du navigateur ; les données de production
ne sont jamais utilisées.

## Contrôles et preuves

`npm run check` réussi après les corrections : TypeScript, lint,
**514 tests dans 73 fichiers**, build PWA. Revue ciblée des composants React :
aucun nouveau hook, dépendance ou appel réseau hors changement de tuiles ;
nom accessible de l’action mobile conservé. Vérification du diff sans erreur.

Synthèse versionnable : [preuves structurées](preuves-audit-fonctionnel-2026-10-07.json).
Les preuves complètes et scripts locaux sont sous :
`/home/eliotserive/Documents/Codex/2026-09-11/b/work/functional-audit-20261007`.

| Preuve | Contenu |
|---|---|
| `execution/user-reports-before.json` | Mesures des problèmes de thème et d’encombrement avant correction |
| `execution/user-reports-after.json` | Mesures multi-tailles, thème et configuration des fonds après correction |
| `execution/after-mobile-form.png` | Barre compacte dans le formulaire mobile |
| `execution/offline-full.json`, `execution/offline-full.png` | Parcours complet hors ligne, nettoyage de deux observations temporaires |
| `execution/functional-flows.json`, `execution/exports/` | Fichiers réels et parcours import/modification/suppression |
| `execution/npm-check.log` | Validation complète du projet |
| `execution/final-lab-state.json` | Deux comptes, six observations de préparation, bucket privé |

Scripts correspondants : `user-reports-after.mjs`, `offline-full.mjs`,
`functional-flows.mjs`, `build-local.mjs`. Ils dépendent du manifeste de comptes
fictifs local `accounts.local.json` (privé, hors dépôt) ; ne pas le publier.
Ils ferment leurs navigateurs et serveurs temporaires. Le laboratoire Docker
reste démarré ; les six observations de préparation sont conservées.

### Sauvegarde technique : métadonnées seulement

Les quatre dernières exécutions hebdomadaires consultées sont réussies.
La plus récente est celle du [4 octobre 2026](https://github.com/Limuletempedte/carnet-naturaliste/actions/runs/37193626320),
avec l’artefact `sauvegarde-base-2026-10-04`, non expiré, de 258 874 octets.
L’archive réelle n’a pas été téléchargée ni déchiffrée. Ces métadonnées
**ne démontrent pas** sa restaurabilité. Aucun workflow n’a été déclenché.

## Suite de l’audit général

La [matrice de suivi](PREPARATION-AUDIT-FONCTIONNEL-2026-10-07.md) distingue
les résultats de cette passe et les contrôles non exécutés. Restent notamment :
restauration technique sur une cible isolée, restauration complète ZIP,
imports anciens/invalides/volumineux, concurrence et erreurs réseau ciblées,
mise à jour du worker pendant une saisie, médias nouvellement ajoutés hors
ligne, performance des gros carnets et appareils/navigateurs réels.

Le prochain diagnostic sur téléphone doit relever le comportement exact :
écran inaccessible dès l’ouverture, carnet absent, médias absents ou saisies
qui ne se synchronisent pas. Préserver les données et caches existants avant
toute intervention. Aucune fusion ni modification de production autorisée.

## État de livraison vérifié le 8 octobre 2026

La PR #97 était déjà fusionnée le 7 octobre à 18 h 19 (Paris), commit
`db677f05b7124c3c8b4712a957cf6e6ead2b4c1c`. Déploiement de production
`dpl_6Kv68aTuF39bafBdm3vUvnuDEnWt` confirmé READY par Vercel.
L’alias https://carnet-naturaliste.vercel.app répond HTTP 200 et sa feuille
CSS contient les corrections de thème et de fond Auto (`color-scheme:light only`
après minification). Contrôle en lecture seule, sans nouvelle fusion ni
redéploiement. Le contrôle fonctionnel sur le téléphone et la suite de
l’audit restent à réaliser.
