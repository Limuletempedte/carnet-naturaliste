# Registre des traitements de donnees personnelles (RGPD Art. 30)

**Responsable de traitement** : Eliot SERIVE (editeur particulier, service non commercial) — contact : carnetnaturaliste.app@gmail.com
**Date de mise a jour** : 2026-11-06

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
| Finalite | Localiser les observations sur une carte |
| Base legale | Consentement (API Geolocation du navigateur) |
| Donnees collectees | Latitude, longitude |
| Duree de conservation | Duree de l'observation |
| Destinataires | Nominatim/OpenStreetMap (geocodage inverse — IP transmise) |
| Transfert hors UE | Possible (serveurs Nominatim en Europe et ailleurs) |
| Mesures | User-Agent identifiant l'application. GPS flouté (~11 km) a l'export pour especes VU/EN/CR/EW. |

## Traitement 4 : Suggestions taxonomiques

| Champ | Valeur |
|---|---|
| Finalite | Auto-completer les noms d'especes |
| Base legale | Interet legitime (amelioration UX) |
| Donnees collectees | Termes de recherche (nom d'espece partiel) |
| Duree de conservation | Aucune — requetes non persistees cote serveur |
| Destinataires | iNaturalist (California Academy of Sciences), GBIF |
| Transfert hors UE | Oui — serveurs iNaturalist (US), GBIF (Danemark/global) |
| Mesures | User-Agent identifiant l'application. Aucune donnee personnelle transmise. |

## Traitement 5 : Donnees meteorologiques

| Champ | Valeur |
|---|---|
| Finalite | Pre-remplir les conditions meteo d'une observation |
| Base legale | Interet legitime (amelioration UX) |
| Donnees collectees | Coordonnees GPS (transmises a l'API) |
| Duree de conservation | Aucune — reponse consommee en memoire |
| Destinataires | Open-Meteo (open-source, serveurs EU) |
| Transfert hors UE | Non (serveurs en Europe) |

## Traitement 6 : Stockage local (localStorage)

| Champ | Valeur |
|---|---|
| Finalite | Fonctionnement hors-ligne, cache, preferences |
| Base legale | Consentement (bandeau de consentement au stockage) |
| Donnees collectees | Observations en cache, session, preferences UI (theme sombre, filtres) |
| Duree de conservation | Cache : 90 jours (TTL). Preferences : duree du navigateur. |
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

## Traitement 9 : Aide à l'identification par IA (Anthropic)

| Champ | Valeur |
|---|---|
| Finalité | Proposer, à la demande de l'utilisateur, jusqu'à 3 hypothèses d'espèce à partir de la photo d'une observation. L'utilisateur choisit lui-même ; rien n'est rempli automatiquement, aucune décision automatisée. |
| Base légale | **Consentement** (art. 6.1.a) pour l'envoi des photos : case obligatoire, texte versionné (`CONSENT_VERSION`), retrait à tout moment (« Retirer mon accord »). **Intérêt légitime** (art. 6.1.f) pour le journal d'usage : contrôle des coûts et des abus. |
| Données | Envoyées à Anthropic : photo réencodée en JPEG (1 280 px au plus, sans EXIF ni GPS), mois, pays, département, groupe taxonomique s'il a été choisi, habitat s'il est renseigné. **Jamais** : GPS, commune, lieu-dit, altitude, date exacte, commentaire, email, identifiant. Conservées par le Carnet : `ai_access` (statut de la demande, quota, version du consentement, dates, note) et `ai_usage` (date, modèle, tokens, coût, statut), sans photo ni hypothèses. |
| Destinataires | Anthropic (modèle Claude), via **Anthropic Ireland Ltd** pour l'EEE, sous-traitant ; DPA intégré aux Commercial Terms, droit irlandais. Supabase (fonction `ai-identify` et tables, UE). |
| Transfert hors UE | **Oui** — données stockées aux États-Unis, pas de traitement limité à l'UE (`inference_geo` : `global` ou `us`). Transfert encadré par les clauses contractuelles types de l'UE (modules 2 et 3) du DPA. |
| Conservation | Chez Anthropic : entrées et sorties effacées sous 30 jours ; jusqu'à 2 ans si un contrôle de sécurité signale la demande. Pas d'entraînement sur les données de l'API par défaut. Dans le Carnet : `ai_access` jusqu'au retrait de l'accord ou à la suppression du compte ; `ai_usage` 3 mois (purge à chaque nouvelle réservation). |
| Mesures | Accès sur demande validée à la main ; quota mensuel (20 par défaut) et budget global plafonné ; clé API uniquement côté serveur ; droits et RLS empêchant de s'approuver soi-même ; journaux sans utilisateur, photo, prompt ni hypothèses ; avertissement d'éviter les photos où des personnes sont reconnaissables ; une photo envoyée ne peut pas être rappelée (dit dans le consentement). |
| AIPD | Non nécessaire : petite échelle, pas de données sensibles recherchées, l'utilisateur décide de chaque envoi et du choix final. |

> Exploitation : [`docs/ops/ASSISTANT-IA.md`](../ops/ASSISTANT-IA.md). Plan : [`docs/plans/assistant-ia-phase1.md`](../plans/assistant-ia-phase1.md) (sources des faits vérifiés le 2026-11-05).

## Droits des personnes concernees

Les utilisateurs peuvent exercer leurs droits (acces, rectification, effacement, portabilite, opposition) :
- **Export** : bouton "Exporter mes donnees" dans le menu profil. L'archive ZIP contient les observations (`data.json`, `data.csv`), leurs medias et, pour l'assistant IA (Traitement 9), le fichier `assistant_ia.json` : ligne `ai_access` (statut, version du consentement, dates, note, quota) et lignes `ai_usage` (date, fonctionnalite, modele, tokens, cout, statut) de l'utilisateur, lues avec ses propres droits (RLS). Section presente meme vide ; le journal ne couvre que les 3 derniers mois (duree de conservation). Toute nouvelle table IA liee a l'utilisateur doit y etre ajoutee (`AI_EXPORT_SOURCES` dans `services/aiDataExportService.ts`).
- **Suppression** : bouton "Supprimer mon compte" (suppression cascade de toutes les donnees)
- **Contact DPO** : carnetnaturaliste.app@gmail.com

### Effacement et sauvegardes

Une demande d'effacement est repercutee **immediatement** en base de production.
Les sauvegardes techniques deja constituees (Traitement 7) continuent de
contenir les donnees jusqu'a leur expiration automatique, soit **35 jours au
plus**. Ces sauvegardes sont chiffrees et servent exclusivement a une
restauration apres sinistre : elles ne sont jamais utilisees pour recreer un
compte supprime.

Assistant IA (Traitement 9) : à la suppression du compte, la ligne `ai_access`
est supprimée et les lignes `ai_usage` sont **rendues anonymes** (l'identifiant
est effacé, la dépense du mois reste comptée). Les sauvegardes techniques
conservent les deux tables **35 jours au plus**. Les photos déjà envoyées à
Anthropic suivent sa propre durée (30 jours, jusqu'à 2 ans en cas de contrôle
de sécurité) et ne peuvent pas être rappelées par le Carnet.
