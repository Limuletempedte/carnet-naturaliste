# Recapitulatif des conditions d'utilisation des APIs tierces

**Date de mise a jour** : 2026-11-05

---

## 1. iNaturalist API

| Champ | Detail |
|---|---|
| URL | `https://api.inaturalist.org/v1/` |
| Usage | Autocompletion taxonomique, images d'especes, infos Wikipedia |
| Conditions | [API Terms](https://www.inaturalist.org/pages/api+terms) |
| Rate limit | Non documente officiellement, usage raisonnable attendu |
| Attribution | Requise — nom « iNaturalist » + licence CC BY-NC 4.0 pour les photos |
| Donnees envoyees | Termes de recherche (noms d'especes partiels). Aucune donnee personnelle. |
| User-Agent | `CarnetNaturaliste/5.2 (contact@carnet-naturaliste.fr)` |
| Implementation | `services/speciesService.ts` |

## 2. GBIF API

| Champ | Detail |
|---|---|
| URL | `https://api.gbif.org/v1/` |
| Usage | Validation taxonomique (fallback quand iNat ne renvoie pas de resultats) |
| Conditions | [GBIF Data Use](https://www.gbif.org/terms/data-user) |
| Rate limit | Aucune limite documentee pour les recherches simples |
| Attribution | Requise — mention « GBIF.org » + licence CC BY 4.0 / CC0 |
| Donnees envoyees | Termes de recherche. Aucune donnee personnelle. |
| User-Agent | `CarnetNaturaliste/5.2 (contact@carnet-naturaliste.fr)` |
| Implementation | `services/speciesService.ts` |

## 3. Nominatim (OpenStreetMap)

| Champ | Detail |
|---|---|
| URL | `https://nominatim.openstreetmap.org/reverse` |
| Usage | Geocodage inverse (coordonnees GPS → commune, departement, pays) |
| Conditions | [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/) |
| Rate limit | 1 req/seconde (respecte par l'app — une seule requete a la saisie GPS) |
| Attribution | Requise — « OpenStreetMap contributors » sous licence ODbL |
| Donnees envoyees | Latitude, longitude. L'adresse IP de l'utilisateur est visible par le serveur. |
| User-Agent | `CarnetNaturaliste/5.2 (contact@carnet-naturaliste.fr)` |
| Implementation | `services/locationService.ts` |

## 4. Open-Meteo

| Champ | Detail |
|---|---|
| URL | `https://api.open-meteo.com/v1/forecast` |
| Usage | Recuperation des conditions meteo actuelles pour une observation |
| Conditions | [Open-Meteo Terms](https://open-meteo.com/en/terms) |
| Rate limit | 10 000 req/jour (plan gratuit) |
| Attribution | Requise — « Open-Meteo.com » sous licence CC BY 4.0 |
| Donnees envoyees | Latitude, longitude. |
| User-Agent | Non requis (API ouverte) |
| Implementation | `components/ObservationForm.tsx` (inline fetch) |

## 5. Anthropic (API Claude) — assistant d'identification

| Champ | Detail |
|---|---|
| URL | API Anthropic, appelée **uniquement côté serveur** par la fonction Supabase `ai-identify` (clé jamais présente dans l'application) |
| Usage | Jusqu'à 3 hypothèses d'espèce à partir d'une photo, sur demande d'accès validée et consentement |
| Conditions | Commercial Terms d'Anthropic, avec le [Data Processing Addendum](https://www.anthropic.com/legal/data-processing-addendum) intégré (Anthropic Ireland Ltd pour l'EEE, clauses contractuelles types de l'UE, droit irlandais) |
| Entraînement | Pas d'entraînement sur les données de l'API par défaut (Commercial Terms, section B) |
| Conservation | Entrées et sorties effacées sous 30 jours ; jusqu'à 2 ans si un contrôle de sécurité les signale |
| Localisation | Pas de traitement limité à l'UE (`inference_geo` : `global` ou `us`) ; données stockées aux États-Unis |
| Limites | Plafond de dépense par espace de travail de la Console ; une fois atteint, l'API renvoie une erreur 400 (« usage limits reached »), traduite en `upstream_unavailable` par la fonction |
| Donnees envoyees | Photo réencodée (JPEG, 1 280 px max, sans EXIF ni GPS), mois, pays, département, groupe taxonomique s'il a été choisi, habitat s'il est renseigné. Aucun identifiant ni email. |
| Implementation | `supabase/functions/ai-identify/` (serveur), `services/aiAssistService.ts` (application) |

Faits vérifiés sur les pages officielles le 2026-11-05 : tableau « Faits vérifiés » de
[`docs/plans/assistant-ia-phase1.md`](../plans/assistant-ia-phase1.md).

---

## Conformite

- **User-Agent** : toutes les APIs identifient l'application via un User-Agent dedie (VP-15/16/17)
- **Attribution** : fichier `ATTRIBUTIONS.txt` inclus dans les sauvegardes ZIP (VP-18)
- **RGPD** : aucune donnee personnelle n'est transmise aux APIs taxonomiques. Seule l'API Anthropic reçoit une photo, uniquement sur consentement (Traitement 9 du registre). Les coordonnees GPS envoyees a Nominatim et Open-Meteo ne sont pas couplees a une identite utilisateur.

## Fonds cartographiques — mise à jour du 7 octobre 2026

Le mode Auto utilise les tuiles OpenStreetMap déjà proposées en mode Standard.
Le thème sombre applique un filtre visuel aux seules tuiles, en conservant
les attributions et les marqueurs. Les requêtes CARTO sans clé sont retirées.
Aucun nouveau fournisseur ni abonnement n’est ajouté. L’adresse IP, le référent
et les coordonnées des tuiles affichées sont transmis au fournisseur ; aucune
prélecture de zone ni fonction de téléchargement de carte hors ligne n’est ajoutée.
Les fonds Satellite (Esri) et Topo (OpenTopoMap) restent disponibles.

Sources consultées : [exigence de clé CARTO](https://www.carto.com/basemaps/apikey/)
et [politique des tuiles OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/).
