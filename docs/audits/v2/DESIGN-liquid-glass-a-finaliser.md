# Liquid Glass & fonds — note « à finaliser à la toute fin »

> ⚠️ **À RELIRE AVANT LA FINITION FINALE DU PROJET.**
> Le Liquid Glass (EE-4) est **fonctionnel et déjà bien mieux qu'avant**, mais il
> n'est **pas considéré comme terminé**. Quand tous les lots fonctionnels seront
> livrés, il faudra **revenir dessus pour le pousser au maximum et mieux
> réfléchir au design d'ensemble** (pas seulement les onglets : le fond de l'app,
> la cohérence globale, l'ambiance visuelle). Cette note existe pour ne pas
> l'oublier.

Date de la note : 2026-07-05. Auteur du suivi : Eliot (éditeur) + agent.

---

## Ce qu'on a fait jusqu'ici

Style visé : **Liquid Glass iOS 26 « bulle d'eau »**, le plus fidèle possible,
mobile ET desktop. Zéro dépendance ajoutée (verre = CSS + SVG + canvas pur).

- **v1 → v3 (PR #50, MERGÉE)** — Fondations :
  - `components/LiquidGlass.tsx` : hook `useLiquidGlassRefraction`. Réfraction
    réelle via une *displacement map* générée en canvas (loi de Snell, n≈1,5) +
    un **étage spéculaire calculé** (`feSpecularLighting`, 2 lumières, carte de
    hauteur, masque à la forme) pour l'éclat « goutte brillante ». Chromium
    uniquement, repli CSS propre ailleurs.
  - `index.css` : classes `.liquid-glass` / `-clear` / `-green` / `-bubble` /
    `-sheen` / `-opaque` + replis `prefers-reduced-motion` / `-transparency`.
  - `components/GlassTabBar.tsx` : barre d'onglets partagée mobile/desktop =
    pilule de verre + **bulle qui glisse** élastiquement sous l'onglet actif
    (comme la barre Photothèque/Collections de l'app Photos iOS 26).
  - `BottomNavigation` : **pilule flottante** détachée du bas de l'écran.

- **v4 (PR #52)** — Interaction + lisibilité :
  - **Drag de la bulle** : on reste appuyé sur l'onglet actif et on fait glisser
    la bulle le long de la barre ; écrasement « gelée » pendant le geste, aperçu
    de la cible teintée, aimantation à l'onglet le plus proche au lâcher, retour
    haptique (`navigator.vibrate`) sur Android. Doigt ET souris.
  - **Relief sur fond uni** : liseré sombre ultra-fin + ombrage interne
    « lentille » + ombre en deux couches, pour que le verre garde du volume même
    sur le fond beige de l'app.

---

## Les limites connues (pourquoi ce n'est pas « fini »)

1. **LE FOND DE L'APP est le vrai facteur limitant.** Le verre ne peut réfracter
   que ce qu'il y a *derrière* lui. Sur iOS, les barres flottent au-dessus de
   **photos** → effet spectaculaire. Notre fond est un **beige uni** : rien à
   déformer, donc l'effet ne s'exprime pleinement qu'au **scroll** (quand du
   contenu passe sous les barres). **Décision de design à trancher à la fin :**
   - garder le fond uni (effet visible surtout au scroll) ;
   - **motif topographique léger** (la classe `.bg-topography` existe déjà dans
     `index.css`, discrète, thème nature) ;
   - dégradé plus riche (beige → vert très pâle) ;
   - autre direction artistique à imaginer.

   > **Statut vérifié le 2026-11-05** : ni la PR #52 ni la #54 n'ont tranché.
   > La #52 a **gardé le fond uni** et compensé par du relief sur le verre ; la
   > #54 ne touche pas au fond. Le motif `.bg-topography` n'est utilisé qu'en
   > filigrane à 3 % dans `components/ObservationList.tsx`. La décision reste
   > **ouverte**, reportée à la finition design finale (checklist ci-dessous).
2. **Réfraction + éclat = Chromium uniquement** (Chrome / Edge / **Android**).
   Safari / Firefox → repli verre CSS sans distorsion. Limite navigateur, pas du
   code.
3. **Le morphing « deux gouttes qui fusionnent » d'Apple** utilise leur moteur de
   rendu privé → non reproductible exactement sur le web. Notre écrasement
   « gelée » en est l'approximation.
4. **Listes déroulantes natives `<select>`** : la liste ouverte est peinte par
   l'OS, non stylable en CSS web.
5. **Vibration au lâcher** : Android oui, iPhone non (Apple bloque `vibrate` sur
   le web).
6. **Perf** : réfraction/blur = GPU → réservé au chrome (petites surfaces),
   jamais sur les cartes d'une liste scrollée.

---

## À faire à la toute fin (checklist de reprise)

- [ ] **Trancher la direction du fond de l'app** (uni / motif topo / dégradé /
      autre) — c'est ce qui débloquera le plus l'effet visuel.
- [ ] Repenser la **cohérence design globale** une fois toutes les features en
      place : ambiance, contrastes, mode sombre, densité, pas seulement les
      onglets.
- [ ] Repasser sur les **réglages fins** du verre (chaque surface a ses curseurs
      `scale` / `bezelWidth` / `blur` / `saturate` / `brightness` /
      `specular*`) et itérer sur preview avec Eliot.
- [ ] Comparer une dernière fois côte à côte avec les **captures iOS 26 de
      référence** fournies par Eliot.
- [ ] Vérifier le rendu réel **sur l'Android d'Eliot** (public cible) + un tour
      accessibilité (reduced-motion / reduced-transparency).

---

## Où se trouve le code

- Hook & filtre SVG : `components/LiquidGlass.tsx`
- Barre + bulle + drag : `components/GlassTabBar.tsx`, `components/BottomNavigation.tsx`
- Styles verre & fonds : `index.css` (chercher `liquid-glass` et `bg-topography`)
- Historique détaillé : `docs/audits/v2/SESSION-recap-2026-07-04.md`
