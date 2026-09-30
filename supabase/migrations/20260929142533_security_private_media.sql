-- Déployer d'abord le frontend du lot 2 et vérifier le téléchargement authentifié.
-- Ne supprime ni ne déplace aucun objet : les références historiques sont conservées.
UPDATE storage.buckets SET public = false WHERE id = 'photos';
