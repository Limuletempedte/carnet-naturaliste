# État de reprise — 1er octobre 2026

Point d'entrée à lire avant de reprendre les travaux. Pour changer de discussion,
utiliser la [passation vers l'audit fonctionnel](REPRISE-AUDIT-FONCTIONNEL.md).
Dernier état de `main` vérifié : `bd13548c9539c55a202c2c508253ccf949b61dc9`,
après fusion de la PR #95.
Les rapports datés gardent leur portée historique ; cette page donne l'ordre
actuel des actions. Le déploiement GitHub/Vercel `Production` associé au commit
précédent `60eb163303b4d4781120f4cc627e92418d9ac220` (#94)
est déclaré réussi (ID `6786327087`, statut du 1er octobre à 14:04:38 UTC).
Ce contrôle de déploiement ne remplace pas l'audit fonctionnel du site.

## Travaux terminés

| Sujet | État et preuve |
|---|---|
| Sécurité | Quatre lots livrés et déployés : isolation des comptes, médias privés, imports bornés, mots de passe de 12 caractères et CAPTCHA serveur. [Bilan de production](../audits/v5/MISE-EN-PRODUCTION-2026-09-30.md). |
| Dépendances | PR #90 fusionnée et déployée. Les alertes traitées et les contrôles sont datés du 1er octobre ; leur résultat ne vaut pas surveillance continue. [Rapport](../audits/v5/DEPENDANCES-2026-10-01.md). |
| Historique Supabase | PR #92 et #93 fusionnées. Dix versions alignées ; les quatre entrées anciennes ont été régularisées sans rejouer leur SQL. Données et protections inchangées au contrôle avant/après. **Ne pas répéter l'opération.** [Compte rendu](REGULARISATION-MIGRATIONS-2026-10-01.md). |
| Investigation hors ligne / ZIP | PR #94 fusionnée, contrôles GitHub réussis. Onze parcours locaux complets réussis et diagnostics ajoutés. Les deux incidents restent **non reproduits, cause non isolée**, pas corrigés par démonstration. [Diagnostic](DIAGNOSTIC-HORS-LIGNE-2026-10-01.md). |

Dernière validation applicative : `npm run check` réussi, TypeScript, lint,
514 tests dans 73 fichiers et build PWA. Aucune fusion automatique autorisée.
Ne jamais rendre les médias publics pour contourner un problème.

## Complément documentaire #82 examiné

La [PR #82 — complément Auth et cache PWA](https://github.com/Limuletempedte/carnet-naturaliste/pull/82)
reste ouverte au contrôle du 1er octobre. Son contenu a maintenant été examiné :
preuves cohérentes, 17 assertions (10 contrôles et 7 reproductions du défaut),
empreinte du worker conforme, capture sur données fictives, scripts archivés.
Le [complément](../audits/v5/COMPLEMENT-2026-09-17.md) et ses pièces utiles sont
repris dans le présent lot documentaire basé sur `main`, avec une signalisation
historique explicite. Les preuves brutes sont conservées à l'identique.

Ce lot **remplace la proposition documentaire de #82**, sans reprendre ses
modifications anciennes par-dessus les documents récents. Après fusion manuelle
du présent lot, vérifier la présence des preuves sur `main`, puis proposer la
fermeture de #82 comme remplacée, sans fusion ni suppression de sa branche.
Ne pas appliquer ses anciens réglages Auth comme recommandations actuelles.

Les PR #92 à #94 sont fusionnées ; aucune opération de migration ni correction
applicative démontrée ne reste à livrer dans ces trois lots. Cela ne clôt pas les
deux incidents intermittents. La revue de #82 est faite ; seule la livraison
manuelle de ce lot et le rangement de l'ancienne PR restent à vérifier.

## Prochaine étape : audit fonctionnel général

L'audit général n'a pas commencé. Préparer un plan et un laboratoire à données
fictives, puis vérifier :

1. Création, modification, suppression, recherche et filtres des observations.
2. Synchronisation, erreurs réseau, concurrence entre onglets et préservation
   des saisies ; réutiliser les diagnostics hors ligne si un délai réapparaît.
3. PWA, médias photo/son, fichiers en attente et quotas.
4. Imports/exports JSON, Excel, PDF, ZIP et anciennes sauvegardes.
5. Sauvegardes techniques et **restauration réellement testée en environnement
   isolé** ; la présence du workflow ne prouve pas la récupérabilité des données.
6. Performances sur gros carnets et compatibilité mobile/navigateurs.

Pistes historiques à qualifier : champs serveur nuls dans le formulaire,
synonymes Excel `__proto__`/`constructor`, synchronisation/restauration. Ne pas
les transformer en nouvelles failles confirmées sans reproduction.
Présenter les constats et les lots de correction nécessaires avant une réécriture.

MFA reportée. Les autres durcissements Supabase restent séparés et à revalider
si demandés ; aucun abonnement payant ni suivi automatique n'est autorisé.

## Copies locales et précautions de reprise

Sur la machine de cette passation, la copie active est
`/home/eliotserive/Documents/Codex/2026-09-11/b/work/security-fixes`.
Le dossier initial `/home/eliotserive/Documents/Projet dev/carnet-naturaliste`
est encore au commit `0041b1c1964251cb6585ce69eef6f43ceb72bc4f` au contrôle du
1er octobre : ne pas repartir de son code ancien. Ces chemins sont propres à
cette machine ; les revérifier dans une autre session.

Lire les `AGENTS.md`, vérifier `git status`, récupérer les dernières références
et utiliser une branche `codex/...` adaptée. Préserver `REPRISE.md` et les
modifications locales. Le `node_modules` de la copie active pointe vers le
runtime partagé `work/security-runtime-20261001/node_modules` ; ne pas supprimer
ou modifier les installations voisines pour nettoyer une tâche.

Les deux notes locales `REPRISE.md` pointent vers cette page. L'ancien document
complet de passation demeure une archive pour les outils et les preuves ; son
ancienne liste de tâches ne remplace pas le présent état.
