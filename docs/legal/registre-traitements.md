# Registre des traitements de donnees personnelles (RGPD Art. 30)

**Responsable de traitement** : Eliot SERIVE (editeur particulier, service non commercial) — contact : carnetnaturaliste.app@gmail.com
**Date de mise a jour** : 2026-07-26

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
| Mesures | Archive **chiffree** (age, chiffrement asymetrique) avant tout depot : GitHub ne detient que du contenu chiffre, la cle privee reste chez le responsable de traitement. Depot prive, workflow sans droit d'ecriture. |

> Procedure d'exploitation : [`docs/ops/RUNBOOK-sauvegarde-restauration.md`](../ops/RUNBOOK-sauvegarde-restauration.md)

---

## Droits des personnes concernees

Les utilisateurs peuvent exercer leurs droits (acces, rectification, effacement, portabilite, opposition) :
- **Export** : bouton "Exporter mes donnees" dans le menu profil
- **Suppression** : bouton "Supprimer mon compte" (suppression cascade de toutes les donnees)
- **Contact DPO** : carnetnaturaliste.app@gmail.com

### Effacement et sauvegardes

Une demande d'effacement est repercutee **immediatement** en base de production.
Les sauvegardes techniques deja constituees (Traitement 7) continuent de
contenir les donnees jusqu'a leur expiration automatique, soit **35 jours au
plus**. Ces sauvegardes sont chiffrees et servent exclusivement a une
restauration apres sinistre : elles ne sont jamais utilisees pour recreer un
compte supprime.
