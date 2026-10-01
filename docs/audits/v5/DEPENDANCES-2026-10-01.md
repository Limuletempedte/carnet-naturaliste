# Dépendances — qualification et corrections du 1er octobre 2026

Base : `ebe953017d4b1c5620dcc263112e35d09c73d4e5` (`main`, après le bilan de production).
Ce travail porte sur les alertes de dépendances ; ce n'est pas un nouvel audit
exhaustif ni l'audit général du fonctionnement.

## Résultat

GitHub renvoyait **31 alertes Dependabot ouvertes**, aucune classée malware.
`npm audit --package-lock-only --json` signalait **11 paquets affectés**
(5 high, 6 moderate). Ce sont deux modes de comptage différents : plusieurs avis
et plusieurs branches d'un même paquet peuvent produire plusieurs alertes GitHub.

Le verrouillage corrigé ne contient plus de version dans les plages vulnérables
associées aux **31 alertes**. `npm audit` ne signale plus de vulnérabilité connue
au moment du contrôle. Cela ne prouve pas l'absence de toute vulnérabilité.
Les alertes de la branche principale peuvent rester ouvertes jusqu'à fusion et
réanalyse par GitHub ; aucune alerte n'a été fermée ou masquée manuellement.

## Portée réelle des avis

La présence d'un paquet affecté n'a pas été assimilée à une attaque démontrée sur
le site. Aucun `SECURITY.md` applicable n'a été trouvé ; les frontières ont été
examinées à partir des configurations Vite/Vitest, des usages et du workflow CI.
Le tri statique conserve un résultat pour chacune des 31 alertes : 3 scénarios
non applicables aux chemins actuels, 28 nécessitant une qualification des entrées
de l'outillage avant de pouvoir affirmer un impact exploitable. Aucun scénario
supplémentaire d'attaque distante du site n'a été confirmé dans ce tri.

| Famille | Chemin dans le projet et limite du scénario |
|---|---|
| DOMPurify | Dépendance optionnelle de jsPDF. Les exports utilisent `pdf.text` ou `html2canvas` + `addImage`, jamais `pdf.html`, `IN_PLACE` ou un hook DOMPurify. Les préconditions de l'avis ne sont pas présentes. |
| Vitest / mocker | Environnement `jsdom`, aucun plugin mocker/interceptor public ni mode browser configuré. L'API de développement décrite par l'avis n'est pas exposée par le site. |
| brace-expansion | Utilisé par minimatch/glob dans ESLint, la couverture et Workbox. Le chemin Node d'ExcelJS passe par archiver, mais le build navigateur utilise `dist/exceljs.min.js`. Aucun glob utilisateur du carnet n'a été relié à ces fonctions. |
| fast-uri | Chemin `vite-plugin-pwa → workbox-build → ajv`. Les paramètres PWA sont versionnés. Aucun contrôle d'URL utilisateur de l'application ne s'appuie sur fast-uri. |
| js-yaml | Dépendance d'ESLint/eslintrc. Aucun import YAML utilisateur n'est proposé par le carnet. |
| PostCSS / nanoid | Transformation CSS à la compilation. L'application n'expose pas de service PostCSS et ne passe aucune taille utilisateur à `customAlphabet` ou `customRandom`. |
| Browserslist / baseline-browser-mapping | Cibles de compilation Babel/Autoprefixer/Workbox. La provenance hostile de fichiers de configuration/statistiques dans un environnement CI doit être distinguée des observations du carnet ; cette frontière n'a pas été démontrée ici. |

Les chemins d'outillage ont tout de même été mis à jour de manière préventive.
Les situations où un tiers maîtrise le contenu exécuté en CI ne sont pas couvertes
par une simple recherche d'appels dans le frontend.

## Choix de mise à jour

- Mises à jour compatibles de DOMPurify, fast-uri, js-yaml, Browserslist,
  baseline-browser-mapping, nanoid, PostCSS et des branches 1/2 de brace-expansion.
- Vitest et son fournisseur de couverture sont **alignés et épinglés en 4.1.11**,
  version corrigée compatible avec Node 20/22 et Vite 8. Pas de migration à Vitest 5.
- Le minimum déclaré de PostCSS passe à `^8.5.28`.
- La résolution npm conservait brace-expansion 5.0.8 après les mises à jour ciblées.
  L'override **limité à `minimatch@10`** fixe cette seule branche à 5.0.12.
  Les anciens minimatch conservent leurs API compatibles via 1.1.21 et 2.1.7 :
  aucun override global de brace-expansion, aucune montée majeure ESLint.
- Le mock jsPDF des tests statistiques utilise une fonction constructible,
  conformément au changement de Vitest 4. Les assertions existantes sont conservées.
- Les services applicatifs, les limites d'import, la CSP, les paramètres Supabase
  et les règles d'accès ne changent pas dans cette PR.

## Versions vérifiées, sans suppression d'alertes similaires

Pour chaque ligne, toutes les occurrences du paquet dans le nouveau lockfile ont
été comparées à la plage vulnérable de cet avis : **aucune occurrence restante**.

| Alerte | Paquet | Avis | Versions après correction | Qualification initiale |
|---|---|---|---|---|
| [#66](https://github.com/Limuletempedte/carnet-naturaliste/security/dependabot/66) | `fast-uri` | [GHSA-hrr3-gc8f-f4qj](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj) | 3.1.8 | Exposition de l’outillage non démontrée |
| [#65](https://github.com/Limuletempedte/carnet-naturaliste/security/dependabot/65) | `brace-expansion` | [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) | 1.1.21, 5.0.12, 2.1.7 | Exposition de l’outillage non démontrée |
| [#64](https://github.com/Limuletempedte/carnet-naturaliste/security/dependabot/64) | `brace-expansion` | [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) | 1.1.21, 5.0.12, 2.1.7 | Exposition de l’outillage non démontrée |
| [#63](https://github.com/Limuletempedte/carnet-naturaliste/security/dependabot/63) | `brace-expansion` | [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) | 1.1.21, 5.0.12, 2.1.7 | Exposition de l’outillage non démontrée |
| [#62](https://github.com/Limuletempedte/carnet-naturaliste/security/dependabot/62) | `brace-expansion` | [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) | 1.1.21, 5.0.12, 2.1.7 | Exposition de l’outillage non démontrée |
| [#61](https://github.com/Limuletempedte/carnet-naturaliste/security/dependabot/61) | `brace-expansion` | [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) | 1.1.21, 5.0.12, 2.1.7 | Exposition de l’outillage non démontrée |
| [#60](https://github.com/Limuletempedte/carnet-naturaliste/security/dependabot/60) | `brace-expansion` | [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) | 1.1.21, 5.0.12, 2.1.7 | Exposition de l’outillage non démontrée |
| [#59](https://github.com/Limuletempedte/carnet-naturaliste/security/dependabot/59) | `brace-expansion` | [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) | 1.1.21, 5.0.12, 2.1.7 | Exposition de l’outillage non démontrée |
| [#58](https://github.com/Limuletempedte/carnet-naturaliste/security/dependabot/58) | `brace-expansion` | [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) | 1.1.21, 5.0.12, 2.1.7 | Exposition de l’outillage non démontrée |
| [#57](https://github.com/Limuletempedte/carnet-naturaliste/security/dependabot/57) | `brace-expansion` | [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) | 1.1.21, 5.0.12, 2.1.7 | Exposition de l’outillage non démontrée |
| [#56](https://github.com/Limuletempedte/carnet-naturaliste/security/dependabot/56) | `fast-uri` | [GHSA-qw65-cvwx-89v3](https://github.com/advisories/GHSA-qw65-cvwx-89v3) | 3.1.8 | Exposition de l’outillage non démontrée |
| [#55](https://github.com/Limuletempedte/carnet-naturaliste/security/dependabot/55) | `js-yaml` | [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh) | 4.3.2 | Exposition de l’outillage non démontrée |
| [#54](https://github.com/Limuletempedte/carnet-naturaliste/security/dependabot/54) | `baseline-browser-mapping` | [GHSA-w5vr-8v7q-w6rv](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv) | 2.11.26 | Exposition de l’outillage non démontrée |
| [#53](https://github.com/Limuletempedte/carnet-naturaliste/security/dependabot/53) | `vitest` | [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) | 4.1.11 | Scénario absent des usages actuels |
| [#51](https://github.com/Limuletempedte/carnet-naturaliste/security/dependabot/51) | `@vitest/mocker` | [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) | 4.1.11 | Scénario absent des usages actuels |
| [#50](https://github.com/Limuletempedte/carnet-naturaliste/security/dependabot/50) | `browserslist` | [GHSA-73wf-gq98-2v4g](https://github.com/advisories/GHSA-73wf-gq98-2v4g) | 4.29.3 | Exposition de l’outillage non démontrée |
| [#49](https://github.com/Limuletempedte/carnet-naturaliste/security/dependabot/49) | `browserslist` | [GHSA-c83g-rgw3-j3cx](https://github.com/advisories/GHSA-c83g-rgw3-j3cx) | 4.29.3 | Exposition de l’outillage non démontrée |
| [#48](https://github.com/Limuletempedte/carnet-naturaliste/security/dependabot/48) | `fast-uri` | [GHSA-jqff-g426-hqxp](https://github.com/advisories/GHSA-jqff-g426-hqxp) | 3.1.8 | Exposition de l’outillage non démontrée |
| [#47](https://github.com/Limuletempedte/carnet-naturaliste/security/dependabot/47) | `fast-uri` | [GHSA-f65p-4m7j-42xc](https://github.com/advisories/GHSA-f65p-4m7j-42xc) | 3.1.8 | Exposition de l’outillage non démontrée |
| [#46](https://github.com/Limuletempedte/carnet-naturaliste/security/dependabot/46) | `brace-expansion` | [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895) | 1.1.21, 5.0.12, 2.1.7 | Exposition de l’outillage non démontrée |
| [#45](https://github.com/Limuletempedte/carnet-naturaliste/security/dependabot/45) | `fast-uri` | [GHSA-5jgf-p345-68v8](https://github.com/advisories/GHSA-5jgf-p345-68v8) | 3.1.8 | Exposition de l’outillage non démontrée |
| [#44](https://github.com/Limuletempedte/carnet-naturaliste/security/dependabot/44) | `fast-uri` | [GHSA-fph4-wmhf-6fwf](https://github.com/advisories/GHSA-fph4-wmhf-6fwf) | 3.1.8 | Exposition de l’outillage non démontrée |
| [#43](https://github.com/Limuletempedte/carnet-naturaliste/security/dependabot/43) | `brace-expansion` | [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895) | 1.1.21, 5.0.12, 2.1.7 | Exposition de l’outillage non démontrée |
| [#42](https://github.com/Limuletempedte/carnet-naturaliste/security/dependabot/42) | `nanoid` | [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8) | 3.3.19 | Exposition de l’outillage non démontrée |
| [#41](https://github.com/Limuletempedte/carnet-naturaliste/security/dependabot/41) | `postcss` | [GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp) | 8.5.28 | Exposition de l’outillage non démontrée |
| [#39](https://github.com/Limuletempedte/carnet-naturaliste/security/dependabot/39) | `js-yaml` | [GHSA-5p4m-2wfm-xmqj](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj) | 4.3.2 | Exposition de l’outillage non démontrée |
| [#38](https://github.com/Limuletempedte/carnet-naturaliste/security/dependabot/38) | `brace-expansion` | [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg) | 1.1.21, 5.0.12, 2.1.7 | Exposition de l’outillage non démontrée |
| [#37](https://github.com/Limuletempedte/carnet-naturaliste/security/dependabot/37) | `dompurify` | [GHSA-55q2-fjhq-7xh7](https://github.com/advisories/GHSA-55q2-fjhq-7xh7) | 3.4.16 | Scénario absent des usages actuels |
| [#36](https://github.com/Limuletempedte/carnet-naturaliste/security/dependabot/36) | `fast-uri` | [GHSA-7p8r-x3mc-p8w7](https://github.com/advisories/GHSA-7p8r-x3mc-p8w7) | 3.1.8 | Exposition de l’outillage non démontrée |
| [#35](https://github.com/Limuletempedte/carnet-naturaliste/security/dependabot/35) | `brace-expansion` | [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895) | 1.1.21, 5.0.12, 2.1.7 | Exposition de l’outillage non démontrée |
| [#34](https://github.com/Limuletempedte/carnet-naturaliste/security/dependabot/34) | `brace-expansion` | [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg) | 1.1.21, 5.0.12, 2.1.7 | Exposition de l’outillage non démontrée |

## Validation

- Installation propre avec `npm ci`, aucun conflit de peerDependencies déclaré
  par `npm ls --all`. Les bibliothèques anciennes de la copie d'audit partagée
  n'ont pas été modifiées pendant l'installation candidate.
- `npm run check` : **514 tests sur 73 fichiers**, TypeScript, ESLint et build PWA réussis après réinstallation propre.
- Couverture : Vitest 4 recalcule les branches plus précisément. Le premier calcul
  donnait 54,3 % pour un seuil existant de 55 %. Des contrôles d'exports ont été ajoutés
  (coordonnées sensibles, valeurs manquantes/zéro, texte de formule Excel, PDF
  multipage) ; aucun seuil n'a été abaissé et aucune exclusion ajoutée.
- Les tests de couverture s'exécutent avec `--maxWorkers=2` pour éviter que la
  génération de grosses fixtures ZIP, instrumentée, se dispute le CPU avec les
  autres fichiers. La limite de 30 secondes du Worker applicatif ne change pas.
- `CHECK_DEPENDENCY_EXPORTS=1 node tests/security/lot3-browser.mjs` vérifie les vrais
  téléchargements Excel et PDF, le ZIP statistique avec PDF rasterisé par
  html2canvas, puis les contrôles d'import/annulation/hors-ligne/synchronisation.
  Il utilise un navigateur réel et un Supabase local, avec appels externes simulés.
- `npm run test:coverage -- --maxWorkers=2` : **66,89 % statements, 55,64 % branches,
  64,78 % fonctions et 69,78 % lignes**. Tous les seuils initiaux sont respectés.
- Campagnes navigateur finales : **11 contrôles imports/exports** et **11 contrôles
  médias/PWA**, soit 22 contrôles réussis sur un véritable Supabase local privé.
- Limite de stabilité : deux premiers essais médias ont dépassé leur délai
  (rechargement hors ligne, puis téléchargement ZIP après retour réseau). Une
  exécution isolée du build final a ensuite passé les 11 contrôles. Le build de
  référence avec les anciennes dépendances a également passé les 11 contrôles.
  La cause des deux délais n'a pas été isolée : ne pas les présenter comme corrigés
  ni comme une régression établie des dépendances. Ce point est transmis à l'audit
  fonctionnel, sans allonger les délais du produit ou supprimer de contrôles.
- Les tests unitaires des formats relisent un véritable XLSX, contrôlent le
  masquage des coordonnées sensibles et l'absence de formule exécutable pour
  une valeur textuelle commençant par `=`. La pagination PDF a aussi un contrôle
  de contrat ; le parcours navigateur utilise le véritable jsPDF.
- Revue indépendante du candidat : aucun contournement ni régression concret
  signalé, compatibilité des huit copies de minimatch contrôlée. Les tests
  d'exports supplémentaires liés à la couverture ont ensuite été relus et
  exécutés par l'agent principal.

Aucun test d'attaque ni changement de configuration n'a été exécuté sur la
production. Fusion et déploiement restent à effectuer après revue de la PR.
L'alignement de l'historique des migrations Supabase et l'audit général du
fonctionnement restent des tâches distinctes.

## Sources

- Les liens GHSA du tableau identifient chaque avis importé le 1er octobre.
- [Migration Vitest 4 au tag 4.1.11](https://github.com/vitest-dev/vitest/blob/v4.1.11/docs/guide/migration.md) : constructeurs simulés et nouveau calcul de couverture.
- `package-lock.json`, `vite.config.ts`, `vitest.config.ts`, `postcss.config.js`,
  `.github/workflows/ci.yml`, `services/observationExportService.ts`,
  `services/statsExportService.ts`, `services/excelImportService.ts`.
