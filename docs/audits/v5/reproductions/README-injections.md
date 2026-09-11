# Reproduction locale des contrôles d’injection

Audit du commit `0041b1c1964251cb6585ce69eef6f43ceb72bc4f` de Carnet naturaliste. Le fichier `audit-injections.test.ts` contient 27 tests exécutés avec Vitest 3.2.7 le 11 septembre 2026 : **27 réussis, aucun ignoré**.

Dans une copie isolée du dépôt avec les dépendances du verrouillage déjà installées, placer ce fichier sous `tests/audit-injections.test.ts`, puis exécuter depuis la racine de cette copie :

```sh
./node_modules/.bin/vitest run tests/audit-injections.test.ts --maxWorkers 2 --reporter verbose
```

Tous les appels `fetch`, `XMLHttpRequest` et `WebSocket` sont bloqués dans le test. Les clics de téléchargement sont interceptés. Aucune connexion, donnée réelle, requête Supabase ou requête vers un service tiers n’est nécessaire.

Le fichier contient des tests de protection et des reproductions du comportement actuel. **Une reproduction verte ne signifie pas que la faiblesse est corrigée** : les cas ZIP et synonymes Excel attendent explicitement le comportement vulnérable ou incorrect observé au commit audité.

Résultats reproductibles :

- ZIP : 8 636 octets compressés ont produit 8 389 155 caractères décompressés, soit environ 971,4 fois plus, et une observation valide a été acceptée. Le test reste sous 9 Mio décompressés. Aucun épuisement mémoire ou crash de navigateur n’a été tenté.
- Une sauvegarde légitime est restaurée. Faux ZIP, fichier `data.json` absent, JSON malformé et mauvaise racine sont rejetés.
- JSON : les clés `__proto__`, `constructor` et `prototype` ajoutées aux objets ne sont pas conservées. Le prototype global est comparé avant et après chaque test. Les protocoles actifs et les URL non HTTP(S) sont retirés ; les témoins HTTP et HTTPS sont conservés sans téléchargement.
- CSV : les formules sont préfixées par une apostrophe dans les exports Darwin Core et sauvegarde. Les guillemets, virgules et retours à la ligne hostiles restent dans leur cellule.
- XLSX : huit chaînes sont exportées par la vraie API, puis relues avec ExcelJS ; elles restent de type `String`. Le XML du classeur ne contient aucun élément de formule `<f>`. Le retour CRLF est normalisé en LF lors de la lecture XML.
- HTML : le vrai export statistique et les cinq sections du DOM préparé pour le PDF gardent le nom hostile comme texte, sans élément injecté. `html2canvas` et la sortie graphique `jsPDF` sont simulés, car ces contrôles portent sur le HTML avant rasterisation. Il ne s’agit pas d’un test de rendu PDF dans un navigateur réel.
- Excel : des en-têtes dangereux sont rejetés. En revanche, les valeurs de statut `__proto__` et `constructor` deviennent respectivement un objet et une fonction, sans erreur bloquante. Cela confirme une anomalie du parseur ; la persistance et son impact de sécurité doivent être évalués séparément.

Le premier passage comptait 26 succès et une attente trop stricte sur la conservation CRLF dans XLSX. L’attente a été corrigée pour la normalisation XML, sans modifier les assertions de type `String` et d’absence de formule. Aucun fichier de production ni verrouillage de dépendances n’a été changé.
