# Audit v4 — Rapport de synthèse

- **Date** : 2026-09-04
- **Périmètre** : sécurité et robustesse, dépôt `main` au commit `fa9fb07`, en lecture seule
- **Méthode** : lecture de code avec vérification individuelle de chaque constat, scans semgrep applicatifs, mesure `npm audit`
- **Volume** : **22 constats** — 11 de sécurité (`SEC-*`), 11 de robustesse (`ROB-*`)

---

## Verdict

**Le socle de sécurité est sain. C'est la robustesse qui doit être reprise.**

Ce n'est pas une formule de politesse. Sur les 207 fichiers du dépôt, 166 règles
semgrep couvrant l'OWASP Top 10, les CWE Top 25, les secrets, React et
TypeScript ne remontent **aucun constat sur le code applicatif** — avec une
réserve honnête : l'analyse de propagation de données a expiré sur les huit plus
gros fichiers, ce qui est un signal favorable, pas une preuve d'absence
(cf. [limites](./README.md#limites-méthodologiques)). La RLS de la
table `observations` est complète et sans policy permissive. Il n'existe aucune
fonction `SECURITY DEFINER`, aucune requête construite par concaténation, aucun
secret en dur — ni dans le code, ni dans l'historique git. L'identifiant
utilisateur est systématiquement dérivé du serveur, jamais accepté depuis le
client. Les six en-têtes de sécurité attendus sont tous présents, et la CSP
n'autorise ni `unsafe-eval` ni `unsafe-inline` sur les scripts. Les deux
constats critiques de l'audit v2 sont bien corrigés.

En face, cinq mécanismes peuvent faire perdre des données à un utilisateur sans
qu'il en soit averti — et le filet censé rattraper tout le reste, la sauvegarde
hebdomadaire, **n'a jamais été restauré une seule fois**.

L'écart entre les deux moitiés du rapport s'explique : les audits v1 et v2 ont
concentré leur effort sur la sécurité, et cet effort a payé. La robustesse a été
traitée par symptômes, correctif par correctif, sans reprise d'ensemble. Trois
des constats ci-dessous sont d'ailleurs des **corrections incomplètes** : le
mécanisme a été posé à un endroit et oublié à un autre.

---

## Ce qui frappe le plus

**Trois corrections portent un commentaire affirmant qu'elles font une chose
qu'elles ne font pas.** C'est plus préoccupant que les bugs eux-mêmes, parce
qu'un lecteur — humain ou agent — fait confiance au commentaire et passe son
chemin.

| Le code dit | La réalité |
|---|---|
| `// SI-08: Select updated_at to detect concurrent modifications` | Le `updated_at` est bien lu depuis le serveur, mais **jamais comparé à quoi que ce soit**. Aucune détection de conflit n'existe. (ROB-02) |
| `// SI-29: Supabase PostgREST plafonne une requête non paginée à 1000 lignes` — suivi d'une pagination correcte | La même requête, 440 lignes plus bas, **n'est pas paginée** et retombe dans le plafond que le commentaire décrit. (ROB-01) |
| Le bandeau « Erreur critique », livré comme dispositif d'alerte SR-12 | La fonction qui l'active **n'est appelée nulle part**. Il ne peut jamais s'afficher. (ROB-07) |

À quoi s'ajoute un quatrième cas, dans la documentation cette fois :
`supabase_schema.sql` contient encore la policy `"Public Access"` que la
migration de juin a supprimée. Rejouer ce fichier, en croyant remonter le
schéma, rouvrirait la faille H1 de l'audit v2 (SEC-08).

---

## Priorisation — par où commencer

Le tableau croise la gravité et l'effort. **L'ordre de la colonne de gauche est
l'ordre de traitement recommandé.**

### 🔴 À traiter en premier

| # | Id | Constat | Effort |
|---|---|---|---|
| 1 | **ROB-09** | **La sauvegarde n'a jamais été restaurée.** Le runbook le dit lui-même : « on n'a pas une sauvegarde : on a un fichier ». | 2 h, à faire soi-même |
| 2 | **ROB-03** | Une observation saisie hors ligne peut **n'être écrite nulle part** si le stockage local est plein. | Petit — inverser deux lignes |
| 3 | **ROB-02** | Modifier la même observation sur deux appareils **perd une des deux versions**, en silence. | Moyen |

### 🟠 Ensuite

| # | Id | Constat | Effort |
|---|---|---|---|
| 4 | **ROB-01** | Au-delà de 1000 observations, le cache local est **tronqué à chaque synchronisation**. | Petit — copier la boucle qui existe déjà |
| 5 | **SEC-01** | Le bucket photos est **public** alors que la page légale promet l'inverse. Seul décalage RGPD substantiel restant. | Gros |
| 6 | **SEC-02** | Remplacer une photo **laisse l'ancienne** dans le bucket, publiquement accessible, indéfiniment. | Moyen |
| 7 | **ROB-04** | File d'attente et cache **purgés en silence** après 30 et 90 jours. | Petit |

### 🟡 Puis

| # | Id | Constat | Effort |
|---|---|---|---|
| 8 | **SEC-09** | CI sans `npm audit` ni analyse de sécurité, actions sur tags mutables, sans `permissions:`. | Petit |
| 9 | **ROB-06** | Échec de suppression d'un fichier photo **invisible** : l'erreur retournée n'est jamais lue. | Petit |
| 10 | **SEC-03** | La CSP **casse** le lien d'accessibilité et le bouton « Réessayer » de la page hors ligne. | Petit |
| 11 | **SEC-05** | Sentry reçoit 100 % des erreurs sans filtrage de contenu ; un nom d'espèce y transite déjà. | Petit |
| 12 | **ROB-05** | Hors ligne, la file d'attente n'est pas réconciliée avec le cache. | Petit |
| 13 | **SEC-04** | `search_path` non figé ; `created_at` falsifiable à l'insertion. | Petit |
| 14 | **ROB-11** | Les données venant du serveur sont **castées sans validation**. | Moyen |

### 🔵 Quand le reste sera fait

`SEC-06` mot de passe à 6 caractères et anti-brute-force contournable ·
`SEC-07` import JSON sans limite de taille · `SEC-08` `supabase_schema.sql`
désynchronisé · `SEC-10` `dompurify` vulnérable mais non exploité ·
`SEC-11` Dependabot sans quarantaine · `ROB-07` bandeau d'erreur mort ·
`ROB-08` exports sans limite de volume · `ROB-10` `App.tsx` non couvert, zéro test E2E.

---

## Regroupement en lots

Les constats se regroupent naturellement. Traiter un lot entier coûte à peine
plus cher qu'un constat isolé, parce qu'ils touchent les mêmes fichiers.

| Lot | Contenu | Fichier principal |
|---|---|---|
| **A — Ne plus perdre de données** | ROB-01, ROB-02, ROB-03, ROB-04, ROB-05, ROB-06 | `services/storageService.ts` |
| **B — Vérifier la sauvegarde** | ROB-09 + les réglages GitHub | À faire à la main, cf. `04-verifications-manuelles.md` |
| **C — Tenir la promesse RGPD** | SEC-01, SEC-02 + purge des orphelins | `services/storage/storageMedia.ts`, migrations |
| **D — Durcir la chaîne de build** | SEC-09, SEC-11, SEC-10, npm audit | `.github/workflows/` |
| **E — Petites dettes** | SEC-03, SEC-04, SEC-05, SEC-07, SEC-08, ROB-07 | Dispersé, chaque point est indépendant |

Le **lot A** est celui qui protège le plus d'utilisateurs pour le moins d'effort :
six constats dans un seul fichier, dont trois ne demandent que quelques lignes.

Le **lot B** ne demande aucun code — mais c'est le plus important du rapport.

---

## Ce que l'audit a vérifié et écarté

Ces points ont été contrôlés et sont **toujours en place**. Ils ne sont pas
ré-instruits, mais leur bon état est confirmé au 2026-09-04 :

RLS complète sur `observations` (SELECT / INSERT / UPDATE avec `WITH CHECK` /
DELETE, aucune policy permissive) · aucune fonction `SECURITY DEFINER` ·
identifiant utilisateur toujours dérivé de `auth.getUser()` côté serveur ·
aucune requête SQL concaténée · un seul point d'injection HTML dans tout le
dépôt, correctement échappé · CSP stricte, six en-têtes de sécurité présents ·
aucun secret en dur, historique git propre · edge function de suppression de
compte à JWT vérifié, listing récursif fonctionnel · clé `service_role`
correctement cantonnée au serveur · validation stricte des imports Excel et JSON ·
limites serveur du bucket (20 Mo, types MIME) · FK en cascade · fonts
auto-hébergées · région d'hébergement UE.

---

## Suite

Ce rapport ne modifie aucun code. Les corrections feront l'objet de lots
séparés, à décider après lecture. Deux documents sont directement actionnables
sans moi :

- [`04-verifications-manuelles.md`](./04-verifications-manuelles.md) — l'exercice de restauration et les réglages GitHub
- [`03-supabase-heberge.md`](./03-supabase-heberge.md) — les réglages à contrôler dans le tableau de bord Supabase
