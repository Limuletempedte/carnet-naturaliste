# Registre des traitements de donnees personnelles (RGPD Art. 30)

**Responsable de traitement** : [A COMPLETER — nom, adresse, contact DPO]
**Date de mise a jour** : 2026-04-11

---

## Traitement 1 : Authentification

| Champ | Valeur |
|---|---|
| Finalite | Creer et gerer les comptes utilisateurs |
| Base legale | Execution du contrat (CGU) |
| Donnees collectees | Email, mot de passe (hashe par Supabase Auth) |
| Duree de conservation | Duree du compte + 30 jours apres suppression |
| Destinataires | Supabase Inc. (sous-traitant, hebergeur auth + BDD) |
| Transfert hors UE | Oui — Supabase (AWS us-east-1). Clauses contractuelles types. |

## Traitement 2 : Observations naturalistes

| Champ | Valeur |
|---|---|
| Finalite | Enregistrer et consulter les observations de terrain |
| Base legale | Execution du contrat (CGU) |
| Donnees collectees | Espece, date, heure, lieu-dit, coordonnees GPS, altitude, commune, departement, pays, commentaire, photos, protocole, conditions meteo |
| Duree de conservation | Duree du compte. Cache local : 90 jours (TTL). |
| Destinataires | Supabase Inc. (BDD PostgreSQL), Vercel Inc. (CDN/hosting) |
| Transfert hors UE | Oui — Supabase (AWS us-east-1), Vercel (edge global). Clauses contractuelles types. |

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

---

## Droits des personnes concernees

Les utilisateurs peuvent exercer leurs droits (acces, rectification, effacement, portabilite, opposition) :
- **Export** : bouton "Exporter mes donnees" dans le menu profil
- **Suppression** : bouton "Supprimer mon compte" (suppression cascade de toutes les donnees)
- **Contact DPO** : [A COMPLETER]
