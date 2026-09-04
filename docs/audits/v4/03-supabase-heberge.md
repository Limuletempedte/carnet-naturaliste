# Audit v4 — Le projet Supabase hébergé

- **Date** : 2026-09-04
- **État** : ⚠️ **non vérifié** — à compléter

---

## Pourquoi ce document existe

Le serveur MCP Supabase répond `HTTP 401` : le jeton d'accès a été vidé lors
d'un nettoyage de sécurité antérieur (`.mcp.json` contient `"Authorization": ""`).
Le projet hébergé n'a donc **pas pu être inspecté** pendant cet audit.

C'est une limite importante, parce que **le dépôt ne dit rien de la production
sur ces sujets**. Le fichier `supabase/config.toml` que l'on trouve dans le code
est la configuration de la CLI locale — celle qui sert à lancer une base de test
sur ta machine. Les réglages réels du projet en ligne vivent uniquement dans le
tableau de bord Supabase, et peuvent être complètement différents.

Autrement dit : les valeurs de la colonne « Config locale » ci-dessous sont
peut-être fausses en production. Il faut aller regarder.

---

## Comment compléter ce document

### Option A — Me redonner l'accès (le plus rapide)

1. Sur [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens),
   crée un jeton d'accès (nom suggéré : `mcp-audit-v4`).
2. Ouvre `.mcp.json` à la racine du projet — il n'est pas versionné, donc le
   jeton ne partira jamais sur GitHub — et remplace :
   ```json
   "Authorization": ""
   ```
   par :
   ```json
   "Authorization": "Bearer sbp_ton_jeton_ici"
   ```
3. Relance Claude Code, et demande-moi de compléter ce fichier.

Ne colle pas le jeton dans la conversation : il n'a pas besoin d'y passer, et
tout ce qui est écrit dans le chat est conservé.

Je pourrai alors relever automatiquement les advisors de sécurité et de
performance, les policies réellement actives, les index, et l'ensemble des
réglages ci-dessous.

### Option B — Vérifier toi-même

Déroule la checklist ci-dessous dans le tableau de bord. Chaque ligne indique où
cliquer, ce que dit la configuration locale, et ce qui serait raisonnable.

---

## Checklist

### Advisors — commence par là

*Tableau de bord → Advisors*

Supabase analyse le projet en continu et signale les problèmes de sécurité et de
performance. C'est le contrôle qui rapporte le plus pour le moins d'effort, et
il n'a apparemment jamais été relevé dans les audits précédents.

- [ ] Ouvrir **Advisors → Security** et noter chaque alerte.
- [ ] Ouvrir **Advisors → Performance** et noter chaque alerte.
- [ ] Vérifier en particulier si `function_search_path_mutable` apparaît :
      l'audit a confirmé que `set_observations_updated_at()` n'a pas de
      `search_path` figé (cf. [SEC-04](./01-securite.md#sec-04--durcissement-sql-incomplet-)).

Résultat relevé le `__________` :

```
(coller ici la liste des alertes)
```

---

### Authentification

*Tableau de bord → Authentication → Policies / Sign In / Providers*

| Réglage | Config **locale** | Recommandé | Réel ? |
|---|---|---|---|
| Longueur minimale du mot de passe | **6** | **10 ou plus** | [ ] `____` |
| Exigences de complexité | aucune (`""`) | au moins lettres + chiffres | [ ] `____` |
| Confirmation d'e-mail à l'inscription | **désactivée** | à activer | [ ] `____` |
| Réauthentification pour changer de mot de passe | **désactivée** | à activer | [ ] `____` |
| Captcha | **non configuré** | à envisager | [ ] `____` |
| Double authentification (TOTP) | **désactivée** | facultatif | [ ] `____` |
| Durée de validité du jeton | 3600 s (1 h) | correct | [ ] `____` |
| Plafond connexions / inscriptions | 30 par 5 min et par IP | correct | [ ] `____` |

**Le point le plus important est le premier.** Six caractères sans exigence de
complexité, c'est faible pour un compte contenant des données de localisation —
d'autant que le verrou anti-tâtonnement de l'application est côté navigateur
seulement, donc contournable par un simple rafraîchissement de page
(cf. [SEC-06](./01-securite.md#sec-06--mot-de-passe-faible-et-anti-brute-force-contournable-)).

Le porter à 10 est un réglage, pas du code. Attention : le changement ne
s'applique qu'aux **nouveaux** mots de passe — les comptes existants gardent le
leur.

**Sur la confirmation d'e-mail** : l'activer empêche quelqu'un de créer un
compte avec l'adresse d'un tiers. À mettre en balance avec la friction ajoutée à
l'inscription, sur une application grand public à faible volume. C'est un
arbitrage, pas une évidence.

---

### Policies réellement actives

*Tableau de bord → Authentication → Policies*, et *Storage → Policies*

L'audit a vérifié les policies **telles qu'écrites dans les migrations** du
dépôt. Rien ne garantit qu'elles correspondent à ce qui tourne réellement — une
policy a pu être modifiée à la main dans l'interface.

- [ ] Table `observations` : confirmer les **quatre** policies (SELECT, INSERT,
      UPDATE avec `WITH CHECK`, DELETE), toutes conditionnées par
      `auth.uid() = user_id`.
- [ ] Confirmer qu'aucune policy supplémentaire n'a été ajoutée à la main.
- [ ] Storage, bucket `photos` : confirmer que la policy `"Public Access"` est
      bien **absente** (supprimée par la migration de juin 2026) et que
      `"Users can list their own files"` est présente.
- [ ] Confirmer que le bucket `photos` est toujours en `public = true` — c'est
      attendu aujourd'hui, et c'est l'objet de
      [SEC-01](./01-securite.md#sec-01--les-photos-sont-publiques-la-page-légale-dit-le-contraire-).
- [ ] Confirmer les limites du bucket : **20 Mo** par fichier et la liste de
      types autorisés (`image/jpeg` + formats audio).

---

### Index et performance

*Tableau de bord → Database → Indexes*, ou via les advisors

- [ ] Vérifier qu'un index existe sur `observations.user_id` — toutes les
      requêtes de l'application filtrent dessus.
- [ ] Vérifier l'index sur `observations.date` (tri par défaut de la liste).
- [ ] Relever les index inutilisés signalés par les advisors, s'il y en a.

---

### Volume — pour situer les constats de cet audit

Deux constats du rapport ne se déclenchent qu'au-delà d'un certain volume.
Ces chiffres permettent de savoir s'ils sont théoriques ou déjà actifs.

- [ ] Nombre total d'observations en base : `__________`
- [ ] Nombre de comptes utilisateurs : `__________`
- [ ] **Le plus grand nombre d'observations détenues par un seul compte** :
      `__________`
- [ ] Espace occupé par le stockage (photos et sons) : `__________`

> Si un seul utilisateur dépasse **1000 observations**,
> [ROB-01](./02-robustesse.md#rob-01--le-cache-local-est-tronqué-à-1000-observations-après-chaque-synchronisation-)
> n'est plus un risque théorique : son carnet est déjà tronqué hors ligne à
> chaque synchronisation. C'est le chiffre à relever en premier.

---

### Sauvegardes côté Supabase

*Tableau de bord → Database → Backups*

- [ ] Vérifier si le plan actuel inclut des sauvegardes automatiques Supabase
      (les offres gratuites n'en ont généralement pas — c'est la raison d'être
      du workflow GitHub hebdomadaire).
- [ ] Vérifier que le projet n'a pas été **mis en pause** : un projet gratuit
      l'est après environ 7 jours de faible activité, ce qui ferait échouer la
      sauvegarde.

---

## Une fois complété

Reporte ici les alertes des advisors et les valeurs relevées, puis mets à jour
l'en-tête (`État : vérifié le ____`). Si des constats en découlent, ils
prendront les identifiants `SEC-12` et suivants pour rester cohérents avec le
reste du dossier.
