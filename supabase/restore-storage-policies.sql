-- Complément de restauration, uniquement sur une NOUVELLE cible isolée.
-- Les exports CLI standards n'incluent pas les policies du schéma géré storage.
-- Aucune donnée ni fichier n'est supprimé. Ne pas exécuter sur la source.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'photos' AND public = false) THEN
    RAISE EXCEPTION 'Le bucket photos restauré doit exister et rester privé';
  END IF;
END $$;

DROP POLICY IF EXISTS "Authenticated users can upload photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can list their own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own photos" ON storage.objects;

CREATE POLICY "Authenticated users can upload photos" ON storage.objects AS PERMISSIVE FOR INSERT TO public WITH CHECK (((bucket_id = 'photos'::text) AND (auth.role() = 'authenticated'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
CREATE POLICY "Users can delete their own photos" ON storage.objects AS PERMISSIVE FOR DELETE TO public USING (((bucket_id = 'photos'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
CREATE POLICY "Users can list their own files" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING (((bucket_id = 'photos'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
CREATE POLICY "Users can update their own photos" ON storage.objects AS PERMISSIVE FOR UPDATE TO public USING (((bucket_id = 'photos'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

COMMIT;
