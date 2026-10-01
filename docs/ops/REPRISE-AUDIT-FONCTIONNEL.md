# Passation pour l'audit fonctionnel — 1er octobre 2026

## Demande et prochaine action

L'utilisateur souhaite continuer **dans une autre discussion**, sur l'audit
fonctionnel général du Carnet naturaliste. Cet audit **n'a pas commencé**.
Expliquer simplement et brièvement, produire des preuves vérifiables, préserver
les données et les protections. Aucune fusion automatique.

À la reprise : lire ce document et `AGENTS.md`, vérifier Git et la PR de passation,
puis présenter un plan d'audit adapté avant de commencer les essais locaux.
Ne pas recommencer les lots terminés ni lancer les anciens scripts qui
reproduisent volontairement des failles corrigées.

## Où travailler

- Dépôt : `https://github.com/Limuletempedte/carnet-naturaliste`.
- Copie active : `/home/eliotserive/Documents/Codex/2026-09-11/b/work/security-fixes`.
- Dossier initial : `/home/eliotserive/Documents/Projet dev/carnet-naturaliste`,
  encore au commit ancien `0041b1c1964251cb6585ce69eef6f43ceb72bc4f` au contrôle.
  **Ne pas repartir de son code** ; sa note locale renvoie à la copie active.
- Base du présent lot : `origin/main` au commit
  `bd13548c9539c55a202c2c508253ccf949b61dc9` (PR #95 fusionnée).
- Branche de passation : `codex/audit-functional-handoff`. Vérifier si sa PR a
  été fusionnée depuis la rédaction. Sinon, son contenu est encore à relire et
  fusionner manuellement ; ne pas le perdre en changeant de branche.
- `REPRISE.md` reste local et non versionné dans les deux copies. Préserver les
  changements utilisateur, inspecter `git status` avant toute opération.
- `node_modules` pointe vers
  `/home/eliotserive/Documents/Codex/2026-09-11/b/work/security-runtime-20261001/node_modules`.
  L'ancien runtime `work/audit/repo/node_modules` est partagé et conservé.
  Ne supprimer aucune installation partagée pour faire du nettoyage.

## État des travaux terminés et limites

| Sujet | Situation à la passation |
|---|---|
| Sécurité | Lots #83–#86 et bilan #89 livrés : isolation par compte, médias privés, imports bornés/Worker annulable, nouveaux mots de passe de 12 caractères et CAPTCHA serveur. Ne pas réactiver les liens publics. |
| Dépendances | #90 fusionnée et déployée. Les alertes traitées et le résultat npm audit/Dependabot sont datés du 1er octobre ; pas de suivi automatique ni de nouveau contrôle permanent. |
| Migrations | #92/#93 fusionnées ; dix versions alignées dans Supabase. Quatre entrées déclaratives ajoutées sans exécuter les anciens scripts. **Ne pas rejouer cette régularisation.** |
| Délais hors ligne / ZIP | #94 fusionnée. Onze parcours complets réussis, dont cinq avec CPU ×8 ; deux pannes injectées ont validé les diagnostics. Les deux incidents historiques restent **non reproduits, cause non isolée**, pas prouvés corrigés. |
| Documentation courante | #95 fusionnée ; README, AGENTS, liens et notes locales actualisés. |
| Complément historique #82 | Examiné et repris dans ce lot documentaire, avec ses preuves et sa date du 17 septembre. La vieille PR reste ouverte jusqu'à la livraison manuelle du lot remplaçant ; détail ci-dessous. |

Le dernier déploiement de production contrôlé explicitement est celui de #94,
`60eb163303b4d4781120f4cc627e92418d9ac220` : statut GitHub/Vercel `success`,
déploiement `6786327087`. Ne pas transformer cette vérification de déploiement
en validation fonctionnelle complète du site. Revalider l'état courant si utile.

Contrôle du présent lot documentaire : `npm run check` réussi,
514 tests / 73 fichiers, TypeScript, lint et build PWA. Liens locaux, cohérence
des deux notes de reprise, syntaxe des scripts archivés et `git diff --check`
également vérifiés. Aucun audit fonctionnel général exécuté dans ce lot.

## Sort de la PR #82

Source examinée : `354ffc7245547aed24142910776514ebe37a2fb3`, branche
`docs/audit-v5-complements`. Elle contient un relevé Auth du 17 septembre et une
reproduction locale du cache partagé de l'ancien code, avec Auth/API simulés.
Les résultats contiennent 17 assertions cohérentes : 10 contrôles et 7 constats
qui reproduisent volontairement le défaut. Le worker conservé correspond à son
empreinte, les journaux correspondent au JSON et la capture montre des données
fictives. Aucun ancien scénario d'attaque n'a été réexécuté pour cette revue.

Les neuf fichiers ajoutés par #82 sont repris dans les mêmes chemins ; seules
les deux pages explicatives reçoivent un avertissement historique. Les sept
pièces brutes/scripts sont identiques octet pour octet. Les trois anciens
changements d'index/matrice/protocole sont remplacés par des liens datés adaptés
aux documents actuels. [Manifeste de provenance](preuves-reprise-pr82-2026-10-01.json).

Après fusion manuelle de la PR de cette branche, vérifier que les fichiers sont
sur `main`, puis proposer la clôture de #82 comme remplacée. **Ne pas fusionner
l'ancienne PR en plus et ne pas supprimer sa branche.** L'absence de clôture
administrative de #82 n'empêche pas de préparer l'audit fonctionnel dès que les
preuves sont conservées. Aucune fermeture automatique n'a été effectuée.

## Documents à lire pour préparer l'audit

- [État courant](ETAT-REPRISE.md).
- [Diagnostic hors ligne / ZIP et mesures](DIAGNOSTIC-HORS-LIGNE-2026-10-01.md) ;
  les logs complets sont dans `work/offline-timeouts-20261001`.
- [Régularisation des migrations](REGULARISATION-MIGRATIONS-2026-10-01.md).
- [Sauvegarde/restauration](RUNBOOK-sauvegarde-restauration.md), à vérifier par une
  restauration isolée : l'existence du workflow n'est pas une preuve de reprise.
- [Audit historique v5](../audits/v5/README.md), sa matrice et son rapport :
  conserver leurs dates, ne pas reprendre leurs vulnérabilités comme actuelles.
- `docs/audits/v5/CORRECTIONS-LOT1.md` à `CORRECTIONS-LOT4.md`,
  `MISE-EN-PRODUCTION-2026-09-30.md` et `DEPENDANCES-2026-10-01.md`.

## Périmètre proposé pour la nouvelle discussion

Préparer une matrice « parcours, attendu, données fictives, résultat, preuve,
limites » puis examiner, par groupes cohérents :

1. Observations : création, édition, suppression, détails, recherche et filtres.
2. Synchronisation : coupure/retour réseau, file d'attente, deux onglets,
   déconnexion/changement de compte, absence de perte et de doublons.
3. PWA et médias : redémarrage hors ligne, mise à jour du worker, anciennes
   références photo/son, médias en attente, quotas et expiration.
4. Import/export : JSON, XLSX, PDF, ZIP, sauvegardes anciennes, données nulles,
   limites et annulation. Vérifier les fichiers produits, pas seulement les toasts.
5. Sauvegardes techniques : vérifier les exécutions disponibles et effectuer une
   vraie restauration sur un environnement isolé, sans écraser la production.
6. Gros carnets, performances, mobile et navigateurs réellement disponibles ;
   expliciter les plateformes non testées.

Pistes héritées, non confirmées comme défauts actuels : champs serveur nuls dans
le formulaire, synonymes Excel `__proto__`/`constructor`, restauration et
synchronisation. Réutiliser les diagnostics si les délais intermittents reviennent,
sans augmenter arbitrairement les délais ni en faire une boucle infinie de tests.
Les défauts trouvés doivent être qualifiés et les correctifs regroupés dans des
lots cadrés ; pas de réécriture générale implicite.

## Outils et laboratoire local

- GitHub CLI : `/home/eliotserive/Documents/Codex/2026-09-11/b/work/github-cli/runtime/usr/bin/gh` ;
  `GH_CONFIG_DIR=/home/eliotserive/Documents/Codex/2026-09-11/b/work/github-cli/config`.
- Supabase CLI du projet : `./node_modules/.bin/supabase` (2.109.1 au dernier
  contrôle). Découvrir les commandes avec `--help`, ne pas mettre à jour les
  dépendances simplement pour mener l'audit.
- Labo principal : `work/security-validation/supabase-lab`, réseau et conteneur DB
  `cn_security_fixes_20260918` / `supabase_db_cn_security_fixes_20260918`.
  API `http://127.0.0.1:54321`, PostgreSQL `127.0.0.1:54322`, Mailpit
  `http://127.0.0.1:54324`. Vérifier qu'il tourne encore.
- `work/security-validation/local-status.json` contient les clés **locales** :
  le lire seulement pour alimenter les outils, ne pas afficher ni versionner son
  contenu. Ne pas demander ou extraire les secrets/cookies de production.
- Docker direct peut être refusé ; utiliser les outils/connexions locales
  disponibles ou les commandes `pkexec` bornées déjà utilisées. Ne pas modifier
  les groupes ni les privilèges globaux. Ne pas réinitialiser le labo partagé.
- Playwright : `/usr/lib/chatgpt/resources/cua_node/lib/node_modules/playwright-core/index.mjs`.
- Chromium : `/home/eliotserive/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`
  (Chrome for Testing 153.0.8010.12 observé). Revalider les chemins.
- Tests actuels : `tests/security/lot1-browser.mjs` à `lot4-browser.mjs`.
  `lot2-browser.mjs` accepte `MEDIA_DIAGNOSTICS=1` et
  `MEDIA_CPU_THROTTLE_RATE=1..8`. `lot3-browser.mjs` accepte
  `CHECK_DEPENDENCY_EXPORTS=1` pour inspecter aussi les exports réels.
- Variables de test : `LOCAL_STATUS_FILE`, `AUDIT_BUILD_DIR`,
  `PLAYWRIGHT_MODULE`, `CHROMIUM_EXECUTABLE`. Compiler avec les paramètres du
  laboratoire ; le widget CAPTCHA de production n'autorise pas les previews.
  Employer les fixtures locales prévues, sans contourner le CAPTCHA en production.
- La base temporaire de régularisation a été supprimée ; ses logs restent dans
  `work/history-validation-20261001`. Les profils des essais hors ligne ont été
  supprimés, comptes et objets fictifs nettoyés. Aucun essai de cette discussion
  n'est volontairement laissé en cours.

## Limites conservées

MFA reportée ; aucun abonnement payant ni automation créé. Les anciens clients
PWA restés hors ligne ne sont nettoyés qu'à leur mise à jour. Aucune nouvelle
attaque distante autorisée par cette passation. Les preuves de sécurité antérieures
restent dans la collection locale indiquée par l'ancienne note complète, conservée
comme archive ; l'ordre de travail est celui de la présente passation.

## Message à copier dans la nouvelle discussion

> Reprends le Carnet naturaliste. Lis d'abord REPRISE.md puis la passation
> REPRISE-AUDIT-FONCTIONNEL.md dans la copie active indiquée. Vérifie l'état Git
> et la PR de passation, puis prépare et mène l'audit fonctionnel général sur un
> laboratoire à données fictives. Ne recommence pas les corrections de sécurité,
> les dépendances ou la régularisation Supabase déjà terminées. Les deux délais
> intermittents restent non reproduits, cause inconnue. Ne fusionne rien
> automatiquement et ne modifie pas la production.
