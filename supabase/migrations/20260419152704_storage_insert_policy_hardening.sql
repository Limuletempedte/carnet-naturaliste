-- Phase 7 migration: harden storage insert policy while keeping public reads.
-- Prevent authenticated users from uploading files outside their own folder prefix.

drop policy if exists "Authenticated users can upload photos" on storage.objects;

create policy "Authenticated users can upload photos"
  on storage.objects for insert
  with check (
    bucket_id = 'photos'
    and auth.role() = 'authenticated'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
