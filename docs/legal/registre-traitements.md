# Registre des traitements de donnees personnelles (RGPD Art. 30)

**Responsable de traitement** : Eliot SERIVE (editeur particulier, service non commercial) — contact : carnetnaturaliste.app@gmail.com
**Date de mise a jour** : 2026-11-21

---

## Traitement 1 : Authentification

| Champ | Valeur |
|---|---|
| Finalite | Creer et gerer les comptes utilisateurs |
| Base legale | Execution du contrat (CGU) |
| Donnees collectees | Email, mot de passe (hashe par Supabase Auth) |
| Duree de conservation | Duree du compte. Suppression immediate en base ; voir Traitement 7 pour les sauvegardes. |
| Destinataires | Supabase Inc. (sous-traitant, hebergeur auth + BDD) |
| Transfert hors UE | Non pour l'exploitation courante — Supabase heberge dans l'UE (eu-central-1, Francfort). **Voir Traitement 7** pour les sauvegardes techniques (chiffrees, hebergees hors UE). |

## Traitement 2 : Observations naturalistes

| Champ | Valeur |
|---|---|
| Finalite | Enregistrer et consulter les observations de terrain |
| Base legale | Execution du contrat (CGU) |
| Donnees collectees | Espece, date, heure, lieu-dit, coordonnees GPS, altitude, commune, departement, pays, commentaire, photos, protocole, conditions meteo |
| Duree de conservation | Duree du compte. Cache local : 90 jours (TTL). |
| Destinataires | Supabase Inc. (BDD PostgreSQL), Vercel Inc. (CDN/hosting) |
| Transfert hors UE | Non pour l'exploitation courante — Supabase heberge dans l'UE (eu-central-1, Francfort). Vercel : frontend statique public (CDN mondial), aucune donnee personnelle. **Voir Traitement 7** pour les sauvegardes techniques. |

## Traitement 3 : Geolocalisation (GPS)

| Champ | Valeur |
|---|---|
| Finalite | Localiser les observations sur une carte ; filtre « près de chez moi » de la recherche en langage naturel (Traitement 9.4 : position de l'appareil gardée en mémoire le temps de la recherche, jamais envoyée ni enregistrée) |
| Base legale | Consentement (API Geolocation du navigateur) |
| Donnees collectees | Latitude, longitude |
| Duree de conservation | Duree de l'observation |
| Destinataires | Nominatim/OpenStreetMap (geocodage inverse — IP transmise ; geocodage direct du nom d'un lieu cite dans une recherche, voir Traitement 9.4) |
| Transfert hors UE | Possible (serveurs Nominatim en Europe et ailleurs) |
| Mesures | User-Agent identifiant l'application. GPS flouté (~11 km) a l'export pour especes VU/EN/CR/EW. |

## Traitement 4 : Suggestions taxonomiques

| Champ | Valeur |
|---|---|
| Finalite | Auto-completer les noms d'especes |
| Base legale | Interet legitime (amelioration UX) |
| Donnees collectees | Termes de recherche (nom d'espece partiel) |
| Duree de conservation | Aucune — requetes non persistees cote serveur |
| Destinataires | iNaturalist (California Academy of Sciences), GBIF ; Wikipédia (Wikimedia Foundation) pour la fiche de l'espèce (nom de l'espèce) |
| Transfert hors UE | Oui — serveurs iNaturalist (US), GBIF (Danemark/global), Wikimedia (US) |
| Mesures | User-Agent identifiant l'application. Aucune donnee personnelle transmise. |

## Traitement 5 : Donnees meteorologiques

| Champ | Valeur |
|---|---|
| Finalite | Pre-remplir les conditions meteo d'une observation |
| Base legale | Interet legitime (amelioration UX) |
| Donnees collectees | Coordonnees GPS et date de l'observation (meteo), coordonnees seules (altitude), transmises a l'API sans identite |
| Duree de conservation | Aucune — reponse consommee en memoire |
| Destinataires | Open-Meteo (open-source, serveurs EU) |
| Transfert hors UE | Non (serveurs en Europe) |

## Traitement 6 : Stockage local (localStorage)

| Champ | Valeur |
|---|---|
| Finalite | Fonctionnement hors-ligne, cache, preferences |
| Base legale | Consentement (bandeau de consentement au stockage) |
| Donnees collectees | Observations en cache, session, preferences UI (theme sombre, filtres) ; bilans du mois rediges par l'assistant IA, phrases de recherche interpretees par l'assistant et dernier compteur d'utilisations connu (Traitement 9), par personne |
| Duree de conservation | Cache : 90 jours (TTL). Preferences : duree du navigateur. Bilans du mois : 24 mois au plus apres leur redaction (purge a l'ouverture de l'application, pour tous les comptes du navigateur) ; effaces aussi de l'appareil ou le compte est supprime. Phrases de recherche interpretees : les 50 dernieres, effacees de l'appareil au retrait de l'accord a la recherche ou a l'assistant et a la suppression du compte. |
| Destinataires | Aucun — donnees locales uniquement |
| Transfert hors UE | Non |

## Traitement 7 : Sauvegarde technique de la base

| Champ | Valeur |
|---|---|
| Finalite | Continuite de service : pouvoir restaurer la base apres un incident (l'offre gratuite Supabase ne fournit aucune sauvegarde) |
| Base legale | Interet legitime (art. 6.1.f) — securite et disponibilite du service |
| Donnees collectees | Copie complete de la base : comptes (email, mot de passe hashe) et observations. **Les fichiers photos/sons ne sont pas inclus.** |
| Duree de conservation | 35 jours — suppression automatique de l'archive par GitHub a l'expiration |
| Destinataires | GitHub Inc. (Microsoft), sous-traitant, stockage de l'archive |
| Transfert hors UE | **Oui** — les artefacts GitHub sont heberges aux Etats-Unis (la residence des donnees en UE n'existe que sur l'offre Enterprise Cloud). |
| Mesures | Archive **chiffree** (age, chiffrement asymetrique) avant tout depot : GitHub ne detient que du contenu chiffre, la cle privee reste chez le responsable de traitement. Archive conservee dans un **depot prive dedie** (`Limuletempedte/carnet-naturaliste-sauvegardes`), distinct du depot de code public : seul son proprietaire peut la telecharger. Le workflow n'a aucun droit d'ecriture et refuse de s'executer dans un depot public. Les archives produites dans l'ancien emplacement (le depot de code, alors prive) sont supprimees avant que ce depot ne devienne public. |

> Procedure d'exploitation : [`docs/ops/RUNBOOK-sauvegarde-restauration.md`](../ops/RUNBOOK-sauvegarde-restauration.md)

---

## Traitement 8 : Protection anti-robots (Cloudflare Turnstile)

| Champ | Valeur |
|---|---|
| Finalité | Limiter les abus automatisés sur connexion, inscription et demande de récupération du compte |
| Base légale | Intérêt légitime à sécuriser les comptes (art. 6.1.f) |
| Données | IP, signaux du navigateur et de connexion (notamment User-Agent, caractéristiques TLS et site d'origine) ; jeton transmis à Supabase pour validation |
| Destinataires | Cloudflare Inc. (Turnstile) et Supabase Auth pour la validation du jeton |
| Conservation | Jeton conservé uniquement en mémoire par l'application jusqu'à utilisation, expiration (5 minutes maximum) ou fermeture du formulaire. Conservation des données du fournisseur selon sa politique, sans durée supplémentaire garantie par l'application. |
| Transfert hors UE | Possible : traitement Cloudflare mondial ; ne pas assimiler la région Supabase à une garantie de traitement exclusivement européen |
| Mesures | Widget limité au domaine de production, pas de pré-clearance, clé secrète uniquement dans la configuration serveur Supabase ; aucun mot de passe ou contenu d'observation envoyé au widget |

Sources : [politique Turnstile](https://www.cloudflare.com/turnstile-privacy-policy/), [validation serveur](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).

## Traitement 9 : Assistant IA (Anthropic)

Un traitement, une sous-section par fonctionnalité. Le socle est commun :
demande d'accès validée à la main (`ai_access`), quota de **20 utilisations
par mois, toutes fonctionnalités confondues**, budget global plafonné, journal
d'usage (`ai_usage`). Chaque fonctionnalité a **son propre consentement**
(finalités distinctes) : photo dans `ai_access.consent_version`, fonctionnalités
texte dans `ai_consents`.

### Socle commun

| Champ | Valeur |
|---|---|
| Base légale | **Consentement** (art. 6.1.a), par fonctionnalité : case obligatoire, texte versionné, retrait à tout moment dans la fenêtre « Assistant IA ». **Intérêt légitime** (art. 6.1.f) pour le journal d'usage : contrôle des coûts et des abus. |
| Données conservées par le Carnet | `ai_access` (statut de la demande, quota, version du consentement photo, dates, note) ; `ai_consents` (une ligne par fonctionnalité texte : fonctionnalité, version du texte accepté, `given_at` posé par le serveur comme preuve, art. 7.1) ; `ai_usage` (date, fonctionnalité, modèle, tokens, coût, statut). Ni photo, ni chiffres, ni note, ni hypothèses, ni texte produit. |
| Données conservées dans le navigateur | Bilans du mois rédigés (texte, date, empreinte des chiffres), par personne, **24 mois au plus après leur rédaction** : un bilan expiré n'est jamais relu, et il est retiré à chaque ouverture de l'application pour **tous** les comptes du navigateur (y compris un compte supprimé depuis un autre appareil) ; 24 mois différents au plus. Dernier compteur d'utilisations connu (affichage hors ligne), retiré dès que l'accès n'est plus approuvé et à l'ouverture suivant la fin du mois. Phrases de recherche interprétées par l'assistant (voir 9.4), **les 50 dernières**. Jamais envoyés au serveur. Effacés de l'appareil où le compte est supprimé ; sur les autres appareils, à leur expiration ou quand la personne efface les données du site. |
| Destinataires | Anthropic (modèle Claude), via **Anthropic Ireland Ltd** pour l'EEE, sous-traitant ; DPA intégré aux Commercial Terms, droit irlandais. Supabase (fonctions `ai-identify` et `ai-text`, tables, UE). |
| Transfert hors UE | **Oui** — données stockées aux États-Unis, pas de traitement limité à l'UE (`inference_geo` : `global` ou `us`). Transfert encadré par les clauses contractuelles types de l'UE (modules 2 et 3) du DPA. |
| Conservation | Chez Anthropic : entrées et sorties effacées sous 30 jours ; jusqu'à 2 ans si un contrôle de sécurité signale la demande. Pas d'entraînement sur les données de l'API par défaut. Dans le Carnet : `ai_access` et `ai_consents` jusqu'au retrait de l'accord (retirer l'accès supprime aussi les lignes `ai_consents`) ou à la suppression du compte ; `ai_usage` 3 mois (purge à chaque nouvelle réservation). |
| Mesures | Accès sur demande validée à la main ; quota et budget plafonnés ; clé API uniquement côté serveur ; droits et RLS empêchant de s'approuver soi-même, de modifier un consentement (suppression puis insertion seulement) ou d'en créer un pour autrui ; journaux sans utilisateur, photo, prompt, chiffres, note, phrase de recherche, filtres, position, hypothèses ni texte produit (côté serveur comme dans les journaux et Sentry de l'application) ; une donnée envoyée ne peut pas être rappelée (dit dans chaque consentement). |
| AIPD | Non nécessaire : petite échelle, pas de données sensibles recherchées, l'utilisateur décide de chaque envoi et de ce qu'il garde. |

### 9.1 Aide à l'identification (photo, `ai-identify`)

| Champ | Valeur |
|---|---|
| Finalité | Proposer, à la demande de l'utilisateur, jusqu'à 3 hypothèses d'espèce à partir de la photo d'une observation. L'utilisateur choisit lui-même ; rien n'est rempli automatiquement, aucune décision automatisée. |
| Consentement | Donné avec la demande d'accès (`ai_access.consent_version`, `CONSENT_VERSION` d'`ai-identify`). |
| Données envoyées à Anthropic | Photo réencodée en JPEG (1 280 px au plus, sans EXIF ni GPS), mois, pays, département, groupe taxonomique s'il a été choisi, habitat s'il est renseigné. **Jamais** : GPS, commune, lieu-dit, altitude, date exacte, commentaire, email, identifiant. |
| Mesures propres | Avertissement d'éviter les photos où des personnes sont reconnaissables. |

### 9.2 Bilan du mois (texte, `ai-text`, fonctionnalité `summary`)

| Champ | Valeur |
|---|---|
| Finalité | Rédiger, à la demande de l'utilisateur, un court texte à partir des chiffres d'un mois calculés par l'application (onglet Stats). Les chiffres font foi ; l'utilisateur décide de rédiger, de régénérer et de garder le texte. |
| Consentement | Ligne `ai_consents` (`feature = 'summary'`, version `CONSENT_VERSIONS.summary` d'`ai-text`), donnée par une carte affichée au premier usage ou dans « Assistant IA » ; retrait par « Retirer mon accord au bilan ». |
| Données envoyées à Anthropic | Mois (`AAAA-MM`), totaux (observations, espèces, jours d'activité), répartition par groupe, noms des 15 espèces les plus observées avec leur effectif, jusqu'à 30 espèces nouvelles (« + N autres »), mêmes totaux pour le même mois de l'année précédente. Les noms d'espèces liés à un compte restent des données personnelles. **Jamais** : lieu, commune, GPS, commentaire, observateur, date précise, photo, email. |
| Données conservées | Le texte rédigé reste **dans le navigateur** (24 mois au plus après sa rédaction, voir socle), jamais sur le serveur. |
| Mesures propres | Le serveur ne transmet que les champs validés (les autres sont ignorés) ; texte refusé s'il cite un nombre absent des chiffres fournis ; affichage en texte brut (ni HTML, ni markdown, ni lien). |

### 9.3 Note → fiche (texte, `ai-text`, fonctionnalité `note`)

| Champ | Valeur |
|---|---|
| Finalité | Proposer, à la demande de l'utilisateur, de remplir des champs de la fiche d'observation (espèce, effectifs, date, heure, lieu-dit, listes fermées) à partir d'une note libre tapée ou dictée au clavier. L'utilisateur relit chaque champ et coche ce qu'il applique ; l'application est annulable ; aucune décision automatisée. |
| Consentement | Ligne `ai_consents` (`feature = 'note'`, version `CONSENT_VERSIONS.note` d'`ai-text`, `2026-11-v1`), donnée par une carte affichée au premier usage ou dans « Assistant IA » ; retrait par « Retirer mon accord à la note ». La version provisoire `2026-11-v0` (partie serveur seule, sans texte affiché) est refusée. |
| Données envoyées à Anthropic | Le **texte de la note tel qu'il est écrit**, 1 000 caractères au plus (refus au-delà, jamais de troncature), nettoyé des caractères invisibles : il peut contenir des lieux, des noms d'espèces et des noms de personnes, ce que dit le consentement. Si la personne reprend le commentaire d'une fiche comme note, c'est ce commentaire. **Jamais** : date ou heure de la fiche, GPS, commune, observateurs, photo, reste de la fiche, email. |
| Données conservées | Aucune par le Carnet sans le choix de la personne : la note reste dans l'état de la page (jamais dans le stockage du navigateur ni sur le serveur) le temps de la relecture. Les champs cochés sont écrits dans la fiche ; la note entière (« Garder la note dans le commentaire », cochée d'avance, décochée d'avance quand la note reprend le commentaire) ou son reste (jamais pré-coché) ne rejoignent le commentaire que si la case correspondante est cochée, puis suivent le Traitement 2. Le commentaire reste borné à 5 000 caractères : au-delà, rien n'y est ajouté. |
| Autres destinataires | Le nom d'espèce proposé est vérifié par la recherche d'espèce (iNaturalist puis GBIF, Traitement 4) et sa fiche cherchée sur Wikipédia, comme un nom tapé à la main. Si la vérification échoue, le nom tel que proposé (120 caractères au plus, relu par la personne avant de cocher) est cherché de la même façon. |
| Mesures propres | Avertissement sous la zone de texte (éviter les noms de personnes et la localisation précise d'espèces sensibles) ; champs rendus bornés et vérifiés deux fois (fonction, puis application), un champ fautif est écarté et jamais proposé ; affichage en texte React brut (une balise écrite dans la note s'affiche telle quelle) ; la note et la réponse ne sont ni journalisées ni envoyées à Sentry ; les traces réseau gardées par Sentry sont réduites à l'adresse du site appelé, sans le nom cherché. |

### 9.4 Recherche en langage naturel (texte, `ai-text`, fonctionnalité `search`)

| Champ | Valeur |
|---|---|
| Finalité | Traduire en filtres, à la demande de l'utilisateur, une phrase tapée dans la recherche de la liste (« les rapaces vus en mai près de chez moi ») quand l'analyse gratuite de l'application ne la comprend pas entièrement. Les filtres sont appliqués par l'application, sur l'appareil, à ses propres observations ; l'utilisateur voit chaque filtre compris (« J'ai compris : … ») avant de l'appliquer, peut en retirer un et tout annuler ; aucune décision automatisée. |
| Consentement | Ligne `ai_consents` (`feature = 'search'`, version `CONSENT_VERSIONS.search` d'`ai-text`, `2026-11-v1`), donnée par une carte affichée au premier usage, sous le champ de recherche, ou dans « Assistant IA » ; retrait par « Retirer mon accord à la recherche ». La version provisoire de la partie serveur (plus longue que les 32 caractères de `ai_consents.version`, donc impossible à enregistrer) est remplacée. |
| Données envoyées à Anthropic | La **phrase telle qu'elle est écrite**, 200 caractères au plus (refus au-delà, jamais de troncature), nettoyée des caractères invisibles, seulement sur le bouton « Interpréter avec l'IA » (jamais sur Entrée) : elle peut contenir des lieux et des noms, ce que dit le consentement. **Jamais** : observation, position de l'appareil, date du jour, email. L'analyse gratuite (`utils/naturalSearchLocal.ts`) n'envoie rien. |
| Données conservées | Dans le navigateur seulement : les phrases interprétées par l'assistant, **les 50 dernières**, par personne, avec leurs filtres sous forme relative (« le mois dernier », « autour de ma position actuelle »), **sans date calculée ni coordonnées** ; clé normalisée, cache versionné avec le dictionnaire des catégories. Elles permettent de rejouer une phrase sans nouvelle utilisation, même hors ligne. Effacées de l'appareil au retrait de l'accord à la recherche ou à l'assistant, et à la suppression du compte (`ACCOUNT_SCOPED_STORAGE_PREFIXES`). Les filtres appliqués restent en mémoire le temps de la session de l'application ; un preset ne peut pas enregistrer les critères propres à la recherche (catégories, mois de toutes les années, habitats…). |
| Autres destinataires | **Nominatim (OpenStreetMap), géocodage direct** : quand la phrase cite un lieu (« près de Pessac »), son nom, tel que rendu par l'assistant, est envoyé à Nominatim pour trouver ses coordonnées, au moment où la personne applique les filtres (base légale : exécution du service demandé, art. 6.1.b ; IP transmise comme pour toute requête web ; transfert hors UE possible, comme au Traitement 3). **Position de l'appareil** (« près de chez moi ») : demandée au navigateur, avec son autorisation, au moment d'appliquer ; gardée en mémoire seulement, jamais envoyée à l'assistant ni enregistrée. |
| Mesures propres | Avertissement dans le consentement (éviter les noms de personnes et la localisation précise d'espèces sensibles) ; filtres rendus bornés et vérifiés deux fois (fonction, puis application), un champ fautif est écarté, signalé et jamais appliqué ; textes (nom, lieu, commune, genres) affichés en texte React brut ; la phrase, les filtres et la position ne sont ni journalisés ni envoyés à Sentry ; les traces réseau gardées par Sentry sont réduites à l'adresse du site appelé, sans le lieu cherché. |

> Exploitation : [`docs/ops/ASSISTANT-IA.md`](../ops/ASSISTANT-IA.md). Plan : [`docs/plans/assistant-ia-phase1.md`](../plans/assistant-ia-phase1.md) (sources des faits vérifiés le 2026-11-05).

## Droits des personnes concernees

Les utilisateurs peuvent exercer leurs droits (acces, rectification, effacement, portabilite, opposition) :
- **Export** : bouton "Exporter mes donnees" dans le menu profil. L'archive ZIP contient les observations (`data.json`, `data.csv`), leurs medias et, pour l'assistant IA (Traitement 9), le fichier `assistant_ia.json` : ligne `ai_access` (statut, version du consentement, dates, note, quota), lignes `ai_usage` (date, fonctionnalite, modele, tokens, cout, statut) et lignes `ai_consents` (fonctionnalite, version, date de l'accord) de l'utilisateur, lues avec ses propres droits (RLS). Section presente meme vide ; le journal ne couvre que les 3 derniers mois (duree de conservation). Toute nouvelle table IA liee a l'utilisateur doit y etre ajoutee (`AI_EXPORT_SOURCES` dans `services/aiDataExportService.ts`).
- **Suppression** : bouton "Supprimer mon compte" (suppression cascade de toutes les donnees)
- **Contact DPO** : carnetnaturaliste.app@gmail.com

### Effacement et sauvegardes

Une demande d'effacement est repercutee **immediatement** en base de production.
Les sauvegardes techniques deja constituees (Traitement 7) continuent de
contenir les donnees jusqu'a leur expiration automatique, soit **35 jours au
plus**. Ces sauvegardes sont chiffrees et servent exclusivement a une
restauration apres sinistre : elles ne sont jamais utilisees pour recreer un
compte supprime.

Assistant IA (Traitement 9) : à la suppression du compte, les lignes `ai_access`
et `ai_consents` sont supprimées, et les lignes `ai_usage` sont **rendues anonymes** (l'identifiant
est effacé, la dépense du mois reste comptée). Les sauvegardes techniques
conservent ces tables **35 jours au plus**. Les bilans gardés dans le
navigateur sont effacés de l'appareil où le compte est supprimé. Les données
déjà envoyées à Anthropic suivent sa propre durée (30 jours, jusqu'à 2 ans en cas de contrôle
de sécurité) et ne peuvent pas être rappelées par le Carnet.
