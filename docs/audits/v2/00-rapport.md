# Audit v2 — Carnet Naturaliste V5.2 (juin 2026)

- **Date** : 2026-06-11
- **Méthode** : audit multi-agents « regard neuf » sur `main` (86 agents) — 8 dimensions en parallèle (sécurité front, sécurité Supabase, bugs cœur, bugs fonctionnels, cohérence, UI/UX/a11y, dépendances, RGPD), contre-expertise adversariale (1-2 vérificateurs par constat important), dédoublonnage contre l'audit v1 et le BACKLOG, + 3 agents de propositions (fonctionnalités, design, architecture).
- **Données brutes** : [`rapport-workflow-brut.json`](./rapport-workflow-brut.json) (74 constats avec preuves et verdicts détaillés, 29 propositions).
- **Légende** : ✅ contre-expertisé et confirmé · ✋ vérifié manuellement par l'orchestrateur · ⚠️ non contre-expertisé (à re-vérifier en début de PR).

**Verdict global** : socle sain (RLS observations correcte, CSP stricte, AuthContext durci, offline-first robuste, 0 TODO/any/ts-ignore) — l'audit v1 a porté ses fruits. Mais **2 critiques et ~14 hauts**, dont plusieurs régressions sur des corrections v1 documentées à tort comme faites (VP-05, SI-12, AC-26, CO-06).

---

## 🔴 Critiques

### C1. La suppression de compte ne supprime AUCUN média (RGPD art. 17) ✅✋
- `supabase/functions/delete-account/index.ts:40` : `list(user.id)` non récursif ne renvoie que les pseudo-dossiers `photos/` et `sounds/` ; `remove()` sur ces préfixes est un no-op silencieux (erreur non vérifiée). Les uploads sont à profondeur 2 (`services/storage/storageMedia.ts:22` et `:67`) depuis AVANT la création de la fonction → elle n'a jamais marché.
- Médias orphelins à vie dans un bucket PUBLIC. Le RECAP thème 07 (VP-05) la documente à tort comme fonctionnelle ; les tests la mockent.
- **Fix** : listing récursif paginé des deux sous-dossiers, remove par lots, vérification des erreurs (échec → 500 avant `deleteUser`). Purge one-shot des orphelins existants.

### C2. Export d'observations inopérant sur mobile/tablette (≤1024 px) ✋
- `components/ObservationList.tsx:783` : `ExportScopeDialog` n'est rendu que dans le return desktop (l.528+). La branche mobile (l.298-527) pose `pendingExportType` mais aucun dialogue ne s'ouvre → Exporter ne fait RIEN sur téléphone. Tests uniquement `isMobileView={false}`.
- **Fix** : rendre `ExportScopeDialog` dans les deux branches + test `isMobileView={true}`.

## 🟠 Hauts

### Sécurité / RGPD
- **H1. Énumération anonyme du bucket** ✅ — policy `"Public Access" for select using (bucket_id='photos')` sans condition d'auth (`20240101000000_initial_schema.sql:138`) : quiconque a la clé anon (dans le bundle JS) peut lister TOUS les fichiers de TOUS les utilisateurs via `/storage/v1/object/list/photos`. Les URLs publiques (`/object/public/`) ne passent pas par RLS → fix sans régression (SELECT scopé par `user_id` ; seul `delete-account` utilise `list()`, via service_role).
- **H2. Backup/restore et export RGPD détruisent la précision GPS des espèces sensibles** ✋ — l'obfuscation VP-11 (~11 km) s'applique au `data.json` du ZIP (`backupService.ts:168-174`), qui est AUSSI la source de restauration (l.468) et le contenu de « Exporter mes données (RGPD) ». Sauvegarde → restauration merge = perte définitive en base.
- **H3. Pages légales en prod avec `[A COMPLETER]`** ✅ — responsable de traitement, contact DPO, éditeur, dates (`LegalPages.tsx:37`, `:88`, `:165-169`). Art. 13 RGPD + LCEN. Action utilisateur requise.
- **H4. Token Supabase dans `.codex/config.toml` non gitignoré** ✅ — jamais commité, repo privé, token testé DÉJÀ INVALIDE (401). Hygiène : `.codex/` au `.gitignore`, purger le token mort.
- **H5. 15 vulnérabilités npm audit (2 critiques vitest, 6 hautes dont vite/tmp/lodash)** ⚠️ — quasi toutes corrigeables in-range (`npm audit fix` sans `--force`, refuser le downgrade exceljs). Cause racine : aucune veille (pas de Dependabot, pas d'audit en CI).

### Bugs cœur (offline/sync/auth)
- **H6. Rechargement complet de l'app à chaque refresh de token (~1×/h), perte de saisie** ✋ — `App.tsx:327` dépend de l'objet `user` (nouvelle référence à chaque `TOKEN_REFRESHED`) → `loadData()` + `setIsLoading(true)` démontent l'UI dont le formulaire (sans brouillon). Fix : `user?.id` (+ `useOfflineQueue`), pas de re-loading plein écran si des données sont affichées.
- **H7. La déconnexion détruit silencieusement la file offline non synchronisée** ✋ — `AuthContext.tsx:173-177` : `clearScopedOfflineData(user.id)` inconditionnel, sans confirmation. Une journée de terrain non synchronisée = perdue.
- **H8. Après une synchro partielle, les observations en échec disparaissent de la liste** ⚠️ — le `getObservations()` post-sync écrase la ré-injection SI-12 (`useSyncQueue.ts:51-54`, `storageService.ts:681-687`) → re-saisie → doublon.
- **H9. Enrichissement Wikipedia au démarrage : snapshot périmé qui écrase l'état UI et les lignes en base** ⚠️ — `App.tsx:268-312` : `setObservations(snapshot)` + `updateObservation(ligne entière)` pendant que l'utilisateur travaille.

### Bugs fonctionnels
- **H10. « Me localiser » ne remplit jamais le formulaire quand le GPS est précis** ⚠️ — `MapInput.tsx:341` : le timer debounce (2 s) portant `onLocationChange` est annulé par `stopWatching()` dès que précision <30 m. Régression de FO-22.
- **H11. Import Excel : heures/dates décalées (fuseaux)** ⚠️ — `excelImportService.ts:623` : getters locaux sur des Date UTC d'ExcelJS (la branche serial utilise correctement getUTC*).
- **H12. Aller-retour export→import Excel EFFACE habitat/phénologie/observateurs en base** ⚠️ — colonnes exportées (`observationExportService.ts:63-65`) mais absentes de HEADER_ALIASES (`excelImportService.ts:106`) → undefined → NULL en mode merge/update.

### UX / PWA
- **H13. Aucun parcours « mot de passe oublié »** ✅×2 — `resetPasswordForEmail`/`PASSWORD_RECOVERY` : 0 occurrence. Oubli = compte perdu.
- **H14. Bannière de mise à jour PWA inopérante + rechargements surprise** ✋ — `registerType: 'autoUpdate'` (`vite.config.ts:83`) rend `onNeedRefresh` (`index.tsx:67`) mort. Fix : `registerType: 'prompt'`.

## 🟡 Moyens (sélection)

- Bucket sans `file_size_limit`/`allowed_mime_types` serveur ✅ (gardes client-only).
- Sync multi-onglets/PWA non verrouillée (T-14 connu) ⚠️ — Web Locks API.
- Refresh post-sync non paginé (>1000 obs) ⚠️ · retries infinis des échecs définitifs ⚠️ · coalescence du mutex → faux toast de succès ⚠️ · import : suppressions ressuscitées ⚠️ · clic carte sans GPS si Nominatim échoue ⚠️ · heure fabriquée « 12:00 » à l'import ⚠️.
- A11y ✅ : cibles tactiles header mobile ~28 px (AC-26 jamais appliqué), tri tableau souris-only, calendrier 6 th / 7 td, statut connexion pastille-couleur-seule, filtres sans label (reliquat AC-10), boutons icône sans nom, pas d'`autocomplete` Login. ⚠️ : validation silencieuse, contraste BottomNavigation ~2,2:1, erreurs techniques brutes.
- Deps ⚠️ : `leaflet` fantôme · `licenses:check` cassé (buffers@0.1.1) · @types/* en dependencies.
- RGPD ⚠️ : destinataires manquants dans la politique (tuiles Esri/CARTO/OSM/OpenTopoMap, Wikipedia, Open-Meteo qui reçoit les GPS exacts) · hébergement us-east-1 non déclaré.

## 🔵 Bas / info

CSP casse les handlers inline (skip-link + offline.html) · sourceUrl sans validation de protocole · import JSON sans limite de taille · CORS `*` + méthode non vérifiée sur delete-account · search_path non figé · created_at forgeable à l'INSERT · colonnes texte sans plafond · doc « 37 fichiers/246 tests » (réel : 43/278) · validation GPS dupliquée ×5 · normalisation texte ×3 · metadata.json vestige + `server/` vide · formats de date incohérents (même écran) · typographie des toasts · tsconfig (experimentalDecorators, useDefineForClassFields:false, allowJs) · vitest `globals:true` inutile · typo « Champigion.png » · tri null non antisymétrique · fitBounds à chaque frappe · galerie sans état vide · window.confirm backup · pas de preuve de consentement · export RGPD sans account.json · html2canvas/exceljs/file-saver vieillissants · supabase-js 22 mineures de retard · supabase CLI postinstall en CI · chunks lourds jamais en runtime cache (404 après déploiement).

---

## Plan d'action (lots de petits PRs, `npm run check` vert à chaque commit)

- **Lot A — Urgences sécurité/RGPD** : A1 fix delete-account + purge orphelins · A2 migration policy SELECT + limites bucket · A3 .gitignore .codex · A4 pages légales (infos utilisateur requises).
- **Lot B — Bugs critiques/hauts front** : B1 export mobile · B2 backup fidèle vs export partagé · B3 `user?.id` + confirmation déconnexion · B4 merge queue post-sync · B5 enrichissement non destructif · B6 « Me localiser » + clic carte · B7 import Excel (fuseaux, alias, heure '').
- **Lot C — Hygiène deps + PWA** : C1 npm audit fix + leaflet déclaré + @types→devDeps + licenses:check + Dependabot · C2 registerType prompt + runtimeCaching vendor + catch import().
- **Lot D — UX/A11y** : D1 mot de passe oublié + autocomplete · D2-D5 cibles 44px, tri clavier, th Statut, labels, statut connexion, focus erreur, contraste, mapUserFacingError.
- **Lot E — Propositions** (à arbitrer) : Sentry · backup auto DB · E2E Playwright · versionnage cache localStorage · CI mono-Node ; features (audio, météo auto, save-and-add, comparaison annuelle, heatmap, life list, TAXREF, partage, Pl@ntNet, sessions) ; design (palette olive, Button, icônes SVG, dark mode complet, états vides, data-viz, typo).
