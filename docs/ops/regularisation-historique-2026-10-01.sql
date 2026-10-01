-- Régularisation déclarative autorisée le 1er octobre 2026.
-- Seule la table supabase_migrations.schema_migrations reçoit quatre INSERT.
-- Les scripts historiques sont enregistrés comme texte, jamais exécutés.
DO $repair$
DECLARE
  expected jsonb := $expected$[{"version": "20260419152657", "name": "phase6_count_breakdown", "sql_md5": "f43e6da677017d7da5517d01d6934c5b"}, {"version": "20260419152704", "name": "storage_insert_policy_hardening", "sql_md5": "fc365d10842be3cfde50e2382f6b2fef"}, {"version": "20260419152719", "name": "theme5_sync_integrity", "sql_md5": "583d8bbda54ddca5e0fc690477a29bbb"}, {"version": "20260419152731", "name": "theme12_observation_fields", "sql_md5": "fb7fa4b9be1c5136eba8c5dbc35f4fe3"}, {"version": "20260611093249", "name": "audit_v2_storage_hardening", "sql_md5": "24beb8a380e91b39d212be26c9c8a54e"}, {"version": "20260930135528", "name": "security_private_media", "sql_md5": "c39dcdc946f8a0285ac48f687380bcb2"}]$expected$::jsonb;
  actual jsonb;
  original_history jsonb;
  preserved_history jsonb;
  inserted integer;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  LOCK TABLE supabase_migrations.schema_migrations IN EXCLUSIVE MODE;
  SELECT jsonb_agg(jsonb_build_object('version',version,'name',name,
    'sql_md5',md5(array_to_string(statements,E'\n'))) ORDER BY version)
    INTO actual FROM supabase_migrations.schema_migrations;
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'Historique inattendu : aucune régularisation effectuée';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='photos' AND public=false) THEN
    RAISE EXCEPTION 'Le bucket photos doit rester privé';
  END IF;
  SELECT jsonb_agg(to_jsonb(m) ORDER BY version) INTO original_history
    FROM supabase_migrations.schema_migrations m;

  INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES
  ('20240101000000', 'initial_schema', ARRAY[$source$-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Create Observations Table
create table observations (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users not null,
  species_name text not null,
  latin_name text,
  taxonomic_group text,
  date date not null,
  time time,
  count int default 1,
  male_count int,
  female_count int,
  unidentified_count int,
  location text,
  gps_lat float,
  gps_lon float,
  municipality text,
  department text,
  country text,
  altitude float,
  comment text,
  status text,
  atlas_code text,
  protocol text,
  sexe text,
  age text,
  observation_condition text,
  comportement text,
  photo_url text,
  wikipedia_image text,
  sound_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Data integrity constraints
alter table observations
  add constraint observations_count_positive_check
  check (count is not null and count >= 1);

alter table observations
  add constraint observations_male_count_non_negative_check
  check (male_count is null or male_count >= 0);

alter table observations
  add constraint observations_female_count_non_negative_check
  check (female_count is null or female_count >= 0);

alter table observations
  add constraint observations_unidentified_count_non_negative_check
  check (unidentified_count is null or unidentified_count >= 0);

alter table observations
  add constraint observations_count_breakdown_sum_check
  check (
    (
      male_count is null
      and female_count is null
      and unidentified_count is null
    )
    or (
      coalesce(male_count, 0) + coalesce(female_count, 0) + coalesce(unidentified_count, 0) = count
    )
  );

alter table observations
  add constraint observations_species_name_not_blank_check
  check (char_length(btrim(species_name)) > 0);

alter table observations
  add constraint observations_gps_lat_range_check
  check (gps_lat is null or (gps_lat >= -90 and gps_lat <= 90));

alter table observations
  add constraint observations_gps_lon_range_check
  check (gps_lon is null or (gps_lon >= -180 and gps_lon <= 180));

-- Read/query indexes used by current app filters and sort
create index if not exists idx_observations_user_date_created
  on observations (user_id, date desc, created_at desc);

create index if not exists idx_observations_user_taxonomic_group
  on observations (user_id, taxonomic_group);

create index if not exists idx_observations_user_status
  on observations (user_id, status);

create index if not exists idx_observations_user_species_name
  on observations (user_id, species_name);

create index if not exists idx_observations_user_gps_present
  on observations (user_id, gps_lat, gps_lon)
  where gps_lat is not null and gps_lon is not null;

-- Keep updated_at synchronized
create or replace function public.set_observations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

create trigger trg_set_observations_updated_at
before update on observations
for each row
execute function public.set_observations_updated_at();

-- Enable Row Level Security (RLS)
alter table observations enable row level security;

-- Create Policies
create policy "Users can view their own observations"
  on observations for select
  using (auth.uid() = user_id);

create policy "Users can insert their own observations"
  on observations for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own observations"
  on observations for update
  using (auth.uid() = user_id);

create policy "Users can delete their own observations"
  on observations for delete
  using (auth.uid() = user_id);

-- Create Storage Bucket for Photos
insert into storage.buckets (id, name, public) values ('photos', 'photos', true);

-- Storage Policies
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id = 'photos' );

create policy "Authenticated users can upload photos"
  on storage.objects for insert
  with check (
    bucket_id = 'photos'
    and auth.role() = 'authenticated'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can update their own photos"
  on storage.objects for update
  using ( bucket_id = 'photos' and auth.uid()::text = (storage.foldername(name))[1] );

create policy "Users can delete their own photos"
  on storage.objects for delete
  using ( bucket_id = 'photos' and auth.uid()::text = (storage.foldername(name))[1] );
$source$]::text[]),
  ('20240201000000', 'phase2_indexes_constraints', ARRAY[$source$-- Phase 2 migration: indexes, constraints, updated_at trigger hardening.
-- Apply this script after the initial schema has been created.

-- 1) Normalize legacy rows so constraints can be validated safely.
update observations
set count = 1
where count is null or count < 1;

update observations
set species_name = 'Espèce inconnue'
where species_name is null or btrim(species_name) = '';

update observations
set gps_lat = null
where gps_lat < -90 or gps_lat > 90;

update observations
set gps_lon = null
where gps_lon < -180 or gps_lon > 180;

-- 2) Add constraints (NOT VALID first, then VALIDATE).
-- Wrapped in DO blocks for idempotency: fresh DBs may already have these from initial_schema.sql.
do $$ begin
  alter table observations
    add constraint observations_count_positive_check
    check (count is not null and count >= 1) not valid;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table observations
    add constraint observations_species_name_not_blank_check
    check (char_length(btrim(species_name)) > 0) not valid;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table observations
    add constraint observations_gps_lat_range_check
    check (gps_lat is null or (gps_lat >= -90 and gps_lat <= 90)) not valid;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table observations
    add constraint observations_gps_lon_range_check
    check (gps_lon is null or (gps_lon >= -180 and gps_lon <= 180)) not valid;
exception when duplicate_object then null; end $$;

alter table observations validate constraint observations_count_positive_check;
alter table observations validate constraint observations_species_name_not_blank_check;
alter table observations validate constraint observations_gps_lat_range_check;
alter table observations validate constraint observations_gps_lon_range_check;

-- 3) Add query indexes aligned with current app filters/sorting.
create index if not exists idx_observations_user_date_created
  on observations (user_id, date desc, created_at desc);

create index if not exists idx_observations_user_taxonomic_group
  on observations (user_id, taxonomic_group);

create index if not exists idx_observations_user_status
  on observations (user_id, status);

-- Already applied in DB manually; kept here for migration traceability.
create index if not exists idx_observations_user_species_name
  on observations (user_id, species_name);

create index if not exists idx_observations_user_gps_present
  on observations (user_id, gps_lat, gps_lon)
  where gps_lat is not null and gps_lon is not null;

-- 4) Keep updated_at accurate on every row update.
create or replace function public.set_observations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists trg_set_observations_updated_at on observations;

create trigger trg_set_observations_updated_at
before update on observations
for each row
execute function public.set_observations_updated_at();
$source$]::text[]),
  ('20240325000000', 'add_weather_condition', ARRAY[$source$-- Add weather condition column to observations
ALTER TABLE observations ADD COLUMN weather_condition text;
$source$]::text[]),
  ('20240501000000', 'phase5_neuroptera_label', ARRAY[$source$-- Phase 5 migration: taxonomic label correction for Neuroptera.
-- Apply in a dedicated release window, separate from functional fixes.

update observations
set taxonomic_group = 'Névroptères'
where taxonomic_group = 'Nervoptère';
$source$]::text[]);
  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted <> 4 OR (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 10 THEN
    RAISE EXCEPTION 'Nombre de migrations inattendu';
  END IF;
  SELECT jsonb_agg(to_jsonb(m) ORDER BY version) INTO preserved_history
    FROM supabase_migrations.schema_migrations m
    WHERE version NOT IN ('20240101000000','20240201000000','20240325000000','20240501000000');
  IF preserved_history IS DISTINCT FROM original_history THEN
    RAISE EXCEPTION 'Les six entrées préexistantes ont changé';
  END IF;
END;
$repair$;
