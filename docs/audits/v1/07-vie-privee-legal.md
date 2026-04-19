# Audit Vie Privee et Legal - Carnet Naturaliste v5.2

**Date** : 2025-03-28
**Version audit** : v1
**Statut** : Termine

## Resume executif

L'application **ne peut pas etre commercialisee en l'etat**. Il manque les **six documents/mecanismes legaux obligatoires** en France : politique de confidentialite (RGPD), CGU/CGV (Code consommation), mentions legales (LCEN), consentement a l'inscription, suppression de compte (droit a l'effacement), et User-Agent Nominatim (politique d'usage). De plus, les **coordonnees d'especes protegees sont exportees en clair** sans aucun mecanisme de floutage, et les **Google Fonts sont chargees depuis les serveurs US** (transfert d'IP vers Google, non conforme RGPD).

**Niveau de preuve** : STATIQUE (analyse du code source et des documents du projet).

## Methode et perimetre

- **Analyse statique** de tous les composants, services, fichiers de configuration
- **Recherche de fichiers legaux** : grep sur `privacy`, `rgpd`, `cgu`, `cgv`, `terms`, `mentions`, `confidentialite`, `legal` dans tout le projet
- **Audit des APIs externes** : conditions d'utilisation, User-Agent, licences
- **Non couvert** : verification de la region Supabase/Vercel (variable d'environnement), audit CNIL formel

## Constats

### Documents legaux obligatoires

| # | Severite | Preuve | Constat | Obligation | Recommandation |
|---|----------|--------|---------|------------|----------------|
| VP-01 | CRITIQUE | STATIQUE | **Aucune politique de confidentialite.** Zero fichier/composant `privacy`, `confidentialite`, `rgpd` dans le projet. | RGPD art. 13-14 : obligatoire des la collecte de donnees personnelles. Amende jusqu'a 4% du CA ou 20M EUR. | Creer `/politique-de-confidentialite` detaillant : responsable de traitement, finalites, bases legales, durees de conservation, droits, transferts hors UE, contact. |
| VP-02 | CRITIQUE | STATIQUE | **Aucune CGU / CGV.** Zero fichier `terms`, `cgu`, `cgv`, `conditions`. | Code de la consommation L111-1 : obligatoire pour tout service commercial en France. | Creer CGU/CGV accessibles avant inscription. |
| VP-03 | CRITIQUE | STATIQUE | **Aucune mention legale.** Zero fichier `mention`, `legal`. | LCEN art. 6 III : obligatoire pour tout site/service. Amende : 75 000 EUR (personne physique), 375 000 EUR (morale). | Creer `/mentions-legales` avec : editeur, adresse, email, directeur de publication, hebergeur (Vercel). |
| VP-04 | CRITIQUE | STATIQUE | **Aucun consentement explicite a l'inscription.** Login.tsx:55-86 -- formulaire sans checkbox d'acceptation CGU, sans mention RGPD, sans lien vers la politique de confidentialite. | RGPD art. 7 : preuve du consentement obligatoire. | Ajouter checkbox obligatoire "J'accepte les CGU et la politique de confidentialite" avec liens. |
| VP-05 | CRITIQUE | STATIQUE | **Aucune suppression de compte.** UserProfile.tsx ne contient qu'un bouton "Se deconnecter". `signOut()` efface le cache local mais NE supprime PAS le compte Supabase, les observations en base, ni les photos/sons du Storage. De plus, la FK `user_id` sans `ON DELETE CASCADE` (SI-18) bloquerait la suppression cote DB. | RGPD art. 17 : droit a l'effacement. | Implementer "Supprimer mon compte" : (1) supprimer photos/sons du Storage, (2) supprimer observations, (3) supprimer compte Supabase Auth. Via Edge Function securisee. |

### Donnees personnelles collectees

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| VP-06 | HAUTE | STATIQUE | AuthContext.tsx:34 | **Session utilisateur complete** (email, id, metadata) stockee en clair dans localStorage pendant 48h. | PII en clair accessible a tout script JS sur la meme origine. | Stocker uniquement l'ID et le display_name. |
| VP-07 | HAUTE | STATIQUE | storageService.ts:292, types.ts:118-147 | **Observations avec GPS precis, especes, photos, commentaires** en cache localStorage en clair, sans chiffrement, sans duree de conservation. | Donnees naturalistes sensibles accessibles en clair. | Definir une duree de conservation, informer l'utilisateur. |
| VP-08 | HAUTE | STATIQUE | (absent) | **Pas de DPO ni coordonnees de contact** pour les demandes RGPD. | Non-conformite RGPD art. 13 (informations a fournir). | Afficher un email de contact RGPD dans la politique de confidentialite. |
| VP-09 | HAUTE | STATIQUE | (absent) | **Pas de registre de traitement.** | Obligatoire RGPD art. 30. | Creer un registre documentant toutes les activites de traitement. |
| VP-10 | HAUTE | STATIQUE | (absent) | **Pas de duree de conservation definie.** Les observations et photos persistent indefiniment. | Non-conformite RGPD art. 5(1)(e) -- principe de limitation. | Definir et documenter les durees. Implementer purge ou rappel. |

### Especes sensibles

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| VP-11 | HAUTE | STATIQUE | observationExportService.ts:38-39, backupService.ts:108-109 | **Coordonnees GPS precises exportees en clair** pour toutes les observations, y compris especes CR/EN/VU. Aucun mecanisme de floutage, masquage, ou flag `sensitive`. | Risque de braconnage et pillage. Code de l'environnement L411-1 interdit la divulgation de localisation d'especes protegees. | Flouter automatiquement les coordonnees a 10km pour les especes CR/EN/VU dans les exports. Ajouter un flag `sensitive` aux observations concernees. |
| VP-12 | MOYENNE | STATIQUE | supabase_schema.sql:137 | **Bucket photos public** : les photos d'especes protegees sur leurs sites de nidification sont accessibles a quiconque a l'URL. | Localisation indirecte d'especes via les photos publiques. | Passer en bucket prive ou utiliser des URLs signees. |
| VP-13 | INFO | STATIQUE | speciesService.ts | **Aucun partage actif** de donnees vers des tiers. Les appels iNat/GBIF sont en lecture seule (autocomplete, match). Aucun POST de donnees utilisateur. | Positif. | Documenter dans la politique de confidentialite. |

### Portabilite et export

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| VP-14 | MOYENNE | STATIQUE | backupService.ts, observationExportService.ts | **Export existant** (ZIP, JSON, Excel, PDF) mais pas presente comme un droit RGPD. Pas de bouton "Telecharger toutes mes donnees" dans le profil. | Portabilite partiellement conforme (art. 20). | Ajouter un bouton explicite dans le profil utilisateur. |

### Conditions d'utilisation des APIs

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| VP-15 | CRITIQUE | STATIQUE | locationService.ts:61-68 | **Pas de User-Agent dans les requetes Nominatim.** Seuls `Accept` et `Accept-Language` envoyes. | La politique Nominatim **exige** un User-Agent identifiant l'app. Requetes peuvent etre bloquees ou IP bannie. | Ajouter `'User-Agent': 'CarnetNaturaliste/5.2 (contact@domaine.fr)'`. |
| VP-16 | HAUTE | STATIQUE | speciesService.ts:191-193 | **Pas de User-Agent** dans les requetes iNaturalist API. | iNat ToS recommande fortement un User-Agent. Risque de blocage. | Ajouter un User-Agent. |
| VP-17 | HAUTE | STATIQUE | speciesService.ts:255-256 | **Pas de User-Agent** dans les requetes GBIF API. | GBIF demande un User-Agent dans ses conditions. | Ajouter un User-Agent. |
| VP-18 | MOYENNE | STATIQUE | backupService.ts:136-139 | **Images iNaturalist telechargees dans le backup ZIP.** Les photos iNat sont sous licence CC. Le hotlinking pour l'affichage est tolere, mais le telechargement et la redistribution via backup posent question. | Violation potentielle des licences CC (attribution manquante). | Verifier les licences de chaque photo. Ajouter une mention d'attribution dans le backup. |
| VP-19 | MOYENNE | INFERENCE | locationService.ts:99-100 | **Open-Meteo en usage commercial.** Gratuit pour usage non-commercial. Si l'app est commercialisee, les conditions peuvent changer. | Risque de non-conformite aux ToS Open-Meteo. | Consulter https://open-meteo.com/en/terms et envisager l'offre payante. |

### Google Fonts et transferts de donnees

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| VP-20 | HAUTE | STATIQUE | index.html:8-12 | **Google Fonts charge depuis fonts.googleapis.com.** Chaque visiteur transmet son IP a Google (serveurs US). Jurisprudence europeenne (tribunal de Munich, jan. 2022) : transfert de donnees personnelles vers US sans base legale. La CNIL a prononce des mises en demeure similaires. | Non-conformite RGPD pour le transfert d'IP vers Google US. | **Self-host les polices** : telecharger Inter et Merriweather en woff2, les servir depuis `/fonts/`. |

### Cookies et trackers

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| VP-21 | MOYENNE | STATIQUE | (absent) | **Pas de bandeau cookies.** L'app utilise localStorage (pas de cookies HTTP au sens strict), mais Supabase Auth utilise des cookies de session (`sb-*`). La directive ePrivacy s'applique au stockage local. | Risque de non-conformite ePrivacy/CNIL si des cookies/storage sont utilises sans information. | Evaluer si un bandeau est necessaire. Au minimum, informer dans la politique de confidentialite. |
| VP-22 | INFO | STATIQUE | Projet entier | **Aucun tracker tiers** (pas d'analytics, hotjar, sentry, etc.). | Positif : surface de collecte minimale. | -- |

### Localisation des donnees

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| VP-23 | MOYENNE | INFERENCE | supabaseClient.ts, vercel.json | **Region Supabase et Vercel non verifiable dans le code.** La variable `VITE_SUPABASE_URL` ne revele pas la region. `vercel.json` ne specifie pas de region. | Si Supabase est hors UE, transfert non encadre (RGPD art. 44-49). | Verifier que Supabase est en region UE. Configurer la region Vercel sur `cdg1` (Paris). |

## Statistiques

- **Total constats** : 23
- **Critiques** : 6 | **Hautes** : 9 | **Moyennes** : 5 | **Info** : 2 | **OK** : 1
- Par niveau de preuve : STATIQUE 21 | INFERENCE 2

## Points positifs

1. **Aucun tracker tiers** : pas d'analytics, pas de monitoring externe, surface de collecte minimale
2. **Export de donnees existant** : JSON, Excel, PDF, ZIP -- base pour la portabilite RGPD
3. **Pas de partage actif** de donnees utilisateur vers iNaturalist/GBIF (lecture seule)
4. **Throttling Nominatim** : 1 req/s respecte (seul le User-Agent manque)
5. **Geolocation via API navigateur** : le consentement de geolocalisation est gere par le navigateur (prompt natif)
6. **Pas de profilage** ni de decisions automatisees
7. **EXIF supprimees de facto** par le pipeline Canvas lors de la compression photo

## Conclusion

Le projet a **6 bloquants critiques** pour la commercialisation, tous lies a l'absence de documents legaux et de mecanismes RGPD fondamentaux. Ce sont des **ajouts a faire, pas des corrections de code** (sauf la suppression de compte et le User-Agent). La priorite absolue est :

1. **Politique de confidentialite + CGU + Mentions legales** (VP-01, VP-02, VP-03) -- documents a rediger
2. **Suppression de compte** (VP-05) -- fonctionnalite a developper
3. **Consentement a l'inscription** (VP-04) -- checkbox + liens
4. **User-Agent Nominatim** (VP-15) -- fix 1 ligne
5. **Self-host Google Fonts** (VP-20) -- migration rapide
6. **Floutage especes sensibles** (VP-11) -- fonctionnalite a developper

**Note** : La redaction des documents legaux (politique de confidentialite, CGU, mentions legales) devrait etre validee par un juriste. L'audit identifie les manques mais ne constitue pas un avis juridique.
