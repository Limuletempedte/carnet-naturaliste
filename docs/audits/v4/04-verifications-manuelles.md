# Audit v4 — Vérifications à faire à la main

- **Date** : 2026-09-04
- **Pourquoi ce document** : ces points ne peuvent pas être vérifiés en lisant le
  code. Ils demandent d'ouvrir une interface, de cliquer, ou de dérouler une
  procédure. Aucun ne demande d'écrire du code.

Coche les cases au fur et à mesure. Ce fichier est fait pour être modifié.

---

## 1. L'exercice de restauration — le plus important 🔴

**Constat lié** : [ROB-09](./02-robustesse.md#rob-09--la-sauvegarde-na-jamais-été-restaurée-)

Aujourd'hui, on sait que la sauvegarde **s'écrit**. On ne sait pas qu'elle **se
relit**. Tant que ce test n'a pas eu lieu, il n'existe aucun filet sous
l'application.

Compte environ deux heures, sur un moment calme. La procédure complète est au
§4 du [runbook](../../ops/RUNBOOK-sauvegarde-restauration.md) ; voici les points
de contrôle.

- [ ] **Récupérer la dernière archive.** Onglet *Actions* → *Sauvegarde de la
      base* → dernière exécution verte → télécharger l'artefact.
- [ ] **Vérifier que le déchiffrement fonctionne.** C'est l'étape qui teste la
      clé privée `age`. Si elle a été perdue ou mal recopiée, **on le découvre
      ici** — et c'est exactement pour ça qu'il faut le faire maintenant plutôt
      qu'un jour d'incident.
- [ ] **Noter la taille réelle de l'archive** : `__________ Mo`.
      Si elle est sous ~15 Mo, passer `retention-days` de 35 à **90** dans
      `.github/workflows/sauvegarde-base.yml` (90 est le maximum autorisé).
      C'est gratuit et ça triple la fenêtre de récupération.
- [ ] **Restaurer sur un projet Supabase de test** (pas la production). Créer un
      projet vide, y réinjecter le schéma puis les données.
- [ ] **Vérifier que le compte utilisateur revient** et qu'on peut s'y connecter.
- [ ] **Vérifier que les observations sont là**, en nombre cohérent avec la
      production.
- [ ] **Constater que les photos sont des liens morts.** C'est attendu — les
      médias ne sont pas dans la sauvegarde. Le but est de le voir de ses yeux
      une fois, pour savoir à quoi ressemblerait vraiment une restauration.
- [ ] **Remplir le journal** en fin de runbook (§5), ligne « Exercice de
      restauration ». Ce tableau est vide depuis la mise en service.
- [ ] **Supprimer le projet de test** pour ne pas laisser traîner une copie des
      données.

> Si une seule case de cette section doit être cochée cette semaine, c'est la
> deuxième : vérifier que l'archive se déchiffre. Elle prend dix minutes et
> répond à la seule question qui compte vraiment.

---

## 2. Signal de vie sur la sauvegarde 🟠

**Constat lié** : ROB-09, angles morts

Si le workflow cesse de tourner, **rien ne le signale**. GitHub n'envoie un
e-mail qu'en cas d'échec — pas en cas de silence. Or il existe deux façons très
réalistes pour qu'il se taise :

- GitHub **désactive les workflows planifiés** après 60 jours sans activité sur
  le dépôt. Un e-mail prévient, mais il se noie facilement.
- Un projet Supabase gratuit est **mis en pause après environ 7 jours** de faible
  activité.

- [ ] Créer une surveillance externe gratuite (par exemple
      [healthchecks.io](https://healthchecks.io)) réglée pour alerter si aucune
      sauvegarde n'a eu lieu depuis 10 jours.
- [ ] Ajouter l'appel à cette surveillance en fin de workflow, après l'envoi de
      l'artefact.

Compte dix minutes. C'est le meilleur rapport effort/protection de tout le
rapport.

---

## 3. Copie hors ligne trimestrielle 🟠

Aujourd'hui, le code **et** les sauvegardes vivent dans le même compte GitHub.
Perdre l'accès à ce compte — piratage, suspension, erreur — ferait tout perdre
d'un seul coup. Les archives ne survivent par ailleurs que 35 jours.

- [ ] Télécharger la dernière archive chiffrée et la ranger sur un disque externe
      ou un espace de stockage personnel distinct de GitHub.
- [ ] Vérifier que la clé privée `age` est bien conservée **ailleurs** que sur ce
      même support (sinon les deux se perdent ensemble).
- [ ] Noter la date dans le journal du runbook (§5).
- [ ] Se fixer un rappel trimestriel.

---

## 4. Réglages GitHub à contrôler 🟡

**Constats liés** : [SEC-09](./01-securite.md#sec-09--la-ci-ne-monte-aucune-garde-de-sécurité-), [SEC-11](./01-securite.md#sec-11--dependabot-sans-période-de-quarantaine-)

- [ ] **Vérifier que les mises à jour de sécurité Dependabot sont activées.**
      *Settings → Code security → Dependabot security updates*. Le fichier
      `dependabot.yml` ne le configure pas : c'est un réglage d'interface, non
      versionné, donc invisible depuis le dépôt.
- [ ] **Faire le ménage dans les branches Dependabot.** Il y en a **20 ouvertes**
      au 2026-09-04, dont `dompurify` en trois versions différentes et `fast-uri`
      en trois. Cette accumulation augmente le risque qu'une mise à jour soit
      fusionnée sans examen.
- [ ] **Vérifier que le dépôt est bien privé.** Les artefacts de sauvegarde y
      sont déposés — chiffrés, mais autant ne pas les exposer.
- [ ] *(facultatif)* Activer l'analyse de code GitHub (CodeQL) — gratuite sur les
      dépôts publics, payante sur les privés. Si le dépôt est privé, les scans
      semgrep manuels comme celui de cet audit sont l'alternative gratuite.

---

## 5. Vérifications dans l'application 🟡

**Constat lié** : [SEC-03](./01-securite.md#sec-03--la-politique-de-sécurité-casse-deux-éléments-en-production-)

Deux éléments sont cassés par la politique de sécurité et n'ont jamais été
testés en conditions réelles. Constate-le toi-même, ça prend deux minutes et
c'est plus parlant qu'une explication :

- [ ] **Le lien d'évitement.** Ouvre l'application en production, appuie sur la
      touche `Tab` dès le chargement. Un lien « Aller au contenu principal »
      devrait apparaître en haut à gauche. **Il n'apparaît pas** : la CSP bloque
      le code qui le rend visible. Ce lien sert aux personnes qui naviguent au
      clavier.
- [ ] **Le bouton « Réessayer » hors ligne.** Coupe le réseau, recharge
      l'application pour voir la page hors ligne, clique sur « Réessayer ».
      **Rien ne se passe.**
- [ ] Ouvre la console du navigateur (touche `F12`) pendant ces deux tests : les
      messages de blocage de la CSP y sont visibles, ce qui confirme le
      diagnostic.

---

## 6. Décision à prendre sur les photos 🟠

**Constats liés** : [SEC-01](./01-securite.md#sec-01--les-photos-sont-publiques-la-page-légale-dit-le-contraire-), [SEC-02](./01-securite.md#sec-02--remplacer-une-photo-laisse-lancienne-accessible-à-vie-)

Ce point n'est pas une case à cocher : c'est un arbitrage qui t'appartient.

Aujourd'hui, les photos sont stockées dans un espace **public**. Elles ne sont
pas listables — l'audit v2 a fermé cette porte — mais toute personne détenant
l'adresse d'une photo peut l'afficher sans compte, et cette adresse ne peut pas
être révoquée. Or les mentions légales promettent des données « isolées par
utilisateur ».

Deux issues possibles, et une seule à écarter :

| Option | Ce que ça implique |
|---|---|
| **Fermer l'espace de stockage** | Le vrai correctif. Chantier conséquent : adresses signées à durée limitée, cache côté application, vérification de l'affichage hors ligne et des sauvegardes. |
| **Corriger la promesse** | Reformuler les mentions légales pour décrire ce qui est réellement fait. Rapide, honnête, mais l'exposition demeure. |
| ~~Ne rien faire~~ | À écarter : l'écart entre la promesse et la réalité est ce qui pose problème, plus que l'exposition elle-même. |

- [ ] Trancher entre les deux premières options.
- [ ] Dans les deux cas, dérouler la purge des fichiers orphelins accumulés
      depuis le début du projet — la procédure est prête dans
      [`docs/audits/v2/purge-orphelins-storage.md`](../v2/purge-orphelins-storage.md)
      et n'a jamais été exécutée.

---

## Récapitulatif

| Priorité | Section | Temps | Pourquoi maintenant |
|---|---|---|---|
| 🔴 | §1 — Exercice de restauration | ~2 h | Sans ça, il n'y a aucun filet |
| 🟠 | §2 — Signal de vie | 10 min | Meilleur rapport effort/protection du rapport |
| 🟠 | §3 — Copie hors ligne | 15 min | Un seul compte GitHub = un seul point de rupture |
| 🟠 | §6 — Décision sur les photos | réflexion | Seul écart RGPD substantiel restant |
| 🟡 | §4 — Réglages GitHub | 20 min | 20 branches en attente, réglage non versionné |
| 🟡 | §5 — Constater les bugs CSP | 2 min | Pour voir de ses yeux ce que décrit SEC-03 |
