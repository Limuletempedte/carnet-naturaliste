# Matrice des scénarios de sécurité

**Mise à jour du 17 septembre 2026 :** [complément Auth et PWA](COMPLEMENT-2026-09-17.md). Les autres lignes conservent les résultats de l’audit initial.

Les essais actifs ciblent exclusivement le laboratoire loopback. « Protection vérifiée » signifie vérifiée dans le chemin et les conditions décrits, pas garantie universelle.

| Surface | Scénario et contrôle positif | Résultat | Preuve / limite |
|---|---|---|---|
| SQL/PostgREST | Texte SQL spécial inséré puis recherché comme valeur ; donnée normale propriétaire | Protection vérifiée | API locale réelle ; table intacte, correspondance littérale |
| Observations | Anonyme, A vers B, INSERT propriétaire falsifié, transfert user_id, lot mixte | Protection vérifiée | RLS locale réelle et policies hébergées lues ; opérations du propriétaire réussies |
| JWT | Absence, signature falsifiée, token local signé expiré | Protection vérifiée | Requêtes API locales refusées |
| Suppression de compte | C avec user_id B dans le corps ; vérification des comptes et médias après | Protection vérifiée | C seul supprimé, B intact ; code serveur hébergé identique |
| Médias | Lecture d’une photo et d’un son de A sans compte | Faille confirmée | HTTP 200 local ; public=true en ligne |
| Médias | Route authenticated utilisée par B pour une photo de A | Faille confirmée | HTTP 200 malgré attente de refus ; même cause bucket public |
| Storage | Listing, upload, remplacement, suppression dans dossier B avec session A | Protection vérifiée | Listing vide, écritures refusées ou sans effet ; fichier B intact |
| Storage | HTML déclaré et fichier 20 MiB+1 ; JPEG déclaré et WAV légitimes | Protection vérifiée pour les restrictions déclarées | Restrictions MIME/taille effectives ; MIME binaire non inspecté, sans exécution dangereuse prouvée |
| XSS | Chaînes HTML hostiles dans rendu de rapports, templates et PDF | Protection vérifiée sur chemins testés | Tests des vrais modules ; popups et JSX examinés dans le code |
| URL | javascript:, data: et protocoles non autorisés dans import JSON | Protection vérifiée | Tests unitaires des vrais validateurs ; pas de contrôle d’un fournisseur réel |
| CSV/XLSX | Préfixes de formule, guillemets, retours ligne | Protection vérifiée | CSV neutralisé ; cellules XLSX sérialisées comme chaînes sans formule |
| Prototype | Clés JSON et en-têtes Excel dangereux | Protection vérifiée contre pollution globale testée | Reconstruction explicite / rejet d’en-têtes ; lecture héritée des synonymes à revoir fonctionnellement |
| ZIP | Archive malformée et archive légitime ; expansion bornée ~971× | Faille confirmée | Petite archive acceptée sans budget décompressé ; aucun épuisement volontaire |
| JSON/Excel volume | Absence de plafond JSON ; contrôle Excel après chargement du classeur | Risque à confirmer pour chaque variante | Analyse source ; preuve runtime détaillée concentrée sur ZIP |
| État React | A édite, se déconnecte ; B se connecte sans recharger | Faille confirmée | Navigateur, bundle réel, Supabase local réel, capture |
| Cache / requête retardée | Réponse de A reçue après changement vers B | Faille confirmée | Test de scheduling déterministe ; lecture du cache comme B |
| Journaux | Échec de sauvegarde A ; déconnexion ; journal rechargé et UI B | Faille confirmée | Vrais modules, transport simulé, URL fictive persistante |
| Géographie | Historique de recherche et presets A lus/applicables par B | Faille confirmée dans le code | Chemin complet source ; reproduction UI dédiée non exécutée |
| Déconnexion SDK | HTTP 503 retourné par transport simulé | Protection vérifiée | SDK verrouillé retire token et émet SIGNED_OUT |
| Navigateur | CSP/HSTS/nosniff/DENY/referrer/permissions | Protection vérifiée en configuration servie | Lecture HTTP de l’alias officiel ; pas de scan actif en production |
| CSRF/CORS | Endpoint privilégié avec Authorization absent | Protection vérifiée sur ce contrôle | Bearer exigé ; wildcard CORS ne donne pas un jeton |
| Secrets | Source, historique Git, bundle | Aucun secret confirmé par la méthode | Motifs connus ; exemples redacted ; formats inconnus/encodés non couverts |
| Dépendances | npm audit, dépendances et appels réels | Risques à confirmer / durcissement | 11 paquets signalés, pas 11 exploits démontrés |
| Auth hébergé | Minimum mot de passe, MFA, confirmation email, CAPTCHA, sessions et limites | Réglages vérifiés en lecture seule le 17/09 | Minimum 6 ; email confirmé ; CAPTCHA absent ; TOTP disponible sans parcours applicatif ; voir complément pour valeurs et limites |
| PWA | Isolation et purge du cache HTTP média | Défaut confirmé localement le 17/09 | 17 assertions, worker actif, réseau coupé, profil B rouvert ; médias A déjà connus restitués. Auth/API simulés ; aucune attaque de production |
| Disponibilité partagée | Saturation/attaques distribuées | Non testé | Exclues en ligne ; aucun stress de production |
| Injection shell/XXE/NoSQL/SSRF serveur | Absence de consommateur serveur correspondant | Non applicable aux chemins inspectés | Fonction serveur limitée à Auth/Storage; fetch médias côté navigateur |
| Santé/fonctionnalités | Exhaustivité parcours, sauvegarde/restauration, performance générale | Hors mission | Audit ultérieur distinct |
