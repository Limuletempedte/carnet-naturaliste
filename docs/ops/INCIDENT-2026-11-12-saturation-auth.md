# Incident du 12 novembre 2026 : tentative de saturation de l'authentification

- **Gravité** : faible. Aucun impact sur les utilisateurs, les données ni les coûts.
- **Statut** : clos. Attaque terminée d'elle-même, rien à corriger.
- **Détecté par** : le propriétaire, qui a vu le pic de requêtes (~172 000) dans le tableau de bord Supabase.
- **Analysé le** : 12 novembre 2026, à partir des journaux Supabase (`edge_logs`), interrogés le jour même. La consultation des journaux est limitée à 24 heures par requête : les chiffres ci-dessous en sont la copie.

## Résumé

Un réseau de machines (botnet) a envoyé **172 782 requêtes en 81 secondes** vers l'adresse de connexion de Supabase. **Toutes ont été refusées dès la passerelle d'entrée**, car aucune ne portait la clé d'API publique du projet. Rien n'a atteint le service d'authentification ni la base de données.

## Chronologie (UTC, heure de Paris entre parenthèses)

| Moment | Événement |
|---|---|
| 13:25:34 (14:25:34) | Première requête de l'attaque |
| 13:25 | 71 298 requêtes dans la minute |
| 13:26 | 101 484 requêtes dans la minute (pic, plus de 1 600 par seconde en moyenne) |
| 13:26:55 (14:26:55) | Dernière requête de l'attaque |
| après | Trafic revenu à la normale : quelques requêtes légitimes par heure |

## Caractéristiques de l'attaque

| Élément | Valeur mesurée |
|---|---|
| Requêtes | 172 782 sur les 172 904 de la journée, soit 99,9 % |
| Cible | `GET /auth/v1/token?grant_type=password`. Cette adresse attend une requête POST : l'attaque visait la saturation, pas une vraie tentative de connexion. |
| Réponse | **401** `UNAUTHORIZED_MISSING_API_KEY` pour 100 % des requêtes de l'attaque |
| Sources | **345 adresses IP distinctes** dans **59 pays** : hébergeurs (DigitalOcean, Huawei Cloud, FDCservers…) et réseaux grand public (Chine, Turquie, Russie, Kenya, Syrie…) |
| Signature | Navigateur annoncé « Mozilla/5.0 (Windows NT 1.0 …) Chrome/131 ». Windows NT 1.0 n'existe pas : c'est la marque d'un outil d'attaque, pas d'un vrai navigateur. |

Les adresses IP ne sont volontairement pas recopiées ici : ce dépôt est public, et ces machines appartiennent souvent à des tiers piratés.

## Impact

Aucun, vérifié le jour même :
- **Authentification** : 35 lignes de journal sur 24 h seulement. Le service n'a pas vu passer l'attaque.
- **Base de données** : aucun compte créé et aucune observation ajoutée sur les 7 derniers jours (24 comptes, 2 994 observations).
- **Utilisateurs réels** : leurs requêtes (`/auth/v1/user`, `/rest/v1/observations`) ont continué d'aboutir (200) pendant la journée.
- **Assistant IA** : aucune requête de l'attaque vers les fonctions `ai-identify` ou `ai-text`. Coût du mois inchangé : 0,03 $ pour 3 appels légitimes.

## Pourquoi l'attaque est restée sans effet

La passerelle de Supabase refuse toute requête qui ne porte pas la clé d'API du projet, avant même de la transmettre aux services. L'attaque n'envoyait pas cette clé.

Si une attaque future envoyait la clé publique, que tout site contient forcément, elle atteindrait le service d'authentification. Les protections en place sont alors :
- le **CAPTCHA Turnstile**, vérifié côté serveur, sur la connexion et l'inscription (lot de sécurité 4, septembre 2026) ;
- les **règles d'accès (RLS)** de la base : chaque compte ne voit que ses propres données ;
- les **plafonds de dépense de l'IA** : 18 $ par mois dans les fonctions et 20 $ dans la Console Anthropic (voir `ASSISTANT-IA.md`).

**Non vérifié à ce jour** : les limites de débit intégrées au service d'authentification de Supabase, et la possibilité de bloquer des adresses IP sur l'API avec l'offre gratuite.

## Ce qu'il faut surveiller

- La page **Usage** du tableau de bord Supabase, de temps en temps : une attaque répétée pourrait finir par peser sur les quotas, même avec des réponses d'erreur très courtes.
- Une hausse anormale des **comptes créés** ou des **appels IA** : requêtes de suivi dans `ASSISTANT-IA.md` §2.

## Requêtes utilisées (journaux Supabase, 24 h glissantes)

Elles sont à relancer telles quelles en cas de nouveau pic, dans l'explorateur de journaux ou avec l'outil `query_logs`.

```sql
-- Volume par service
select source, count(*) as n from logs group by source order by n desc;

-- Ce qui est visé, et la réponse
select log_attributes['request.method'] as methode, log_attributes['request.path'] as chemin,
       log_attributes['response.status_code'] as statut,
       log_attributes['unauthorized_hint.error_code'] as code_refus, count(*) as n
from logs where source = 'edge_logs'
group by methode, chemin, statut, code_refus order by n desc limit 15;

-- Durée, nombre d'adresses et de pays
select min(timestamp) as debut, max(timestamp) as fin, count(*) as requetes,
       uniqExact(log_attributes['request.headers.cf_connecting_ip']) as ip_distinctes,
       uniqExact(log_attributes['request.cf.country']) as pays_distincts
from logs where source = 'edge_logs'
  and log_attributes['unauthorized_hint.error_code'] = 'UNAUTHORIZED_MISSING_API_KEY';
```
