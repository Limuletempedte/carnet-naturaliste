# Lot E — Catalogue des futures améliorations

> Backlog vivant des évolutions (≠ corrections). Source : audit v2 (29 propositions)
> + idées et bugs remontés par Eliot le 2026-06-17.
> **Contraintes posées par Eliot** : tout doit rester **gratuit**, et l'espace
> **Supabase est limité** (offre gratuite : ~500 Mo base, 1 Go stockage fichiers).
> Statut : 🟢 validé · 🟡 à expliquer/décider · ⚪ en réserve · 🐛 bug.

## ✅ État au 2026-06-20 (mise à jour)

**Tout le travail prévu du lot E est livré et en prod** (PR #24 → #35). Récap détaillé :
[`RECAP-lot-E.md`](./RECAP-lot-E.md).
- **Bugs** : BUG-E1, BUG-E2, BUG-E3, BUG-E5 ✅ corrigés ; BUG-E4 ❌ abandonné.
- **Features livrées** (au-delà des idées EE ci-dessous) : installation PWA (notification +
  bouton permanent du menu compte), invite d'avis par mail, mentions légales remplies,
  RGPD région (eu-central-1, UE).
- **Reste = idées en réserve** : EE-1 à EE-5 (ci-dessous) + propositions d'audit non
  retenues pour l'instant.
- Finalisation **livrée** : icônes PWA compressées + tests composants (PR #33), docs/récap (PR #35).

## Bugs remontés par Eliot (priorité — un bug passe avant une fonctionnalité)

| # | Bug | Statut (màj 2026-06-20) |
|---|---|---|
| BUG-E1 | Onglet Carte : fonds **topo et standard** gris (satellite OK) | ✅ **CORRIGÉ** (PR #24) — retiré le `{r}` des URLs OSM/OpenTopoMap |
| BUG-E2 | **Scroll partagé** entre onglets | ✅ **CORRIGÉ** (PR #24) — `window.scrollTo({top:0})` dans `handleViewChange` |
| BUG-E3 | Données **« arbre »** non classées auto | ✅ **CORRIGÉ** (PR #25) — `mapGBIFToTaxonomicGroup` + `WOODY_FAMILIES` |
| BUG-E4 | **ZIP** de sauvegarde à améliorer | ❌ **ABANDONNÉ** — Eliot : « pas de problème en fait » |
| BUG-E5 | **Zoom involontaire mobile** (onglet Liste) — *nouveau, juin 2026* | ✅ **CORRIGÉ** (PR #24) — vraie cause = débordement horizontal (`-mx-4` vs `px-2`) → `-mx-2` + `overflow-x-clip` |

## Idées d'Eliot (fonctionnalités / UX)

| # | Idée | Effort estimé | Note coût |
|---|---|---|---|
| EE-1 | 🗺️ **Saisir une obs en cliquant sur la carte** (onglet Carte) : ouvre le formulaire pré-rempli avec la position. Le bouton « se repérer » ne doit PAS ouvrir le formulaire. | M | Gratuit (client) |
| EE-2 | 👁️ **Vue consultation seule** au clic sur une observation (belle présentation, lecture), modification uniquement via bouton **Modifier**. Idem sur la carte (« Voir l'observation » = lecture seule + bouton Modifier dans la vue). | M | Gratuit (client) |
| EE-3 | 🏷️ **Code atlas** : préremplir sous forme de **liste déroulante** (au lieu d'un champ libre). | S | Gratuit (client) |
| EE-4 | ✨ **Animations discrètes et stylées** (pas de refonte — juste des touches : transitions, apparitions douces). | S→M | Gratuit (client) |
| EE-5 | 🎨 **Vrai logo de l'app**. | S (design) | Gratuit |

## Propositions de l'audit — Fonctionnalités

| Idée | Effort | Coût / Supabase | Statut |
|---|---|---|---|
| 🎙️ Enregistrement audio in-app (l'UI le promet déjà) | S | ⚠️ chaque son consomme le stockage 1 Go gratuit | ❌ **pas à faire** (réserve lointaine — décision Eliot 2026-06-17) |
| 🌦️ Météo auto (Open-Meteo, déjà branché pour l'altitude) | S | Gratuit, pas de stockage | ⚪ |
| ➕ « Enregistrer et ajouter une autre » (garde le contexte) | S | Gratuit | ⚪ |
| 📊 Comparaison annuelle dans les stats | S | Gratuit (calcul client) | ❌ **pas à faire** (réserve lointaine — décision Eliot 2026-06-17) |
| 🔥 Heatmap « pression de prospection » | S | Gratuit (plugin ~3 Ko, client) | ⚪ (expliqué) |
| 🦅 Vue « Mes espèces » (life list) | M | Gratuit (client) | ⚪ |
| 🔔 « À chercher en ce moment » (rappels saisonniers locaux) | M | Gratuit (client) | ❌ **pas à faire** (réserve lointaine — décision Eliot 2026-06-17) |
| 🏷️ Rattachement TAXREF (CD_NOM) | M | Gratuit (API INPN) ; +1 colonne texte (négligeable) | 🟡 à expliquer |
| 🔗 Partage public d'une obs par lien | M | Gratuit ; petite table (texte = négligeable) | ⚪ |
| 🌱 Identification plante par photo (Pl@ntNet) | M | Gratuit (API, ~500 req/j) ; clé à cacher via edge function | ⚪ |
| 📋 Sessions / check-lists de sortie (type eBird) | L | Gratuit ; nouvelle table + colonne (texte = négligeable) | 🟡 à expliquer |

## Propositions de l'audit — Design (incrémental, sans refonte)

Palette **olive « carnet de terrain »** (tokens) · **dark mode complété** (respect du réglage du téléphone `prefers-color-scheme`, barre système, fond) · **icônes SVG** (fin des emojis qui changent selon l'OS) · **toasts lisibles en sombre** · **popups/clusters Leaflet** au style de l'app · **blobs violet/jaune/rose → ambiance topographique** · **états vides illustrés** · **palette data-viz nature** · **typo Merriweather + 3 rayons cohérents**. Tous gratuits (client), efforts surtout S. → recoupe l'idée EE-4 (animations) d'Eliot.

## Propositions de l'audit — Robustesse / coulisses

| Idée | Effort | Coût / Supabase | Statut |
|---|---|---|---|
| 🚨 Monitoring d'erreurs (Sentry) | M | Gratuit (5k évts/mois, service externe ≠ Supabase) | 🟡 à expliquer |
| 💾 Sauvegarde auto de la base | M | Gratuit-ish (GitHub Actions, ~1 min/sem ; budget OK) | 🟡 à expliquer |
| 🧪 3-4 tests E2E (Playwright) | M | Gratuit (local ; ou CI = minutes Actions) | 🟡 à expliquer |
| 🔢 Versionner/valider le cache local | S | Gratuit | ⚪ |
| ~~Mises à jour PWA maîtrisées~~ | — | — | ✅ FAIT (Lot C) |
| ~~Cache des gros modules (404 après déploiement)~~ | — | — | ✅ FAIT (Lot C) |

---

## Notes de décision (2026-06-17)
- Eliot veut **tout garder gratuit** et a un **espace Supabase limité** → prioriser
  les idées « client-only » (zéro stockage) ; pour l'audio, prévoir une compression
  et surveiller le quota du bucket 1 Go.
- ❌ **Pas à faire** (décision Eliot 2026-06-17, gardés en réserve lointaine) :
  audio in-app, comparaison annuelle, « à chercher en ce moment ».
- 6 items expliqués (cf. conversation 2026-06-17) : heatmap, TAXREF, sessions eBird,
  Sentry, backup auto, tests E2E.
- **BUG-E1 (carte topo/standard) — cause trouvée** : `ObservationMap.tsx:204,206`
  utilise le suffixe rétina `{r}` dans les URLs OSM et OpenTopoMap, qui ne servent
  pas de tuiles `@2x` → 404 sur écran haute densité → fond gris. `MapInput`
  (qui marche) n'a pas ce `{r}`. **Fix = retirer `{r}` des 2 URLs** (effort S).
- Les **bugs (BUG-E1..E4) passent avant les fonctionnalités**.
- ⏸️ **Pause demandée** après cette session de cadrage Lot E — reprise plus tard.
  Aucune préférence exprimée sur l'ordre de démarrage (bugs/features/design/robustesse).
