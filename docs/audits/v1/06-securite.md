# Audit Securite - Carnet Naturaliste v5.2

**Date** : 2025-03-28
**Version audit** : v1
**Statut** : Termine

## Resume executif

L'application presente un **bon niveau de securite de base** : zero `dangerouslySetInnerHTML`, requetes Supabase 100% parametrisees, protection CSRF naturelle via tokens Bearer, et echappement React sur toutes les donnees utilisateur. Les faiblesses principales sont : (1) **absence de Content-Security-Policy** (la defense XSS la plus importante apres l'echappement), (2) **dependance `xlsx` abandonnee avec CVEs connues** (Prototype Pollution + ReDoS), (3) **bucket photos en lecture publique** sans stripping EXIF explicite, et (4) **upload son sans validation MIME** (risque de stockage HTML/JS).

**Niveau de preuve dominant** : STATIQUE (analyse du code source, schema SQL, configuration).

## Methode et perimetre

- **Analyse statique** de tous les fichiers source pour XSS, injection, CSRF, validation d'entrees
- **Audit RLS** table par table et bucket storage
- **Audit secrets** : fichiers .env, .gitignore, cles hardcodees
- **Audit headers de securite** : vercel.json
- **Audit dependances** : `npm audit`, versions, maintenance
- **Non couvert** : tests de penetration dynamiques, fuzzing, audit du dashboard Supabase

## Constats

### XSS et injection

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| SE-01 | HAUTE | STATIQUE | vercel.json (absent) | **Aucune Content-Security-Policy** configuree. Les headers `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` et `Permissions-Policy` sont presents, mais pas de CSP. | Sans CSP, un script injecte (XSS, extension malveillante) a acces au token Supabase, au localStorage (cache offline, session), et peut exfiltrer toutes les observations. | Ajouter un header CSP restrictif : `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' https://*.inaturalist.org https://upload.wikimedia.org https://*.supabase.co data: blob:; connect-src 'self' https://*.supabase.co https://api.inaturalist.org https://api.gbif.org https://nominatim.openstreetmap.org https://api.open-meteo.com; font-src 'self' https://fonts.gstatic.com` |
| SE-02 | MOYENNE | STATIQUE | storageService.ts:534-563 | **Upload son : type MIME derive du fichier sans validation.** `file.type` est controlable par l'utilisateur. Si `file.type = 'text/html'`, le fichier est uploade avec `contentType: 'text/html'` et extension `.html`. Si le bucket sert le fichier avec ce Content-Type, c'est un XSS stocke. | XSS stocke potentiel via fichier HTML/JS deguise en audio. | Ajouter une whitelist : `const ALLOWED_AUDIO = ['audio/mpeg','audio/ogg','audio/wav','audio/webm','audio/mp4']; if (!ALLOWED_AUDIO.includes(file.type)) throw...` |
| SE-03 | MOYENNE | STATIQUE | jsonImportValidation.ts:233-235 | **URLs photo/son dans l'import JSON non validees.** Les champs `photo`, `sound`, `wikipediaImage` acceptent n'importe quelle string sans verification de protocole. Un import avec `"photo": "javascript:alert(1)"` serait accepte. | Faible en pratique (React echappe les attributs), mais violation du principe de defense en profondeur. | Ajouter une validation : n'accepter que `https://`, `http://`, ou `undefined`. |
| SE-04 | MOYENNE | STATIQUE | speciesService.ts:194-195,630 | **Reponses API externes (iNaturalist, GBIF, Wikipedia) non validees.** Les champs JSON sont deserialises et propages vers l'UI sans validation de schema. Les URLs d'images externes sont utilisees dans `<img src>` sans verification. | Un MITM ou une API compromise pourrait injecter du contenu. React echappe le texte, mais les URLs d'images ne sont pas filtrees (sauf dans ObservationMap via `isSafeImageUrl`). | Appliquer `isSafeImageUrl()` globalement a toutes les URLs d'images externes, pas seulement dans la carte. |
| SE-05 | FAIBLE | STATIQUE | speciesService.ts:453-454 | `stripHtml()` utilise une regex naive `/<[^>]*>/g` pour nettoyer le `wikipedia_summary`. Insuffisant pour du HTML complexe. | Risque residuel faible car le resultat est rendu via React (echappement automatique). | Acceptable. Documenter que c'est une sanitisation "best effort", pas une garantie. |

### Authentification et session

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| SE-06 | MOYENNE | STATIQUE | Login.tsx:34-35 | **Messages d'erreur Supabase bruts affiches** a l'utilisateur (`error.message`). "Invalid login credentials" revele l'existence de comptes (enumeration). Deja identifie comme H3 dans l'audit precedent. | Enumeration de comptes, fuite d'info infrastructure. | Mapper vers des messages generiques en francais. |
| SE-07 | MOYENNE | STATIQUE | Login.tsx (absent) | **Aucune protection brute force cote client.** Pas de compteur de tentatives, pas de captcha, pas de delai progressif. Supabase a un rate limiting serveur (GoTrue), mais aucun feedback client. | Un script automatise peut tenter des connexions en boucle. | Compteur de tentatives avec backoff exponentiel apres 3 echecs. Optionnel : hCaptcha (supporte par Supabase). |
| SE-08 | MOYENNE | STATIQUE | vercel.json (absent) | **Pas de header Strict-Transport-Security (HSTS).** Vercel force HTTPS par defaut, mais sans HSTS le navigateur pourrait tenter HTTP a la premiere visite. | Premiere connexion vulnerable au MITM (downgrade attack). | Ajouter `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`. |
| SE-09 | FAIBLE | STATIQUE | AuthContext.tsx:167-174 | `signOut()` appelle `supabase.auth.signOut()` mais sans fallback si l'appel echoue (offline). Le token JWT Supabase pourrait persister dans localStorage. | Token residuel apres deconnexion en mode offline. | Ajouter `localStorage.removeItem('sb-<ref>-auth-token')` en fallback. |

### RLS et acces aux donnees

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| SE-10 | HAUTE | STATIQUE | supabase_schema.sql:128-129 | **RLS UPDATE sans `WITH CHECK`** sur la table observations. Un utilisateur peut modifier le `user_id` d'une observation pour la "transferer" a un autre utilisateur. Deja identifie comme SI-19 dans le theme 5. | Violation de l'isolation des donnees utilisateur. Pollution de donnees inter-utilisateurs. | `WITH CHECK (auth.uid() = user_id)`. |
| SE-11 | HAUTE | STATIQUE | supabase_schema.sql:137-142 | **Bucket photos en lecture publique.** La policy SELECT ne verifie aucune authentification. N'importe qui avec l'URL peut acceder aux photos. Les URLs contiennent les `user_id` (structure `<uid>/photos/<timestamp>-<uuid>.jpg`). | Photos naturalistes accessibles publiquement. Localisation d'especes protegees potentiellement exposee. User IDs reveles dans les URLs. | Passer en bucket prive + URLs signees (`createSignedUrl` avec TTL court). Ou documenter comme choix intentionnel. |
| SE-12 | INFO | STATIQUE | supabase_schema.sql | RLS correctement configuree pour SELECT/INSERT/UPDATE/DELETE sur la table observations. Aucune service role key exposee cote client. La cle anon est publishable par design. | Isolation utilisateur fonctionnelle (hors le probleme WITH CHECK ci-dessus). | -- |

### Dependances

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| SE-13 | HAUTE | STATIQUE | package.json:32 | **`xlsx` (SheetJS) abandonne avec CVEs connues.** Version 0.18.5 est la derniere gratuite. Vulnerabilites Prototype Pollution (GHSA-4r6h) et ReDoS (GHSA-5pgg), range `*` = aucune version safe. L'app importe des .xlsx fournis par l'utilisateur. | Un fichier Excel malveillant peut exploiter la prototype pollution ou causer un DoS. Le code a des protections (`DANGEROUS_OBJECT_KEYS` check dans excelImportService.ts), mais elles ne couvrent pas tous les vecteurs. | Remplacer par `exceljs` ou `sheetjs-ce` (fork communautaire). |
| SE-14 | FAIBLE | STATIQUE | package.json:56 | Override `serialize-javascript` a 7.0.4, mais le correctif CPU Exhaustion est en 7.0.5. | Build only (dependance de Rollup), pas de risque runtime. | Mettre a jour l'override a `>=7.0.5`. |

### Upload et fichiers

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| SE-15 | HAUTE | STATIQUE | ObservationForm.tsx:454-458 | **Pas de limite de taille photo avant compression.** Deja identifie comme H1. Un fichier 50+ Mo charge en memoire via `FileReader.readAsDataURL()` peut crasher le navigateur (OOM), surtout sur mobile. | Denial of Service cote client. | `if (file.size > 20*1024*1024) { reject(); return; }` avant `compressImage()`. |
| SE-16 | FAIBLE | STATIQUE | utils/imageUtils.ts | **EXIF supprimees de facto** par le pipeline Canvas. `canvas.toBlob()` ne preserve pas les metadonnees EXIF. Pas de stripping explicite mais le comportement est correct. | Pas de fuite EXIF pour les photos uploadees. Si un jour la compression est contournee, les EXIF seraient exposees. | Documenter que le Canvas supprime les EXIF. Ajouter un stripping explicite pour defense en profondeur. |

### Donnees sensibles

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| SE-17 | MOYENNE | STATIQUE | AuthContext.tsx:34 | **Objet User Supabase complet** (email, ID, metadata) stocke en clair dans localStorage (`cached_auth_session`). | En combinaison avec l'absence de CSP (SE-01), une XSS exfiltrerait ces PII. | Stocker uniquement l'ID et le display_name, pas l'objet User complet. |
| SE-18 | MOYENNE | STATIQUE | storageService.ts:292 | **Cache local des observations en clair** dans localStorage : coordonnees GPS, noms de lieux, especes, commentaires. Pas de chiffrement. | PII naturalistes sensibles accessibles a tout script JS ou acces physique. La CSP est la mitigation principale. | Compromis acceptable pour une PWA offline. La CSP (SE-01) devient d'autant plus critique. |
| SE-19 | FAIBLE | STATIQUE | index.html:8-12 | **Google Fonts charge depuis CDN** sans self-hosting. Pas d'attribut SRI (Google Fonts ne le supporte pas). | Dependance a un CDN tiers. Si compromis, du CSS malveillant pourrait etre injecte. | Self-host les fonts pour eliminer la dependance et ameliorer les performances. |

### Validation des entrees

| # | Severite | Preuve | Fichier:ligne | Constat | Impact | Recommandation |
|---|----------|--------|---------------|---------|--------|----------------|
| SE-20 | FAIBLE | STATIQUE | ObservationForm.tsx:331 | **GPS non valide en bornes** dans le formulaire de saisie manuelle. L'import Excel/JSON valide [-90,90] et [-180,180], mais la saisie manuelle fait juste `parseFloat()`. | Coordonnees hors limites acceptees via le formulaire. La DB a des CHECK constraints (si appliquees). | Ajouter une validation de bornes dans `validateObservationForm`. |

## Statistiques

- **Total constats** : 20
- **Critiques** : 0 | **Hautes** : 4 | **Moyennes** : 7 | **Faibles** : 6 | **Info** : 3
- Par niveau de preuve : STATIQUE 20

## Points positifs

1. **Zero `dangerouslySetInnerHTML`** dans tout le projet -- verifie par grep global
2. **Popups Leaflet securisees** : `buildPopupContent` utilise l'API DOM safe (`.textContent`), jamais `.innerHTML`
3. **Requetes Supabase 100% parametrisees** : zero concatenation SQL, zero `.rpc()` avec SQL brut
4. **Protection CSRF naturelle** : token Bearer dans le header Authorization (pas de cookie d'auth)
5. **`encodeURIComponent`** utilise systematiquement sur les parametres d'URL des APIs externes
6. **Import Excel tres bien securise** : taille max (15 Mo), max lignes (10k), max colonnes (120), timeout (20s), protection prototype pollution (`DANGEROUS_OBJECT_KEYS`)
7. **Noms de fichiers generes cote serveur** avec UUID : `${user.id}/photos/${Date.now()}-${crypto.randomUUID()}.jpg`
8. **`isSafeImageUrl()`** verifie le protocole des images dans la carte (http, https, blob)
9. **Compression Canvas neutralise les fichiers non-image** : un HTML/SVG malveillant est converti en pixels innocents
10. **Aucun script tiers** : pas d'analytics, tracking, ou chat externe
11. **Headers de securite** : `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` tous configures
12. **Pas de service role key** exposee cote client, `.gitignore` couvre `*.local`
13. **EXIF supprimees de facto** par le pipeline Canvas (compression d'image)
14. **Deconnexion propre** : nettoie les donnees offline scopees, reset le namespace, supprime la session cachee

## Conclusion

L'application a un **bon niveau de securite de base** grace a React (echappement automatique), Supabase (ORM parametrise, RLS), et l'absence de patterns dangereux (pas de `dangerouslySetInnerHTML`, pas d'`eval`). Les risques residuels sont lies a l'**absence de CSP** (SE-01, priorite #1), la **dependance `xlsx` abandonnee** (SE-13), et des **failles RLS specifiques** (SE-10, SE-11).

**Top 3 des actions prioritaires :**
1. **SE-01** : Ajouter une Content-Security-Policy dans `vercel.json` -- defense XSS la plus impactante
2. **SE-13** : Remplacer `xlsx` par une alternative maintenue (`exceljs` ou `sheetjs-ce`)
3. **SE-10** : Ajouter `WITH CHECK` a la policy RLS UPDATE (fix 1 ligne SQL)
