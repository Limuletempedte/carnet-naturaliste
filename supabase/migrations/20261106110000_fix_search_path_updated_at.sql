-- Fige le search_path de la fonction du déclencheur `trg_set_observations_updated_at`.
-- Alerte Supabase « Function Search Path Mutable » (lint 0011), relevée par
-- l'audit v5 : sans search_path figé, la fonction résout les noms selon le
-- search_path de la session qui la déclenche.
--
-- Le corps est identique à celui de 20260419152719_theme5_sync_integrity.sql
-- (vérifié en production le 2026-11-06 via pg_get_functiondef). Seuls changent :
--   - `set search_path = ''` ;
--   - `timezone` et `now` qualifiés par `pg_catalog`.
--
-- `create or replace` garde la même fonction (même OID) : le déclencheur
-- existant et les droits restent en place, rien à recréer.
--
-- Retour arrière : recréer la fonction sans la ligne `set search_path = ''`
-- (corps de 20260419152719_theme5_sync_integrity.sql).

create or replace function public.set_observations_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.timezone('utc'::text, pg_catalog.now());
  new.created_at = old.created_at;  -- empêche le client de modifier la date de création
  return new;
end;
$$;
