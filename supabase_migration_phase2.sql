-- Phase 2 migration: indexes, constraints, updated_at trigger hardening.
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
alter table observations
  add constraint observations_count_positive_check
  check (count is not null and count >= 1) not valid;

alter table observations
  add constraint observations_species_name_not_blank_check
  check (char_length(btrim(species_name)) > 0) not valid;

alter table observations
  add constraint observations_gps_lat_range_check
  check (gps_lat is null or (gps_lat >= -90 and gps_lat <= 90)) not valid;

alter table observations
  add constraint observations_gps_lon_range_check
  check (gps_lon is null or (gps_lon >= -180 and gps_lon <= 180)) not valid;

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
