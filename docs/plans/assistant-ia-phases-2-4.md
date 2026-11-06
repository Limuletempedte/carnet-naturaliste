# Assistant IA — Phases 2 à 4 (bilan du mois, note → fiche, recherche en langage naturel)

- **Statut** : plan validé le 2026-11-06. Premier lot (bilan du mois) : étape 0 et **PR A** (socle commun, back-end invisible) fusionnées le 2026-11-06 (#123) et **mises en production** le même jour, selon `docs/ops/ASSISTANT-IA.md` §6.2 :
  - tag `ai-identify-v1` posé sur `a8cddfa` ;
  - migration `20261106220000_ai_text_features.sql` appliquée par `db push` (un seul fichier au `--dry-run`) ; droits, version unique d'`ai_reserve_call`, RLS et contrainte vérifiés ; aucune nouvelle alerte de sécurité ;
  - une analyse photo réelle après la migration : ligne `identify`, statut `ok`, 0,011 $ (`ai-identify` inchangée fonctionne) ;
  - secrets `AI_TEXT_MODEL=claude-haiku-5-5` (provisoire) et `AI_DISABLED_FEATURES=summary` ; `ai-text` déployée avec `--use-api`, **fermée** ; contrôles sans frais : 401 renvoyé par la passerelle (`verify_jwt` actif), 204, 403.
  - **Reste** : l'essai Sonnet contre Haiku (§6.3 du guide), le choix d'`AI_TEXT_MODEL`, puis la PR B du bilan.
- **Écarts de mise en œuvre (PR A du bilan)** :
  - la migration finit par `notify pgrst, 'reload schema'`, et `ai_my_status` est remplacée par `create or replace` (droits conservés) ;
  - la migration de secours (`docs/ops/retour-arriere-ai-text-features.sql`) **garde** la contrainte élargie et la table `ai_consents` : remettre l'ancienne contrainte échouerait dès qu'une ligne `summary` existe ;
  - `AI_TEXT_MODEL` n'a pas de valeur par défaut, et un nom inconnu dans `AI_DISABLED_FEATURES` donne `misconfigured` ;
  - corps `{ feature, payload }`, validé **avant** la réservation : une requête invalide ne coûte rien ;
  - bilan : le texte peut citer les écarts avec l'an passé (calculés par la fonction), l'année et l'année précédente ; il est refusé s'il contient des chiffres non ASCII ou un décimal ; `max_tokens` 2 500 ;
  - coût maximum réservé calculé sur la **taille réelle du prompt** (0,032 $ avec Sonnet pour un bilan courant, davantage pour une entrée extrême) ;
  - suite à la relecture sécurité : tous les caractères invisibles de format (classe Unicode Cf) sont retirés, `<` est échappé dans les données envoyées, et la migration pose `lock_timeout = 5s` ;
  - conseil pour la mise en production : `AI_DISABLED_FEATURES=summary` jusqu'à la PR B ;
  - `tests/security/ai-access-rls.mjs` est étendu mais **pas encore lancé** (Docker indisponible sur le portable) ; un banc sans Supabase, `tests/security/ai-text-bench.mjs`, a été lancé avec succès.
- **Pour la PR B du bilan** (relevé pendant la PR A) :
  - retirer l'accès photo (« Retirer mon accord ») devrait aussi supprimer les lignes `ai_consents` ;
  - un renouvellement de consentement texte se fait toujours par suppression puis insertion, jamais par upsert ;
  - le texte du bilan peut contenir du HTML ou du markdown bruts : l'afficher en texte React, et l'échapper (`escHtml`) s'il entre un jour dans l'export PDF des statistiques (`services/statsExportService.ts`, qui passe par `innerHTML`).
- **Base** : `main` à `57bbbe5`. La phase 1 (`docs/plans/assistant-ia-phase1.md`) est en production : fonction `ai-identify`, tables `ai_access` et `ai_usage`, fonctions SQL `ai_reserve_call`, `ai_finalize_call` et `ai_my_status`.
- **Ordre de livraison** : **bilan du mois (phase 3) → note → fiche (phase 2) → recherche (phase 4)**. La première livraison porte le socle commun ; le bilan est la fonctionnalité la moins risquée pour l'éprouver, puisqu'il ne remplit aucun champ et n'envoie que des chiffres.
- **Exploitation** : `docs/ops/ASSISTANT-IA.md`, à compléter dans chaque PR A.

## Contexte

L'aide à l'identification par photo fonctionne. Trois usages de plus, tous en texte :

1. **Note → fiche** (formulaire d'observation) : une note libre tapée ou dictée au clavier du téléphone (« 3 mésanges charbonnières au bord de l'étang, ensoleillé ») est transformée en champs. L'utilisateur relit : **rien n'est appliqué sans validation**.
2. **Bilan du mois** (onglet Stats) : l'application calcule les chiffres, Claude rédige seulement un court texte. Le bilan est généré à la demande, puis conservé pour ne pas le repayer.
3. **Recherche en langage naturel** (liste) : « les rapaces vus en mai près de chez moi » devient des filtres appliqués **localement**. Aucune observation n'est envoyée.

## Décisions prises

- **Pas d'onglet IA** : l'IA reste intégrée là où elle sert, discrète.
- **Signature visuelle commune** à tous les boutons IA :
  - l'icône ✨, c'est-à-dire le « sparkles » aujourd'hui recopié en SVG dans `components/ObservationForm.tsx:948` et `components/Auth/UserProfile.tsx:124` ;
  - une couleur **lavande** réservée à l'IA, via un jeton Tailwind `ai`.
- **Point central** : l'entrée « Aide à l'identification (IA) » du menu du compte devient « **Assistant IA** » : accès, compteur restant, explications, consentements.
- **Quota** : **20 utilisations par mois, tous types confondus**, où 1 action IA vaut 1 utilisation.
  - Pas de crédits pondérés : les coûts sont du même ordre de grandeur (voir « Coûts »).
  - Le compteur se remet à zéro au début du mois UTC, soit vers 1 h à Paris. La formulation reste donc approximative : « repart le 1er ».
- **Bilan conservé sur l'appareil** (navigateur), pas sur le serveur. Il est à régénérer (1 utilisation) sur un autre appareil ou après un nettoyage du navigateur.
- **« Chez moi » = la position actuelle de l'appareil**. Elle n'est jamais envoyée à Claude, et le libellé le dit (« autour de ma position actuelle »). Un lieu de référence enregistré pourra venir plus tard.
- **Pas d'audio** : la dictée du clavier suffit.
- **Modèle** : réglable séparément pour les fonctionnalités texte (`AI_TEXT_MODEL`), choisi après un essai comparant Sonnet 5.5 et Haiku 5.5.

## Architecture

### Une nouvelle fonction `ai-text` ; `ai-identify` n'est pas modifiée

- **Une seule fonction pour les trois fonctionnalités texte.** Elles ont la même forme : un petit corps de texte et une réponse JSON structurée. Seuls changent :
  - le prompt système ;
  - le schéma JSON ;
  - le validateur de sortie ;
  - `max_tokens` ;
  - le coût maximum réservé.

  Elles sont rangées dans une table de fonctionnalités (`summary`, `note`, `search`), choisie par un champ `feature` du corps. Il n'y a qu'une fonction à déployer, à configurer (`verify_jwt`) et à documenter, au lieu de trois.
- **Pourquoi ne pas généraliser `ai-identify`** :
  - elle tourne en production, avec un chemin d'entrée propre aux images : 2 Mo, JPEG uniquement, 1 280 px ;
  - la modifier imposerait de la redéployer et de la réessayer, sans bénéfice pour l'utilisateur ;
  - un défaut dans une fonctionnalité texte ne peut pas casser l'identification photo.
- **Pas de dossier `_shared` pour l'instant.**
  - La documentation Supabase recommande un dossier préfixé par `_` pour le code partagé, mais elle ne dit pas comment `--use-api` l'empaquette.
  - `ai-text/logic.ts` est donc **autonome et sans import**, comme `ai-identify/logic.ts`, pour rester testable par Vitest.
  - Les constantes communes y sont recopiées : prix, CORS, correspondance entre codes d'erreur et codes HTTP, classement des `stop_reason`.
  - **Un test Vitest vérifie qu'elles sont identiques** dans les deux fonctions. C'est le procédé déjà utilisé pour la version du consentement.
- **Secrets et budget partagés** : les secrets Supabase valent pour tout le projet. La clé, `AI_MONTHLY_BUDGET_USD` et `ALLOWED_ORIGINS` servent aux deux fonctions, et la somme `cost_usd` du mois est commune. **Le budget est donc commun.**

### Consentement : un par fonctionnalité

La relecture critique a jugé bloquante l'idée de monter un consentement global à chaque phase. Trois raisons :

- **Production.** `ai_reserve_call` compare la version exactement (`20261105161500_ai_identification.sql:161`). Une personne passée à la nouvelle version serait refusée par `ai-identify`, qui attend toujours `2026-11-v1`. Redéployer `ai-identify` avec la nouvelle version couperait au contraire la photo à tous ceux restés sur l'ancienne.
- **Application.** `mapAccessStatus` compare aussi exactement (`services/aiAssistService.ts:146`). Un ancien onglet resté ouvert afficherait « Renouveler », qui **supprime** la ligne `ai_access` et en recrée une `pending` : l'approbation serait perdue sans que personne le voie.
- **RGPD.** Faire dépendre la photo de l'acceptation d'envoyer du texte lie des finalités distinctes : le consentement ne serait plus granulaire.

**Ce qui est retenu**

- `ai_access.consent_version` reste le consentement **photo** (`2026-11-v1`) et n'est **pas** modifié. La demande d'accès et l'approbation manuelle restent globales.
- **Nouvelle table `ai_consents`**, une ligne par personne et par fonctionnalité texte. Son `given_at`, horodaté par le serveur, sert de preuve du consentement (art. 7.1).
- **Retirer son accord** à une fonctionnalité supprime sa ligne.
- **Renouveler son accord** = supprimer puis insérer. L'approbation dans `ai_access` n'est pas touchée : le propriétaire n'a rien à revalider.
- **Comparaison toujours en égalité stricte**, jamais « supérieure ou égale ». Une version inventée par un utilisateur ne peut que le bloquer lui-même.
- **Le texte du consentement photo reste tel quel** (preuve du texte accepté). Sa ligne « Quota : 20 analyses par mois » reste vraie comme maximum. Le quota est une condition du service, pas du traitement des données : le partage du compteur est donc dit dans les CGU et dans le point central, ce qui évite un renouvellement forcé.
- **Limite acceptée** : la demande d'accès vaut consentement photo, comme aujourd'hui. Aucune donnée ne part tant que l'utilisateur ne clique pas sur le bouton photo.

## Étape 0 : ranger (règle des jaunes)

- `docs/audits/v2/RECAP-lot-E.md:3` : la date « 2026-06-20 » est périmée, car le fichier a été modifié le 2026-11-05. **Corrigée dans la PR de ce plan.**
- `docs/audits/v2/DESIGN-liquid-glass-a-finaliser.md:50` : c'est une décision réellement ouverte, déjà annotée le 2026-11-05. Rien à faire.

## Socle commun (livré avec le bilan)

### Migration unique `supabase/migrations/<YYYYMMDDHHMMSS>_ai_text_features.sql`

Elle sert pour les trois phases : la note et la recherche n'auront **aucune** migration. Commentaires en français, sur le modèle des migrations existantes.

1. **`ai_usage.feature`** : la contrainte accepte `('identify','summary','note','search')`.
   - La contrainte d'origine n'a pas de nom explicite (`20261105161500_ai_identification.sql:43`) : `drop constraint if exists ai_usage_feature_check`.
   - Un bloc `do` vérifie ensuite qu'aucune autre contrainte ne porte sur `feature`, puis la nouvelle contrainte est ajoutée avec un nom explicite.
2. **Table `ai_consents`**
   - Colonnes :
     - `user_id uuid` : référence `auth.users`, `on delete cascade` ;
     - `feature text not null check (feature in ('summary','note','search'))` ;
     - `version text not null check (char_length(version) between 1 and 32)` ;
     - `given_at timestamptz not null default now()` ;
     - clé primaire `(user_id, feature)`.
   - **Droits (point critique).** Une nouvelle table de `public` reçoit tous les droits par défaut. Il faut donc :
     - `revoke all` à `public`, `anon` et `authenticated` ;
     - `authenticated` : `select` et `delete` ; `insert (user_id, feature, version)` seulement, si bien que `given_at` garde sa valeur par défaut ;
     - **aucun** droit de mise à jour ;
     - `service_role` : droits accordés explicitement.
   - **RLS**, règles écrites en `drop policy if exists` puis `create policy` :
     - lecture et suppression de ses propres lignes ;
     - insertion contrôlée par `with check ((select auth.uid()) = user_id)` ;
     - aucune règle de mise à jour.
3. **`ai_reserve_call`**
   - `drop function if exists` de la version à 5 arguments, puis `create` avec un 6ᵉ argument `p_feature text default 'identify'`, et remise des `revoke`/`grant` : EXECUTE réservé à `service_role`.
   - PostgREST appelle par arguments nommés : **l'actuelle `ai-identify` continue de fonctionner sans redéploiement**, et la valeur par défaut s'applique.
   - Le tout dans le même fichier, donc dans la même transaction, sans `BEGIN`/`COMMIT` ajouté à la main.
   - Contrôle final dans `pg_proc` : **une seule** version de la fonction. Deux versions rendraient l'appel ambigu (erreur PostgREST PGRST203).
   - Logique :
     - `p_feature` doit faire partie de la liste, sinon exception ;
     - accès `approved` exigé, quelle que soit la fonctionnalité ;
     - consentement : `ai_access.consent_version = p_consent_version` pour `identify`, sinon une ligne `ai_consents` de cette fonctionnalité avec `version = p_consent_version`, et `consent_outdated` dans le cas contraire ;
     - **`busy` par fonctionnalité** (`and feature = p_feature`) : un appel resté bloqué ne gèle plus les autres fonctionnalités pendant 3 minutes. L'abus reste borné : 4 appels en cours au plus, chacun compté dans le quota et réservé à son coût maximum sous le verrou global ;
     - **quota inchangé** : toutes les lignes du mois sauf `failed`, toutes fonctionnalités confondues ;
     - **budget inchangé** : global, sous `pg_advisory_xact_lock(hashtext('ai_budget'))` ;
     - l'insertion écrit `feature = p_feature`. Aujourd'hui elle ne l'écrit pas, et la valeur par défaut `identify` s'applique ;
     - la purge des lignes de plus de 3 mois est conservée.
4. **`ai_my_status()`**, toujours `security invoker` et appuyée sur la RLS, ajoute deux champs :
   - `used_by_feature` (objet JSON), pour le détail du compteur dans le point central ;
   - `consents` : la version acceptée pour chaque fonctionnalité texte.
5. **Une migration corrective de secours** est rédigée et rangée dans `docs/ops/`, **hors de `migrations/`**. Elle recrée la version à 5 arguments et l'ancienne contrainte. Elle ne sert qu'en cas de retour arrière.

### Fonction `supabase/functions/ai-text/`

1. **`logic.ts`, sans aucun import**
   - **Constantes communes** :
     - `CONSENT_VERSIONS`, par fonctionnalité ;
     - `MODEL_PRICES_USD_PER_MTOK` ;
     - `ALLOWED_EFFORTS` ;
     - CORS (`parseAllowedOrigins`, `corsDecision`) ;
     - `ERROR_HTTP_STATUS` ;
     - `classifyStopReason`.

     Un test d'égalité avec `ai-identify/logic.ts` les accompagne.
   - **Configuration** : `AI_TEXT_MODEL`, `AI_EFFORT` et `AI_MONTHLY_BUDGET_USD`. La fonction refuse de tourner (`misconfigured`) si l'une de ces valeurs est invalide ou si le modèle n'a pas de prix connu.
   - `AI_DISABLED_FEATURES` est une liste séparée par des virgules. Une fonctionnalité coupée répond `feature_disabled` (503).
   - **Par fonctionnalité** :
     - validation de la requête : au-delà de la limite, **refus** (`invalid_request`), jamais de troncature ;
     - prompt système en français : le contenu fourni est une **donnée**, jamais une instruction ;
     - schéma JSON pour `output_config.format` ;
     - validateur de sortie. Les sorties structurées ne savent exprimer ni longueur ni nombre d'éléments : le validateur borne donc les chaînes (120 caractères pour un champ court) et les listes, retire les caractères de contrôle et bidi, et vérifie les listes fermées ;
     - `max_tokens` d'au moins 2 000 à 3 000, car la réflexion compte dedans, même en effort `low` : un `max_tokens` trop serré donnerait `invalid_output`, facturé à l'utilisateur ;
     - coût maximum réservé = `computeCostUsd(model, { input: estimation haute, output: max_tokens })`.
2. **`index.ts`**, sur le modèle de `ai-identify/index.ts`. Dans l'ordre :
   1. CORS (POST uniquement) ;
   2. authentification par `auth.getUser()` ;
   3. lecture du corps, limitée à **16 Ko** ;
   4. `feature` connue et non coupée ;
   5. configuration ;
   6. `ai_reserve_call` avec `p_feature` (un test vérifie que l'argument est bien passé) ;
   7. appel à Claude : SDK `npm:@anthropic-ai/sdk@1.1.0`, la même version qu'`ai-identify`, avec `timeout: 50_000`, `maxRetries: 0` et `output_config: { effort, format: { type: 'json_schema', schema } }`. `stop_reason` est vérifié **avant** de lire la réponse ;
   8. `ai_finalize_call` ;
   9. réponse `{ result, remaining }`.
   - **Erreurs** : mêmes règles qu'`ai-identify`. Une erreur d'Anthropic donne `upstream_unavailable`. La ligne est marquée `failed` à 0 $, ou au coût maximum si l'appel a pu être facturé.
   - **Journaux** : l'id de la ligne, la fonctionnalité, le statut, le modèle, les tokens, le coût et le type d'erreur. **Jamais** l'utilisateur, la note, la phrase, les chiffres ni le texte produit.
3. **`supabase/config.toml`** : `[functions.ai-text] verify_jwt = true`, écrit explicitement.

### Application (socle)

- **`components/icons.tsx`** : un `SparklesIcon` unique, qui remplace les deux SVG recopiés.
- **`components/AiButton.tsx`**, le bouton IA commun :
  - jeton `ai` lavande dans `tailwind.config.js`, avec le mode sombre et un contraste vérifié ;
  - mention « 1 utilisation · N restantes » ;
  - désactivé hors ligne, avec la raison affichée (« Disponible en ligne uniquement. ») ;
  - `aria-label` ;
  - icône animée seulement si `prefers-reduced-motion` ne l'interdit pas.
  - Le bouton photo existant passe dessus.
  - Le `content` de Tailwind ne lit pas `./hooks/**` : garder les classes dans les composants, ou ajouter ce dossier.
- **Point central** : `components/AiAccessDialog.tsx` devient « Assistant IA », et l'entrée du menu est renommée dans `UserProfile.tsx`. Il présente :
  - l'état de l'accès ;
  - le compteur partagé et son détail par fonctionnalité ;
  - une carte par fonctionnalité : à quoi elle sert, où la trouver, ce qui est envoyé, et un consentement à donner ou à retirer ;
  - hors ligne, le dernier compteur connu, avec la mention « au jj/mm ».

  `AiConsentText`, le texte photo, ne change pas.
- **`components/AiConsentCard.tsx`** : à la première utilisation d'une fonctionnalité, une petite carte apparaît à l'endroit même. Elle contient le texte court du consentement, une case obligatoire et un lien vers le point central.
- **`services/aiAssistService.ts`** :
  - `callAiText(feature, body, options, sessionCtx)` reprend l'annulation combinée, le contrôle de session, l'en-tête Bearer et le refus hors ligne de `identifySpecies` ;
  - `giveConsent(feature)` et `withdrawConsent(feature)` ;
  - `AI_TEXT_CONSENT_VERSIONS`, avec un test d'égalité côté fonction ;
  - des messages d'erreur **propres à chaque fonctionnalité** : ceux d'aujourd'hui parlent de photo (« Essayez avec une autre photo ») ;
  - toujours **sans** `mapUserFacingError`.
- **Sentry** : vérifier que ni `logger.error` ni les fils d'événements de la console ne portent de texte saisi.

## Phase 3 — Bilan du mois (livrée en premier, avec le socle)

### Chiffres (application, gratuits, toujours affichés)

Nouveau fichier `utils/monthlySummaryStats.ts`, fait de fonctions pures :

- **Clé d'espèce unique.** Le nom latin normalisé, et à défaut le nom courant, après avoir associé chaque nom courant au nom latin trouvé ailleurs dans les données de la personne. Il existe aujourd'hui deux façons différentes de dédoublonner : `utils/statsReportData.ts:147` (nom brut) et `utils/observationStatsUtils.ts:11` (nom normalisé).
- **Première observation de chaque espèce**, d'où les **espèces nouvelles du mois**.
- **Pour le mois choisi** :
  - nombre d'observations, d'espèces et de jours d'activité ;
  - répartition par groupe ;
  - les 15 premières espèces par effectif ;
  - comparaison avec le même mois de l'année précédente.
- **Plafonds** : 30 espèces nouvelles au plus, puis « + N autres ». Un mois chargé ne dépasse donc pas la limite du corps.
- **Calcul fait sur les observations chargées**, en ligne. Si des enregistrements attendent encore leur synchronisation, une mention l'indique.

### Ce qui est envoyé et ce qui revient

- **Envoyé** : uniquement ces chiffres agrégés, les noms d'espèces et le mois (`YYYY-MM`).
- **Jamais envoyé** : lieu, commune, GPS, commentaire, observateur, date précise.
- **Réponse attendue** : un texte de 80 à 150 mots, en texte brut, avec les chiffres écrits en chiffres.
- **Validateur** : 1 200 caractères au plus ; refus (`invalid_output`) si le texte contient un nombre absent des chiffres fournis.
- **Affichage** en texte React brut : ni markdown, ni `dangerouslySetInnerHTML`, ni lien.

### Interface

`components/MonthlySummaryCard.tsx`, dans `components/ObservationStats.tsx` :

- **Mois** : un sélecteur sur les 12 derniers mois. Par défaut, le **dernier mois complet** ; le mois en cours est marqué « provisoire ».
- **Rédaction** : un bouton IA « Rédiger le bilan ». La carte de consentement `summary` apparaît au premier usage.
- **Conservation** :
  - dans le navigateur, par personne, 24 mois au plus ;
  - avec la date de rédaction et une empreinte des chiffres ;
  - lisible hors ligne ;
  - nouvelle clé de stockage ajoutée à la liste de purge (`services/accountService.ts`, `clearScopedOfflineData`).
- **Chiffres modifiés** : pour un **mois terminé** dont les chiffres ont changé depuis la rédaction, une mention le signale et propose « Régénérer (1 utilisation) ». Le mois provisoire n'affiche pas cette mention.

## Phase 2 — Note → fiche (livrée en deuxième)

### Ce qui est envoyé et ce qui revient

- **Envoyé** : le texte de la note seulement, 1 000 caractères au plus, refusé au-delà. **Aucune date** n'est envoyée.
- **Schéma de réponse** :
  - `speciesName` tel qu'écrit, et `scientificName` facultatif ;
  - `count`, `maleCount`, `femaleCount` ;
  - `dateExpr` : `{ kind: 'none' | 'relative_days' | 'last_weekday' | 'absolute', offsetDays, weekday, day, month, year }`. L'**application** le convertit en date, par rapport à la date du formulaire ;
  - `time` ;
  - `location` : le lieu-dit tel qu'écrit ;
  - champs à liste fermée : `weather`, `habitat`, `comportement`, `observationCondition`, `age`, `sexe`, `phenology`. Ces listes sont recopiées depuis `types.ts`, avec un test d'égalité ;
  - `otherSpecies` : les autres espèces citées, 5 au plus ;
  - `remainder` : ce que la note dit d'autre ;
  - **pas de champ observateurs**.
- **Validateur** :
  - effectifs entiers de 1 à 10 000 ;
  - ventilation cohérente ;
  - nom scientifique au format binomial ;
  - listes fermées respectées ;
  - chaînes bornées.

### Saisie

- **Bouton** : un bouton IA « Remplir depuis une note », en haut de la section Identification de `ObservationForm.tsx`.
- **Zone de texte** :
  - une aide indique que l'on peut dicter avec le micro du clavier ;
  - un avertissement demande d'éviter les noms de personnes et la localisation précise d'espèces sensibles ;
  - la note est gardée en brouillon pendant l'attente et si la zone se ferme.

### Relecture

`components/AiNotePanel.tsx`, appuyé sur un fichier de logique pure, `utils/aiNoteMapping.ts` :

- **Affichage** : chaque champ proposé montre sa valeur actuelle et la valeur proposée, avec une case à cocher.
- **Pré-cochage.** À l'ouverture du panneau, une copie du formulaire est gardée. Une case est **pré-cochée** seulement si le champ est encore identique à cette copie **et** vide ou à sa valeur par défaut. `fieldTouched` ne suit aujourd'hui que 4 champs (`ObservationForm.tsx:67`).
- **« Appliquer la sélection »** est une seule action, que l'on peut annuler :
  1. **l'espèce en premier**, par le chemin de la phase 1 : `suggestSpeciesAutocomplete`, correspondance exacte, puis `applySpeciesAutocompleteSuggestion` ; sinon, remplissage avec un avertissement, et confirmation avant de remplacer un nom latin tapé à la main ;
  2. puis les autres champs, **marqués comme modifiés**. Sans cela, la récupération automatique de la météo, relancée par un changement de date (`ObservationForm.tsx:155-165`), écraserait la météo proposée ;
  3. la ventilation est contrôlée par `validateObservationForm` avant application.
- **« Garder la note dans le commentaire »** est cochée par défaut : rien n'est perdu.
- **Autres espèces citées** : elles sont listées. Une fiche par espèce est une suite possible.

### Hors ligne

- Le bouton est désactivé ; la note peut être gardée dans le commentaire.
- Sur une observation existante, « Analyser le commentaire » reprend ce commentaire comme note, une fois en ligne.

## Phase 4 — Recherche en langage naturel (livrée en troisième)

### Analyse locale d'abord, gratuite

- `utils/naturalSearchLocal.ts` reconnaît les mois, les années, « ce mois-ci » et « le mois dernier », les synonymes de groupes et les statuts.
- Si l'analyse locale suffit, aucun appel n'est fait.
- Sinon, un bouton explicite propose « Interpréter avec l'IA (1 utilisation) ». Une recherche ne consomme jamais de quota à chaque appui sur Entrée.

### Ce qui est envoyé et ce qui revient

- **Envoyé** : la phrase seulement, 200 caractères au plus. Ni date, ni observation, ni position.
- **Schéma de réponse** :
  - **jetons de temps relatifs** : `this_month`, `last_month`, `this_year`, `last_n_days:N`, `month:5` (sans année)… L'application les convertit **au moment d'appliquer le filtre** ;
  - années explicites ;
  - groupes : liste fermée, plusieurs possibles ;
  - **catégories** prises dans un dictionnaire fixe et versionné, `utils/taxonCategories.ts` : rapaces diurnes, rapaces nocturnes, canards, limicoles, laridés, pics, orchidées… chacune avec la liste de ses genres. Claude choisit des **clés** du dictionnaire (liste fermée). Les genres libres ne servent qu'en dernier recours : format `^[A-Z][a-z]+( [a-z-]+)?$`, 20 au plus ;
  - statut et habitat : listes fermées ;
  - département ou commune, sous forme de texte. Le département est normalisé grâce à une table locale (Gironde = 33) ;
  - `near` : `{ kind: 'current_position' | 'place', placeName?, radiusKm }`, avec un rayon ramené entre 0,1 et 100 km ;
  - texte libre.

### Application des filtres

- Ce qui correspond aux filtres existants (`hooks/useObservationFilters.ts`, `hooks/useFilterControls.ts`) **y est écrit** : année, période, statut, groupe unique, rayon. Les réglages existants continuent ainsi de marcher.
- Le reste va dans un `aiFilter` : plusieurs groupes, catégories ou genres, mois de toutes les années, habitat, département ou commune.
- La distance (haversine), aujourd'hui privée dans le hook, est exportée dans un utilitaire.
- **« Réinitialiser » efface les deux.** Un préréglage ne peut pas enregistrer un `aiFilter` : un message le dit.

### Interface

- **Bouton** : un bouton IA à côté du champ de recherche de `components/ObservationList.tsx`, sur mobile comme sur ordinateur. Le mobile n'a aujourd'hui ni filtre par groupe ni période.
- **Étiquettes** « J'ai compris : … », que l'on peut retirer une à une.
- **Avec une catégorie**, le nombre d'observations exclues faute de nom latin est indiqué.
- **« Près de chez moi »** : l'étiquette dit « autour de ma position actuelle (10 km) ». Si la géolocalisation est refusée, une étiquette d'erreur s'affiche, et le critère n'est **jamais** abandonné en silence.
- **Lieu nommé** : il est cherché par `searchAddress` (`services/locationService.ts:166`, Nominatim, déjà autorisé par la CSP). Ce **géocodage direct** est à ajouter aux textes légaux, qui ne décrivent aujourd'hui que la recherche de l'adresse d'une position.

### Cache des phrases

- Les phrases reconnues sont gardées avec leurs filtres, dans le navigateur, par personne.
- La clé est normalisée ; le cache est versionné et garde les 50 dernières phrases.
- Les dates restant relatives, une même phrase rejouée plus tard **ne coûte rien et marche hors ligne**.
- Clé ajoutée à la liste de purge (`services/accountService.ts`).

### Hors ligne

L'analyse locale et le cache fonctionnent ; le bouton IA est désactivé.

## Textes légaux (dans la PR B de chaque phase, livrés avec l'application)

- **`components/LegalPages.tsx`** :
  - **Politique de confidentialité §2 à §6** : ce qui est envoyé pour chaque fonctionnalité, la base légale (le consentement, par fonctionnalité), les durées, les destinataires. Préciser que « jamais la commune ni le commentaire » vaut **pour l'aide photo** : la note, elle, est envoyée telle qu'elle est écrite ;
  - **CGU §3 et §6** : « 20 utilisations IA par mois, toutes fonctionnalités confondues » ; un refus ou une réponse inexploitable compte ;
  - nouvelle date de mise à jour (texte écrit en dur aux lignes 34 et 119).
- **`docs/legal/registre-traitements.md`** :
  - le traitement 9 devient « Assistant IA », avec une sous-section par fonctionnalité : données envoyées, base légale, durées ;
  - y figurent aussi la table `ai_consents` (supprimée avec le compte) et les caches du navigateur (bilans 24 mois, phrases 50 entrées) ;
  - phase 4 : géocodage direct par Nominatim.
- **`docs/legal/infrastructure-regions.md`** (§3 et tableau récapitulatif) et **`docs/legal/api-terms-summary.md`** (§5) : ajouter la fonction `ai-text`.
- **Texte de chaque consentement texte** :
  - ce qui est envoyé, et ce qui ne l'est pas ;
  - pour la note : le texte part **tel qu'il est écrit, lieux compris** ;
  - destinataire Anthropic Ireland Ltd ; transfert vers les États-Unis encadré par les clauses contractuelles types ; conservation 30 jours (jusqu'à 2 ans si un contrôle de sécurité signale la demande) ; pas d'entraînement par défaut ;
  - c'est une aide, et l'utilisateur décide ;
  - un refus ou une réponse inexploitable compte dans le quota ;
  - comment retirer son accord.
- **Les chiffres agrégés et les noms d'espèces** liés à un compte restent des données personnelles : la base légale est le consentement. Pas d'analyse d'impact (AIPD) nécessaire : même petite échelle qu'en phase 1, pas de données sensibles, l'utilisateur décide.

## Déroulé de chaque phase (modèle de la phase 1)

1. **PR A — back-end, rien de visible pour les utilisateurs**
   - la migration (une seule fois, avec le bilan) ;
   - `ai-text`, ou l'ajout d'une fonctionnalité ;
   - les tests ;
   - `docs/ops/ASSISTANT-IA.md` : nouvelle fonction et ses secrets ; requêtes du §1.3 passées à 6 arguments ; requêtes de suivi par fonctionnalité ; consentements ; coupure par fonctionnalité ; retour arrière ;
   - `docs/ops/RUNBOOK-sauvegarde-restauration.md` : `ai-text` et ses secrets.
2. **Étapes en production, faites par le propriétaire**
   1. Avant le bilan : poser un tag `ai-identify-v1` sur la version d'`ai-identify` en service.
   2. Migration (bilan seulement) :
      - `npx supabase migration list --linked` ;
      - `npx supabase db push --linked --dry-run`, qui doit lister **exactement un** fichier ;
      - `npx supabase db push --linked`.

      Jamais par le tableau de bord ni par l'outil MCP `apply_migration`.
   3. Vérifications en lecture seule :
      - `has_table_privilege` et `has_column_privilege` sur `ai_consents` ;
      - `has_function_privilege` sur la nouvelle signature ;
      - une seule version de `ai_reserve_call` ;
      - conseils de sécurité du tableau de bord.
   4. Secrets `AI_TEXT_MODEL` et `AI_DISABLED_FEATURES`, saisis dans le tableau de bord, jamais dans un terminal ni dans une conversation.
   5. `npx supabase functions deploy ai-text --use-api`, puis les contrôles sans frais :
      - 401 sans jeton ;
      - 204 pour la requête préalable CORS depuis le site ;
      - 403 depuis une autre origine.

      Ce premier déploiement, encore invisible, éprouve aussi `--use-api` sans aucun risque.
3. **Essai sur un jeu de test**, en local, avec la clé de l'espace d'essai (plafond de 2 à 5 $) :
   - le jeu : 12 mois de chiffres réels (bilan), 15 à 20 vraies notes (note), ou 20 phrases (recherche), dont des pièges : instructions cachées dans le texte, note hors sujet, plusieurs espèces ;
   - Sonnet 5.5 en effort `low` comparé à Haiku 5.5 ;
   - on relève la qualité, le temps, les tokens et le coût réel ;
   - on choisit `AI_TEXT_MODEL`.
4. **PR B — application et textes légaux, livrés ensemble**, puis mise à jour des compteurs de tests dans `CLAUDE.md` et `AGENTS.md`.
5. **Après la mise en production** :
   - un appel depuis le site en ligne ;
   - contrôle de la ligne `ai_usage` (colonne `feature`) et de la dépense dans la Console.

   Les aperçus Vercel ne peuvent pas appeler les fonctions, car CORS est limité à la production.

**Retour arrière**

- **Fonction** : `git checkout ai-identify-v1 -- supabase/functions/ai-identify`, puis `npx supabase functions deploy ai-identify --use-api`. Ce n'est nécessaire que si `ai-identify` a été touchée, ce qui n'est pas prévu.
- **`ai-text`** : la couper avec `AI_DISABLED_FEATURES`, ou toutes les fonctions IA avec un budget à 0.
- **SQL** : appliquer la migration corrective de secours rangée dans `docs/ops/`.

## Vérification

- **Tests unitaires**, lancés par `npm run check` :
  - **logique d'`ai-text`** :
    - validations, refus au-delà des limites, `feature` inconnue ou coupée ;
    - schémas ;
    - validateurs : listes fermées, bornes, nombre absent des chiffres, caractères de contrôle et bidi, plus d'éléments que permis, réponse qui n'est pas du JSON ;
    - coûts maximum, CORS, codes d'erreur ;
  - **égalités** :
    - constantes d'`ai-text` et d'`ai-identify` ;
    - listes fermées et `types.ts` ;
    - clés de catégories ;
    - versions de consentement côté application et côté fonction ;
  - **fonctions de calcul** :
    - `monthlySummaryStats` : clé d'espèce, espèces nouvelles, plafonds, mois sans observation ;
    - `aiNoteMapping` : dates relatives, pré-cochage, ventilation, ordre d'application ;
    - `naturalSearchLocal` ;
    - `aiSearchFilters` : jetons relatifs convertis au bon mois, rayon borné, département normalisé ;
    - `taxonCategories` ;
  - **service** :
    - en-tête Bearer, annulation au changement de session ;
    - chaque code d'erreur traduit ;
    - aucun appel réseau hors ligne ;
    - consentement donné puis retiré ;
  - **composants** :
    - bouton IA (hors ligne, accessibilité, mention du quota) ;
    - point central et carte de consentement ;
    - panneau de la note : rien n'est appliqué sans clic ; annulation ; un `<img onerror>` s'affiche tel quel ;
    - carte du bilan : provisoire, régénération, lecture hors ligne ;
    - étiquettes de recherche : retrait, géolocalisation refusée.
- **Supabase local** (`supabase db reset`, puis `tests/security/ai-access-rls.mjs`, étendu, avec `CONSENT` et `reserve()` mis à jour) :
  - réservation à 6 arguments ;
  - consentement par fonctionnalité exigé, et `consent_outdated` sur une version différente ;
  - `ai_consents` :
    - impossible de modifier une ligne, ou d'en insérer une pour quelqu'un d'autre ;
    - impossible de lire les lignes des autres ;
    - `given_at` impossible à choisir ;
    - accès anonyme refusé ;
  - `busy` par fonctionnalité ;
  - quota partagé : 20 au total, réparties sur plusieurs fonctionnalités ;
  - `feature` bien enregistrée dans `ai_usage` ;
  - **l'actuelle `ai-identify` de `main` tourne sans changement sur la base migrée** ;
  - une seule version de `ai_reserve_call` dans `pg_proc` ;
  - contrôles `has_function_privilege` mis à jour ;
  - de bout en bout, `ai-text` avec le faux serveur Anthropic :
    - 401, 403, 413 et 400 ;
    - CORS ;
    - `feature_disabled` et `misconfigured` ;
    - coût réel enregistré ;
    - **aucun texte saisi dans les journaux**.

## Coûts

Prix de `supabase/functions/ai-identify/logic.ts:22-25` : Sonnet 5.5 à 2 / 10 $ par million de tokens ; Haiku 5.5 à 0,10 / 0,50 $.

- **Photo, mesuré en phase 1** : environ 0,01 $ par analyse (≈ 2 230 tokens en entrée, ≈ 520 en sortie).
- **Fonctionnalités texte, estimées et à mesurer pendant l'essai** :
  - entre 800 et 1 500 tokens en entrée, car les prompts contiennent les listes fermées ;
  - entre 300 et 700 en sortie, réflexion comprise ;
  - soit **entre 0,4 et 1 centime avec Sonnet**, et environ 20 fois moins avec Haiku.
- **Au plus 20 × 0,01 $ = 0,20 $ par personne et par mois** : le budget de 18 $ n'est pas menacé.
- **Pas de mise en cache du prompt** : les prompts sont probablement trop courts pour en bénéficier, comme en phase 1.

## Hors périmètre (suites possibles)

- **Export RGPD incomplet** : l'export ne contient que les observations, pas `ai_access`, `ai_usage` ni, demain, `ai_consents`, alors que la politique promet l'export de « toutes vos données ». C'est un manque existant, à traiter dans une tâche à part.
- **`_shared`** : faire passer `ai-identify` et `ai-text` sur un dossier partagé, une fois `--use-api` éprouvé.
- **Lieu de référence « chez moi »** enregistré.
- **Note → fiche** : créer une fiche par autre espèce citée dans la note.
- **Taxonomie** : conserver l'ordre et la famille des espèces, pour des catégories sans dictionnaire.
- **Notification** par e-mail des nouvelles demandes d'accès.
- **CORS `*` de `delete-account`**, déjà signalé par les audits.

## Réglages conseillés pour la mise en œuvre

- **Modèle** : Opus 5.5. Le socle reprend des schémas éprouvés en phase 1 ; Fable 5.1 seulement si la migration résiste.
- **Mode** : auto, un lot à la fois, avec une pause après chaque PR A pour la mise en production.
- **Effort** : high, à cause des droits, de l'argent et du RGPD.
- **Ultracode** : non.
- **Advisor** : oui, uniquement sur la migration du socle (consentements, `ai_reserve_call` à 6 arguments, droits), avant de l'écrire.
