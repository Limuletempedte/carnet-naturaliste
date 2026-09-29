# Lot 3 — imports bornés et annulables

Cette branche dépend du lot 2 (PR #84). Le point d'entrée de l'interface confie
JSON, XLSX et ZIP à un Worker dédié. Le thread principal termine réellement ce
Worker après 30 secondes, sur annulation, erreur ou changement de compte. La
prévisualisation et la confirmation avant enregistrement restent obligatoires.

## Limites appliquées

| Format | Limites |
|---|---|
| JSON / XLSX | 15 Mio compressés, 10 000 observations |
| XLSX | 50 Mio décompressés, 120 colonnes ; dimensions, lignes, cellules et fusions contrôlées avant ExcelJS |
| ZIP | 500 Mio compressés, 512 Mio de sortie cumulée, 20 005 entrées |
| ZIP `data.json` | 15 Mio |
| ZIP média | 20 Mio |

Le lecteur inspecte le répertoire central puis décompresse par blocs de sortie
de 64 Kio. Les compteurs réels sont contrôlés avant accumulation, y compris pour
les fichiers ignorés. Les tailles annoncées ne constituent pas la preuve de taille.
Les CRC, en-têtes locaux et noms sont vérifiés ; doublons, chemins ambigus,
ZIP64, archives chiffrées/multivolumes et méthodes autres que stockage/DEFLATE
sont refusés explicitement. Le format binaire XLS n'était pas pris en charge
par ExcelJS : le message invite désormais clairement à enregistrer en XLSX.

Les noms de feuilles reconnus par ExcelJS sont contrôlés même lorsque sa recherche
non ancrée accepterait un préfixe/suffixe inattendu. Les alias Unicode contradictoires
et les références XML ambiguës sont refusés. Un chevron dans un attribut XML ne
peut pas interrompre artificiellement le contrôle des dimensions.

## Médias et confirmation

Le Worker retourne des Blobs, sans transformer toutes les images en base64. Les
URL temporaires sont créées sur le thread principal et libérées à l'annulation,
au remplacement, à la fin d'import, au démontage et au changement de compte.
À confirmation, les médias sont soit envoyés avec authentification, soit conservés
dans un stockage IndexedDB distinct pour les saisies non synchronisées. La file
contient des références durables liées au propriétaire, jamais des URL Blob.
Le retour en ligne ré-uploade ces fichiers. La sauvegarde ZIP sait également lire
ces fichiers en attente. Les limites du cache de téléchargement ne les évinceraient pas.

Une erreur de taille/décompression bloque l'analyse entière avant toute écriture.
Les erreurs réseau lors de l'enregistrement restent affichées par le bilan d'import
existant ; elles ne sont pas confondues avec une acceptation partielle d'archive invalide.

## Vérifications et limites

Les tests ciblent les tailles falsifiées, le nombre d'entrées/observations, CRC,
doublons, dimensions et alias Excel, les parcours valides et la terminaison du Worker.
`tests/security/lot3-browser.mjs` vérifie sur le vrai bundle : JSON et Excel valides,
ZIP refusé, prévisualisation sans écriture, Worker volontairement bloqué interrompu
en 30 secondes pendant que l'interface reste réactive, annulation, restauration ZIP
hors ligne, rechargement et synchronisation de la photo vers un vrai Supabase local.

La revue déléguée a détecté l'écart de noms Excel, corrigé et testé, puis a été
interrompue par un filtre de sécurité. Elle ne constitue donc pas une revue indépendante
complète du lot. La vérification complémentaire du code et les tests ont été poursuivis
par l'agent principal. Aucun test malveillant distant ni changement de production.

Exécution : mêmes variables locales que les scripts des lots 1 et 2, puis
`node tests/security/lot3-browser.mjs`. `npm run check` reste le contrôle global
avant commit. Les bascules Supabase et l'audit général de santé restent distincts.
