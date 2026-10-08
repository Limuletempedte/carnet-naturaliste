# Plan distinct — fluidité de la liste sur les gros carnets

Proposition à valider, **non implémentée dans les PR de l’audit**.
Le scénario de 10 000 observations a dépassé 15 secondes pour une action de
recherche, après import. La liste rend toutes les lignes.

## Changement proposé

- Afficher 100 observations par page dans la Liste, sur mobile et ordinateur,
  avec les commandes Précédent/Suivant et « Page X sur Y ».
- Garder le filtrage et le tri sur toutes les observations chargées. Revenir
  à la première page quand un filtre ou le tri change ; après suppression,
  borner la page courante au nombre de pages encore disponibles.
- Conserver les exports sur leurs périmètres actuels : toutes, filtrées ou
  sélectionnées. « Tout sélectionner » porte sur toutes les observations
  filtrées, avec leur nombre explicite, pas seulement sur la page visible.
- Garder les sélections entre pages tant que les filtres ne les excluent pas.
  Au retour d’une autre vue ou du formulaire, ouvrir la première page.
- Ne pas ajouter de bibliothèque, endpoint, migration ou pagination serveur.
  Ne pas modifier les vues Carte/Stats/Calendrier/Galerie dans ce lot.

## Vérification

Tester 0, 1, 100, 101, 1 000 et 10 000 observations ; accès au dernier élément
par page et par recherche, tri, suppression de la dernière page, sélection et
exports au-delà des 100 lignes affichées. Vérifier le clavier, les libellés
accessibles et les boutons tactiles d’au moins 44 px.

Comparer trois rechargements/recherches avec les mesures du rapport, sans
modifier le délai de 15 secondes du scénario. Le DOM de la liste ne doit pas
contenir plus de 100 lignes d’observations. L’import serveur reste inchangé :
son optimisation éventuelle nécessite une analyse séparée des lots d’écriture.

Livrer dans une PR propre, avec `npm run check` et essais navigateur, puis
fusion manuelle. Aucun déploiement de production pendant l’implémentation.
