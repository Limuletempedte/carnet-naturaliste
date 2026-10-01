-- Audit v2 — durcissement Storage (constats H1 + bucket sans limites serveur).
--
-- 1) Fin de l'énumération anonyme.
--    La policy SELECT "Public Access" (initial_schema) s'appliquait aussi au
--    rôle anon sur l'endpoint de listing (POST /storage/v1/object/list/photos) :
--    n'importe qui, muni de la seule clé anon publique, pouvait énumérer tous
--    les fichiers de tous les utilisateurs (donc découvrir tous les user_id et
--    toutes les URLs). Les URLs publiques (/object/public/) d'un bucket
--    public=true ne passent PAS par RLS : elles continuent de fonctionner.
--    Seule la découverte en masse est bloquée. L'app n'utilise aucun list()
--    côté client (seul delete-account liste, via service_role qui bypasse RLS).

drop policy if exists "Public Access" on storage.objects;

create policy "Users can list their own files"
  on storage.objects for select
  using (
    bucket_id = 'photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- 2) Limites côté serveur.
--    Les gardes existantes (20 Mo, whitelist MIME audio, JPEG forcé) ne
--    vivaient que dans le client (ObservationForm / storageMedia) : un client
--    direct de l'API Storage pouvait uploader n'importe quel type/taille dans
--    son dossier du bucket public. Le serveur applique désormais les mêmes
--    règles quel que soit le chemin d'appel.

update storage.buckets
set
  file_size_limit = 20971520, -- 20 MiB, aligné sur la garde client (SE-15)
  allowed_mime_types = array[
    'image/jpeg',
    'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/mp4', 'audio/x-m4a'
  ]
where id = 'photos';
