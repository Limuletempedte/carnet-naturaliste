# Délais hors ligne et export ZIP — 1er octobre 2026

## Conclusion

**Les deux délais intermittents historiques ne sont pas reproduits dans les
essais sans panne injectée de cette campagne. Leur cause reste indéterminée.**
Ce résultat ne démontre ni leur correction, ni une régression des dépendances,
ni un défaut exclusivement dû aux tests. Aucun code applicatif n'a été modifié.

La PR #93 est fusionnée ; la base de cette investigation est
`e94754873a197d9416ff84db2ff6429cf1041041`. La régularisation Supabase terminée
au point 1 n'est pas rejouée. L'audit fonctionnel général (point 3) reste distinct.

## Ce qui a été contrôlé

Le parcours `tests/security/lot2-browser.mjs` utilise le véritable bundle de
production compilé pour le laboratoire Supabase local, des comptes et médias
fictifs, un profil Chromium neuf par exécution, et un service worker actif.
Les échanges externes sont simulés par le scénario, avec les limites de routage
des requêtes contrôlées par un service worker signalées plus bas.

Les onze assertions existantes sont conservées : droits sur les médias privés,
purge de l'ancien cache, plafonds et expiration IndexedDB, photo/son, rechargement
hors ligne, contenu réel du ZIP, déconnexion entre onglets et absence de lecture
des anciennes URL publiques. Les comptes, objets fictifs et profils sont nettoyés
à la fin de chaque parcours, y compris lors des deux échecs volontairement injectés.

Les essais comprennent le script initial, des répétitions instrumentées et un
ralentissement du processeur du premier onglet par les outils Chromium (facteurs
4 et 8). Ce ralentissement ne simule pas un téléphone complet ; le deuxième
onglet et le service worker ne reçoivent pas cette configuration CPU. Une partie
des essais ×8 a coexisté avec les sondes de diagnostic sur la même machine.

Environnement : Node 22.23.2, Chrome for Testing 153.0.8010.12, dépendances
existantes du dépôt. Aucun paquet ni paramètre de production mis à jour.

Résultats détaillés et durées : [preuve structurée](preuves-hors-ligne-2026-10-01.json).
Les journaux complets sont conservés localement dans
`work/offline-timeouts-20261001`, à côté de la copie de travail.

**Onze parcours complets réussis**, avec les onze contrôles chacun. Les deux
sondes avec panne injectée sont comptées séparément. Le parcours initial et le
dernier parcours de validation sans options passent aussi ; les neuf autres
fournissent les mesures suivantes :

| Ralentissement du premier onglet | Parcours réussis | Rechargement hors ligne → photo visible | Menu export → téléchargement ZIP |
|---|---:|---:|---:|
| Aucun | 5, dont 3 mesurés | 0,20–0,44 s | 0,27–0,36 s |
| ×4 | 1 | 1,26 s | 0,62 s |
| ×8 | 5 | 1,76–8,27 s | 0,85–2,02 s |

Ce sont des mesures locales sur un carnet fictif minimal, pas des objectifs de
performance en production ou pour de gros carnets.

## Amélioration du scénario de test

- `MEDIA_DIAGNOSTICS=1` mesure séparément la navigation hors ligne, l'affichage de
  la photo, l'ouverture du menu et l'arrivée du téléchargement ZIP.
- En cas d'échec, le scénario capture les requêtes encore en attente, les trente
  dernières requêtes terminées, l'état réseau, le contrôle par le service worker
  et l'état visible de la page concernée. Les en-têtes et les jetons ne sont pas
  collectés ; les paramètres d'URL sont retirés et les UUID des chemins masqués.
  Le texte visible peut contenir les données fictives du laboratoire.
- La capture de page est limitée à deux secondes pour ne pas bloquer le nettoyage
  si le navigateur ne répond plus. Lors d'un échec dans le second onglet, elle
  examine cet onglet, plutôt que de toujours lire le premier.
- L'attente du téléchargement et le clic sont consommés ensemble avec
  `Promise.all`, pour qu'un rejet soit immédiatement pris en charge même si le
  clic attend encore. Cela améliore le diagnostic et le passage par le nettoyage ;
  ce n'est pas présenté comme la cause démontrée du délai historique.
- `MEDIA_CPU_THROTTLE_RATE` permet de reproduire un ralentissement de 1 à 8.

**Les limites initiales restent inchangées : 15 secondes pour les actions et
l'attente du téléchargement, 30 secondes pour l'affichage de la photo.**
Aucun retry automatique ou suppression de contrôle n'a été ajouté.

## Deux pannes injectées pour vérifier le diagnostic

Deux copies temporaires du script ont été utilisées exclusivement dans le
laboratoire ; les injections ne sont pas présentes dans le script livré.

1. **Bibliothèque ZIP retardée de 18 secondes** par le serveur HTTP local :
   l'attente du téléchargement échoue à 15 secondes. Le diagnostic indique
   `online=true`, une PWA contrôlée par un worker actif et la requête du chunk
   `vendor-jszip` toujours en attente. L'export a bien commencé dans l'interface.
2. **Cache média vidé juste avant le passage hors ligne** : la navigation aboutit,
   mais aucune image privée n'est disponible. L'attente de la photo échoue à
   30 secondes ; le diagnostic distingue le réseau hors ligne et l'absence de
   photo d'un échec de chargement de la page. Le nettoyage des deux comptes et
   quatre objets fictifs est confirmé dans le journal.

Ces échecs attendus prouvent que le scénario conserve ses assertions et produit
des informations utiles. Ils **ne reproduisent pas la cause inconnue** des deux
échecs observés lors de la mise à jour des dépendances.

## Refaire un essai

Utiliser un bundle compilé avec l'URL et la clé publique du laboratoire ; ne
jamais utiliser les identifiants de production. Le script refuse une API dont
l'hôte n'est pas local. Les chemins ci-dessous sont à renseigner dans
l'environnement de test, sans versionner le fichier de statut Supabase :

```bash
MEDIA_DIAGNOSTICS=1 MEDIA_CPU_THROTTLE_RATE=4 \
  node tests/security/lot2-browser.mjs
```

Variables existantes requises : `LOCAL_STATUS_FILE`, `AUDIT_BUILD_DIR`, et selon
l'installation `PLAYWRIGHT_MODULE` / `CHROMIUM_EXECUTABLE`. Conserver le journal
complet et préciser si d'autres tâches lourdes tournaient en même temps.

## Limites et suite

Un résultat réussi n'exclut pas un problème intermittent. La campagne ne couvre
pas Safari, Firefox, un téléphone réel, un réseau mobile ni une session expirée.
La documentation [Playwright sur les service workers](https://playwright.dev/docs/service-workers)
précise les limites de routage : les traces de requêtes ne constituent pas une
preuve exhaustive de tous les échanges du worker. Le worker reste activé pendant
ces tests pour que le parcours hors ligne soit réel.

Si le problème revient, exploiter le diagnostic pour distinguer navigation,
restauration de session, accès IndexedDB et chargement du chunk ZIP avant de
choisir un correctif. **Le statut des deux anciens incidents reste “non reproduit,
cause non isolée”.** Aucun ajustement arbitraire des délais du produit n'est justifié
par les résultats actuels.

Validation générale du lot : `npm run check` réussi (TypeScript, ESLint,
514 tests dans 73 fichiers, build et génération du service worker PWA).
`node --check tests/security/lot2-browser.mjs` et `git diff --check` réussis.
Fusion manuelle uniquement ; aucune mutation du Supabase de production.
