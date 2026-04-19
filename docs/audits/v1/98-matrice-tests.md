# Matrice de Tests - Audit v5.2

**Objectif** : Lister les verifications dynamiques necessaires pour confirmer ou infirmer les constats de l'audit statique.

> Aucun test dynamique n'a ete effectue pendant l'audit. Cette matrice est un plan de verification pour les equipes QA.

## Legende

- **STATIQUE-OK** : le constat est confirme par lecture du code, pas de test supplementaire necessaire
- **A VERIFIER** : le constat est base sur une inference et necessite un test dynamique
- **PRIORITE** : P0 (bloquant), P1 (avant commercialisation), P2 (apres lancement)

---

## Tests critiques (P0)

| # | IDs | Test a realiser | Environnement | Resultat attendu | Priorite |
|---|-----|-----------------|---------------|------------------|----------|
| T-01 | BF-01, SR-07 | Provoquer une erreur JS dans un composant lazy (ex: passer une observation null a ObservationForm). L'app affiche-t-elle un ecran blanc ? | Chrome desktop + Safari iOS | Ecran blanc = confirme. Message d'erreur = infirme. | P0 |
| T-02 | SI-01, BF-09 | Creer 2 observations en moins d'1ms (script JS `for` boucle synchrone). Les IDs sont-ils identiques ? | Chrome console | IDs identiques = confirme collision | P0 |
| T-03 | SI-16, FO-01 | Activer le mode avion. Creer une observation avec photo. Fermer/rouvrir l'app. La photo est-elle presente ? | Mobile Android/iOS | Photo absente = confirme | P0 |
| T-04 | SR-08 | Se connecter. Bloquer les requetes Supabase (DevTools throttle "Offline" sur le domaine Supabase seulement). Sauvegarder une observation. | Chrome DevTools | Erreur sans queue = confirme. Observation mise en queue = infirme. | P0 |
| T-05 | VP-01-05 | Naviguer dans l'app. Y a-t-il un lien vers une politique de confidentialite, des CGU, ou des mentions legales ? Peut-on supprimer son compte ? | Tout navigateur | Aucun lien = confirme | P0 |

## Tests hauts (P1)

| # | IDs | Test a realiser | Environnement | Resultat attendu | Priorite |
|---|-----|-----------------|---------------|------------------|----------|
| T-06 | PE-01, PE-02 | Charger 1000+ observations. Mesurer le FPS de la liste et de la galerie au scroll. | Chrome DevTools Performance | FPS < 30 = confirme. FPS > 50 = infirme. | P1 |
| T-07 | AC-01-04 | Ouvrir chaque dialog (ConfirmationDialog, AdvancedFilterDialog, SyncCenterDialog, ImportPreviewDialog, ExportScopeDialog, StatsExportDialog). Tabber. Le focus reste-t-il dans la modale ? Escape ferme-t-il ? | Chrome + lecteur ecran NVDA | Focus sort = confirme. Escape inefficace = confirme. | P1 |
| T-08 | AC-23 | Mesurer le ratio de contraste de `nature-green` (#34C759 ou equivalent) sur fond blanc avec un outil (Colour Contrast Analyser). | Outil WCAG | Ratio < 4.5:1 = confirme (echoue AA) | P1 |
| T-09 | SE-01 | Ouvrir l'app et verifier les headers de reponse. Y a-t-il un header `Content-Security-Policy` ? | Chrome DevTools Network | Absent = confirme | P1 |
| T-10 | SE-10, SI-19 | Avec un token valide, envoyer un UPDATE Supabase avec un `user_id` different du sien. L'UPDATE reussit-il ? | Supabase SQL Editor ou curl | UPDATE reussi = confirme (RLS bypass) | P1 |
| T-11 | CO-02 | Installer la PWA sur iOS Safari. S'ouvre-t-elle en mode standalone (plein ecran) ou avec la barre Safari ? | iPhone/iPad Safari | Barre Safari visible = confirme | P1 |
| T-12 | PE-08, PE-09 | Ouvrir l'onglet Network. Au premier chargement, combien de KB sont telecharges pour xlsx, jspdf, html2canvas ? | Chrome DevTools Network | Chunks present au chargement initial = confirme import statique | P1 |
| T-13 | VP-15-17 | Capturer les requetes vers Nominatim, iNaturalist, GBIF. Y a-t-il un header `User-Agent` specifique ? | Chrome DevTools Network | Absent = confirme. Attention: les fetch navigateur incluent un User-Agent par defaut. Verifier que ce n'est pas juste le UA navigateur. | P1 |
| T-14 | SI-02 | Ouvrir 2 onglets de l'app. Declencher la sync dans les 2 simultanement. Les operations sont-elles dupliquees ? | Chrome 2 onglets | Doublons en base = confirme pas de mutex | P1 |
| T-15 | UX-17 | Mesurer la taille des boutons edit/delete dans la liste. | Chrome DevTools Elements | < 44x44px = confirme (non-conforme WCAG) | P1 |

## Tests moyens (P2)

| # | IDs | Test a realiser | Environnement | Resultat attendu | Priorite |
|---|-----|-----------------|---------------|------------------|----------|
| T-16 | CO-19 | Ouvrir l'app sur un ecran 320px (iPhone SE ou Chrome Device Toolbar). Les champs min-w-[220px] debordent-ils ? | Chrome 320px viewport | Scroll horizontal = confirme | P2 |
| T-17 | CO-07 | Installer la PWA sur iOS. Ne pas l'ouvrir pendant 8 jours. La reouvrir offline. Le cache est-il preserve ? | iPhone Safari PWA | Cache vide apres 7j inactivite = confirme limitation iOS | P2 |
| T-18 | PE-13 | Au chargement initial avec 100+ observations, combien de requetes HTTP sont envoyees a iNaturalist/GBIF ? | Chrome DevTools Network | > 50 requetes = confirme enrichissement massif | P2 |
| T-19 | PE-16 | Importer un fichier Excel de 5000 lignes. L'UI est-elle figee pendant le parsing ? | Chrome + Performance Monitor | UI figee > 2s = confirme parsing main thread | P2 |
| T-20 | SR-09 | Corrompre manuellement le JSON dans localStorage (`localStorage.setItem('cache-key', '{invalid')`. Recharger l'app. L'app crashe-t-elle ? Affiche-t-elle un avertissement ? | Chrome console | Pas de crash mais pas d'avertissement = confirme | P2 |
| T-21 | QT-17 | Scanner les dependances avec `npm audit`. Quelles CVEs sont reportees pour `xlsx` ? | Terminal | CVEs presentes = confirme | P2 |
| T-22 | SR-01 | Exporter un backup ZIP. Essayer de le reimporter dans l'app. | Tout navigateur | Pas de fonction d'import ZIP = confirme | P2 |
| T-23 | VP-20 | Verifier si Google Fonts est charge depuis `fonts.googleapis.com`. Tester avec un bloqueur de requetes (uBlock). L'app fonctionne-t-elle ? | Chrome + uBlock | Requete vers googleapis.com = confirme. App fonctionne sans = fallback OK. | P2 |
| T-24 | AC-12, AC-13 | Naviguer avec un lecteur d'ecran (NVDA/VoiceOver). Les landmarks (main, nav, header) sont-ils annonces ? Y a-t-il un lien "Aller au contenu" ? | Chrome + NVDA ou Safari + VoiceOver | Aucun landmark annonce = confirme | P2 |
| T-25 | UX-01 | Observer un utilisateur non-technique creer sa premiere observation. Combien de temps met-il ? Ou bloque-t-il ? | Test utilisateur (personne reelle) | > 5 min ou abandon = confirme surcharge cognitive | P2 |

## Tests Lighthouse (P2)

| # | Test | Metrique cible | Seuil |
|---|------|----------------|-------|
| T-L1 | Lighthouse Performance (mobile, 3G lent) | Performance Score | > 70 |
| T-L2 | Lighthouse Accessibility | Accessibility Score | > 80 |
| T-L3 | Lighthouse Best Practices | Best Practices Score | > 80 |
| T-L4 | Lighthouse PWA | Installable, Works offline | Tous verts |
| T-L5 | Core Web Vitals (CrUX ou web-vitals) | LCP < 2.5s, FID < 100ms, CLS < 0.1 | Vert |

## Resume

| Priorite | Nombre de tests | Statut |
|----------|-----------------|--------|
| P0 (bloquant) | 5 | A executer avant commercialisation |
| P1 (avant lancement) | 10 | A executer avant lancement |
| P2 (apres lancement) | 10 + 5 Lighthouse | A planifier post-lancement |
| **Total** | **30** | -- |
