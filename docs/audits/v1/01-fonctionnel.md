# Audit Fonctionnel - Carnet Naturaliste v5.2

**Date** : 2026-03-28
**Version audit** : v1
**Statut** : Termine

## Resume executif

L'application couvre un large spectre fonctionnel (CRUD, import/export, sync offline, carte, stats, filtres avances). La logique metier est globalement bien construite, mais l'audit revele **plusieurs problemes critiques** autour de la coherence cache/UI lors des imports, de la validation des coordonnees GPS dans les filtres, et de la gestion des photos en mode offline. Les services d'import JSON et Excel ont des regles de validation **incoherentes entre eux**, ce qui peut surprendre les utilisateurs. Les APIs externes (iNaturalist, Nominatim) manquent de feedback utilisateur en cas de panne.

## Methode et perimetre

- **Type** : Audit statique (lecture du code source) + inferences logiques
- **Fichiers analyses** : App.tsx, ObservationForm.tsx, ObservationList.tsx, ObservationCard.tsx, ObservationRow.tsx, ObservationMap.tsx, MapInput.tsx, ObservationStats.tsx, ObservationCalendar.tsx, ObservationGallery.tsx, AdvancedFilterDialog.tsx, FilterBar.tsx, SyncCenterDialog.tsx, StatsExportDialog.tsx, ImportPreviewDialog.tsx, useObservationFilters.ts, storageService.ts, excelImportService.ts, backupService.ts, observationExportService.ts, speciesService.ts, locationService.ts, jsonImportValidation.ts
- **Non couvert** : Tests dynamiques en navigateur, tests offline reels, tests multi-appareils

---

## Constats

### CRUD — Creation, Edition, Suppression

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| FO-01 | CRITIQUE | STATIQUE | ObservationForm.tsx:494 | Photo perdue en edition offline : le formulaire affiche la nouvelle photo mais sauvegarde l'ancienne URL (`initialData?.photo`) | L'utilisateur croit avoir change la photo mais l'ancienne persiste | Sauvegarder le preview data-URL ou blob en mode offline |
| FO-02 | HAUTE | STATIQUE | App.tsx:328 | Confirmation de suppression bloquee si l'operation echoue : `setConfirmation(null)` non appele apres erreur | L'utilisateur doit rafraichir la page pour debloquer l'interface | Appeler setConfirmation(null) dans le finally |
| FO-03 | HAUTE | STATIQUE | App.tsx:346-359 | Suppression en masse : echecs partiels non communiques. `allSettled()` filtre les succes mais aucun retry ni message sur les echecs | Divergence UI/backend ; observations non supprimees sans feedback | Afficher les echecs et proposer un retry |
| FO-04 | MOYENNE | STATIQUE | App.tsx:382 | Photo non mise a jour dans la liste apres edition : la nouvelle `photoUrl` n'est pas mergee dans l'observation retournee | La nouvelle photo n'apparait qu'apres rafraichissement | Merger photoUrl dans l'observation mise a jour |
| FO-05 | MOYENNE | INFERENCE | ObservationForm.tsx:359-362 | Count=0 non rejete : si l'utilisateur met explicitement 0, la valeur falsy passe la validation | Observation avec 0 individu enregistree (incoherent) | Ajouter validation count >= 1 |
| FO-06 | MOYENNE | INFERENCE | ObservationForm.tsx:333-339 | Ventilation male/femelle/indetermine sans somme verifiee cote formulaire (la verif existe cote import mais pas cote saisie) | Observation avec ventilation incoherente | Ajouter validation somme = count dans le formulaire |
| FO-07 | FAIBLE | STATIQUE | ObservationCard.tsx:52 | Affichage brut de `observation.count` sans verification null/negatif | Valeurs invalides affichees telles quelles | Ajouter fallback count >= 1 |
| FO-08 | FAIBLE | STATIQUE | ObservationRow.tsx:67 | Commune non visible en vue mobile (seulement breakpoint md+) | Perte d'info en contexte terrain (mobile) | Afficher la commune en vue mobile |

### Import / Export

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| FO-09 | CRITIQUE | STATIQUE | App.tsx:481 | Cache mis a jour AVANT l'etat React lors d'un import bulk. Si le cache echoue et React reussit, divergence permanente | Cache offline et UI desynchronises | Inverser l'ordre : etat React d'abord, cache ensuite |
| FO-10 | HAUTE | STATIQUE | jsonImportValidation.ts:185-187 | Import JSON rejette les enums si casse differente ("MALE" vs "Male"), alors que l'import Excel a un mapping de synonymes | Meme fichier accepte en Excel, rejete en JSON | Harmoniser la validation avec normalisation de casse |
| FO-11 | HAUTE | STATIQUE | jsonImportValidation.ts:117-138 | Incoherence import JSON vs Excel : JSON rejette si ventilation != count, Excel efface silencieusement la ventilation | Comportement imprevisible selon le format d'import | Unifier le comportement (erreur ou avertissement, pas les deux) |
| FO-12 | HAUTE | STATIQUE | excelImportService.ts:176-182 | Timeout import Excel : le FileReader continue en arriere-plan apres timeout, pas de `reader.abort()` | Fuite memoire ; CPU gaspille sur fichiers volumineux | Appeler reader.abort() dans le handler timeout |
| FO-13 | HAUTE | STATIQUE | backupService.ts:143-163 | Backup ZIP cree meme si toutes les images echouent au telechargement, sans avertissement visible | L'utilisateur pense avoir un backup complet alors que les images manquent | Avertir clairement si des images manquent |
| FO-14 | MOYENNE | INFERENCE | App.tsx:487 | Import merge ne deduplit pas par ID : si le fichier contient des IDs en double, l'etat final a des doublons | Corruption logique : selecteurs et filtres cassent | Deduplication par ID apres merge |
| FO-15 | MOYENNE | STATIQUE | excelImportService.ts:337-348 | Ventilation invalide dans Excel : silencieusement effacee avec un simple warning, donnees utilisateur perdues | Utilisateur ne comprend pas que ses donnees sont supprimees | Erreur bloquante ou confirmation explicite |
| FO-16 | MOYENNE | INFERENCE | excelImportService.ts:555-584 | Heure Excel : valeur numerique 1.0 (minuit jour suivant) parsee en "24:00" au lieu de "00:00" | Heure invalide importee | Gerer le cas modulo 24 |
| FO-17 | MOYENNE | INFERENCE | observationExportService.ts:84-92 | Export PDF : calcul de hauteur de bloc fixe (lines.length * 5 + 3) ; commentaires tres longs causent chevauchement/troncature | Observations tronquees ou superposees dans le PDF | Calcul dynamique avec saut de page |
| FO-18 | MOYENNE | STATIQUE | observationExportService.ts:55 | Export Excel : ordre des colonnes potentiellement different de l'ordre des headers si les cles de l'objet ne matchent pas | Colonnes desalignees dans le fichier Excel | Forcer l'ordre via array of arrays |
| FO-19 | FAIBLE | STATIQUE | excelImportService.ts:606-612 | Date Excel : pas de validation mois 1-12 ou jour valide pour le mois (ex: 30 fevrier accepte) | Dates invalides importees | Valider avec Date.parse ou equivalent |
| FO-20 | FAIBLE | STATIQUE | observationExportService.ts:5-15 | Export JSON : pas de try/catch autour de JSON.stringify (reference circulaire theorique) | Export echoue silencieusement | Ajouter try/catch avec message d'erreur |
| FO-21 | FAIBLE | STATIQUE | ObservationList.tsx:88-93 | Export "selection" avec 0 items selectionnes exporte toutes les observations filtrees au lieu de rien | L'utilisateur exporte plus que prevu | Retourner tableau vide si selection vide |

### Carte et Geolocalisation

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| FO-22 | HAUTE | STATIQUE | MapInput.tsx:316-324 | watchPosition declenche reverseGeocode() a chaque mise a jour GPS sans debounce (potentiellement 10+/sec) | Saturation API Nominatim, performances degradees | Ajouter debounce 1-2 secondes |
| FO-23 | HAUTE | STATIQUE | MapInput.tsx:89-93 | Reverse geocode : destructuration de `result.address` sans verification null. Si la reponse est malformee, crash | Crash runtime de la fonctionnalite geolocalisation | Ajouter verification null sur result.address |
| FO-24 | HAUTE | INFERENCE | ObservationMap.tsx:238 | Acces a `obs.gps.lat` sans verifier que `obs.gps` existe. Si gps est undefined, TypeError | Crash de la carte pour les observations sans GPS | Ajouter guard `obs.gps &&` |
| FO-25 | MOYENNE | INFERENCE | ObservationMap.tsx:333-342 | Historique de recherche carte stocke dans localStorage sans limite de taille | Depassement quota localStorage apres usage intensif | Limiter a N dernieres recherches |
| FO-26 | MOYENNE | INFERENCE | MapInput.tsx:212-218 | Pas de validation que les coordonnees retournees par l'API de recherche sont des nombres finis | Marqueur invisible si API retourne NaN | Valider avec Number.isFinite() |
| FO-27 | FAIBLE | INFERENCE | MapInput.tsx:326-329 | Plusieurs watchPosition actifs simultanement si l'utilisateur clique "Localiser" plusieurs fois | Fuite de ressources GPS | Verifier et arreter le watch precedent |

### Filtres avances

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| FO-28 | CRITIQUE | STATIQUE | AdvancedFilterDialog.tsx:96-100 | Filtre rayon : aucune validation des coordonnees (lat/lon). L'utilisateur peut entrer lat=200, lon=500 | Filtrage incorrect ou crash silencieux | Valider lat [-90,90] et lon [-180,180] |
| FO-29 | HAUTE | STATIQUE | useObservationFilters.ts:139-142 | Filtre rayon retourne `true` (inclut tout) si un parametre est null/vide. Le filtre est silencieusement desactive | L'utilisateur croit filtrer mais voit tout | Afficher un indicateur que le filtre est incomplet |
| FO-30 | HAUTE | STATIQUE | useObservationFilters.ts:150-153 | Filtre bbox : meme probleme, retourne `true` si une coordonnee est null | Filtre silencieusement inactif | Idem FO-29 |
| FO-31 | HAUTE | STATIQUE | useObservationFilters.ts:133 | Acces `obs.gps.lat` sans verifier que `obs.gps` existe | Crash TypeError en filtrant | Ajouter guard null |
| FO-32 | MOYENNE | STATIQUE | AdvancedFilterDialog.tsx:103-108 | Bbox inversee (minLat > maxLat) corrigee silencieusement sans feedback utilisateur | L'utilisateur ne comprend pas le resultat du filtre | Avertir ou empecher la saisie inversee |
| FO-33 | FAIBLE | STATIQUE | AdvancedFilterDialog.tsx:118-128 | Tri secondaire/tertiaire : possible de choisir la meme cle en doublon, ignore silencieusement | Tri inattendu sans explication | Desactiver les options deja selectionnees |

### Statistiques et Calendrier

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| FO-34 | HAUTE | STATIQUE | ObservationCalendar.tsx:54 | Le calendrier ne gere pas la selection de plage de dates (`[Date, Date]`) que react-calendar peut retourner | Liste d'observations vide sur selection de plage | Gerer le type Value correctement |
| FO-35 | HAUTE | INFERENCE | ObservationStats.tsx:179 | Top especes agregees par nom : la photo de la 1ere observation est utilisee. Compte les individus, pas les observations uniques | Stats potentiellement trompeuses | Preciser "individus" et utiliser la meilleure photo |
| FO-36 | MOYENNE | STATIQUE | StatsExportDialog.tsx:39,48 | Pas de validation startDate <= endDate pour l'export stats. Dates inversees = resultat vide sans message | Export silencieusement vide | Valider ou inverser automatiquement |
| FO-37 | MOYENNE | STATIQUE | ObservationStats.tsx:215-226 | Position tooltip hardcodee avec `window.innerWidth - 230`. Si ecran < 230px, position negative | Tooltip hors ecran sur petits viewports | Clamp dynamique |

### Services externes (iNaturalist, GBIF, Nominatim)

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| FO-38 | HAUTE | STATIQUE | speciesService.ts:204-216 | iNaturalist en panne : suggestions vides retournees sans aucun message d'erreur utilisateur | L'autocomplete parait "casse" sans explication | Afficher un toast "service temporairement indisponible" |
| FO-39 | HAUTE | INFERENCE | speciesService.ts:402-426 | Deduplication suggestions par nom commun : deux especes avec le meme nom commun (rare mais possible) sont fusionnees | Espece valide masquee dans l'autocomplete | Dedupliquer par (latinName + commonName) |
| FO-40 | HAUTE | INFERENCE | locationService.ts:73-79 | Retry 429 Nominatim : header Retry-After ignore, backoff fixe 350ms/700ms | Re-rate-limited immediatement, UX degradee | Lire et respecter le header Retry-After |
| FO-41 | MOYENNE | INFERENCE | speciesService.ts:191-196 | Recherche espece : si API retourne uniquement des genres, le premier est selectionne sans avertissement | L'utilisateur obtient un genre au lieu d'une espece | Indiquer le rang taxonomique dans les suggestions |
| FO-42 | MOYENNE | STATIQUE | locationService.ts:113-140 | Extraction departement depuis code postal : logique specifique France (97xxx). Adresses internationales donnent des codes incoherents | Code departement errone pour adresses hors France | Verifier le code pays avant extraction |
| FO-43 | FAIBLE | STATIQUE | locationService.ts:98-111 | Altitude : retour silencieux `null` si API Open-Meteo echoue, aucun feedback | Altitude manquante sans explication | Logger l'erreur, optionnellement informer |

### Formulaire — Divers

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| FO-44 | MOYENNE | STATIQUE | ObservationForm.tsx:537-557 | Race condition blur/click sur suggestions espece : timeout 120ms peut fermer le dropdown avant le clic | Suggestions qui disparaissent avant selection | Utiliser onMouseDown au lieu de onClick |
| FO-45 | MOYENNE | STATIQUE | ObservationForm.tsx:289-297 | Revocation blob URLs : race condition si le formulaire re-render avant la fin du cleanup effect | Fuite memoire avec cycles d'edition rapides | Tracker les URLs a revoquer dans un ref |
| FO-46 | MOYENNE | STATIQUE | ObservationForm.tsx:156-164 | Timeout autocomplete non annule au demontage du composant | Warning React "setState on unmounted component" | Cleanup dans le useEffect return |

### Sync offline

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| FO-47 | HAUTE | INFERENCE | storageService.ts:606-630 | Mapping temp ID → real ID : si `mapToObservation()` echoue, les UPDATE/DELETE suivants dans le meme batch echouent en "SKIP_TEMP_ID" | Modifications offline silencieusement perdues | Valider le mapping avant de continuer le batch |
| FO-48 | HAUTE | STATIQUE | storageService.ts:648-650 | UPDATE d'un temp ID absent du mapping : erreur levee mais aucun feedback utilisateur sur quelle observation a echoue | Utilisateur ne sait pas quelles donnees sont perdues | Lister les operations echouees dans le SyncCenter |
| FO-49 | MOYENNE | STATIQUE | SyncCenterDialog.tsx:114-116 | Liste des raisons d'echec affichee sans limite. Si 1000+ erreurs, la modale devient inutilisable | UX degradee avec beaucoup d'erreurs | Tronquer avec "et X autres erreurs" |
| FO-50 | MOYENNE | INFERENCE | ObservationGallery.tsx:16-17 | Image fallback incomplet : si photo et wikipediaImage sont null, emoji affiche. Pas de handler `onError` pour images 404 | Image cassee affichee comme zone vide | Ajouter onError avec fallback visuel |

---

## Statistiques

- **Total constats** : 50
- **Critiques** : 4 (FO-01, FO-09, FO-28, FO-29 reclasse → voir note)
- **Hautes** : 20
- **Moyennes** : 19
- **Faibles** : 7
- Par niveau de preuve : STATIQUE 36 | INFERENCE 14

> Note : FO-28 est reclasse CRITIQUE car il permet de saisir des coordonnees completement invalides dans un filtre spatial, rendant la fonctionnalite inutilisable.

## Points positifs

- **Architecture CRUD solide** : le flux creation/edition/suppression est bien structure avec separation formulaire/service/stockage
- **Gestion offline ambitieuse** : file d'attente avec mapping d'IDs temporaires, reduction de queue, progression
- **Import multi-format** : support Excel et JSON avec validation, preview, resolution de conflits
- **Export complet** : JSON, Excel, PDF, ZIP avec images — couvre les besoins de portabilite
- **Enrichissement especes** : integration iNaturalist + GBIF avec cache, abort, et timeout
- **Filtres avances** : tri multi-criteres, filtrage spatial (rayon, bbox), recherche textuelle normalisee
- **Carte interactive** : clustering, recherche, geolocalisation, selection de zone
- **Statistiques riches** : top especes, repartition taxonomique, calendrier, graphiques Recharts
- **Code bien type** : TypeScript strict, enums pour les valeurs metier, types Observation complets

## Conclusion

L'application offre une couverture fonctionnelle **remarquable** pour un carnet naturaliste terrain. Les flux principaux (saisie, recherche, export) sont bien construits. Cependant, les **4 constats critiques** doivent etre resolus avant mise sur le marche :

1. **FO-01** : Perte de photo en edition offline — risque de frustration utilisateur majeur
2. **FO-09** : Coherence cache/UI apres import — risque de donnees fantomes en mode offline
3. **FO-28** : Coordonnees invalides dans les filtres — fonctionnalite de filtrage spatial inutilisable
4. **FO-10/FO-11** : Incoherence validation JSON vs Excel — experience utilisateur confuse

Les 20 constats de severite HAUTE concernent principalement la gestion des erreurs silencieuses, les crash potentiels sur GPS null, et le manque de feedback utilisateur quand les services externes sont indisponibles. Ces points sont importants pour la robustesse terrain (pas de reseau, GPS instable, gros volumes).

*Niveau de confiance global : STATIQUE — les constats sont bases sur la lecture du code. Un test dynamique en conditions terrain (offline, mobile, gros jeu de donnees) est recommande pour valider les inferences.*
