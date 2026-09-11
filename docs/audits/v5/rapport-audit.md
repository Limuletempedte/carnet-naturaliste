# Security Review: carnet-naturaliste

## Scope

Résistance aux attaques de la PWA et du backend Supabase; code, tests locaux synthétiques et métadonnées de production en lecture seule. Revue intégrale dédupliquée: 132 fichiers suivis; 324 fichiers examinés pour les motifs de secrets.

- Scan mode: repository
- Target kind: git_revision
- Target ID: target_sha256_b96ee465d5db7b1f8312dac36a257caed660634b9e9c2ad352809c36aba5efa6
- Revision: 0041b1c1964251cb6585ce69eef6f43ceb72bc4f
- Inventory strategy: repository
- Included paths: .
- Excluded paths: none
- Runtime or test status: 36 scénarios API locaux, 32 tests ciblés Vitest, navigateur sur bundle compilé; données fictives uniquement.
- Artifacts reviewed: App.tsx, supabase/migrations/, supabase/functions/delete-account/index.ts, services/, components/, hooks/, contexts/, utils/, .github/workflows/, vercel.json, package-lock.json

Limitations and exclusions:
- Pas de test d’attaque sur le site en ligne ou ses services tiers.
- Paramètres Auth hébergés complets et charges distribuées non vérifiés.
- Le service worker est désactivé pour le scénario navigateur A/B; son isolation a été examinée statiquement seulement.
- Révision manuelle centrée sur le code applicatif et sa configuration; tests historiques, rapports antérieurs et illustrations ne sont pas tous relus ligne par ligne.
- Le paquet de reproduction inclut des assertions du comportement vulnérable actuel; passer ces tests ne signifie pas que le produit est sécurisé.
- Excluded attaques sur production et services tiers: Périmètre utilisateur: lecture seule en ligne, attaques exclusivement locales.
- Excluded audit de santé, performance générale, UX et fonctionnalité: Mission ultérieure distincte.

### Scan Summary

| Field | Value |
| --- | --- |
| Scan outcome | completed |
| Reportable findings | 6 |
| Severity mix | medium: 3, low: 3 |
| Confidence mix | high: 6 |
| Coverage | partial |
| Validation mode | static-and-local-runtime |

Canonical artifacts: `scan-manifest.json`, `findings.json`, and `coverage.json`. This report is a deterministic projection of those files.

## Threat Model

Carnet Naturaliste est une PWA React/TypeScript construite par Vite. Le navigateur exécute l’interface, les imports, les exports, les caches et la synchronisation; il contacte directement Supabase pour Auth, public.observations et Storage. Le seul backend applicatif identifié est la fonction Deno delete-account, qui vérifie le jeton puis utilise service_role pour effacer le compte courant et ses médias. Le démarrage initialise Sentry si configuré, enregistre le service worker, puis monte AuthProvider et App (index.tsx:10-12, index.tsx:72-87; supabaseClient.ts:3-15; services/accountService.ts:7-27; supabase/functions/delete-account/index.ts:52-103). Le déploiement frontend prévoit des réécritures et en-têtes Vercel; les modes dev, build, preview et dev:test sont distincts (vercel.json:2-35; package.json:6-20). Le dépôt propose deux chemins de création de base qui divergent: migrations complètes et schéma SQL autonome référencé dans README.md:46-49. Revue indépendante, statique et hors ligne du commit 0041b1c1964251cb6585ce69eef6f43ceb72bc4f; elle ne constitue pas une couverture complète d’audit.

### Assets

- Observations rattachées à user_id: espèces, dates, commentaires, coordonnées GPS exactes, lieux, observateurs et références de médias. Leur confidentialité et leur intégrité doivent être indépendantes de l’interface (supabase/migrations/20240101000000_initial_schema.sql:5-36; services/storage/storageMappers.ts:43-76).
- Photos et sons: deux sous-arborescences du même bucket photos, respectivement \<uid\>/photos/\<timestamp\>-\<uuid\>.jpg et \<uid\>/sounds/\<timestamp\>-\<uuid\>.\<extension\>. Les consommateurs utilisent actuellement des URL publiques (services/storage/storageMedia.ts:19-47, services/storage/storageMedia.ts:59-93).
- Comptes Auth, sessions et capacité de suppression du compte. SUPABASE_SERVICE_ROLE_KEY est une autorité serveur distincte de la clé publique frontend et ne doit pas sortir de l’environnement de fonction (supabaseClient.ts:3-15; supabase/functions/delete-account/index.ts:66-96).
- Données hors ligne du navigateur: local_observations_cache:\<uid\>, ses suffixes _ts et _v, offline_sync_queue:\<uid\>, ainsi que cached_auth_session. Les espaces de noms ne constituent pas une isolation contre un script de même origine ou un détenteur du profil navigateur (services/storageService.ts:23-30, services/storageService.ts:65-98; services/storage/storageHelpers.ts:39-40; contexts/AuthContext.tsx:37-50).
- Cache HTTP des médias publics: Cache Storage supabase-storage-cache, commun à l’origine de la PWA, limité à 50 entrées et 30 jours. Ce stockage est distinct du localStorage effacé à la déconnexion (vite.config.ts:79-93; contexts/AuthContext.tsx:183-202; services/storageService.ts:69-77).
- Exports téléchargés par le titulaire. Le ZIP carnet-naturaliste-backup-\<date\>.zip contient data.json, data.csv, les GPS exacts et, par défaut, photos et sons; les exports destinés au partage appliquent une réduction de précision GPS aux statuts sensibles (services/backupService.ts:158-222, services/backupService.ts:253-254, services/backupService.ts:376-411; services/observationExportService.ts:7-25; utils/gpsPrivacy.ts:3-14).
- Sauvegarde administrative: secret GitHub SUPABASE_DB_URL, dumps temporaires sauvegarde/roles.sql, sauvegarde/schema.sql et sauvegarde/data.sql, puis archive age chiffrée conservée 35 jours. La clé publique BACKUP_AGE_PUBLIC_KEY choisit le destinataire cryptographique; la clé privée est un actif opérateur externe au workflow. Les binaires photos/sons ne sont pas sauvegardés par ce chemin (.github/workflows/sauvegarde-base.yml:80-121, .github/workflows/sauvegarde-base.yml:200-232; docs/ops/RUNBOOK-sauvegarde-restauration.md:110-127).
- Intégrité du frontend distribué, des migrations et des workflows. Les dépendances installées et le code des contributions s’exécutent dans la CI; la sauvegarde administrative est un workflow séparé sans checkout et avec permissions GitHub vides (.github/workflows/ci.yml:3-35; .github/workflows/sauvegarde-base.yml:8-31).

### Trust Boundaries

- Navigateur non fiable vers Supabase Auth: email/mot de passe, récupération et renouvellement de session. L’interface impose seulement un ralentissement local après plusieurs échecs; les limites opposables doivent être appliquées par Auth. Le fichier local configure notamment 30 connexions/inscriptions par cinq minutes/IP, une durée JWT de 3600 secondes et la rotation des refresh tokens; ces réglages ne prouvent pas ceux de production (components/Auth/Login.tsx:38-49, components/Auth/Login.tsx:73-105; supabase/config.toml:150-190).
- Utilisateur connecté vers public.observations: le client récupère l’identité par getUser, construit user_id explicitement et filtre les opérations. PostgreSQL applique séparément RLS: propriétaire pour SELECT/INSERT/DELETE et propriétaire avant/après UPDATE. Les contraintes de valeurs et longueurs sont serveur; le déclencheur protège created_at lors des modifications (services/storageService.ts:303-349, services/storageService.ts:353-378, services/storageService.ts:416-466, services/storageService.ts:508-553; services/storage/storageMappers.ts:43-45; supabase/migrations/20240101000000_initial_schema.sql:114-132; supabase/migrations/20260404100000_theme5_sync_integrity.sql:11-52).
- Utilisateur vers Storage: upload, modification, suppression et listing sont autorisés suivant le premier composant du chemin égal à auth.uid(). Les migrations complètes limitent chaque objet à 20 MiB et à JPEG ou aux six MIME audio déclarés. La lecture par URL publique constitue une autre capacité: le bucket reste public=true et le durcissement du listing affirme explicitement conserver ces lectures publiques (supabase/migrations/20240101000000_initial_schema.sql:134-156; supabase/migrations/20260611100000_audit_v2_storage_hardening.sql:3-36).
- Session active vers données hors ligne: AuthProvider choisit le namespace utilisateur; un cache minimal d’identité, version 3 et TTL deux jours, peut restaurer l’affichage hors ligne lorsque getSession échoue. Ce cache ne contient pas lui-même de jeton d’accès. Les mutations en ligne et le rejeu de file demandent getUser; la file capture aussi le namespace et revérifie périodiquement Auth. Le cache applicatif annoncé à 90 jours et les actions de file annoncées à 30 jours sont des politiques client, pas une autorisation serveur (contexts/AuthContext.tsx:11-13, contexts/AuthContext.tsx:37-91, contexts/AuthContext.tsx:124-172; services/storageService.ts:108-124, services/storageService.ts:167-204, services/storageService.ts:589-625, services/storageService.ts:649-724).
- Fichier fourni à un utilisateur vers son contexte applicatif: JSON, Excel et ZIP sont lus dans le navigateur, transformés en observations, présentés en prévisualisation puis envoyés via les mêmes services de persistance. Le JSON reconstruit explicitement les propriétés autorisées et limite les URL aux protocoles HTTP(S); les modes merge/no-overwrite ne remplacent pas l’autorisation RLS. Excel prévoit 15 MiB, 10000 lignes et 120 colonnes; ZIP vérifie une taille compressée de 500 MiB avant JSZip. Les limites de travail après décompression et celles du JSON sont des questions de validation, pas des protections établies par cette cartographie (components/ObservationList.tsx:162-210, components/ObservationList.tsx:244-250; services/jsonImportValidation.ts:34-41, services/jsonImportValidation.ts:269-330; services/importPolicy.ts:18-46; hooks/useImportObservations.ts:45-117; services/excelImportService.ts:72-74; services/backupService.ts:427-427, services/backupService.ts:460-498).
- Données d’observation ou réponses externes vers le DOM, Leaflet et les téléchargements. Un consommateur représentatif, la popup Leaflet, utilise textContent et une validation de protocole pour les images. Les exports CSV protègent les préfixes de formule. Ces contrôles localisés ne constituent pas une validation de tous les composants et exports (components/ObservationMap.tsx:40-84; utils/urlUtils.ts:5-13; utils/csvUtils.ts:1-14).
- Navigateur vers delete-account, puis fonction privilégiée vers Supabase: POST et Authorization sont requis; le serveur valide le jeton avec getUser, prend exclusivement user.id et ne lit pas un identifiant dans le corps. La capacité service_role liste récursivement photos/\<uid\> par pages de 100, supprime par lots de 100, puis supprime auth.users/\<uid\>. La cascade de la migration supprime les observations. Une erreur de suppression des fichiers arrête la suppression du compte. CORS '\*' autorise des origines mais ne remplace pas le jeton requis (supabase/functions/delete-account/index.ts:3-6, supabase/functions/delete-account/index.ts:14-49, supabase/functions/delete-account/index.ts:52-103; supabase/migrations/20260404100000_theme5_sync_integrity.sql:5-9).
- Navigateur vers services externes: requêtes taxonomiques encodées vers iNaturalist, GBIF et Wikipedia; recherche d’adresse et GPS exacts vers Nominatim; GPS exacts et date vers Open-Meteo; coordonnées de tuiles vers CARTO, OSM, Esri ou OpenTopoMap. Ces appels sont GET, mais transportent bien des éléments saisis ou dérivés de l’observation. Le CSP Vercel limite les destinations et le navigateur applique CORS; les réponses restent des données non fiables (services/speciesService.ts:235-241, services/speciesService.ts:286-295, services/speciesService.ts:330-360; services/locationService.ts:117-120, services/locationService.ts:138-147, services/locationService.ts:166-169, services/locationService.ts:195-198; components/ObservationMap.tsx:233-251; vercel.json:33-34).
- Erreurs du navigateur vers Sentry: activation conditionnée par VITE_SENTRY_DSN, désactivation de plusieurs collectes HTTP et utilisateur, tracing à zéro, exclusion BrowserSession et filtrage des erreurs de chunks. reportError transmet encore des objets Error et des chaînes de contexte; l’absence d’observations dans ces contenus doit être vérifiée aux appelants (services/errorReportingService.ts:17-48, services/errorReportingService.ts:58-73).
- Publication du frontend: la configuration Vercel prévoit script-src 'self', object-src/frame-src 'none', DENY, nosniff et HSTS. Les commandes Vite locales et la construction CI ne démontrent pas l’application de ces en-têtes. Le propriétaire du déploiement et des variables de compilation contrôle les endpoints injectés (vercel.json:13-35; package.json:6-20; .github/workflows/ci.yml:30-35).
- Opérateur de sauvegarde vers base puis GitHub: workflow planifié ou manuel, secret de connexion DB privilégié, CLI Supabase et age sur runner Ubuntu, dumps en clair avant chiffrement et publication de la seule archive .tar.gz.age. Les logs de diagnostic sont un destinataire distinct des artefacts; le workflow affiche erreur.log lors des échecs. La clé privée de déchiffrement et les droits des personnes pouvant modifier secret, variable ou workflow sont des contrôles externes (.github/workflows/sauvegarde-base.yml:8-31, .github/workflows/sauvegarde-base.yml:34-78, .github/workflows/sauvegarde-base.yml:80-121, .github/workflows/sauvegarde-base.yml:200-232).

### Attacker Capabilities

- Un visiteur anonyme peut charger le frontend et connaître l’URL Supabase ainsi que la clé publique injectée. Il peut appeler directement les API accessibles, tenter Auth et présenter des URL d’objet connues; cela ne lui donne pas une session utilisateur ou service_role (supabaseClient.ts:3-15; supabase/functions/delete-account/index.ts:61-78).
- Un utilisateur malveillant dispose de son propre compte et peut ignorer les contrôles React, forger les champs, identifiants, filtres, noms de fichiers et MIME envoyés aux API. L’enjeu supplémentaire est la lecture ou modification d’autrui, la publication involontaire de médias, ou la consommation des ressources partagées; ses propres opérations autorisées ne sont pas une escalade (supabase/migrations/20240101000000_initial_schema.sql:114-156; supabase/migrations/20260611100000_audit_v2_storage_hardening.sql:15-36).
- Un auteur de fichier piégé peut contrôler JSON/Excel/ZIP si le titulaire choisit de l’importer. Les entrées et médias d’un compte ne sont pas automatiquement affichés à un autre compte dans l’architecture observée; une hypothèse XSS interutilisateur nécessite donc un canal supplémentaire, comme cet import ou une réponse externe compromise (components/ObservationList.tsx:162-210; services/storageService.ts:321-326).
- Un fournisseur externe compromis peut contrôler ses réponses taxonomiques, géographiques ou ses médias. Il ne reçoit pas de service_role et ne dispose pas, du seul fait de ce rôle, d’une écriture directe sur observations; le client peut toutefois enregistrer certains résultats d’enrichissement sous l’identité courante (services/speciesService.ts:235-241; services/locationService.ts:195-198; services/storageService.ts:480-490).
- Un script exécuté dans l’origine de l’application, ou une personne contrôlant le même profil navigateur, peut atteindre le stockage de cette origine. Le namespace utilisateur et le cache d’identité hors ligne ne sont pas un cloisonnement contre cette autorité déjà locale; il faut distinguer ce préalable d’une attaque distante sans exécution préalable (contexts/AuthContext.tsx:37-91; services/storageService.ts:69-98).
- Un contributeur de pull request peut faire exécuter du code par le workflow CI pull_request. Cette capacité est distincte du workflow de sauvegarde schedule/workflow_dispatch, qui ne checkout pas le code. Les permissions GitHub effectives, protections de branche, secrets de déploiement et identité de l’opérateur ne sont pas présumés compromis (.github/workflows/ci.yml:3-31; .github/workflows/sauvegarde-base.yml:8-18).

### Security Objectives

- Exigence explicite de l’utilisateur: observations, photos et sons privés par défaut, sauf partage expressément prévu. Appliquer cette exigence séparément aux lignes SQL, au listing Storage, aux URL d’objet, aux caches et aux exports.
- Les API doivent imposer le propriétaire indépendamment des identifiants ou champs transmis par le client; une modification ne doit pas transférer user_id. Le chemin Storage doit rester rattaché à auth.uid().
- Aucun utilisateur ou visiteur ne doit obtenir la capacité service_role, SUPABASE_DB_URL, des jetons d’un autre compte ou une sauvegarde déchiffrable qui ne lui appartient pas.
- La fonction de suppression doit agir exclusivement sur l’identité validée par Auth, et traiter les médias avant la suppression irréversible du compte.
- Les imports, réponses externes et données mises en cache doivent rester des données; leur rendu ou export ne doit pas autoriser l’exécution de scripts ou formules sous l’autorité du titulaire.
- Les limites serveur doivent protéger le service partagé; les limites client doivent borner les lectures, décompressions, allocations, uploads et synchronisations, avec une vérification positive des opérations légitimes.
- La déconnexion et les changements de compte doivent empêcher l’affichage ou le rejeu involontaire des données d’un autre utilisateur dans l’utilisation normale du navigateur.
- Les données exactes exportées volontairement, les transferts vers les API tierces et la télémétrie doivent correspondre aux attentes et déclarations de confidentialité.
- Contexte d’audit fourni par l’utilisateur: accès en ligne en lecture seule; requêtes malveillantes, suppressions, saturation et reproductions uniquement dans un environnement local isolé avec données fictives. Aucune correction de production dans cette mission.

### Assumptions

- Le commit et l’absence de modifications suivies ont été vérifiés hors ligne. Les 97 ancres utilisées lors de la cartographie ont été contrôlées contre 39 fichiers suivis et leurs bornes de lignes. Aucune application, attaque ou requête externe n’a été exécutée par cette revue.
- Le contexte utilisateur annonce la correspondance du commit local et du dernier déploiement retrouvé; l’identité actuellement servie, les variables Vercel, les migrations actives, les ACL et les paramètres Auth hébergés doivent être vérifiés indépendamment par le parent.
- Désaccord établi avec l’exigence de confidentialité: public=true est conservé pour le bucket photos et les deux uploaders émettent des URL publiques. La restriction du listing ne rend pas les octets privés (supabase/migrations/20240101000000_initial_schema.sql:135-135; supabase/migrations/20260611100000_audit_v2_storage_hardening.sql:3-20; services/storage/storageMedia.ts:39-41, services/storage/storageMedia.ts:85-87).
- Désaccord entre chemins de bootstrap: README.md:46-49 cite le schéma autonome et les migrations; supabase_schema.sql:163-190 conserve Public Access et ne reproduit pas le durcissement de juin. Le résultat dépend donc du chemin et des migrations réellement appliquées; une installation à partir du schéma autonome seul ne peut pas être assimilée à une installation entièrement migrée.
- Désaccord local Auth/UI: Login annonce une confirmation d’email après inscription, alors que la configuration locale désactive enable_confirmations. site_url local vaut http://127.0.0.1:3000, mais les scripts Vite ne fixent pas leur port; les parcours de récupération locaux nécessitent un alignement explicite. Ceci ne prouve rien sur les réglages hébergés (components/Auth/Login.tsx:82-90; supabase/config.toml:154-156, supabase/config.toml:202-211; package.json:6-20).
- Les déclarations d’absence de partage actif et de conservation des médias seulement pendant l’existence de l’observation doivent être confrontées aux consommateurs: Nominatim/Open-Meteo reçoivent les GPS, les médias ont des URL publiques, l’effacement direct d’une observation nettoie Storage en best effort et le rejeu DELETE hors ligne montré supprime seulement la ligne. Ces différences sont conservées comme points à valider, sans conclure ici à une faille (components/LegalPages.tsx:61-73; services/locationService.ts:119-119, services/locationService.ts:146-147, services/locationService.ts:197-197; services/storageService.ts:555-564, services/storageService.ts:693-707).
- La déclaration Sentry 'jamais vos observations ni votre email' n’est pas entièrement prouvée par les options SDK: les objets Error et chaînes des appelants restent transmis. Les contenus réellement atteignables doivent être examinés séparément (components/LegalPages.tsx:71-71; services/errorReportingService.ts:58-73).
- L’emplacement exact des jetons gérés par le SDK Supabase reste à confirmer avec la dépendance installée: le client ne personnalise pas ses options et la déconnexion de secours cible sb-\<référence-projet\>-auth-token. Le code SDK n’était pas présent dans ce checkout (supabaseClient.ts:12-15; contexts/AuthContext.tsx:193-200).
- Aucun montage Docker, volume hôte effectif, secret réel ou endpoint Vercel compilé ne peut être déduit des seules déclarations versionnées. Le fichier local expose une API HTTP port 54321, PostgreSQL port 54322, Studio port 54323 et Inbucket port 54324; la liaison réseau et les volumes effectifs appartiennent au CLI/runtime (supabase/config.toml:7-36, supabase/config.toml:90-102).
- Les règles RLS versionnées ne remplacent pas la vérification des GRANT, rôles, fonctions SQL, règles actives et capacités Storage réellement déployés. Cette revue établit l’architecture et les prérequis, pas une validation exhaustive de chaque contrôle.
- Le secret DB et la clé publique de sauvegarde proviennent de GitHub; la possession de la clé privée reste externe. Les dumps en clair sont supprimés après un chiffrement réussi, mais le nettoyage lors d’un échec antérieur repose sur le cycle de vie du runner (.github/workflows/sauvegarde-base.yml:80-121, .github/workflows/sauvegarde-base.yml:200-215).
- Mise à jour du coordinateur le 11 septembre 2026: le connecteur a confirmé les policies SQL actives, public=true du bucket photos, les limites MIME/20 MiB et la fonction delete-account identique au dépôt avec verify_jwt=true. L’alias de production sert les six en-têtes prévus. Ces lectures n’ont accédé à aucune ligne d’observation utilisateur.
- Environnement exécuté: Docker 29.1.3, Supabase CLI verrouillée 2.109.1, PostgreSQL 17, services bindés sur 127.0.0.1 via réseau dédié. Une attribution locale explicite des GRANT de table, observés en production mais absents du bootstrap neuf, a été nécessaire pour les contrôles positifs. Seul le project_id a été changé dans la copie de test; le code applicatif audité est intact.

## Findings

| Finding | Severity | Confidence | Detailed write-up |
| --- | --- | --- | --- |
| [Un changement de compte conserve les observations et le formulaire d'édition du compte précédent](#finding-1) | medium | high | inline below |
| [Les photos et sons restent accessibles sans authentification par leur URL permanente](#finding-2) | medium | high | inline below |
| [Les opérations asynchrones écrivent dans le cache ou la file du compte devenu actif](#finding-3) | medium | high | inline below |
| [Les lieux recherchés et les filtres géographiques restent visibles au compte suivant](#finding-4) | low | high | inline below |
| [Le journal partagé entre comptes conserve et réaffiche des URL de médias privés](#finding-5) | low | high | inline below |
| [Les imports décompressent et analysent des contenus sans limite de taille décompressée](#finding-6) | low | high | inline below |

### Confidence Scale

| Label | Meaning |
| --- | --- |
| high | Direct evidence supports the finding with no material unresolved blocker. |
| medium | Evidence supports a plausible issue, but material runtime or reachability proof remains. |
| low | Evidence is incomplete and the item is retained only for explicit follow-up. |

<a id="finding-1"></a>

### [1] Un changement de compte conserve les observations et le formulaire d'édition du compte précédent

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | high |
| Confidence rationale | Navigateur Chromium sur le bundle compilé, en-têtes Vercel avec exception API loopback, vrais comptes Auth locaux: A ouvre Modifier, se déconnecte et B se connecte. Le menu identifie B mais les champs contiennent PRIVE_A et SECRET_FICTIF_PRIVE_A. Capture et browser-result.json conservés. |
| Category | account-isolation |
| CWE | CWE-488 |
| Affected lines | App.tsx:71-80, App.tsx:391-398, App.tsx:637-658, App.tsx:1070-1084, components/ObservationForm.tsx:76-90 |

#### Summary

B peut lire durablement le nom d'espèce, la date, les commentaires, les coordonnées GPS et les références de médias de l'observation laissée en édition par A. Même hors édition, la liste de A reste visible jusqu'au chargement de B, ou davantage si celui-ci échoue.

#### Root Cause

Après un changement d'identité, aucune donnée privée de A ne doit être affichée ou exportable dans la session de B. A ouvre une observation en édition : handleEditObservation conserve l'objet complet dans editingObservation et sélectionne View.FORM. La déconnexion met à jour le contexte d'authentification mais ne démonte pas App ; App renvoie simplement Login. La connexion de B réutilise les états observations, editingObservation et view. Le chargement de B remplace observations seulement ; editingObservation reste celui de A. ObservationForm reçoit donc à nouveau initialData={editingObservation} et affiche les champs privés de A.

**root_control: App.tsx** — `App.tsx:71-80`

Ce contrôle conserve une ressource partagée ou n’impose pas la limite attendue.

```
    const userId = user?.id;
    const hasLoadedOnceRef = useRef(false);
    const { offlineQueueItems, refreshOfflineQueueSnapshot } = useOfflineQueue(user);
    const [observations, setObservations] = useState<Observation[]>([]);
    const [view, setView] = useState<View>(View.LIST);
    const [editingObservation, setEditingObservation] = useState<Observation | null>(null);
    // EE-1 : position de départ quand on crée une obs depuis un clic sur la carte.
    const [pendingPosition, setPendingPosition] = useState<{ lat: number; lon: number } | null>(null);
    // EE-2 : observation consultée dans la vue détail + vue d'origine pour le bouton retour.
    const [selectedObservationId, setSelectedObservationId] = useState<string | null>(null);
```

**entrypoint: App.tsx** — `App.tsx:391-398`

Cette entrée apporte les données ou l’identité qui doivent rester attachées au propriétaire et être traitées comme non fiables.

```
    const handleEditObservation = useCallback((id: string) => {
        const observationToEdit = observations.find(obs => obs.id === id);
        if (observationToEdit) {
            setEditingObservation(observationToEdit);
            setPendingPosition(null);
            setView(View.FORM);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
```

**propagation: App.tsx** — `App.tsx:637-658`

Cette étape transmet ou conserve ces données jusqu’au consommateur suivant sans rétablir la garantie manquante.

```
    if (!user) {
        // If offline and no cached user, show offline message instead of broken Login form
        if (isOffline) {
            return (
                <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-nature-beige to-white dark:from-nature-dark-bg dark:to-nature-dark-surface p-4">
                    <div className="w-full max-w-md liquid-glass-opaque rounded-2xl p-8 text-center">
                        {/* EE-5 : logo de l'app au-dessus du titre */}
                        <img src="/logo.svg" alt="" aria-hidden="true" className="w-16 h-16 mx-auto mb-3 rounded-2xl shadow-sm" />
                        <h1 className="text-3xl font-bold mb-2 text-nature-dark dark:text-white">Carnet Naturaliste</h1>
                        <SignalOffIcon className="w-16 h-16 mx-auto mb-4 text-gray-400 dark:text-gray-500" />
                        <p className="text-gray-600 dark:text-gray-400 mb-4">Vous êtes hors-ligne. Connectez-vous à Internet pour vous identifier.</p>
                        <p className="text-sm text-gray-400 dark:text-gray-500">Une fois connecté, vos données seront disponibles hors-ligne.</p>
                    </div>
                </div>
            );
        }
        return <Login />;
    }

    if (isLoading) {
        return <FullScreenLoader label="Chargement des données..." />;
    }
```

**sink: App.tsx** — `App.tsx:1070-1084`

Ce consommateur rend les données accessibles ou matérialise l’allocation non bornée.

```
                                    isMobileView={isMobileView}
                                />
                            ) : null;
                        })()
                    ) : (
                        <ObservationForm
                            onSave={handleSaveObservation}
                            onCancel={handleCancel}
                            initialData={editingObservation}
                            initialPosition={pendingPosition}
                            onToast={pushToast}
                        />
                    )}
                </Suspense>
                </ErrorBoundary>
```

**outcome: components/ObservationForm.tsx** — `components/ObservationForm.tsx:76-90`

Cette étape explique pourquoi le nettoyage ou la validation arrive trop tard pour empêcher le résultat.

```
    useEffect(() => {
        if (initialData) {
            setFormData(mapObservationToFormData(initialData));
            setPhotoFile(null);
            setFieldTouched({
                latinName: !!initialData.latinName,
                taxonomicGroup: initialData.taxonomicGroup !== defaultTaxonomicGroup,
                status: initialData.status !== Status.NE,
                weather: initialData.weather !== WeatherCondition.UNKNOWN
            });
        } else {
            setFormData(createEmptyFormData(defaultTaxonomicGroup));
            setFieldTouched({ latinName: false, taxonomicGroup: false, status: false, weather: false });
        }
    }, [defaultTaxonomicGroup, initialData]);
```

#### Validation

Navigateur Chromium sur le bundle compilé, en-têtes Vercel avec exception API loopback, vrais comptes Auth locaux: A ouvre Modifier, se déconnecte et B se connecte. Le menu identifie B mais les champs contiennent PRIVE_A et SECRET_FICTIF_PRIVE_A. Capture et browser-result.json conservés.

Validation method: lecture de code et tests locaux

**root_control: App.tsx** — `App.tsx:71-80`

Ce contrôle conserve une ressource partagée ou n’impose pas la limite attendue.

```
    const userId = user?.id;
    const hasLoadedOnceRef = useRef(false);
    const { offlineQueueItems, refreshOfflineQueueSnapshot } = useOfflineQueue(user);
    const [observations, setObservations] = useState<Observation[]>([]);
    const [view, setView] = useState<View>(View.LIST);
    const [editingObservation, setEditingObservation] = useState<Observation | null>(null);
    // EE-1 : position de départ quand on crée une obs depuis un clic sur la carte.
    const [pendingPosition, setPendingPosition] = useState<{ lat: number; lon: number } | null>(null);
    // EE-2 : observation consultée dans la vue détail + vue d'origine pour le bouton retour.
    const [selectedObservationId, setSelectedObservationId] = useState<string | null>(null);
```

**entrypoint: App.tsx** — `App.tsx:391-398`

Cette entrée apporte les données ou l’identité qui doivent rester attachées au propriétaire et être traitées comme non fiables.

```
    const handleEditObservation = useCallback((id: string) => {
        const observationToEdit = observations.find(obs => obs.id === id);
        if (observationToEdit) {
            setEditingObservation(observationToEdit);
            setPendingPosition(null);
            setView(View.FORM);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
```

**propagation: App.tsx** — `App.tsx:637-658`

Cette étape transmet ou conserve ces données jusqu’au consommateur suivant sans rétablir la garantie manquante.

```
    if (!user) {
        // If offline and no cached user, show offline message instead of broken Login form
        if (isOffline) {
            return (
                <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-nature-beige to-white dark:from-nature-dark-bg dark:to-nature-dark-surface p-4">
                    <div className="w-full max-w-md liquid-glass-opaque rounded-2xl p-8 text-center">
                        {/* EE-5 : logo de l'app au-dessus du titre */}
                        <img src="/logo.svg" alt="" aria-hidden="true" className="w-16 h-16 mx-auto mb-3 rounded-2xl shadow-sm" />
                        <h1 className="text-3xl font-bold mb-2 text-nature-dark dark:text-white">Carnet Naturaliste</h1>
                        <SignalOffIcon className="w-16 h-16 mx-auto mb-4 text-gray-400 dark:text-gray-500" />
                        <p className="text-gray-600 dark:text-gray-400 mb-4">Vous êtes hors-ligne. Connectez-vous à Internet pour vous identifier.</p>
                        <p className="text-sm text-gray-400 dark:text-gray-500">Une fois connecté, vos données seront disponibles hors-ligne.</p>
                    </div>
                </div>
            );
        }
        return <Login />;
    }

    if (isLoading) {
        return <FullScreenLoader label="Chargement des données..." />;
    }
```

**sink: App.tsx** — `App.tsx:1070-1084`

Ce consommateur rend les données accessibles ou matérialise l’allocation non bornée.

```
                                    isMobileView={isMobileView}
                                />
                            ) : null;
                        })()
                    ) : (
                        <ObservationForm
                            onSave={handleSaveObservation}
                            onCancel={handleCancel}
                            initialData={editingObservation}
                            initialPosition={pendingPosition}
                            onToast={pushToast}
                        />
                    )}
                </Suspense>
                </ErrorBoundary>
```

**outcome: components/ObservationForm.tsx** — `components/ObservationForm.tsx:76-90`

Cette étape explique pourquoi le nettoyage ou la validation arrive trop tard pour empêcher le résultat.

```
    useEffect(() => {
        if (initialData) {
            setFormData(mapObservationToFormData(initialData));
            setPhotoFile(null);
            setFieldTouched({
                latinName: !!initialData.latinName,
                taxonomicGroup: initialData.taxonomicGroup !== defaultTaxonomicGroup,
                status: initialData.status !== Status.NE,
                weather: initialData.weather !== WeatherCondition.UNKNOWN
            });
        } else {
            setFormData(createEmptyFormData(defaultTaxonomicGroup));
            setFieldTouched({ latinName: false, taxonomicGroup: false, status: false, weather: false });
        }
    }, [defaultTaxonomicGroup, initialData]);
```

Assertions:
- Après un changement d'identité, aucune donnée privée de A ne doit être affichée ou exportable dans la session de B.

Limitations:
- Le nettoyage mounted de l'effet protège certains retours asynchrones de setObservations.
- clearScopedOfflineData supprime les clés de cache et de file hors ligne de A.
- Ces contrôles ne nettoient pas l'état React déjà chargé.
- Les règles RLS empêchent B de modifier directement la ligne serveur appartenant à A ; le constat porte sur la confidentialité dans l'application.

#### Dataflow

A ouvre une observation en édition : handleEditObservation conserve l'objet complet dans editingObservation et sélectionne View.FORM. → La déconnexion met à jour le contexte d'authentification mais ne démonte pas App ; App renvoie simplement Login. → La connexion de B réutilise les états observations, editingObservation et view. → Le chargement de B remplace observations seulement ; editingObservation reste celui de A. → ObservationForm reçoit donc à nouveau initialData={editingObservation} et affiche les champs privés de A.

- **Source:** L'utilisateur B qui se connecte dans le même onglet après la déconnexion de A.

- **Sink:** components/ObservationForm.tsx

- **Outcome:** B peut lire durablement le nom d'espèce, la date, les commentaires, les coordonnées GPS et les références de médias de l'observation laissée en édition par A. Même hors édition, la liste de A reste visible jusqu'au chargement de B, ou davantage si celui-ci échoue.

**root_control: App.tsx** — `App.tsx:71-80`

Ce contrôle conserve une ressource partagée ou n’impose pas la limite attendue.

```
    const userId = user?.id;
    const hasLoadedOnceRef = useRef(false);
    const { offlineQueueItems, refreshOfflineQueueSnapshot } = useOfflineQueue(user);
    const [observations, setObservations] = useState<Observation[]>([]);
    const [view, setView] = useState<View>(View.LIST);
    const [editingObservation, setEditingObservation] = useState<Observation | null>(null);
    // EE-1 : position de départ quand on crée une obs depuis un clic sur la carte.
    const [pendingPosition, setPendingPosition] = useState<{ lat: number; lon: number } | null>(null);
    // EE-2 : observation consultée dans la vue détail + vue d'origine pour le bouton retour.
    const [selectedObservationId, setSelectedObservationId] = useState<string | null>(null);
```

**entrypoint: App.tsx** — `App.tsx:391-398`

Cette entrée apporte les données ou l’identité qui doivent rester attachées au propriétaire et être traitées comme non fiables.

```
    const handleEditObservation = useCallback((id: string) => {
        const observationToEdit = observations.find(obs => obs.id === id);
        if (observationToEdit) {
            setEditingObservation(observationToEdit);
            setPendingPosition(null);
            setView(View.FORM);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
```

**propagation: App.tsx** — `App.tsx:637-658`

Cette étape transmet ou conserve ces données jusqu’au consommateur suivant sans rétablir la garantie manquante.

```
    if (!user) {
        // If offline and no cached user, show offline message instead of broken Login form
        if (isOffline) {
            return (
                <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-nature-beige to-white dark:from-nature-dark-bg dark:to-nature-dark-surface p-4">
                    <div className="w-full max-w-md liquid-glass-opaque rounded-2xl p-8 text-center">
                        {/* EE-5 : logo de l'app au-dessus du titre */}
                        <img src="/logo.svg" alt="" aria-hidden="true" className="w-16 h-16 mx-auto mb-3 rounded-2xl shadow-sm" />
                        <h1 className="text-3xl font-bold mb-2 text-nature-dark dark:text-white">Carnet Naturaliste</h1>
                        <SignalOffIcon className="w-16 h-16 mx-auto mb-4 text-gray-400 dark:text-gray-500" />
                        <p className="text-gray-600 dark:text-gray-400 mb-4">Vous êtes hors-ligne. Connectez-vous à Internet pour vous identifier.</p>
                        <p className="text-sm text-gray-400 dark:text-gray-500">Une fois connecté, vos données seront disponibles hors-ligne.</p>
                    </div>
                </div>
            );
        }
        return <Login />;
    }

    if (isLoading) {
        return <FullScreenLoader label="Chargement des données..." />;
    }
```

**sink: App.tsx** — `App.tsx:1070-1084`

Ce consommateur rend les données accessibles ou matérialise l’allocation non bornée.

```
                                    isMobileView={isMobileView}
                                />
                            ) : null;
                        })()
                    ) : (
                        <ObservationForm
                            onSave={handleSaveObservation}
                            onCancel={handleCancel}
                            initialData={editingObservation}
                            initialPosition={pendingPosition}
                            onToast={pushToast}
                        />
                    )}
                </Suspense>
                </ErrorBoundary>
```

**outcome: components/ObservationForm.tsx** — `components/ObservationForm.tsx:76-90`

Cette étape explique pourquoi le nettoyage ou la validation arrive trop tard pour empêcher le résultat.

```
    useEffect(() => {
        if (initialData) {
            setFormData(mapObservationToFormData(initialData));
            setPhotoFile(null);
            setFieldTouched({
                latinName: !!initialData.latinName,
                taxonomicGroup: initialData.taxonomicGroup !== defaultTaxonomicGroup,
                status: initialData.status !== Status.NE,
                weather: initialData.weather !== WeatherCondition.UNKNOWN
            });
        } else {
            setFormData(createEmptyFormData(defaultTaxonomicGroup));
            setFieldTouched({ latinName: false, taxonomicGroup: false, status: false, weather: false });
        }
    }, [defaultTaxonomicGroup, initialData]);
```

#### Reachability

L'utilisateur B qui se connecte dans le même onglet après la déconnexion de A.

- **Attacker:** L'utilisateur B qui se connecte dans le même onglet après la déconnexion de A.

- **Entry point:** App.tsx

- **Outcome:** B peut lire durablement le nom d'espèce, la date, les commentaires, les coordonnées GPS et les références de médias de l'observation laissée en édition par A. Même hors édition, la liste de A reste visible jusqu'au chargement de B, ou davantage si celui-ci échoue.

Limitations:
- Le nettoyage mounted de l'effet protège certains retours asynchrones de setObservations.
- clearScopedOfflineData supprime les clés de cache et de file hors ligne de A.
- Ces contrôles ne nettoient pas l'état React déjà chargé.
- Les règles RLS empêchent B de modifier directement la ligne serveur appartenant à A ; le constat porte sur la confidentialité dans l'application.

#### Severity

**Medium** — Divulgation directe de données privées avec interaction normale; nécessite deux utilisateurs successifs dans le même onglet/profil.

Additional runtime or deployment evidence could raise or lower this severity.

Impact assessment:
- **Level:** high
- **Why:** B peut lire durablement le nom d'espèce, la date, les commentaires, les coordonnées GPS et les références de médias de l'observation laissée en édition par A. Même hors édition, la liste de A reste visible jusqu'au chargement de B, ou davantage si celui-ci échoue.

Likelihood assessment:
- **Level:** medium
- **Why:** Divulgation directe de données privées avec interaction normale; nécessite deux utilisateurs successifs dans le même onglet/profil.

#### Remediation

Monter toute la partie authentifiée avec une clé liée à user.id, ou réinitialiser atomiquement les observations, l'édition, la sélection, les dialogues et les résultats de synchronisation à chaque changement d'identité. Garder un écran vide ou de chargement jusqu'à réception des données de cette identité.

Tests:
- A ouvre Modifier, se déconnecte et B se connecte: aucun champ, sélection, dialogue ou export ne conserve les données A.
- Même contrôle pendant un chargement lent ou échoué de B.

<a id="finding-2"></a>

### [2] Les photos et sons restent accessibles sans authentification par leur URL permanente

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | high |
| Confidence rationale | Configuration Supabase hébergée lue: bucket photos public=true. Tests REST locaux: JPEG et WAV lus sans jeton; B lit aussi une photo de A par la route dite authenticated du bucket public. Listing intercompte et écritures étrangères restent refusés. |
| Category | missing-authorization |
| CWE | CWE-862 |
| Affected lines | supabase/migrations/20240101000000_initial_schema.sql:134-140, services/storage/storageMedia.ts:19-24, services/storage/storageMedia.ts:39-47, services/storage/storageMedia.ts:85-93 |

#### Summary

Lecture et redistribution d'un média supposé privé dès que son URL est connue. La déconnexion ne révoque pas cet accès.

#### Root Cause

Les photos et sons doivent être privés par défaut et leur lecture réservée au propriétaire, sauf partage explicite. Les uploads utilisent le bucket photos pour les photographies et les sons. La migration initiale crée ce bucket avec public=true. La migration de durcissement limite la liste des objets au propriétaire mais conserve public=true. Les fonctions d'upload renvoient getPublicUrl(fileName), puis ces URL permanentes sont enregistrées dans les observations. Une lecture sur /storage/v1/object/public/photos/... ne nécessite pas la session du propriétaire.

**root_control: supabase/migrations/20240101000000_initial_schema.sql** — `supabase/migrations/20240101000000_initial_schema.sql:134-140`

Ce contrôle conserve une ressource partagée ou n’impose pas la limite attendue.

```
-- Create Storage Bucket for Photos
insert into storage.buckets (id, name, public) values ('photos', 'photos', true);

-- Storage Policies
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id = 'photos' );
```

**entrypoint: services/storage/storageMedia.ts** — `services/storage/storageMedia.ts:19-24`

Cette entrée apporte les données ou l’identité qui doivent rester attachées au propriétaire et être traitées comme non fiables.

```
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const fileName = `${user.id}/photos/${Date.now()}-${generateUUID()}.jpg`;
    const { error: uploadError } = await withTimeout(
        supabase.storage
```

**sink: services/storage/storageMedia.ts** — `services/storage/storageMedia.ts:39-47`

Ce consommateur rend les données accessibles ou matérialise l’allocation non bornée.

```
    const { data: { publicUrl } } = supabase.storage
        .from('photos')
        .getPublicUrl(fileName);

    if (!publicUrl) {
        throw new Error('URL publique de la photo non disponible.');
    }

    return publicUrl;
```

**sink: services/storage/storageMedia.ts** — `services/storage/storageMedia.ts:85-93`

Ce consommateur rend les données accessibles ou matérialise l’allocation non bornée.

```
    const { data: { publicUrl } } = supabase.storage
        .from('photos')
        .getPublicUrl(fileName);

    if (!publicUrl) {
        throw new Error('URL publique du son non disponible.');
    }

    return publicUrl;
```

#### Validation

Configuration Supabase hébergée lue: bucket photos public=true. Tests REST locaux: JPEG et WAV lus sans jeton; B lit aussi une photo de A par la route dite authenticated du bucket public. Listing intercompte et écritures étrangères restent refusés.

Validation method: lecture de code et tests locaux

**root_control: supabase/migrations/20240101000000_initial_schema.sql** — `supabase/migrations/20240101000000_initial_schema.sql:134-140`

Ce contrôle conserve une ressource partagée ou n’impose pas la limite attendue.

```
-- Create Storage Bucket for Photos
insert into storage.buckets (id, name, public) values ('photos', 'photos', true);

-- Storage Policies
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id = 'photos' );
```

**entrypoint: services/storage/storageMedia.ts** — `services/storage/storageMedia.ts:19-24`

Cette entrée apporte les données ou l’identité qui doivent rester attachées au propriétaire et être traitées comme non fiables.

```
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const fileName = `${user.id}/photos/${Date.now()}-${generateUUID()}.jpg`;
    const { error: uploadError } = await withTimeout(
        supabase.storage
```

**sink: services/storage/storageMedia.ts** — `services/storage/storageMedia.ts:39-47`

Ce consommateur rend les données accessibles ou matérialise l’allocation non bornée.

```
    const { data: { publicUrl } } = supabase.storage
        .from('photos')
        .getPublicUrl(fileName);

    if (!publicUrl) {
        throw new Error('URL publique de la photo non disponible.');
    }

    return publicUrl;
```

**sink: services/storage/storageMedia.ts** — `services/storage/storageMedia.ts:85-93`

Ce consommateur rend les données accessibles ou matérialise l’allocation non bornée.

```
    const { data: { publicUrl } } = supabase.storage
        .from('photos')
        .getPublicUrl(fileName);

    if (!publicUrl) {
        throw new Error('URL publique du son non disponible.');
    }

    return publicUrl;
```

Assertions:
- Les photos et sons doivent être privés par défaut et leur lecture réservée au propriétaire, sauf partage explicite.

Limitations:
- Les noms comprennent un UUID et ne sont pas raisonnablement devinables.
- La dernière migration bloque l'énumération des objets d'autrui.
- Les observations elles-mêmes disposent de règles RLS propres au propriétaire.
- Ces protections limitent la découverte des URL mais ne rendent pas leur lecture privée.
- Des commentaires historiques présentent la lecture publique comme intentionnelle ; le contexte utilisateur actuel exige explicitement la confidentialité des médias.

#### Dataflow

Les uploads utilisent le bucket photos pour les photographies et les sons. → La migration initiale crée ce bucket avec public=true. → La migration de durcissement limite la liste des objets au propriétaire mais conserve public=true. → Les fonctions d'upload renvoient getPublicUrl(fileName), puis ces URL permanentes sont enregistrées dans les observations. → Une lecture sur /storage/v1/object/public/photos/... ne nécessite pas la session du propriétaire.

- **Source:** Un tiers non connecté disposant de l'URL d'un média, notamment après transmission d'un export, consultation antérieure ou fuite d'un journal.

- **Sink:** services/storage/storageMedia.ts

- **Outcome:** Lecture et redistribution d'un média supposé privé dès que son URL est connue. La déconnexion ne révoque pas cet accès.

**root_control: supabase/migrations/20240101000000_initial_schema.sql** — `supabase/migrations/20240101000000_initial_schema.sql:134-140`

Ce contrôle conserve une ressource partagée ou n’impose pas la limite attendue.

```
-- Create Storage Bucket for Photos
insert into storage.buckets (id, name, public) values ('photos', 'photos', true);

-- Storage Policies
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id = 'photos' );
```

**entrypoint: services/storage/storageMedia.ts** — `services/storage/storageMedia.ts:19-24`

Cette entrée apporte les données ou l’identité qui doivent rester attachées au propriétaire et être traitées comme non fiables.

```
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const fileName = `${user.id}/photos/${Date.now()}-${generateUUID()}.jpg`;
    const { error: uploadError } = await withTimeout(
        supabase.storage
```

**sink: services/storage/storageMedia.ts** — `services/storage/storageMedia.ts:39-47`

Ce consommateur rend les données accessibles ou matérialise l’allocation non bornée.

```
    const { data: { publicUrl } } = supabase.storage
        .from('photos')
        .getPublicUrl(fileName);

    if (!publicUrl) {
        throw new Error('URL publique de la photo non disponible.');
    }

    return publicUrl;
```

**sink: services/storage/storageMedia.ts** — `services/storage/storageMedia.ts:85-93`

Ce consommateur rend les données accessibles ou matérialise l’allocation non bornée.

```
    const { data: { publicUrl } } = supabase.storage
        .from('photos')
        .getPublicUrl(fileName);

    if (!publicUrl) {
        throw new Error('URL publique du son non disponible.');
    }

    return publicUrl;
```

#### Reachability

Un tiers non connecté disposant de l'URL d'un média, notamment après transmission d'un export, consultation antérieure ou fuite d'un journal.

- **Attacker:** Un tiers non connecté disposant de l'URL d'un média, notamment après transmission d'un export, consultation antérieure ou fuite d'un journal.

- **Entry point:** supabase/migrations/20240101000000_initial_schema.sql

- **Outcome:** Lecture et redistribution d'un média supposé privé dès que son URL est connue. La déconnexion ne révoque pas cet accès.

Limitations:
- Les noms comprennent un UUID et ne sont pas raisonnablement devinables.
- La dernière migration bloque l'énumération des objets d'autrui.
- Les observations elles-mêmes disposent de règles RLS propres au propriétaire.
- Ces protections limitent la découverte des URL mais ne rendent pas leur lecture privée.
- Des commentaires historiques présentent la lecture publique comme intentionnelle ; le contexte utilisateur actuel exige explicitement la confidentialité des médias.

#### Severity

**Medium** — Médias privés exposés à un tiers possédant un lien; UUID non devinables et absence de listing anonyme limitent la découverte. Pas de contrôle de compte complet établi.

Additional runtime or deployment evidence could raise or lower this severity.

Impact assessment:
- **Level:** high
- **Why:** Lecture et redistribution d'un média supposé privé dès que son URL est connue. La déconnexion ne révoque pas cet accès.

Likelihood assessment:
- **Level:** medium
- **Why:** Médias privés exposés à un tiers possédant un lien; UUID non devinables et absence de listing anonyme limitent la découverte. Pas de contrôle de compte complet établi.

#### Remediation

Passer le bucket en privé, conserver les chemins d'objets, puis utiliser un téléchargement authentifié ou des URL signées de courte durée après contrôle du propriétaire. Adapter le cache PWA et les exports ; tester séparément lecture propriétaire, lecture B et lecture anonyme.

Tests:
- Médias du propriétaire lisibles; médias de A refusés à B et sans session, y compris avec URL connue.
- Changement de compte, déconnexion et expiration des URL signées ne restituent pas des médias privés depuis le cache partagé.

<a id="finding-3"></a>

### [3] Les opérations asynchrones écrivent dans le cache ou la file du compte devenu actif

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | high |
| Confidence rationale | Test déterministe exécuté: une réponse A retardée termine après setStorageNamespace(B), remplace le cache B, puis un chargement hors ligne B restitue les données A. Le transport simulé prouve le défaut client, pas un contournement RLS serveur. |
| Category | account-isolation |
| CWE | CWE-362 |
| Affected lines | services/storageService.ts:40-52, services/storageService.ts:207-225, services/storageService.ts:312-326, services/storageService.ts:333-339, services/storageService.ts:779-789 |

#### Summary

Copie persistante de données privées de A dans le cache ou la file de B, écrasement de la file de B, puis risque de réimporter des observations de A sous B lors d'une synchronisation ultérieure.

#### Root Cause

Une opération commencée pour A doit rester liée à A jusqu'à sa fin et ne jamais publier ses données sous l'identité B. Les clés de cache et de file sont calculées à partir de la variable globale mutable storageNamespace. getObservations authentifie A et lance ses requêtes, puis attend leur réponse. Un changement de session modifie storageNamespace en B. La réponse contenant les observations de A est passée à setLocalCache, qui recalcule la clé avec B. Le moteur de synchronisation suit le même modèle pour setQueue et setLocalCache ; le contrôle capturedNamespace est seulement un avertissement après les écritures. L'import appelle de nouveau getUser pour chaque insertion : si l'identité change pendant le lot, les opérations suivantes peuvent être attribuées au nouveau compte.

**root_control: services/storageService.ts** — `services/storageService.ts:40-52`

Ce contrôle conserve une ressource partagée ou n’impose pas la limite attendue.

```
let storageNamespace: string | null = null;
let processingQueue: Promise<OfflineSyncResult> | null = null;

const REAUTH_CHECK_INTERVAL = 5;

const getQueueScopedKey = (userId: string): string => scopedKey(QUEUE_KEY_PREFIX, userId);
const getCacheScopedKey = (userId: string): string => scopedKey(LOCAL_CACHE_KEY_PREFIX, userId);

const ensureStorageNamespace = (): string => {
    if (!storageNamespace) {
        throw new Error(STORAGE_NAMESPACE_ERROR);
    }
    return storageNamespace;
```

**propagation: services/storageService.ts** — `services/storageService.ts:207-225`

Cette étape transmet ou conserve ces données jusqu’au consommateur suivant sans rétablir la garantie manquante.

```
const setLocalCache = (observations: Observation[]) => {
    try {
        const { cacheKey } = getScopedKeys();
        let strippedMediaCount = 0;
        const lightweight = observations.map(observation => ({
            ...observation,
            photo: (() => {
                const sanitized = sanitizeCachedMediaValueWithTracking(observation.photo);
                if (sanitized.stripped) strippedMediaCount += 1;
                return sanitized.value;
            })(),
            sound: (() => {
                const sanitized = sanitizeCachedMediaValueWithTracking(observation.sound);
                if (sanitized.stripped) strippedMediaCount += 1;
                return sanitized.value;
            })(),
            wikipediaImage: sanitizeCachedMediaValue(observation.wikipediaImage)
        }));
        localStorage.setItem(cacheKey, JSON.stringify(lightweight));
```

**entrypoint: services/storageService.ts** — `services/storageService.ts:312-326`

Cette entrée apporte les données ou l’identité qui doivent rester attachées au propriétaire et être traitées comme non fiables.

```
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Utilisateur non authentifié');

        // SI-29: Supabase PostgREST plafonne une requête non paginée à 1000 lignes
        // par défaut. Sans pagination, les utilisateurs >1000 obs ont un state
        // incomplet — cassait la détection de collisions à l'import (#PR).
        const PAGE_SIZE = 1000;
        const rows: ObservationRow[] = [];
        for (let from = 0; ; from += PAGE_SIZE) {
            const { data, error } = await supabase
                .from('observations')
                .select('*')
                .eq('user_id', user.id)
                .order('date', { ascending: false })
                .range(from, from + PAGE_SIZE - 1);
```

**sink: services/storageService.ts** — `services/storageService.ts:333-339`

Ce consommateur rend les données accessibles ou matérialise l’allocation non bornée.

```

        // H8 : réconcilier avec la file hors-ligne avant de remplacer le cache,
        // pour ne pas faire disparaître les observations en attente/en échec.
        const observations = applyPendingQueueToObservations(rows.map(mapToObservation));
        setLocalCache(observations);
        return { observations, source: 'remote' };
    } catch (error: unknown) {
```

**outcome: services/storageService.ts** — `services/storageService.ts:779-789`

Cette étape explique pourquoi le nettoyage ou la validation arrive trop tard pour empêcher le résultat.

```
            .map(item => item.payload as Observation);
        if (failedInserts.length > 0) {
            bulkUpsertObservationsInCache(failedInserts);
        }
    }

    // SI-14: Warn if namespace changed during processing
    if (storageNamespace !== capturedNamespace) {
        logger.warn('[storageService] Namespace changed during sync — was', capturedNamespace, 'now', storageNamespace);
    }

```

#### Validation

Test déterministe exécuté: une réponse A retardée termine après setStorageNamespace(B), remplace le cache B, puis un chargement hors ligne B restitue les données A. Le transport simulé prouve le défaut client, pas un contournement RLS serveur.

Validation method: lecture de code et tests locaux

**root_control: services/storageService.ts** — `services/storageService.ts:40-52`

Ce contrôle conserve une ressource partagée ou n’impose pas la limite attendue.

```
let storageNamespace: string | null = null;
let processingQueue: Promise<OfflineSyncResult> | null = null;

const REAUTH_CHECK_INTERVAL = 5;

const getQueueScopedKey = (userId: string): string => scopedKey(QUEUE_KEY_PREFIX, userId);
const getCacheScopedKey = (userId: string): string => scopedKey(LOCAL_CACHE_KEY_PREFIX, userId);

const ensureStorageNamespace = (): string => {
    if (!storageNamespace) {
        throw new Error(STORAGE_NAMESPACE_ERROR);
    }
    return storageNamespace;
```

**propagation: services/storageService.ts** — `services/storageService.ts:207-225`

Cette étape transmet ou conserve ces données jusqu’au consommateur suivant sans rétablir la garantie manquante.

```
const setLocalCache = (observations: Observation[]) => {
    try {
        const { cacheKey } = getScopedKeys();
        let strippedMediaCount = 0;
        const lightweight = observations.map(observation => ({
            ...observation,
            photo: (() => {
                const sanitized = sanitizeCachedMediaValueWithTracking(observation.photo);
                if (sanitized.stripped) strippedMediaCount += 1;
                return sanitized.value;
            })(),
            sound: (() => {
                const sanitized = sanitizeCachedMediaValueWithTracking(observation.sound);
                if (sanitized.stripped) strippedMediaCount += 1;
                return sanitized.value;
            })(),
            wikipediaImage: sanitizeCachedMediaValue(observation.wikipediaImage)
        }));
        localStorage.setItem(cacheKey, JSON.stringify(lightweight));
```

**entrypoint: services/storageService.ts** — `services/storageService.ts:312-326`

Cette entrée apporte les données ou l’identité qui doivent rester attachées au propriétaire et être traitées comme non fiables.

```
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Utilisateur non authentifié');

        // SI-29: Supabase PostgREST plafonne une requête non paginée à 1000 lignes
        // par défaut. Sans pagination, les utilisateurs >1000 obs ont un state
        // incomplet — cassait la détection de collisions à l'import (#PR).
        const PAGE_SIZE = 1000;
        const rows: ObservationRow[] = [];
        for (let from = 0; ; from += PAGE_SIZE) {
            const { data, error } = await supabase
                .from('observations')
                .select('*')
                .eq('user_id', user.id)
                .order('date', { ascending: false })
                .range(from, from + PAGE_SIZE - 1);
```

**sink: services/storageService.ts** — `services/storageService.ts:333-339`

Ce consommateur rend les données accessibles ou matérialise l’allocation non bornée.

```

        // H8 : réconcilier avec la file hors-ligne avant de remplacer le cache,
        // pour ne pas faire disparaître les observations en attente/en échec.
        const observations = applyPendingQueueToObservations(rows.map(mapToObservation));
        setLocalCache(observations);
        return { observations, source: 'remote' };
    } catch (error: unknown) {
```

**outcome: services/storageService.ts** — `services/storageService.ts:779-789`

Cette étape explique pourquoi le nettoyage ou la validation arrive trop tard pour empêcher le résultat.

```
            .map(item => item.payload as Observation);
        if (failedInserts.length > 0) {
            bulkUpsertObservationsInCache(failedInserts);
        }
    }

    // SI-14: Warn if namespace changed during processing
    if (storageNamespace !== capturedNamespace) {
        logger.warn('[storageService] Namespace changed during sync — was', capturedNamespace, 'now', storageNamespace);
    }

```

Assertions:
- Une opération commencée pour A doit rester liée à A jusqu'à sa fin et ne jamais publier ses données sous l'identité B.

Limitations:
- Le moteur dispose d'un mutex, mais il est global et ne garantit pas l'identité du propriétaire.
- Il revérifie périodiquement qu'un utilisateur existe, sans comparer son identifiant à celui du début.
- Le contrôle mounted dans App ne protège pas les écritures déjà effectuées à l'intérieur de storageService.
- Les RLS continuent à filtrer les opérations serveur ; elles ne protègent pas les clés locales et ne bloquent pas une nouvelle insertion explicitement attribuée à B.

#### Dataflow

Les clés de cache et de file sont calculées à partir de la variable globale mutable storageNamespace. → getObservations authentifie A et lance ses requêtes, puis attend leur réponse. → Un changement de session modifie storageNamespace en B. → La réponse contenant les observations de A est passée à setLocalCache, qui recalcule la clé avec B. → Le moteur de synchronisation suit le même modèle pour setQueue et setLocalCache ; le contrôle capturedNamespace est seulement un avertissement après les écritures. → L'import appelle de nouveau getUser pour chaque insertion : si l'identité change pendant le lot, les opérations suivantes peuvent être attribuées au nouveau compte.

- **Source:** L'utilisateur B qui reprend le même onglet pendant qu'une lecture, une synchronisation ou un import de A est encore en cours.

- **Sink:** services/storageService.ts

- **Outcome:** Copie persistante de données privées de A dans le cache ou la file de B, écrasement de la file de B, puis risque de réimporter des observations de A sous B lors d'une synchronisation ultérieure.

**root_control: services/storageService.ts** — `services/storageService.ts:40-52`

Ce contrôle conserve une ressource partagée ou n’impose pas la limite attendue.

```
let storageNamespace: string | null = null;
let processingQueue: Promise<OfflineSyncResult> | null = null;

const REAUTH_CHECK_INTERVAL = 5;

const getQueueScopedKey = (userId: string): string => scopedKey(QUEUE_KEY_PREFIX, userId);
const getCacheScopedKey = (userId: string): string => scopedKey(LOCAL_CACHE_KEY_PREFIX, userId);

const ensureStorageNamespace = (): string => {
    if (!storageNamespace) {
        throw new Error(STORAGE_NAMESPACE_ERROR);
    }
    return storageNamespace;
```

**propagation: services/storageService.ts** — `services/storageService.ts:207-225`

Cette étape transmet ou conserve ces données jusqu’au consommateur suivant sans rétablir la garantie manquante.

```
const setLocalCache = (observations: Observation[]) => {
    try {
        const { cacheKey } = getScopedKeys();
        let strippedMediaCount = 0;
        const lightweight = observations.map(observation => ({
            ...observation,
            photo: (() => {
                const sanitized = sanitizeCachedMediaValueWithTracking(observation.photo);
                if (sanitized.stripped) strippedMediaCount += 1;
                return sanitized.value;
            })(),
            sound: (() => {
                const sanitized = sanitizeCachedMediaValueWithTracking(observation.sound);
                if (sanitized.stripped) strippedMediaCount += 1;
                return sanitized.value;
            })(),
            wikipediaImage: sanitizeCachedMediaValue(observation.wikipediaImage)
        }));
        localStorage.setItem(cacheKey, JSON.stringify(lightweight));
```

**entrypoint: services/storageService.ts** — `services/storageService.ts:312-326`

Cette entrée apporte les données ou l’identité qui doivent rester attachées au propriétaire et être traitées comme non fiables.

```
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Utilisateur non authentifié');

        // SI-29: Supabase PostgREST plafonne une requête non paginée à 1000 lignes
        // par défaut. Sans pagination, les utilisateurs >1000 obs ont un state
        // incomplet — cassait la détection de collisions à l'import (#PR).
        const PAGE_SIZE = 1000;
        const rows: ObservationRow[] = [];
        for (let from = 0; ; from += PAGE_SIZE) {
            const { data, error } = await supabase
                .from('observations')
                .select('*')
                .eq('user_id', user.id)
                .order('date', { ascending: false })
                .range(from, from + PAGE_SIZE - 1);
```

**sink: services/storageService.ts** — `services/storageService.ts:333-339`

Ce consommateur rend les données accessibles ou matérialise l’allocation non bornée.

```

        // H8 : réconcilier avec la file hors-ligne avant de remplacer le cache,
        // pour ne pas faire disparaître les observations en attente/en échec.
        const observations = applyPendingQueueToObservations(rows.map(mapToObservation));
        setLocalCache(observations);
        return { observations, source: 'remote' };
    } catch (error: unknown) {
```

**outcome: services/storageService.ts** — `services/storageService.ts:779-789`

Cette étape explique pourquoi le nettoyage ou la validation arrive trop tard pour empêcher le résultat.

```
            .map(item => item.payload as Observation);
        if (failedInserts.length > 0) {
            bulkUpsertObservationsInCache(failedInserts);
        }
    }

    // SI-14: Warn if namespace changed during processing
    if (storageNamespace !== capturedNamespace) {
        logger.warn('[storageService] Namespace changed during sync — was', capturedNamespace, 'now', storageNamespace);
    }

```

#### Reachability

L'utilisateur B qui reprend le même onglet pendant qu'une lecture, une synchronisation ou un import de A est encore en cours.

- **Attacker:** L'utilisateur B qui reprend le même onglet pendant qu'une lecture, une synchronisation ou un import de A est encore en cours.

- **Entry point:** services/storageService.ts

- **Outcome:** Copie persistante de données privées de A dans le cache ou la file de B, écrasement de la file de B, puis risque de réimporter des observations de A sous B lors d'une synchronisation ultérieure.

Limitations:
- Le moteur dispose d'un mutex, mais il est global et ne garantit pas l'identité du propriétaire.
- Il revérifie périodiquement qu'un utilisateur existe, sans comparer son identifiant à celui du début.
- Le contrôle mounted dans App ne protège pas les écritures déjà effectuées à l'intérieur de storageService.
- Les RLS continuent à filtrer les opérations serveur ; elles ne protègent pas les clés locales et ne bloquent pas une nouvelle insertion explicitement attribuée à B.

#### Severity

**Medium** — Contamination persistante du cache et risque d’intégrité; nécessite un changement de compte pendant une opération en cours. Le contournement distant de RLS n’est pas établi.

Additional runtime or deployment evidence could raise or lower this severity.

Impact assessment:
- **Level:** high
- **Why:** Copie persistante de données privées de A dans le cache ou la file de B, écrasement de la file de B, puis risque de réimporter des observations de A sous B lors d'une synchronisation ultérieure.

Likelihood assessment:
- **Level:** medium
- **Why:** Contamination persistante du cache et risque d’intégrité; nécessite un changement de compte pendant une opération en cours. Le contournement distant de RLS n’est pas établi.

#### Remediation

Capturer userId et une génération de session au début de chaque opération. Utiliser des clés explicites liées à ce propriétaire, vérifier la génération après chaque attente et avant toute publication, puis annuler les travaux de A au changement de session. Les imports doivent garder un propriétaire fixe et s'arrêter si l'identité change.

Tests:
- Terminer une requête A après connexion de B ne modifie ni cache ni file ni état B.
- Une synchronisation ou un import cesse de publier dès que sa génération de session devient obsolète.

<a id="finding-4"></a>

### [4] Les lieux recherchés et les filtres géographiques restent visibles au compte suivant

| Field | Value |
| --- | --- |
| Severity | low |
| Confidence | high |
| Confidence rationale | Validation indépendante du code: clé globale de presets contenant les coordonnées, lecture sans userId et affichage/applicateur dans AdvancedFilterDialog; historique map_search_history également global et affiché. Pas de reproduction navigateur dédiée pour ce constat. |
| Category | account-isolation |
| CWE | CWE-488 |
| Affected lines | hooks/useFilterControls.ts:10, hooks/useFilterControls.ts:121-135, hooks/useFilterControls.ts:138-148, components/AdvancedFilterDialog.tsx:203-211, components/MapInput.tsx:165-181, components/MapInput.tsx:429-440 |

#### Summary

Divulgation persistante de lieux recherchés, noms de presets, texte de recherche, dates et coordonnées géographiques enregistrées par A. Le résultat peut révéler un lieu sensible si A l’a sauvegardé ou recherché. La portée reste le même profil navigateur; le constat ne donne pas accès aux autres lignes Supabase et ne prétend pas dévoiler toutes les observations.

#### Root Cause

Les recherches de lieux, noms et paramètres GPS privés enregistrés par A ne doivent pas être présentés comme ceux de B après un changement de compte. useFilterControls utilise la clé globale observation-filter-presets-v1, sans paramètre userId (hooks/useFilterControls.ts:10,51-75). saveFilterPreset y conserve le nom du filtre, le texte recherché, les dates et les filtres géographiques complets, notamment centre GPS ou bornes de zone (hooks/useFilterControls.ts:121-135; components/AdvancedFilterDialog.tsx:6-18). Le chemin signOut supprime les données offline scindées par utilisateur et le cache minimal d’identité, mais pas cette clé (contexts/AuthContext.tsx:183-201; services/storageService.ts:69-77). Après un rechargement et une connexion de B, le hook relit les mêmes presets. AdvancedFilterDialog affiche leurs noms et permet de les appliquer; applyFilterPreset restaure le texte, les dates et les coordonnées dans les champs visibles (components/AdvancedFilterDialog.tsx:110-144,203-211; hooks/useFilterControls.ts:138-148; App.tsx:896-905). La même classe de défaut affecte map_search_history: MapInput enregistre jusqu’à cinq recherches d’adresse dans une clé globale, puis affiche ces recherches récentes dès le focus du champ vide (components/MapInput.tsx:165-181,217-228,429-440). ObservationMap partage exactement cette clé (components/ObservationMap.tsx:350-366,517-529).

**root_control: hooks/useFilterControls.ts** — `hooks/useFilterControls.ts:10`

Ce contrôle conserve une ressource partagée ou n’impose pas la limite attendue.

```
export const FILTER_PRESETS_STORAGE_KEY = 'observation-filter-presets-v1';
```

**entrypoint: hooks/useFilterControls.ts** — `hooks/useFilterControls.ts:121-135`

Cette entrée apporte les données ou l’identité qui doivent rester attachées au propriétaire et être traitées comme non fiables.

```
    const saveFilterPreset = (name: string) => {
        const newPreset: StoredFilterPreset = {
            id: generateUUID(),
            name,
            createdAt: new Date().toISOString(),
            searchTerm,
            yearFilter,
            taxonomicGroupFilter,
            statusFilter,
            startDateFilter,
            endDateFilter,
            advancedFilters: { ...advancedFilterState }
        };
        setFilterPresets(prev => [newPreset, ...prev]);
        onToast('success', `Preset sauvegardé: ${name}`, 4000);
```

**propagation: hooks/useFilterControls.ts** — `hooks/useFilterControls.ts:138-148`

Cette étape transmet ou conserve ces données jusqu’au consommateur suivant sans rétablir la garantie manquante.

```
    const applyFilterPreset = (presetId: string) => {
        const preset = filterPresets.find(item => item.id === presetId);
        if (!preset) return;
        setSearchTerm(preset.searchTerm);
        setYearFilter(preset.yearFilter);
        setTaxonomicGroupFilter(preset.taxonomicGroupFilter);
        setStatusFilter(preset.statusFilter);
        setStartDateFilter(preset.startDateFilter);
        setEndDateFilter(preset.endDateFilter);
        setAdvancedFilterState({ ...preset.advancedFilters });
        onToast('info', `Preset appliqué: ${preset.name}`, 4000);
```

**sink: components/AdvancedFilterDialog.tsx** — `components/AdvancedFilterDialog.tsx:203-211`

Ce consommateur rend les données accessibles ou matérialise l’allocation non bornée.

```
                            presets.map((preset) => (
                                <div key={preset.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 dark:border-white/10 p-2">
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{preset.name}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{new Date(preset.createdAt).toLocaleString('fr-FR')}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => onApplyPreset(preset.id)} className="px-2.5 py-1.5 rounded-md bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200 text-xs font-semibold">Appliquer</button>
                                        <button onClick={() => onDeletePreset(preset.id)} className="px-2.5 py-1.5 rounded-md bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-200 text-xs font-semibold">Supprimer</button>
```

**root_control: components/MapInput.tsx** — `components/MapInput.tsx:165-181`

Ce contrôle conserve une ressource partagée ou n’impose pas la limite attendue.

```
    const [searchHistory, setSearchHistory] = React.useState<string[]>(() => {
        try { return JSON.parse(localStorage.getItem('map_search_history') || '[]'); } catch { return []; }
    });
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);

    const saveToHistory = (query: string) => {
        const trimmed = query.trim();
        if (trimmed.length < 3) return;
        const updated = [trimmed, ...searchHistory.filter(h => h !== trimmed)].slice(0, 5);
        setSearchHistory(updated);
        localStorage.setItem('map_search_history', JSON.stringify(updated));
```

**sink: components/MapInput.tsx** — `components/MapInput.tsx:429-440`

Ce consommateur rend les données accessibles ou matérialise l’allocation non bornée.

```
                {isFocused && !searchQuery && searchHistory.length > 0 && searchResults.length === 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white/90 dark:bg-nature-dark-surface/90 backdrop-blur-md rounded-xl shadow-lg border border-gray-100 dark:border-white/10 overflow-hidden">
                        <p className="px-3 py-1.5 text-xs text-gray-400 dark:text-gray-500">Recherches récentes</p>
                        {searchHistory.map((query, index) => (
                            <button
                                type="button"
                                key={index}
                                onClick={() => handleHistorySelect(query)}
                                className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors border-b border-gray-100 dark:border-white/5 last:border-0 text-sm flex items-center gap-2"
                            >
                                <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                <span className="text-nature-dark dark:text-white truncate">{query}</span>
```

#### Validation

Validation indépendante du code: clé globale de presets contenant les coordonnées, lecture sans userId et affichage/applicateur dans AdvancedFilterDialog; historique map_search_history également global et affiché. Pas de reproduction navigateur dédiée pour ce constat.

Validation method: lecture indépendante de code

**root_control: hooks/useFilterControls.ts** — `hooks/useFilterControls.ts:10`

Ce contrôle conserve une ressource partagée ou n’impose pas la limite attendue.

```
export const FILTER_PRESETS_STORAGE_KEY = 'observation-filter-presets-v1';
```

**entrypoint: hooks/useFilterControls.ts** — `hooks/useFilterControls.ts:121-135`

Cette entrée apporte les données ou l’identité qui doivent rester attachées au propriétaire et être traitées comme non fiables.

```
    const saveFilterPreset = (name: string) => {
        const newPreset: StoredFilterPreset = {
            id: generateUUID(),
            name,
            createdAt: new Date().toISOString(),
            searchTerm,
            yearFilter,
            taxonomicGroupFilter,
            statusFilter,
            startDateFilter,
            endDateFilter,
            advancedFilters: { ...advancedFilterState }
        };
        setFilterPresets(prev => [newPreset, ...prev]);
        onToast('success', `Preset sauvegardé: ${name}`, 4000);
```

**propagation: hooks/useFilterControls.ts** — `hooks/useFilterControls.ts:138-148`

Cette étape transmet ou conserve ces données jusqu’au consommateur suivant sans rétablir la garantie manquante.

```
    const applyFilterPreset = (presetId: string) => {
        const preset = filterPresets.find(item => item.id === presetId);
        if (!preset) return;
        setSearchTerm(preset.searchTerm);
        setYearFilter(preset.yearFilter);
        setTaxonomicGroupFilter(preset.taxonomicGroupFilter);
        setStatusFilter(preset.statusFilter);
        setStartDateFilter(preset.startDateFilter);
        setEndDateFilter(preset.endDateFilter);
        setAdvancedFilterState({ ...preset.advancedFilters });
        onToast('info', `Preset appliqué: ${preset.name}`, 4000);
```

**sink: components/AdvancedFilterDialog.tsx** — `components/AdvancedFilterDialog.tsx:203-211`

Ce consommateur rend les données accessibles ou matérialise l’allocation non bornée.

```
                            presets.map((preset) => (
                                <div key={preset.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 dark:border-white/10 p-2">
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{preset.name}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{new Date(preset.createdAt).toLocaleString('fr-FR')}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => onApplyPreset(preset.id)} className="px-2.5 py-1.5 rounded-md bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200 text-xs font-semibold">Appliquer</button>
                                        <button onClick={() => onDeletePreset(preset.id)} className="px-2.5 py-1.5 rounded-md bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-200 text-xs font-semibold">Supprimer</button>
```

**root_control: components/MapInput.tsx** — `components/MapInput.tsx:165-181`

Ce contrôle conserve une ressource partagée ou n’impose pas la limite attendue.

```
    const [searchHistory, setSearchHistory] = React.useState<string[]>(() => {
        try { return JSON.parse(localStorage.getItem('map_search_history') || '[]'); } catch { return []; }
    });
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);

    const saveToHistory = (query: string) => {
        const trimmed = query.trim();
        if (trimmed.length < 3) return;
        const updated = [trimmed, ...searchHistory.filter(h => h !== trimmed)].slice(0, 5);
        setSearchHistory(updated);
        localStorage.setItem('map_search_history', JSON.stringify(updated));
```

**sink: components/MapInput.tsx** — `components/MapInput.tsx:429-440`

Ce consommateur rend les données accessibles ou matérialise l’allocation non bornée.

```
                {isFocused && !searchQuery && searchHistory.length > 0 && searchResults.length === 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white/90 dark:bg-nature-dark-surface/90 backdrop-blur-md rounded-xl shadow-lg border border-gray-100 dark:border-white/10 overflow-hidden">
                        <p className="px-3 py-1.5 text-xs text-gray-400 dark:text-gray-500">Recherches récentes</p>
                        {searchHistory.map((query, index) => (
                            <button
                                type="button"
                                key={index}
                                onClick={() => handleHistorySelect(query)}
                                className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors border-b border-gray-100 dark:border-white/5 last:border-0 text-sm flex items-center gap-2"
                            >
                                <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                <span className="text-nature-dark dark:text-white truncate">{query}</span>
```

Assertions:
- Les recherches de lieux, noms et paramètres GPS privés enregistrés par A ne doivent pas être présentés comme ceux de B après un changement de compte.

Limitations:
- Les valeurs géographiques ne sont pas automatiquement copiées depuis chaque observation; la victime doit avoir utilisé une recherche ou sauvegardé un filtre contenant ces données.
- L’historique de carte est limité à cinq entrées.
- Le partage d’un profil navigateur est requis; aucune divulgation distante sans ce préalable n’est établie.
- Les textes sont rendus par React; ce chemin n’établit pas une XSS.
- Le défaut est persistant et reste après rechargement: il est distinct de la conservation d’états React déjà identifiée par baseline-review.
- La suppression complète du compte appelle localStorage.clear(), mais la déconnexion ordinaire ne le fait pas.

#### Dataflow

useFilterControls utilise la clé globale observation-filter-presets-v1, sans paramètre userId (hooks/useFilterControls.ts:10,51-75). → saveFilterPreset y conserve le nom du filtre, le texte recherché, les dates et les filtres géographiques complets, notamment centre GPS ou bornes de zone (hooks/useFilterControls.ts:121-135; components/AdvancedFilterDialog.tsx:6-18). → Le chemin signOut supprime les données offline scindées par utilisateur et le cache minimal d’identité, mais pas cette clé (contexts/AuthContext.tsx:183-201; services/storageService.ts:69-77). → Après un rechargement et une connexion de B, le hook relit les mêmes presets. AdvancedFilterDialog affiche leurs noms et permet de les appliquer; applyFilterPreset restaure le texte, les dates et les coordonnées dans les champs visibles (components/AdvancedFilterDialog.tsx:110-144,203-211; hooks/useFilterControls.ts:138-148; App.tsx:896-905). → La même classe de défaut affecte map_search_history: MapInput enregistre jusqu’à cinq recherches d’adresse dans une clé globale, puis affiche ces recherches récentes dès le focus du champ vide (components/MapInput.tsx:165-181,217-228,429-440). ObservationMap partage exactement cette clé (components/ObservationMap.tsx:350-366,517-529).

- **Source:** L’utilisateur B qui se connecte dans le même profil de navigateur après la déconnexion de A. Aucun outil de développement, accès aux fichiers du profil ou contrôle préalable de l’origine n’est requis: les données apparaissent dans l’interface normale.

- **Sink:** components/MapInput.tsx

- **Outcome:** Divulgation persistante de lieux recherchés, noms de presets, texte de recherche, dates et coordonnées géographiques enregistrées par A. Le résultat peut révéler un lieu sensible si A l’a sauvegardé ou recherché. La portée reste le même profil navigateur; le constat ne donne pas accès aux autres lignes Supabase et ne prétend pas dévoiler toutes les observations.

**root_control: hooks/useFilterControls.ts** — `hooks/useFilterControls.ts:10`

Ce contrôle conserve une ressource partagée ou n’impose pas la limite attendue.

```
export const FILTER_PRESETS_STORAGE_KEY = 'observation-filter-presets-v1';
```

**entrypoint: hooks/useFilterControls.ts** — `hooks/useFilterControls.ts:121-135`

Cette entrée apporte les données ou l’identité qui doivent rester attachées au propriétaire et être traitées comme non fiables.

```
    const saveFilterPreset = (name: string) => {
        const newPreset: StoredFilterPreset = {
            id: generateUUID(),
            name,
            createdAt: new Date().toISOString(),
            searchTerm,
            yearFilter,
            taxonomicGroupFilter,
            statusFilter,
            startDateFilter,
            endDateFilter,
            advancedFilters: { ...advancedFilterState }
        };
        setFilterPresets(prev => [newPreset, ...prev]);
        onToast('success', `Preset sauvegardé: ${name}`, 4000);
```

**propagation: hooks/useFilterControls.ts** — `hooks/useFilterControls.ts:138-148`

Cette étape transmet ou conserve ces données jusqu’au consommateur suivant sans rétablir la garantie manquante.

```
    const applyFilterPreset = (presetId: string) => {
        const preset = filterPresets.find(item => item.id === presetId);
        if (!preset) return;
        setSearchTerm(preset.searchTerm);
        setYearFilter(preset.yearFilter);
        setTaxonomicGroupFilter(preset.taxonomicGroupFilter);
        setStatusFilter(preset.statusFilter);
        setStartDateFilter(preset.startDateFilter);
        setEndDateFilter(preset.endDateFilter);
        setAdvancedFilterState({ ...preset.advancedFilters });
        onToast('info', `Preset appliqué: ${preset.name}`, 4000);
```

**sink: components/AdvancedFilterDialog.tsx** — `components/AdvancedFilterDialog.tsx:203-211`

Ce consommateur rend les données accessibles ou matérialise l’allocation non bornée.

```
                            presets.map((preset) => (
                                <div key={preset.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 dark:border-white/10 p-2">
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{preset.name}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{new Date(preset.createdAt).toLocaleString('fr-FR')}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => onApplyPreset(preset.id)} className="px-2.5 py-1.5 rounded-md bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200 text-xs font-semibold">Appliquer</button>
                                        <button onClick={() => onDeletePreset(preset.id)} className="px-2.5 py-1.5 rounded-md bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-200 text-xs font-semibold">Supprimer</button>
```

**root_control: components/MapInput.tsx** — `components/MapInput.tsx:165-181`

Ce contrôle conserve une ressource partagée ou n’impose pas la limite attendue.

```
    const [searchHistory, setSearchHistory] = React.useState<string[]>(() => {
        try { return JSON.parse(localStorage.getItem('map_search_history') || '[]'); } catch { return []; }
    });
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);

    const saveToHistory = (query: string) => {
        const trimmed = query.trim();
        if (trimmed.length < 3) return;
        const updated = [trimmed, ...searchHistory.filter(h => h !== trimmed)].slice(0, 5);
        setSearchHistory(updated);
        localStorage.setItem('map_search_history', JSON.stringify(updated));
```

**sink: components/MapInput.tsx** — `components/MapInput.tsx:429-440`

Ce consommateur rend les données accessibles ou matérialise l’allocation non bornée.

```
                {isFocused && !searchQuery && searchHistory.length > 0 && searchResults.length === 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white/90 dark:bg-nature-dark-surface/90 backdrop-blur-md rounded-xl shadow-lg border border-gray-100 dark:border-white/10 overflow-hidden">
                        <p className="px-3 py-1.5 text-xs text-gray-400 dark:text-gray-500">Recherches récentes</p>
                        {searchHistory.map((query, index) => (
                            <button
                                type="button"
                                key={index}
                                onClick={() => handleHistorySelect(query)}
                                className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors border-b border-gray-100 dark:border-white/5 last:border-0 text-sm flex items-center gap-2"
                            >
                                <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                <span className="text-nature-dark dark:text-white truncate">{query}</span>
```

#### Reachability

L’utilisateur B qui se connecte dans le même profil de navigateur après la déconnexion de A. Aucun outil de développement, accès aux fichiers du profil ou contrôle préalable de l’origine n’est requis: les données apparaissent dans l’interface normale.

- **Attacker:** L’utilisateur B qui se connecte dans le même profil de navigateur après la déconnexion de A. Aucun outil de développement, accès aux fichiers du profil ou contrôle préalable de l’origine n’est requis: les données apparaissent dans l’interface normale.

- **Entry point:** hooks/useFilterControls.ts

- **Outcome:** Divulgation persistante de lieux recherchés, noms de presets, texte de recherche, dates et coordonnées géographiques enregistrées par A. Le résultat peut révéler un lieu sensible si A l’a sauvegardé ou recherché. La portée reste le même profil navigateur; le constat ne donne pas accès aux autres lignes Supabase et ne prétend pas dévoiler toutes les observations.

Limitations:
- Les valeurs géographiques ne sont pas automatiquement copiées depuis chaque observation; la victime doit avoir utilisé une recherche ou sauvegardé un filtre contenant ces données.
- L’historique de carte est limité à cinq entrées.
- Le partage d’un profil navigateur est requis; aucune divulgation distante sans ce préalable n’est établie.
- Les textes sont rendus par React; ce chemin n’établit pas une XSS.
- Le défaut est persistant et reste après rechargement: il est distinct de la conservation d’états React déjà identifiée par baseline-review.
- La suppression complète du compte appelle localStorage.clear(), mais la déconnexion ordinaire ne le fait pas.

#### Severity

**Low** — Nécessite des recherches ou presets sensibles sauvegardés et un profil partagé. N’accorde pas de lecture des autres observations Supabase.

Additional runtime or deployment evidence could raise or lower this severity.

Impact assessment:
- **Level:** low
- **Why:** Divulgation persistante de lieux recherchés, noms de presets, texte de recherche, dates et coordonnées géographiques enregistrées par A. Le résultat peut révéler un lieu sensible si A l’a sauvegardé ou recherché. La portée reste le même profil navigateur; le constat ne donne pas accès aux autres lignes Supabase et ne prétend pas dévoiler toutes les observations.

Likelihood assessment:
- **Level:** medium
- **Why:** Nécessite des recherches ou presets sensibles sauvegardés et un profil partagé. N’accorde pas de lecture des autres observations Supabase.

#### Remediation

Scinder observation-filter-presets-v1 et map_search_history par user.id, et réinitialiser les états mémoire à chaque changement de compte. Pour les anciennes clés sans propriétaire, les supprimer ou demander explicitement à qui elles appartiennent plutôt que les attribuer au prochain compte. Prévoir une action d’effacement de l’historique. Conserver séparément les préférences réellement liées à l’appareil (thème ou installation).

Tests:
- Presets et recherches A restent absents de B après déconnexion/rechargement; les presets B fonctionnent.
- Les anciennes clés sans propriétaire ne sont pas attribuées automatiquement au prochain compte.

<a id="finding-5"></a>

### [5] Le journal partagé entre comptes conserve et réaffiche des URL de médias privés

| Field | Value |
| --- | --- |
| Severity | low |
| Confidence | high |
| Confidence rationale | Test réel des modules createBackup, journal persistant, AuthContext et SyncCenterDialog: URL fictive de A conservée après signOut, rechargement du journal puis affichage à B. Aucun appel externe réel. |
| Category | sensitive-data |
| CWE | CWE-532 |
| Affected lines | services/backupService.ts:332-339, utils/logger.ts:43-54, utils/eventLog.ts:21-25, components/SyncCenterDialog.tsx:59-64, components/SyncCenterDialog.tsx:171-180 |

#### Summary

Divulgation persistante de références de médias, d'identifiants et de fragments de données présents dans les erreurs. Avec le bucket actuellement public, une URL conservée dans ce journal donne également accès au média tant qu'il existe.

#### Root Cause

Les informations privées d'une observation ou de ses médias ne doivent pas être accessibles via les journaux d'un autre compte. Lorsqu'un téléchargement de média échoue pendant une sauvegarde, backupService journalise son URL complète. logger.warn et logger.error alimentent un tampon persistant commun nommé event-log-v1. La déconnexion supprime uniquement la file et le cache d'observations de A ; elle ne nettoie pas ce tampon. B ouvre le centre de synchronisation, qui affiche les dix derniers messages du journal commun. Le backup de B inclut également les cinquante derniers événements.

**entrypoint: services/backupService.ts** — `services/backupService.ts:332-339`

Cette entrée apporte les données ou l’identité qui doivent rester attachées au propriétaire et être traitées comme non fiables.

```
                const baseName = deriveImageBaseName(url, index);
                handleSuccess(kind, targetFolder, baseName, buffer, false);
            } else {
                handleFailure(kind, url);
            }
        } catch (e) {
            logger.warn(`Failed to download ${kind}: ${url}`, e);
            handleFailure(kind, url);
```

**propagation: utils/logger.ts** — `utils/logger.ts:43-54`

Cette étape transmet ou conserve ces données jusqu’au consommateur suivant sans rétablir la garantie manquante.

```
    },
    warn: (...args: unknown[]): void => {
        pushEvent('warn', args);
        if (shouldLog('warn')) {

            console.warn(...args);
        }
    },
    error: (...args: unknown[]): void => {
        pushEvent('error', args);
        reportError(args);
        if (shouldLog('error')) {
```

**root_control: utils/eventLog.ts** — `utils/eventLog.ts:21-25`

Ce contrôle conserve une ressource partagée ou n’impose pas la limite attendue.

```
export const EVENT_LOG_MAX = 50;
export const EVENT_LOG_STORAGE_KEY = 'event-log-v1';

let buffer: EventLogEntry[] = [];
let initialized = false;
```

**propagation: components/SyncCenterDialog.tsx** — `components/SyncCenterDialog.tsx:59-64`

Cette étape transmet ou conserve ces données jusqu’au consommateur suivant sans rétablir la garantie manquante.

```
    // SR-17 : derniers évènements applicatifs (warn/error). Relu à chaque ouverture.
    const recentEvents = React.useMemo<EventLogEntry[]>(() => {
        if (!isOpen) return [];
        const all = getEventLog();
        return all.slice(-10).reverse();
    }, [isOpen]);
```

**sink: components/SyncCenterDialog.tsx** — `components/SyncCenterDialog.tsx:171-180`

Ce consommateur rend les données accessibles ou matérialise l’allocation non bornée.

```
                                                    : 'bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300'
                                        }`}
                                    >
                                        {evt.level}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{formatTimestamp(evt.ts)}</p>
                                        <p className="text-sm text-gray-800 dark:text-gray-100 break-words">{evt.msg}</p>
                                    </div>
                                </li>
```

#### Validation

Test réel des modules createBackup, journal persistant, AuthContext et SyncCenterDialog: URL fictive de A conservée après signOut, rechargement du journal puis affichage à B. Aucun appel externe réel.

Validation method: lecture de code et tests locaux

**entrypoint: services/backupService.ts** — `services/backupService.ts:332-339`

Cette entrée apporte les données ou l’identité qui doivent rester attachées au propriétaire et être traitées comme non fiables.

```
                const baseName = deriveImageBaseName(url, index);
                handleSuccess(kind, targetFolder, baseName, buffer, false);
            } else {
                handleFailure(kind, url);
            }
        } catch (e) {
            logger.warn(`Failed to download ${kind}: ${url}`, e);
            handleFailure(kind, url);
```

**propagation: utils/logger.ts** — `utils/logger.ts:43-54`

Cette étape transmet ou conserve ces données jusqu’au consommateur suivant sans rétablir la garantie manquante.

```
    },
    warn: (...args: unknown[]): void => {
        pushEvent('warn', args);
        if (shouldLog('warn')) {

            console.warn(...args);
        }
    },
    error: (...args: unknown[]): void => {
        pushEvent('error', args);
        reportError(args);
        if (shouldLog('error')) {
```

**root_control: utils/eventLog.ts** — `utils/eventLog.ts:21-25`

Ce contrôle conserve une ressource partagée ou n’impose pas la limite attendue.

```
export const EVENT_LOG_MAX = 50;
export const EVENT_LOG_STORAGE_KEY = 'event-log-v1';

let buffer: EventLogEntry[] = [];
let initialized = false;
```

**propagation: components/SyncCenterDialog.tsx** — `components/SyncCenterDialog.tsx:59-64`

Cette étape transmet ou conserve ces données jusqu’au consommateur suivant sans rétablir la garantie manquante.

```
    // SR-17 : derniers évènements applicatifs (warn/error). Relu à chaque ouverture.
    const recentEvents = React.useMemo<EventLogEntry[]>(() => {
        if (!isOpen) return [];
        const all = getEventLog();
        return all.slice(-10).reverse();
    }, [isOpen]);
```

**sink: components/SyncCenterDialog.tsx** — `components/SyncCenterDialog.tsx:171-180`

Ce consommateur rend les données accessibles ou matérialise l’allocation non bornée.

```
                                                    : 'bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300'
                                        }`}
                                    >
                                        {evt.level}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{formatTimestamp(evt.ts)}</p>
                                        <p className="text-sm text-gray-800 dark:text-gray-100 break-words">{evt.msg}</p>
                                    </div>
                                </li>
```

Assertions:
- Les informations privées d'une observation ou de ses médias ne doivent pas être accessibles via les journaux d'un autre compte.

Limitations:
- Le tampon est borné à cinquante messages et chaque message à cinq cents caractères.
- Les événements sont affichés comme texte React, donc ce chemin n'établit pas une XSS.
- L'exposition exige des événements contenant des données privées et le partage du même profil de navigateur.

#### Dataflow

Lorsqu'un téléchargement de média échoue pendant une sauvegarde, backupService journalise son URL complète. → logger.warn et logger.error alimentent un tampon persistant commun nommé event-log-v1. → La déconnexion supprime uniquement la file et le cache d'observations de A ; elle ne nettoie pas ce tampon. → B ouvre le centre de synchronisation, qui affiche les dix derniers messages du journal commun. → Le backup de B inclut également les cinquante derniers événements.

- **Source:** L'utilisateur B du même navigateur après déconnexion de A, y compris après rechargement de la page.

- **Sink:** components/SyncCenterDialog.tsx

- **Outcome:** Divulgation persistante de références de médias, d'identifiants et de fragments de données présents dans les erreurs. Avec le bucket actuellement public, une URL conservée dans ce journal donne également accès au média tant qu'il existe.

**entrypoint: services/backupService.ts** — `services/backupService.ts:332-339`

Cette entrée apporte les données ou l’identité qui doivent rester attachées au propriétaire et être traitées comme non fiables.

```
                const baseName = deriveImageBaseName(url, index);
                handleSuccess(kind, targetFolder, baseName, buffer, false);
            } else {
                handleFailure(kind, url);
            }
        } catch (e) {
            logger.warn(`Failed to download ${kind}: ${url}`, e);
            handleFailure(kind, url);
```

**propagation: utils/logger.ts** — `utils/logger.ts:43-54`

Cette étape transmet ou conserve ces données jusqu’au consommateur suivant sans rétablir la garantie manquante.

```
    },
    warn: (...args: unknown[]): void => {
        pushEvent('warn', args);
        if (shouldLog('warn')) {

            console.warn(...args);
        }
    },
    error: (...args: unknown[]): void => {
        pushEvent('error', args);
        reportError(args);
        if (shouldLog('error')) {
```

**root_control: utils/eventLog.ts** — `utils/eventLog.ts:21-25`

Ce contrôle conserve une ressource partagée ou n’impose pas la limite attendue.

```
export const EVENT_LOG_MAX = 50;
export const EVENT_LOG_STORAGE_KEY = 'event-log-v1';

let buffer: EventLogEntry[] = [];
let initialized = false;
```

**propagation: components/SyncCenterDialog.tsx** — `components/SyncCenterDialog.tsx:59-64`

Cette étape transmet ou conserve ces données jusqu’au consommateur suivant sans rétablir la garantie manquante.

```
    // SR-17 : derniers évènements applicatifs (warn/error). Relu à chaque ouverture.
    const recentEvents = React.useMemo<EventLogEntry[]>(() => {
        if (!isOpen) return [];
        const all = getEventLog();
        return all.slice(-10).reverse();
    }, [isOpen]);
```

**sink: components/SyncCenterDialog.tsx** — `components/SyncCenterDialog.tsx:171-180`

Ce consommateur rend les données accessibles ou matérialise l’allocation non bornée.

```
                                                    : 'bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300'
                                        }`}
                                    >
                                        {evt.level}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{formatTimestamp(evt.ts)}</p>
                                        <p className="text-sm text-gray-800 dark:text-gray-100 break-words">{evt.msg}</p>
                                    </div>
                                </li>
```

#### Reachability

L'utilisateur B du même navigateur après déconnexion de A, y compris après rechargement de la page.

- **Attacker:** L'utilisateur B du même navigateur après déconnexion de A, y compris après rechargement de la page.

- **Entry point:** services/backupService.ts

- **Outcome:** Divulgation persistante de références de médias, d'identifiants et de fragments de données présents dans les erreurs. Avec le bucket actuellement public, une URL conservée dans ce journal donne également accès au média tant qu'il existe.

Limitations:
- Le tampon est borné à cinquante messages et chaque message à cinq cents caractères.
- Les événements sont affichés comme texte React, donc ce chemin n'établit pas une XSS.
- L'exposition exige des événements contenant des données privées et le partage du même profil de navigateur.

#### Severity

**Low** — Nécessite un échec ayant journalisé un média et le partage du même profil navigateur; données limitées aux événements persistés.

Additional runtime or deployment evidence could raise or lower this severity.

Impact assessment:
- **Level:** low
- **Why:** Divulgation persistante de références de médias, d'identifiants et de fragments de données présents dans les erreurs. Avec le bucket actuellement public, une URL conservée dans ce journal donne également accès au média tant qu'il existe.

Likelihood assessment:
- **Level:** medium
- **Why:** Nécessite un échec ayant journalisé un média et le partage du même profil navigateur; données limitées aux événements persistés.

#### Remediation

Retirer les URL, jetons, données d'observation et détails bruts des messages persistés ; conserver des codes d'erreur utiles. Si un journal utilisateur reste nécessaire, le lier explicitement à user.id et purger le tampon mémoire au changement d'identité.

Tests:
- Une erreur de sauvegarde ne conserve aucune URL complète ni donnée privée.
- Le journal A n’apparaît ni dans le centre de synchronisation ni dans le ZIP de B.

<a id="finding-6"></a>

### [6] Les imports décompressent et analysent des contenus sans limite de taille décompressée

| Field | Value |
| --- | --- |
| Severity | low |
| Confidence | high |
| Confidence rationale | Fixture bornée réellement importée: 8636 octets ZIP deviennent 8389155 caractères (~971 fois), acceptés avant prévisualisation. Aucune saturation provoquée; le chemin sans budget décompressé est confirmé. 27 tests ciblés de parseurs/exports passent, y compris reproductions de défauts. |
| Category | resource-exhaustion |
| CWE | CWE-409 |
| Affected lines | components/ObservationList.tsx:174-184, services/backupService.ts:460-482, services/backupService.ts:529-535, services/excelImportService.ts:211-231 |

#### Summary

Un petit fichier très compressible peut provoquer une expansion considérable, un blocage prolongé ou l'arrêt de l'onglet avant l'aperçu d'import. Le périmètre atteint est le navigateur de la victime ; aucun déni de service serveur n'est établi.

#### Root Cause

Un fichier importé ne doit pas pouvoir monopoliser la mémoire ou le traitement du navigateur avant les contrôles de validation. Le chemin ZIP vérifie seulement la taille compressée du fichier, avec une limite de 500 Mio. data.json est intégralement décompressé en chaîne puis analysé par JSON.parse avant toute limite de volume. Les médias référencés sont aussi intégralement décompressés en Blob puis convertis en data URL. Le chemin Excel charge intégralement le classeur avant les vérifications du nombre de lignes et de colonnes. Le délai Excel n'arrête que FileReader ; une fois la lecture terminée, il ne peut pas interrompre workbook.xlsx.load ou les boucles synchrones. Le chemin JSON direct n'effectue même pas de contrôle de file.size avant file.text et JSON.parse.

**entrypoint: components/ObservationList.tsx** — `components/ObservationList.tsx:174-184`

Cette entrée apporte les données ou l’identité qui doivent rester attachées au propriétaire et être traitées comme non fiables.

```
                if (lowerName.endsWith('.json')) {
                    const text = await file.text();
                    const parsed = JSON.parse(text) as unknown;
                    importResult = parseJsonImport(parsed);
                } else if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
                    const { parseExcel } = await import('../services/excelImportService');
                    importResult = await parseExcel(file);
                } else if (lowerName.endsWith('.zip')) {
                    // SR-01 : restauration depuis un backup ZIP
                    const { readBackupZip } = await import('../services/backupService');
                    importResult = await readBackupZip(file);
```

**root_control: services/backupService.ts** — `services/backupService.ts:460-482`

Ce contrôle conserve une ressource partagée ou n’impose pas la limite attendue.

```
export const readBackupZip = async (file: File): Promise<ImportResult> => {
    if (file.size > BACKUP_RESTORE_MAX_SIZE_BYTES) {
        const mb = Math.round(file.size / (1024 * 1024));
        throw new Error(`Archive trop volumineuse (${mb} Mo). Limite : ${Math.round(BACKUP_RESTORE_MAX_SIZE_BYTES / (1024 * 1024))} Mo.`);
    }

    const { default: JSZip } = await import('jszip');
    let zip: import('jszip');
    try {
        zip = await JSZip.loadAsync(file);
    } catch (err) {
        logger.error('[backupService] ZIP illisible:', err);
        throw new Error('Archive ZIP invalide ou corrompue.');
    }

    const dataEntry = zip.file('data.json');
    if (!dataEntry) {
        throw new Error('Archive ZIP invalide : data.json manquant.');
    }
    const jsonText = await dataEntry.async('string');
    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonText);
```

**sink: services/backupService.ts** — `services/backupService.ts:529-535`

Ce consommateur rend les données accessibles ou matérialise l’allocation non bornée.

```
        const candidates = mediaFilenameCandidates(url);
        for (const name of candidates) {
            const entry = index.get(name);
            if (entry) {
                try {
                    const blob = await entry.async('blob');
                    return await blobToDataUrl(blob);
```

**propagation: services/excelImportService.ts** — `services/excelImportService.ts:211-231`

Cette étape transmet ou conserve ces données jusqu’au consommateur suivant sans rétablir la garantie manquante.

```
        timeoutId = window.setTimeout(() => {
            logger.warn(`[security][excel-import] Import interrompu après ${IMPORT_PARSE_TIMEOUT_MS}ms.`);
            reader.abort();
            safeResolve(createBlockingResult(
                'Le parsing du fichier a expiré (timeout). Réduisez la taille du fichier ou découpez-le.',
                file.name
            ));
        }, IMPORT_PARSE_TIMEOUT_MS);

        reader.onload = async (e) => {
            try {
                const data = e.target?.result;
                if (!data || !(data instanceof ArrayBuffer)) {
                    safeResolve(createBlockingResult('Impossible de lire le fichier Excel.', file.name));
                    return;
                }

                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.load(data);

                const worksheet = workbook.worksheets[0];
```

#### Validation

Fixture bornée réellement importée: 8636 octets ZIP deviennent 8389155 caractères (~971 fois), acceptés avant prévisualisation. Aucune saturation provoquée; le chemin sans budget décompressé est confirmé. 27 tests ciblés de parseurs/exports passent, y compris reproductions de défauts.

Validation method: lecture de code et tests locaux

**entrypoint: components/ObservationList.tsx** — `components/ObservationList.tsx:174-184`

Cette entrée apporte les données ou l’identité qui doivent rester attachées au propriétaire et être traitées comme non fiables.

```
                if (lowerName.endsWith('.json')) {
                    const text = await file.text();
                    const parsed = JSON.parse(text) as unknown;
                    importResult = parseJsonImport(parsed);
                } else if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
                    const { parseExcel } = await import('../services/excelImportService');
                    importResult = await parseExcel(file);
                } else if (lowerName.endsWith('.zip')) {
                    // SR-01 : restauration depuis un backup ZIP
                    const { readBackupZip } = await import('../services/backupService');
                    importResult = await readBackupZip(file);
```

**root_control: services/backupService.ts** — `services/backupService.ts:460-482`

Ce contrôle conserve une ressource partagée ou n’impose pas la limite attendue.

```
export const readBackupZip = async (file: File): Promise<ImportResult> => {
    if (file.size > BACKUP_RESTORE_MAX_SIZE_BYTES) {
        const mb = Math.round(file.size / (1024 * 1024));
        throw new Error(`Archive trop volumineuse (${mb} Mo). Limite : ${Math.round(BACKUP_RESTORE_MAX_SIZE_BYTES / (1024 * 1024))} Mo.`);
    }

    const { default: JSZip } = await import('jszip');
    let zip: import('jszip');
    try {
        zip = await JSZip.loadAsync(file);
    } catch (err) {
        logger.error('[backupService] ZIP illisible:', err);
        throw new Error('Archive ZIP invalide ou corrompue.');
    }

    const dataEntry = zip.file('data.json');
    if (!dataEntry) {
        throw new Error('Archive ZIP invalide : data.json manquant.');
    }
    const jsonText = await dataEntry.async('string');
    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonText);
```

**sink: services/backupService.ts** — `services/backupService.ts:529-535`

Ce consommateur rend les données accessibles ou matérialise l’allocation non bornée.

```
        const candidates = mediaFilenameCandidates(url);
        for (const name of candidates) {
            const entry = index.get(name);
            if (entry) {
                try {
                    const blob = await entry.async('blob');
                    return await blobToDataUrl(blob);
```

**propagation: services/excelImportService.ts** — `services/excelImportService.ts:211-231`

Cette étape transmet ou conserve ces données jusqu’au consommateur suivant sans rétablir la garantie manquante.

```
        timeoutId = window.setTimeout(() => {
            logger.warn(`[security][excel-import] Import interrompu après ${IMPORT_PARSE_TIMEOUT_MS}ms.`);
            reader.abort();
            safeResolve(createBlockingResult(
                'Le parsing du fichier a expiré (timeout). Réduisez la taille du fichier ou découpez-le.',
                file.name
            ));
        }, IMPORT_PARSE_TIMEOUT_MS);

        reader.onload = async (e) => {
            try {
                const data = e.target?.result;
                if (!data || !(data instanceof ArrayBuffer)) {
                    safeResolve(createBlockingResult('Impossible de lire le fichier Excel.', file.name));
                    return;
                }

                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.load(data);

                const worksheet = workbook.worksheets[0];
```

Assertions:
- Un fichier importé ne doit pas pouvoir monopoliser la mémoire ou le traitement du navigateur avant les contrôles de validation.

Limitations:
- Excel impose 15 Mio, 10 000 lignes, 120 colonnes et un délai nominal de 20 secondes.
- ZIP impose 500 Mio compressés.
- Ces limites ne bornent pas l'expansion ni le travail déjà réalisé avant leurs contrôles.
- L'utilisateur doit sélectionner volontairement le fichier ; aucun déclenchement distant automatique n'est identifié.
- Aucun test de saturation n'a été exécuté par cet auditeur statique.

#### Dataflow

Le chemin ZIP vérifie seulement la taille compressée du fichier, avec une limite de 500 Mio. → data.json est intégralement décompressé en chaîne puis analysé par JSON.parse avant toute limite de volume. → Les médias référencés sont aussi intégralement décompressés en Blob puis convertis en data URL. → Le chemin Excel charge intégralement le classeur avant les vérifications du nombre de lignes et de colonnes. → Le délai Excel n'arrête que FileReader ; une fois la lecture terminée, il ne peut pas interrompre workbook.xlsx.load ou les boucles synchrones. → Le chemin JSON direct n'effectue même pas de contrôle de file.size avant file.text et JSON.parse.

- **Source:** L'auteur d'une archive de sauvegarde ou d'un fichier Excel piégé que la victime choisit d'importer.

- **Sink:** services/excelImportService.ts

- **Outcome:** Un petit fichier très compressible peut provoquer une expansion considérable, un blocage prolongé ou l'arrêt de l'onglet avant l'aperçu d'import. Le périmètre atteint est le navigateur de la victime ; aucun déni de service serveur n'est établi.

**entrypoint: components/ObservationList.tsx** — `components/ObservationList.tsx:174-184`

Cette entrée apporte les données ou l’identité qui doivent rester attachées au propriétaire et être traitées comme non fiables.

```
                if (lowerName.endsWith('.json')) {
                    const text = await file.text();
                    const parsed = JSON.parse(text) as unknown;
                    importResult = parseJsonImport(parsed);
                } else if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
                    const { parseExcel } = await import('../services/excelImportService');
                    importResult = await parseExcel(file);
                } else if (lowerName.endsWith('.zip')) {
                    // SR-01 : restauration depuis un backup ZIP
                    const { readBackupZip } = await import('../services/backupService');
                    importResult = await readBackupZip(file);
```

**root_control: services/backupService.ts** — `services/backupService.ts:460-482`

Ce contrôle conserve une ressource partagée ou n’impose pas la limite attendue.

```
export const readBackupZip = async (file: File): Promise<ImportResult> => {
    if (file.size > BACKUP_RESTORE_MAX_SIZE_BYTES) {
        const mb = Math.round(file.size / (1024 * 1024));
        throw new Error(`Archive trop volumineuse (${mb} Mo). Limite : ${Math.round(BACKUP_RESTORE_MAX_SIZE_BYTES / (1024 * 1024))} Mo.`);
    }

    const { default: JSZip } = await import('jszip');
    let zip: import('jszip');
    try {
        zip = await JSZip.loadAsync(file);
    } catch (err) {
        logger.error('[backupService] ZIP illisible:', err);
        throw new Error('Archive ZIP invalide ou corrompue.');
    }

    const dataEntry = zip.file('data.json');
    if (!dataEntry) {
        throw new Error('Archive ZIP invalide : data.json manquant.');
    }
    const jsonText = await dataEntry.async('string');
    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonText);
```

**sink: services/backupService.ts** — `services/backupService.ts:529-535`

Ce consommateur rend les données accessibles ou matérialise l’allocation non bornée.

```
        const candidates = mediaFilenameCandidates(url);
        for (const name of candidates) {
            const entry = index.get(name);
            if (entry) {
                try {
                    const blob = await entry.async('blob');
                    return await blobToDataUrl(blob);
```

**propagation: services/excelImportService.ts** — `services/excelImportService.ts:211-231`

Cette étape transmet ou conserve ces données jusqu’au consommateur suivant sans rétablir la garantie manquante.

```
        timeoutId = window.setTimeout(() => {
            logger.warn(`[security][excel-import] Import interrompu après ${IMPORT_PARSE_TIMEOUT_MS}ms.`);
            reader.abort();
            safeResolve(createBlockingResult(
                'Le parsing du fichier a expiré (timeout). Réduisez la taille du fichier ou découpez-le.',
                file.name
            ));
        }, IMPORT_PARSE_TIMEOUT_MS);

        reader.onload = async (e) => {
            try {
                const data = e.target?.result;
                if (!data || !(data instanceof ArrayBuffer)) {
                    safeResolve(createBlockingResult('Impossible de lire le fichier Excel.', file.name));
                    return;
                }

                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.load(data);

                const worksheet = workbook.worksheets[0];
```

#### Reachability

L'auteur d'une archive de sauvegarde ou d'un fichier Excel piégé que la victime choisit d'importer.

- **Attacker:** L'auteur d'une archive de sauvegarde ou d'un fichier Excel piégé que la victime choisit d'importer.

- **Entry point:** components/ObservationList.tsx

- **Outcome:** Un petit fichier très compressible peut provoquer une expansion considérable, un blocage prolongé ou l'arrêt de l'onglet avant l'aperçu d'import. Le périmètre atteint est le navigateur de la victime ; aucun déni de service serveur n'est établi.

Limitations:
- Excel impose 15 Mio, 10 000 lignes, 120 colonnes et un délai nominal de 20 secondes.
- ZIP impose 500 Mio compressés.
- Ces limites ne bornent pas l'expansion ni le travail déjà réalisé avant leurs contrôles.
- L'utilisateur doit sélectionner volontairement le fichier ; aucun déclenchement distant automatique n'est identifié.
- Aucun test de saturation n'a été exécuté par cet auditeur statique.

#### Severity

**Low** — Impact limité à l’onglet de la victime qui sélectionne volontairement un fichier. Aucune indisponibilité serveur ni exécution de code démontrée.

Additional runtime or deployment evidence could raise or lower this severity.

Impact assessment:
- **Level:** low
- **Why:** Un petit fichier très compressible peut provoquer une expansion considérable, un blocage prolongé ou l'arrêt de l'onglet avant l'aperçu d'import. Le périmètre atteint est le navigateur de la victime ; aucun déni de service serveur n'est établi.

Likelihood assessment:
- **Level:** medium
- **Why:** Impact limité à l’onglet de la victime qui sélectionne volontairement un fichier. Aucune indisponibilité serveur ni exécution de code démontrée.

#### Remediation

Appliquer un budget commun sur la taille d'entrée, les entrées d'archive, les octets réellement décompressés, les lignes et les longueurs de champs. Décompresser avec compteur et interruption avant accumulation. Déplacer les parseurs dans un Worker pouvant être terminé ; ne pas présenter reader.abort comme une annulation du parseur.

Tests:
- Une archive modeste très compressible est rejetée dès le budget décompressé atteint, sans accumulation intégrale.
- Le délai termine réellement le Worker; un fichier légitime sous limites reste importable.

## Reviewed Surfaces

| Surface | Risk Area | Outcome | Notes |
| --- | --- | --- | --- |
| Accès SQL et observations | not recorded | No issue found | Vrais appels locaux: lecture/mutation B depuis A sans effet, INSERT B et transfert user_id refusés, lot mixte refusé, positif propriétaire réussi. Policies en ligne alignées; pas de SQL dynamique dans les chemins inspectés. public.observations possède RLS. Les GRANT TRUNCATE/REFERENCES/TRIGGER restent du durcissement sans route API exploitable trouvée. |
| Authentification et suppression de compte | not recorded | No issue found | JWT absent/falsifié/expiré refusés; compte C supprimé malgré user_id B dans le corps et compte B intact, médias C effacés. SDK auth-js 2.110.3 nettoie la session sur réponse 503 simulée. verify_jwt=true en production; source serveur récupéré identique au dépôt. |
| HTML, JavaScript, formules et objets importés | not recorded | No issue found | 27 tests ciblés incluent échappement HTML/PDF, chaînes XLSX, neutralisation CSV, URL interdites et absence de pollution globale. Les popups utilisent textContent. L’anomalie Excel de lecture de propriété héritée est conservée pour audit fonctionnel, sans impact de sécurité établi. |
| Les photos et sons restent accessibles sans authentification par leur URL permanente | not recorded | Reported | Configuration Supabase hébergée lue: bucket photos public=true. Tests REST locaux: JPEG et WAV lus sans jeton; B lit aussi une photo de A par la route dite authenticated du bucket public. Listing intercompte et écritures étrangères restent refusés. |
| Un changement de compte conserve les observations et le formulaire d'édition du compte précédent | not recorded | Reported | Navigateur Chromium sur le bundle compilé, en-têtes Vercel avec exception API loopback, vrais comptes Auth locaux: A ouvre Modifier, se déconnecte et B se connecte. Le menu identifie B mais les champs contiennent PRIVE_A et SECRET_FICTIF_PRIVE_A. Capture et browser-result.json conservés. |
| Les opérations asynchrones écrivent dans le cache ou la file du compte devenu actif | not recorded | Reported | Test déterministe exécuté: une réponse A retardée termine après setStorageNamespace(B), remplace le cache B, puis un chargement hors ligne B restitue les données A. Le transport simulé prouve le défaut client, pas un contournement RLS serveur. |
| Les imports décompressent et analysent des contenus sans limite de taille décompressée | not recorded | Reported | Fixture bornée réellement importée: 8636 octets ZIP deviennent 8389155 caractères (~971 fois), acceptés avant prévisualisation. Aucune saturation provoquée; le chemin sans budget décompressé est confirmé. 27 tests ciblés de parseurs/exports passent, y compris reproductions de défauts. |
| Le journal partagé entre comptes conserve et réaffiche des URL de médias privés | not recorded | Reported | Test réel des modules createBackup, journal persistant, AuthContext et SyncCenterDialog: URL fictive de A conservée après signOut, rechargement du journal puis affichage à B. Aucun appel externe réel. |
| Les lieux recherchés et les filtres géographiques restent visibles au compte suivant | not recorded | Reported | Validation indépendante du code: clé globale de presets contenant les coordonnées, lecture sans userId et affichage/applicateur dans AdvancedFilterDialog; historique map_search_history également global et affiché. Pas de reproduction navigateur dédiée pour ce constat. |
| CSP, iframe, CORS et CSRF | not recorded | No issue found | Alias carnet-naturaliste.vercel.app: HTTP 200 et CSP, HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy et Permissions-Policy présents. CORS \* ne remplace pas le Bearer requis. Tests sans jeton refusés; pas de preuve de requête privilégiée déclenchable avec les seuls cookies. |
| Secrets dans source, historique et bundle | not recorded | No issue found | 324 fichiers suivis, 876 blobs historiques (~70,9 Mo), 102 fichiers de build examinés par motifs connus. Six correspondances sont des exemples à placeholders; aucune clé secrète confirmée. Clé anon publique exclue. Pas de vérification de validité en ligne; motifs inconnus/encodés peuvent être manqués. |
| Dépendances et chaîne de publication | not recorded | Needs follow-up | npm audit actualisé: 11 paquets signalés (5 high, 6 moderate), sans équivalence automatique avec 11 failles exploitables. DOMPurify livré via jsPDF, mais pdf.html non appelé dans le produit inspecté; autres alertes principalement outils/chemins non atteignables par observations. CI sur tags mutables, permissions implicites; revue des mises à jour conseillée sans correction dans cet audit. Vérification GitHub: default_workflow_permissions=read et can_approve_pull_request_reviews=false. Branch protection et rulesets HTTP403; ne pas en déduire une règle active ou son absence. |
| Réglages Auth et protections en ligne | not recorded | Needs follow-up | Advisors: protection mots de passe compromis désactivée et search_path du trigger non fixé. Aucun chemin d’élévation via ce trigger invoker établi. Minimum mot de passe, confirmation email, MFA, captcha et limites Auth hébergées non accessibles par les outils utilisés; ne pas inférer leurs valeurs de config.toml local. |
| Cache de médias du service worker | not recorded | Needs follow-up | Cache supabase-storage-cache partagé, pas de purge explicite à signOut. Prévoir une validation PWA HTTPS dédiée lors de la privatisation des médias; le scénario browser courant bloque le worker pour isoler l’état React. |
| Autres familles d’injection serveur | not recorded | Not applicable | Pas de moteur de templates serveur, shell utilisateur, XML/XXE, NoSQL ou proxy serveur à URL arbitraire dans les chemins applicatifs inspectés. Les téléchargements externes sont des fetch navigateur; cela n’établit pas un SSRF serveur. |
| Composants et configuration restants | not recorded | No issue found | Aucun sink HTML brut, évaluation de code ou URL provenant de données d'observation dans ces composants. Les textes variables sont des enfants JSX échappés. Les SVG et les textes de l'aide, des pages légales et du tutoriel sont statiques. Le masque SVG EmptyState retire les caractères autres que alphanumériques, underscore et tiret de l'identifiant généré. Les styles de déplacement GlassTabBar proviennent de mesures numériques du DOM et des événements pointeur. Ce module conserve uniquement un marqueur booléen de tutoriel vu sous onboarding-seen-v1. Il ne conserve ni observations, ni identifiant de compte, ni jeton. Le marqueur partagé entre comptes ne constitue pas un franchissement de frontière de sécurité significatif. Le script module et les liens du point d'entrée sont des chemins locaux constants. Les gestionnaires inline onfocus/onblur du lien d'accessibilité et onclick de rechargement hors ligne sont statiques ; aucune entrée attaquante n'y est interpolée. Leur éventuel blocage par CSP est une question de fonctionnement, pas une faille démontrée par ces fichiers. Ne pas assouplir CSP pour les autoriser sans analyse séparée. startupEnrichmentUtils filtre une collection et borne sa sélection avec slice sans I/O ni interprétation de code. atlasCodes effectue des comparaisons exactes dans une liste constante ; une valeur inconnue ressort comme chaîne brute et doit rester du texte chez ses appelants. Les types TypeScript ne remplacent pas une validation d'entrée, mais ces définitions n'exécutent aucune opération privilégiée. constants.tsx associe des taxons à des chemins d'images locaux constants. ESLint, PostCSS, Tailwind et Vitest utilisent des paramètres locaux statiques sans entrée HTTP, secret ou commande interpolée. Le script PowerShell lit une image fixe appartenant au dépôt et écrit des tailles et chemins fixes calculés depuis PSScriptRoot. Un attaquant devrait déjà contrôler les fichiers du dépôt ou l'environnement développeur ; aucun gain de privilège supplémentaire démontré. Le script n'a pas été exécuté. |
| Couverture réelle des sources | not recorded | Needs follow-up | 132 fichiers intégralement revus selon union dédupliquée des quatre revues. Tous les fichiers de produit exécutables/config listés comme restants ont été examinés; les tests historiques, rapports d’anciens audits et illustrations ne sont pas tous revus ligne à ligne. 459 tests historiques exécutés. Couverture partielle déclarée pour conserver les limites Auth/PWA et l’absence d’attaque sur production. |

## Open Questions And Follow Up

- Quels minimum de mot de passe, confirmation email, MFA/captcha, redirections et limites de requêtes sont configurés dans Auth hébergé ?
- Les limites serveur Auth suffisent-elles sous des tentatives distribuées ? Aucun essai de charge externe autorisé.
- Après privatisation des médias, quelles données doivent rester disponibles hors ligne et comment purger les caches au changement de compte ?
- Réglages Auth hébergés non exposés par les outils disponibles; vérification complémentaire nécessaire.
  - Follow-up prompt: Review deferred unit production-auth-settings and close its stated proof gap. Paths: supabase/config.toml.
- Isolation du cache service worker examinée statiquement; aucune reproduction HTTPS/PWA dédiée.
  - Follow-up prompt: Review deferred unit pwa-runtime and close its stated proof gap. Paths: vite.config.ts.
- En attente de validation indépendante par le coordinateur.
  - Follow-up prompt: Review deferred unit injection-1 and close its stated proof gap.
