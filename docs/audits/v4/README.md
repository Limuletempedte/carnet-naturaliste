# Audit v4 — Carnet Naturaliste V5.2 (septembre 2026)

- **Date** : 2026-09-04
- **Périmètre** : dépôt `main` au commit `fa9fb07`, en **lecture seule**. Sécurité
  et robustesse uniquement. Aucune ligne de code applicatif n'a été modifiée.
- **Méthode** : cartographie de la surface de sécurité et de la chaîne de
  fiabilité par lecture du code, puis vérification individuelle de chaque
  constat dans le fichier concerné avant publication. Complété par les scans
  semgrep applicatifs que l'audit v3 n'avait pas pu produire, et par une mesure
  fraîche de `npm audit`.
- **Ce qui a déclenché cet audit** : trois lots sont partis en production depuis
  le dernier passage — Sentry (#62), le déblocage des dépendances après Vite 8
  (#64) et la sauvegarde hebdomadaire chiffrée (#66, #67, #68) — et l'audit v3
  s'était interrompu avant son rapport final.

## Comment lire ce dossier

| Fichier | Contenu |
|---|---|
| [`00-rapport.md`](./00-rapport.md) | **Commence ici.** Synthèse, verdict, et tableau de priorisation gravité × effort. |
| [`01-securite.md`](./01-securite.md) | Les 11 constats de sécurité et de vie privée, détaillés avec preuves. |
| [`02-robustesse.md`](./02-robustesse.md) | Les 11 constats de fiabilité, perte de données et tenue en volume. |
| [`03-supabase-heberge.md`](./03-supabase-heberge.md) | Ce qui reste à vérifier dans le tableau de bord Supabase, avec les valeurs attendues. |
| [`04-verifications-manuelles.md`](./04-verifications-manuelles.md) | Les gestes que seul un humain peut faire : exercice de restauration, réglages GitHub. |
| [`evidence/`](./evidence/) | Preuves brutes reproductibles : sorties de `npm run check`, `npm audit`, semgrep. |

## Convention d'identifiants

Chaque constat porte un identifiant stable, réutilisable dans les futurs commits
et messages de PR, comme les audits précédents (`SE-01`, `SI-08`…) :

- **`SEC-01` à `SEC-11`** — sécurité et vie privée
- **`ROB-01` à `ROB-11`** — robustesse et fiabilité

## Limites méthodologiques

À lire avant de tirer des conclusions de ce rapport.

1. **Le projet Supabase hébergé n'a pas pu être inspecté.** Le serveur MCP
   Supabase répond `HTTP 401` : le jeton d'accès a été vidé lors d'un nettoyage
   de sécurité antérieur. Or `supabase/config.toml` n'est **que** la
   configuration de la CLI locale — elle ne dit rien des réglages réels de la
   production. Tout ce qui touche à l'authentification hébergée, aux advisors et
   aux index reste donc **non vérifié** : c'est l'objet de `03-supabase-heberge.md`.
2. **Les constats de volume ne sont pas mesurés.** ROB-01 et ROB-08 sont établis
   par lecture du code, pas par test de charge. Le raisonnement est explicité
   pour que tu puisses le contester.
3. **Aucun test d'intrusion n'a été mené.** Pas de requête forgée contre la base
   de production, pas de tentative de contournement des policies. Les conclusions
   sur la RLS reposent sur la lecture des migrations, pas sur une attaque réelle.
4. **Le scan semgrep n'a pas tout couvert.** Il a sauté 32 fichiers de plus de
   1 Mo, n'a pas pu analyser `components/Badges.tsx` (erreur d'encodage), et son
   analyse de propagation de données **a expiré sur les 8 plus gros fichiers du
   dépôt** — dont `App.tsx`, `ObservationForm.tsx` et `ObservationList.tsx`. Le
   « zéro constat sur le code applicatif » annoncé dans le rapport vaut donc pour
   ce qui a été effectivement analysé, et ne constitue pas une preuve d'absence.
   Détail dans [`evidence/baseline.md`](./evidence/baseline.md).
