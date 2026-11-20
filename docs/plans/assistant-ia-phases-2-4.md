# Assistant IA — Phases 2 à 4 (bilan du mois, note → fiche, recherche en langage naturel)

- **Statut** : plan validé le 2026-11-06. Premier lot (bilan du mois) : étape 0 et **PR A** (socle commun, back-end invisible) fusionnées le 2026-11-06 (#123) et **mises en production** le même jour, selon `docs/ops/ASSISTANT-IA.md` §6.2 :
  - tag `ai-identify-v1` posé sur `a8cddfa` ;
  - migration `20261106220000_ai_text_features.sql` appliquée par `db push` (un seul fichier au `--dry-run`) ; droits, version unique d'`ai_reserve_call`, RLS et contrainte vérifiés ; aucune nouvelle alerte de sécurité ;
  - une analyse photo réelle après la migration : ligne `identify`, statut `ok`, 0,011 $ (`ai-identify` inchangée fonctionne) ;
  - secrets `AI_TEXT_MODEL=claude-haiku-5-5` (provisoire) et `AI_DISABLED_FEATURES=summary` ; `ai-text` déployée avec `--use-api`, **fermée** ; contrôles sans frais : 401 renvoyé par la passerelle (`verify_jwt` actif), 204, 403.
  - **Essai du 2026-11-13** (§6.3 du guide) : Sonnet 5.5 contre Haiku 5.5 sur 15 entrées. Haiku a produit 2 bilans fautifs que la validation n'a pas vus (texte coupé à 23 mots, écart faux), Sonnet aucun. **Modèle retenu par le propriétaire : `claude-sonnet-5-5`** (0,0055 $ par bilan en moyenne). Corrections tirées de l'essai : plancher de 40 mots pour un mois qui compte des observations, consignes précisées, champ `individus`.
  - **Fait le 2026-11-13** : en production, `AI_TEXT_MODEL` vaut `claude-sonnet-5-5` et `ai-text` est redéployée (version 3, contrôles 401, 204 et 403 corrects).
  - **PR B du bilan** (application et textes légaux) : fusionnée le 2026-11-13 (#127), voir « Écarts de mise en œuvre (PR B du bilan) » ci-dessous.
  - **Bilan ouvert en production le 2026-11-13** (§6.4 du guide) : `AI_DISABLED_FEATURES` supprimé, `ai-text` redéployée (version 5, contrôles 401, 204 et 403 corrects), premier bilan réel `ok` à 0,0060 $. **Premier lot (bilan du mois) terminé** ; suite : note → fiche (phase 2).
- **Deuxième lot (note → fiche)** : **PR A** (partie serveur, invisible) fusionnée le 2026-11-20 (#130), voir « Écarts de mise en œuvre (PR A de la note) » ci-dessous.
  - **En production le 2026-11-20, note fermée** (`docs/ops/ASSISTANT-IA.md` §6.7) : `AI_DISABLED_FEATURES=note`, `ai-text` déployée (version 7), contrôles 401, 204 et 403 corrects, bilan vérifié, note vérifiée fermée (`503 feature_disabled`).
  - **Essai du 2026-11-20** sur `tests/security/fixtures/ai-text-trial-note.json` : Sonnet 5.5 319 champs justes sur 320, Haiku 5.5 318 sur 320 avec 4 restes de note qui commentent le travail du modèle. **Modèle retenu par le propriétaire : `claude-sonnet-5-5`** (environ 0,01 $ par note), sans réglage par fonctionnalité. Retouches tirées de l'essai : autres espèces **observées** (pas un arbre perchoir), aucun commentaire du modèle dans le reste de la note, « Non renseigné » écrit dans un texte libre traité comme une absence. Passage de contrôle après retouches : 319 sur 320, seul écart jugé acceptable (« jardin » proposé comme lieu).
  - **PR B** (application et textes légaux) : fusionnée le 2026-11-20 (#136) après une relecture croisée (trois défauts importants corrigés avant fusion), voir « Écarts de mise en œuvre (PR B de la note) » ci-dessous. Consentement de la note en version `2026-11-v1` des deux côtés.
  - **Note ouverte en production le 2026-11-20** (`docs/ops/ASSISTANT-IA.md` §6.7, « Ouvrir la note après la fusion de la PR B ») : `ai-text` redéployée fermée, puis `AI_DISABLED_FEATURES` supprimé et `ai-text` redéployée (version 10), contrôles 401, 204 et 403 corrects aux deux étapes ; première note réelle `ok` à 0,0095 $ (Sonnet 5.5), accord `note` enregistré en `2026-11-v1`. **Deuxième lot (note → fiche) terminé** ; suite : recherche en langage naturel (phase 4).
- **Troisième lot (recherche en langage naturel)** : **PR A** (partie serveur, invisible) fusionnée le 2026-11-20 (#138), voir « Écarts de mise en œuvre (PR A de la recherche) » ci-dessous.
  - **En production le 2026-11-20, recherche fermée** (`AI_DISABLED_FEATURES=search`, `ai-text` version 12), selon `docs/ops/ASSISTANT-IA.md` §6.8.
  - **Essai du 2026-11-20** sur `tests/security/fixtures/ai-text-trial-search.json` (22 phrases) : Sonnet 5.5 241 champs justes sur 242, Haiku 5.5 238 sur 242 (une catégorie ajoutée à une espèce précise, le contenu d'une balise recopié dans le texte libre). **Modèle retenu par le propriétaire pour la recherche : `claude-haiku-5-5`** (environ 0,0006 $ par phrase, 18 fois moins que Sonnet) ; le bilan et la note restent sur `claude-sonnet-5-5`. Passage de contrôle avec des consignes durcies, Haiku seul : 241 sur 242, aucune invention ni fuite.
  - **Modèle par fonctionnalité** (`AI_TEXT_MODEL_SEARCH`…) et consignes durcies : PR ouverte le 2026-11-20, voir « Écarts de mise en œuvre (modèle par fonctionnalité) » ci-dessous.
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
- **Écarts de mise en œuvre (PR B du bilan)** :
  - un mois sans observation n'a pas de bouton « Rédiger le bilan » (rien à résumer : pas d'utilisation gâchée) ;
  - à l'ouverture, le sélecteur prend le dernier mois complet **s'il compte des observations**, sinon le mois le plus récent qui en compte (un petit carnet n'ouvre pas sur un mois vide) ; chaque mois affiche son nombre d'observations ;
  - un bilan rédigé pendant le mois puis relu une fois le mois terminé affiche « rédigé avant la fin du mois » ;
  - la comparaison avec l'an passé n'est envoyée que si le carnet remonte jusqu'à ce mois-là (sinon `null`, pas des zéros trompeurs) ;
  - les noms d'espèces sont bornés à 120 unités UTF-16 côté application, comme la fonction les compte ; si des noms très longs dépassaient 15 Ko, des espèces nouvelles passent dans « + N autres » ;
  - le dernier compteur connu est gardé dans le navigateur (`ai-status-v1`), pour l'affichage hors ligne « au jj/mm » et la mention du bouton photo ; il est effacé avec le compte, comme les bilans (`ai-monthly-summaries-v1`) ;
  - les deux clés sont purgées à la suppression du compte (`services/accountService.ts`), pas à la déconnexion : un bilan déjà payé n'est pas perdu en se reconnectant ;
  - la table `ai_consents` est ajoutée à l'export RGPD (`assistant_ia.json`, section `consentements`).
- **Corrections après la relecture croisée de la PR B** (PR suivante, sans changer le texte du consentement `2026-11-v1`) :
  - « 24 mois au plus » devient une vraie durée : un bilan expire 24 mois après sa rédaction, n'est plus relu, et une purge au démarrage retire les expirés de **tous** les comptes du navigateur ; textes légaux précisés (effacés de l'appareil où le compte est supprimé, ailleurs à expiration) ;
  - un seul envoi à la fois (verrou dès le clic), sélecteur figé pendant la vérification, l'accord et la rédaction, « Annuler » arrête la suite ;
  - noms d'espèces calculés sur le seul mois résumé et choisis sans dépendre de l'ordre (plus de faux « Chiffres modifiés ») ; homonymes distingués par le nom latin ;
  - pas de comparaison avec l'an passé pour le mois en cours, ni si le carnet a commencé après le 1er de ce mois-là ;
  - la carte affiche tout ce qui est envoyé : répartition par groupe, jusqu'à 15 espèces et 30 nouvelles (repliables) ;
  - accessibilité : résultat annoncé (`role="status"`), focus gardé sur le bouton pendant l'attente, rendu au bouton après l'accord, rendu au déclencheur à la fermeture d'« Assistant IA » ;
  - compteur oublié quand l'accès n'est plus approuvé ; message hors ligne neutre.
- **Pour la PR B du bilan** (relevé pendant la PR A, traité) :
  - retirer l'accès photo (« Retirer mon accord ») devrait aussi supprimer les lignes `ai_consents` ;
  - un renouvellement de consentement texte se fait toujours par suppression puis insertion, jamais par upsert ;
  - le texte du bilan peut contenir du HTML ou du markdown bruts : l'afficher en texte React, et l'échapper (`escHtml`) s'il entre un jour dans l'export PDF des statistiques (`services/statsExportService.ts`, qui passe par `innerHTML`).
- **Écarts de mise en œuvre (PR A de la note)** :
  - **schéma sans valeur nulle** : les sorties structurées limitent à 16 les champs à type union et à 24 les champs facultatifs, et n'acceptent ni `minimum`, ni `maxLength`, ni `maxItems`. Tous les champs sont donc obligatoires ; l'absence s'écrit `""`, `0`, « Non renseigné » ou `kind: "none"`, et le validateur la rend à l'application sous forme de `null`. Les bornes sont vérifiées par le validateur seul ;
  - les listes fermées reprennent **toutes** les valeurs des énumérations de `types.ts`, « Non renseigné » compris (égalité exacte vérifiée par un test) ; la casse d'une valeur est corrigée, car les sorties structurées ne la garantissent pas ;
  - **un champ fautif est retiré et nommé dans `dropped`** (ordre du schéma), sans rejeter la réponse ; rejet global (`invalid_output`) seulement si la réponse est inexploitable : pas un objet JSON, ou **tous** les champs retirés (`{}`, clés inconnues). Une note hors sujet (tout vide, rien de retiré) reste un succès. Ventilation incohérente : mâles et femelles retirés tous les deux (on ne sait pas lequel est faux). Plus de 5 autres espèces : la liste entière est retirée ;
  - `dateExpr` : `weekday` de 1 (lundi) à 7 (dimanche), `year` null quand la note ne l'écrit pas, `offsetDays` de -366 à 0 ; une date absolue avec année est refusée si elle tombe après demain (marge d'un jour pour les fuseaux) ; sans année, l'application choisira l'occurrence passée ;
  - heure : « 8h30 » et « 7:05 » sont acceptées et rendues en `08:30`, `07:05` ; nom scientifique : binôme ou trinôme, épithète à trait d'union permise ;
  - la limite de 1 000 caractères compte en unités UTF-16 **avant** nettoyage, comme l'attribut `maxlength` de la future zone de texte ;
  - `max_tokens` 3 000 ; coût maximum réservé 0,044 $ avec Sonnet pour une note courte (le schéma et les listes fermées pèsent ≈ 6 Ko) ;
  - consentement : version **provisoire** `2026-11-v0`, déclarée **côté fonction seulement** (`readEnvelope` l'exige). Le test côté application vérifie désormais que chaque version déclarée par l'application est celle de la fonction : ajouter `note` à `AI_TEXT_CONSENT_VERSIONS` ferait apparaître sa carte dans « Assistant IA ». La PR B **doit** remplacer la version provisoire, des deux côtés, en écrivant le texte du consentement : un accord inséré à la main avant ce texte sera alors refusé (un test l'impose) ;
  - suite à la relecture sécurité : une note hors sujet ne produit rien, pas même un résumé dans `remainder` (pas d'assistant généraliste) ; sans total, mâles + femelles restent bornés à 10 000 ; le guide d'exploitation impose d'écrire la liste complète de `AI_DISABLED_FEATURES` (`secrets set` remplace la valeur) et ajoute un contrôle gratuit que la note est bien fermée ;
  - `index.ts` n'est pas modifié ; les journaux restent sans la note ni le résultat (vérifié par le banc `tests/security/ai-text-bench.mjs`) ;
  - pas de contrôle « le nom ou le lieu figurent-ils dans la note ? » : les pluriels et les fautes de dictée le rendraient faux trop souvent ; la relecture par la personne reste le garde-fou ;
  - le script d'essai compare la réponse aux champs attendus de chaque note (juste, inventé, manqué, faux, retiré, fuite) ; les règles de comparaison vivent dans un module pur testé (`tests/security/noteTrialCompare.ts`, `tests/noteTrialCompare.test.ts`) : égalité après normalisation, jamais une inclusion, ensembles sans doublon, fuites cherchées sans accents ;
  - après la relecture de l'orchestrateur : `count` est la somme des nombres partiels quand la note ne donne qu'une ventilation ; le nom d'espèce garde les mots de la note, ni traduction ni complément ; **écart au « tel qu'écrit » du plan** : une faute d'orthographe ou de dictée évidente est corrigée (« buzard des roseaux » → « busard des roseaux »), sans jamais changer d'espèce et, dans le doute, sans rien toucher, car la recherche d'espèce de l'application (`suggestSpeciesAutocomplete`, iNaturalist puis comparaison exacte sans casse ni accents) ne retrouve pas un nom mal orthographié ; même règle pour `otherSpecies` ; une note qui n'écrit que le nom latin laisse `speciesName` vide et remplit `scientificName` ; une date du 1er janvier reste acceptée le 31 décembre au soir (UTC) ; le jeu d'essai est aligné sur ces règles.
- **Pour la PR B de la note** (relevé pendant la PR A) :
  - remplacer la version provisoire `2026-11-v0` du consentement, côté fonction et côté application ;
  - les champs rendus sont **bornés et nettoyés, pas neutralisés** : un `<img onerror>` ou un `javascript:` écrit dans la note peut revenir dans `speciesName`, `location`, `otherSpecies` ou `remainder`. Les afficher en texte React, et les échapper partout où ils atteignent du HTML : export PDF des statistiques (`services/statsExportService.ts`, `innerHTML`), fenêtre de la carte (`components/ObservationMap.tsx`). À revoir si la note peut un jour venir d'un fichier importé ou d'un tiers ;
  - sans année, une date absolue peut être un 29 février : l'application choisit l'occurrence passée qui existe ;
  - ne jamais appliquer un champ nommé dans `dropped` ;
  - idée : journaliser dans `index.ts` le **nombre** de champs retirés (jamais leur contenu), pour voir en production un modèle qui dérive.
- **Écarts de mise en œuvre (PR B de la note)** :
  - deux composants : `components/AiNoteAssist.tsx` (bouton, zone de texte, accord, envoi, annulation) et `components/AiNotePanel.tsx` (relecture, affichage seul) ; l'application au formulaire reste dans `ObservationForm.tsx` (chemin de l'aide photo) et la logique pure dans `utils/aiNoteMapping.ts` ;
  - le résultat est **relu une seconde fois** par l'application (`parseNoteResult`) : bornes, listes fermées de `types.ts`, caractères invisibles ; un champ illisible rejoint `dropped`, et un champ de `dropped` n'est jamais proposé ni appliqué ;
  - **répartition** : mâles et femelles forment une seule proposition ; le reste du total devient « non identifiés », car le formulaire exige mâles + femelles + non identifiés = total. Le panneau la calcule avec le total qui sera **réellement** appliqué (le nombre proposé seulement s'il est coché) ; si elle ne tient pas, il l'annonce et elle n'est pas appliquée. Un nouveau nombre appliqué seul qui rend fausse une répartition déjà saisie est signalé ;
  - **dates** : calculées par rapport à la date de la fiche **à l'ouverture du panneau**, jamais après la date du jour ; une date égale à la date actuelle (« aujourd'hui ») n'est pas proposée ;
  - **pré-cochage** : pour une nouvelle fiche, la date et l'heure du jour comptent comme valeurs par défaut ; pour une fiche existante, jamais ; le nombre 1 compte comme valeur par défaut. Le pré-cochage est **suivi en continu** : un champ modifié dans la fiche pendant la relecture se décoche de lui-même, sauf si la personne a choisi la case elle-même ;
  - **nom latin** : il suit toujours l'espèce appliquée (celui trouvé par la vérification, sinon celui de la note, sinon vide), même quand la note ne donne que le nom commun. Un nom latin tapé à la main qui en diffère n'est remplacé ou vidé qu'après confirmation ; refuser n'applique **rien** (on décoche l'espèce pour garder son nom), plutôt qu'une application partielle ;
  - **annulation** : « Annuler l'application » ne remet que les champs écrits par l'application et que la personne n'a pas modifiés depuis (une photo, un commentaire ou une heure saisis après sont gardés), puis revient au panneau, pour réappliquer sans repayer. Ce que l'enrichissement de l'espèce appliquée a ajouté ensuite (statut, groupe, image, nom latin) est retiré aussi, tant que l'espèce est encore celle de la note. Une erreur pendant l'application remet la fiche à l'état d'avant. Limite connue, commune avec l'aide photo : si iNaturalist et GBIF ne répondent pas alors que l'appareil est en ligne, le message dit « introuvable » ;
  - **replier la zone** masque seulement : la note, un envoi déjà demandé (peut-être déjà compté) et son résultat sont gardés ; seuls les boutons « Annuler » arrêtent un parcours, et leurs messages disent qu'une tentative partie peut compter ;
  - **reste de la note** : masqué quand « Garder la note dans le commentaire » est coché (la note entière le contient), pour éviter tout doublon ;
  - **météo** : la récupération automatique n'est relancée que par un **changement de lieu** (`handleLocationChange`, qui lit la date de la fiche), pas par un changement de date comme l'écrivait le plan ; marquer la météo comme modifiée la protège dans les deux cas ;
  - **hors ligne** : le bouton est désactivé ; une zone déjà ouverte propose « Mettre la note dans le commentaire ». Appliquer hors ligne remplit l'espèce sans la vérifier et le dit (jamais « introuvable »). « Analyser le commentaire » s'appelle « Reprendre le commentaire de la fiche comme note » (fiche existante, commentaire non vide) ;
  - **affichage sûr** : vérifié sans correction nécessaire. La fenêtre de la carte construit son contenu avec `textContent` (`components/ObservationMap.tsx`, `buildPopupContent`), l'export des statistiques échappe les noms (`escHtml`, `services/statsExportService.ts`), et l'icône de la carte n'écrit le groupe que pour un groupe connu. Les champs de la note sont affichés en texte React ;
  - **Sentry** : les traces réseau (`fetch`, `xhr`) sont réduites à l'adresse du site appelé (`beforeBreadcrumb`, `services/errorReportingService.ts`). Avant, l'URL complète partait avec un rapport d'erreur : nom d'espèce cherché (iNaturalist, GBIF, Wikipédia, donc aussi un nom issu d'une note) ou coordonnées (Nominatim, Open-Meteo). Wikipédia est ajouté aux destinataires de la politique de confidentialité ;
  - **relecture croisée de la PR (4 relecteurs, 2026-11-20), corrections dans la même PR** :
    - « Enregistrer et ajouter une autre », ou une autre observation éditée, remonte l'assistant de note (clé de saisie) et invalide l'annulation ; pas d'enregistrement de la fiche pendant une application ; un champ modifié pendant la vérification du nom l'emporte (signalé) ;
    - le nom latin appliqué n'est pas marqué comme saisi à la main (comme l'aide photo) : choisir ensuite une autre espèce le met à jour ;
    - le reste de la note n'est **jamais pré-coché** (il peut contenir des noms de personnes) ; textes d'accord et légaux reformulés : rien de la note n'est enregistré sans le choix de la personne. Version d'accord inchangée (`2026-11-v1`, jamais acceptée en production) ;
    - zone repliée : une erreur, la carte d'accord ou une note hors sujet rouvrent la zone ; un résultat attend (« Résultat à relire ») ; hors ligne, une note en attente reste accessible ;
    - accord : délai maximal de 20 s sur l'enregistrement et la relecture qui suit, focus rendu à « Accepter » en cas d'échec ;
    - compteur relu en arrière-plan après une analyse annulée, un délai dépassé ou une erreur réseau, inconnue ou interne ; leurs messages disent que la tentative peut compter ;
    - répartition pré-cochée seulement si elle sera appliquée telle que la note la dit ; date de référence = date du jour si la fiche n'a pas de date valable (dit dans le détail) ;
    - « Garder la note » décochée quand la note reprend le commentaire ; commentaire borné à 5 000 caractères (contrainte `observations_comment_max_length_check`), aussi contrôlé par `validateObservationForm` ;
    - « Ne rien appliquer » garde le résultat payé (« Revoir les champs proposés » tant que la note ne change pas) ;
    - une annonce par événement, valeurs des cases lues une fois, coût affiché seulement sur le geste qui coûte ;
    - Sentry : les traces d'interface ne gardent plus la valeur de `aria-label`, `alt` et `title` ;
    - textes légaux : Nominatim (coordonnées ou adresse tapée), Open-Meteo (coordonnées et date, ou coordonnées seules), Wikipédia (Wikimedia Foundation, États-Unis) décrits ; le texte d'accord du bilan n'est pas touché ;
  - pas de journalisation du nombre de champs retirés : `index.ts` reste inchangé, comme décidé.
- **Écarts de mise en œuvre (PR A de la recherche)** :
  - **période structurée** plutôt que des jetons texte (`last_n_days:N`, `month:5`) : les sorties structurées n'acceptent pas de motif. `period` est un objet `{ kind, days, month, season, yearScope }`, tous champs obligatoires (absence : 0, `"none"` ou `"all"`), rendu `null` à l'application quand il n'y a pas de période. Types : `this_month`, `last_month`, `this_year`, `last_year`, `last_n_days` (1 à 3 660 jours, aujourd'hui compris), `month`, `season` ;
  - **ajout de `yearScope`** pour un mois ou une saison : `all` (tous les mois de mai), `this_year`, `last_year`, `most_recent` (« en mai dernier », « l'été dernier »). Sans date envoyée, Claude ne peut pas savoir si « mai dernier » est cette année ou l'an passé : l'application tranchera ;
  - **années** : liste de 1 à 60 années écrites (« de 1980 à 2024 » = 45 années), jamais à venir. Une année écrite **l'emporte** sur une période relative, qui est retirée (`dropped`) ; un mois d'une année écrite encore à venir (« décembre 2026 » le 20 novembre 2026) retire la période et les années ; un mois à venir de l'année en cours (`month` avec `yearScope: "this_year"`, « en décembre cette année » le 20 novembre) retire la période, avec un jour de marge pour les fuseaux. Les saisons n'ont pas ce contrôle : leur définition (hiver à cheval sur deux années) appartient à la PR B ;
  - **habitats au pluriel** (« en forêt » = les trois forêts) ; **département et commune** dans deux champs, tels qu'écrits (la table « Gironde = 33 » reste pour la PR B) ;
  - **proximité** : rayon par défaut **10 km** (celui de l'étiquette prévue), ramené entre 0,1 et 100 km et arrondi au dixième ; un rayon négatif ou non numérique retire `near` ; `place` sans nom de lieu aussi ;
  - **genres** : format un peu plus strict que le plan, `^[A-Z][a-z]+( [a-z]+(-[a-z]+)?)?$` (comme le nom scientifique de la note) ; une valeur fautive retire toute la liste. Le format ne distingue pas un nom français capitalisé (« Bruant ») d'un genre : la PR B ne trouvera simplement aucune observation ;
  - **ajout au plan, contre l'invention** : `text`, `department`, `commune` et `placeName` doivent être faits **des mots de la phrase**, à une faute de frappe ou un pluriel près (`wordsFromPhrase`) : « œ » vaut « oe », les apostrophes et les traits d'union sont des séparateurs, et une forme collée vaut ses mots (« Rouge-gorge » pour « rougegorge ») sans que la tolérance puisse avaler un mot entier. Un commentaire, une réponse à une question, une traduction ou un lieu déduit sont retirés. Limites connues : une lettre d'écart laisse passer « Valence » pour « Talence », et une abréviation (« St ») ne passe pas. Les genres et les listes fermées ne sont pas concernés ;
  - **catégories** : 31 entrées dans `utils/taxonCategories.ts` (clé, libellé, groupe de l'application, synonymes, genres ; version 2) : rapaces diurnes, rapaces nocturnes, canards, oies et cygnes, limicoles, mouettes-goélands-sternes, hérons-aigrettes-butors, pics et torcol, mésanges, fauvettes, hirondelles et martinets, corvidés, râles-gallinules-foulques, fringilles, pipits et bergeronnettes, grives et merles, pigeons et tourterelles, bruants, pouillots, grèbes, ongulés, mustélidés, rongeurs, lièvres et lapins, serpents, lézards-orvets-geckos, tortues, grenouilles et crapauds, tritons et salamandres, fougères, bolets. **Écart avec la liste d'exemples** : pas de catégorie qui recopie un groupe de l'application (chauves-souris = « Chiroptères », orchidées = « Orchidées », libellules et demoiselles = « Odonate », papillons de jour, amphibiens) : deux réponses possibles (groupe ou catégorie) rendraient la recherche instable et la comparaison stricte impossible. À la place, des sous-ensembles : grenouilles et crapauds, tritons et salamandres, serpents, lézards, tortues, ongulés, mustélidés, rongeurs, fougères, bolets. Pas de « passereaux forestiers » : ce n'est pas un ensemble de genres défendable. Un genre n'appartient qu'à une catégorie ; d'anciens noms de genre sont gardés pour les données plus anciennes (`Philomachus`, `Leiopicus`, `Elaphe`, `Clethrionomys`, `Neovison`, `Mesotriton`, `Terricola`, `Pitymys`). Après la relecture de l'orchestrateur : `Thinornis` (petit gravelot), `Tamias`, `Callosciurus` et l'orvet (`Anguis`, avec les lézards) ajoutés, ainsi que six catégories (grives et merles, pigeons et tourterelles, bruants, pouillots, grèbes, lièvres et lapins) ; l'exemple de genre en dernier recours donné au modèle devient « les sittelles » = ["Sitta"] (les bruants sont désormais une catégorie). **Dictionnaire à faire relire par le propriétaire**, notamment : l'ouette d'Égypte (`Alopochen`) avec les canards ; les mésanges avec la mésange à longue queue (`Aegithalos`), sans panure (`Panurus`) ni rémiz (`Remiz`) ; l'œdicnème et la bécasse avec les limicoles ;
  - consentement : version **provisoire** côté fonction seulement, comme pour la note, mais **impossible à enregistrer** (`pr-a-fermee-jusqu-au-texte-de-la-pr-b`, plus de 32 caractères alors que `ai_consents.version` en permet 32) : la recherche reste refusée à tous (`consent_outdated`) même si `AI_DISABLED_FEATURES` oublie `search`. Le test côté application redevient « chaque version de l'application est celle de la fonction » (au lieu de l'égalité stricte des deux tables) : seule la recherche peut manquer côté application ;
  - **suite à la relecture sécurité** : version provisoire impossible à enregistrer (ci-dessus) ; commandes de coupure du guide (§6.4, §6.7) réécrites avec `search`, car `secrets set` remplace la liste et les anciennes commandes auraient rouvert la recherche ; les textes rendus ne peuvent ajouter aucun caractère de balisage (`< > " ' \` &`) absent de la phrase ; un genre fait 60 caractères au plus ; le nettoyage commun aux trois fonctionnalités retire aussi les caractères « ignorables » qui n'affichent rien (sélecteurs de variante, remplissage hangul, U+034F, espace braille U+2800), où une consigne pouvait se cacher : la note et le bilan en profitent. Seul le sélecteur de présentation émoji U+FE0F est gardé, une fois à la suite, pour ne pas abîmer « ❤️ » ou « 1️⃣ » (corrigé après la relecture de l'orchestrateur ; les émojis composés avec U+200D, déjà découpés avant ce lot, restent découpés) ;
  - `max_tokens` 2 500 ; coût maximum réservé 0,043 $ avec Sonnet (prompt ≈ 5 Ko avec la liste des catégories, schéma ≈ 3 Ko) ;
  - `index.ts` n'est pas modifié ; le banc `tests/security/ai-text-bench.mjs` vérifie que les journaux ne contiennent ni la phrase ni les filtres, et que couper la recherche seule laisse le bilan et la note ouverts ;
  - essai : comparaison **stricte dès le départ** (`tests/security/searchTrialCompare.ts`) : ensembles égaux, jamais une inclusion ; plusieurs réponses admises s'écrivent `{ "oneOf": [...] }` ; « œ » vaut « oe ». Un champ nommé dans `dropped` a son propre verdict, **« retiré »**, jamais « juste » (le modèle s'était trompé) ; même règle pour la note (`tests/security/noteTrialCompare.ts`). Le script refuse désormais un nom de fonctionnalité qui n'est pas une propriété propre de la table (`--feature toString`).
- **Pour la PR B de la recherche** (relevé pendant la PR A) :
  - remplacer la version provisoire du consentement, des deux côtés, par une version **enregistrable** (32 caractères au plus, un test l'impose), et rétablir le test d'égalité stricte des deux tables (`tests/aiAssistService.test.ts`) ;
  - convertir la période **au moment d'appliquer** : définir les saisons (et l'année d'un hiver), `most_recent`, `last_n_days` aujourd'hui compris ; une période qui tombe dans le futur ne donne rien et doit le dire ;
  - ne jamais appliquer un champ nommé dans `dropped`, et le signaler ;
  - les textes rendus (`text`, `department`, `commune`, `near.placeName`) et les genres sont **bornés et nettoyés, pas neutralisés** : un `<img onerror>` écrit dans la phrase peut revenir, et un genre peut être n'importe quel mot au format « Genre ». Les afficher en texte React, jamais en chaîne HTML (fenêtre Leaflet `bindPopup`, export `innerHTML`) ; `encodeURIComponent` pour Nominatim ; échapper avant de construire une expression régulière ;
  - catégories : comparer le **premier mot** du nom latin aux genres du dictionnaire ; un genre suivi d'une épithète (`genera`) se compare aux deux premiers mots ; dire combien d'observations sont exclues faute de nom latin ;
  - analyse locale gratuite d'abord (`utils/naturalSearchLocal.ts`, synonymes du dictionnaire), cache des phrases, géocodage du lieu nommé par Nominatim et textes légaux, comme prévu plus haut.
- **Écarts de mise en œuvre (modèle par fonctionnalité)** :
  - **un modèle par fonctionnalité, contre « un seul modèle pour tout le texte » prévu** : l'essai de la recherche a montré que Haiku 5.5, 18 fois moins cher, y suffit une fois les consignes durcies, alors que la note et le bilan gardent Sonnet 5.5 (Haiku y commentait son propre travail ou se trompait dans les chiffres). Garder un seul modèle aurait forcé à payer Sonnet pour la recherche, ou à dégrader la note et le bilan ;
  - réglages **facultatifs** `AI_TEXT_MODEL_SUMMARY`, `AI_TEXT_MODEL_NOTE`, `AI_TEXT_MODEL_SEARCH` (`featureModelEnvName`, `resolveFeatureModel` dans `logic.ts`) : chacun l'emporte sur `AI_TEXT_MODEL` pour sa fonctionnalité ; absent ou vide, rien ne change. Un nom sans prix connu donne `misconfigured` pour **cette** fonctionnalité seulement, jamais un repli silencieux, et la valeur fautive n'est pas journalisée. Une fonctionnalité coupée répond `feature_disabled` avant même de lire son modèle ;
  - `index.ts` modifié au minimum : le modèle résolu remplace `AI_TEXT_MODEL` pour le coût réservé, l'appel, le coût réel, `p_model` (colonne `model` d'`ai_usage`) et le journal ;
  - consignes de la recherche durcies avec les trois ajouts essayés par l'orchestrateur (papillons, espèce précise entière sans catégorie, code ignoré) ; validation : un texte rendu qui contient un caractère de code (`< > = { } ;` et accent grave) est retiré, même s'il vient de la phrase ;
  - jeu d'essai : phrase 03 avec les deux groupes de papillons ; six phrases nouvelles (23 à 28), absentes de la consigne, parce que la consigne cite désormais la phrase 10 mot pour mot ;
  - coût maximum de l'essai à blanc (28 phrases) : 0,06 $ avec Haiku seul ; 1,24 $ avec Sonnet seul, au-dessus du plafond `--max-usd` de 1 $ par défaut (`--max-usd 1.5` pour comparer les deux modèles).
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
- **Modèle** : réglable séparément pour les fonctionnalités texte (`AI_TEXT_MODEL`), choisi après un essai comparant Sonnet 5.5 et Haiku 5.5. **Écart** (2026-11-20) : un réglage facultatif par fonctionnalité (`AI_TEXT_MODEL_SEARCH`…) l'emporte sur `AI_TEXT_MODEL`, voir « Écarts de mise en œuvre (modèle par fonctionnalité) ».

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
