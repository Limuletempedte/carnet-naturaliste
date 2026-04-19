-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Create Observations Table
create table observations (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  species_name text not null,
  latin_name text,
  taxonomic_group text not null default 'Autre',
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
  weather_condition text,
  photo_url text, -- URL to Supabase Storage
  wikipedia_image text,
  sound_url text,
  habitat text, -- VP-04 (theme 12)
  phenology text, -- VP-08 (theme 12)
  observers text[], -- VP-05 (theme 12) — tableau de noms libres
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

-- SI-22: Text length constraints
alter table observations
  add constraint observations_location_max_length_check
  check (location is null or char_length(location) <= 500);

alter table observations
  add constraint observations_comment_max_length_check
  check (comment is null or char_length(comment) <= 5000);

alter table observations
  add constraint observations_latin_name_max_length_check
  check (latin_name is null or char_length(latin_name) <= 200);

-- SI-23: taxonomic_group NOT NULL constraint
alter table observations
  add constraint observations_taxonomic_group_not_null_check
  check (taxonomic_group is not null);

-- Read/query indexes used by current app filters and sort
create index if not exists idx_observations_user_date_created
  on observations (user_id, date desc, created_at desc);

create index if not exists idx_observations_user_taxonomic_group
  on observations (user_id, taxonomic_group);

create index if not exists idx_observations_user_status
  on observations (user_id, status);

create index if not exists idx_observations_user_gps_present
  on observations (user_id, gps_lat, gps_lon)
  where gps_lat is not null and gps_lon is not null;

create index if not exists idx_observations_user_species_name
  on observations (user_id, species_name);

-- Keep updated_at synchronized
create or replace function public.set_observations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  new.created_at = old.created_at;  -- SI-24: Prevent client modification
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
-- 1. Users can view their own observations
create policy "Users can view their own observations"
  on observations for select
  using (auth.uid() = user_id);

-- 2. Users can insert their own observations
create policy "Users can insert their own observations"
  on observations for insert
  with check (auth.uid() = user_id);

-- 3. Users can update their own observations (WITH CHECK prevents user_id transfer)
create policy "Users can update their own observations"
  on observations for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4. Users can delete their own observations
create policy "Users can delete their own observations"
  on observations for delete
  using (auth.uid() = user_id);

-- Create Storage Bucket for Photos
insert into storage.buckets (id, name, public) values ('photos', 'photos', true);

-- Storage Policies
-- SI-25: INTENTIONAL public read access — observation photo URLs are stored as public
-- URLs in the observations table. Write policies below restrict uploads to the
-- authenticated user's own folder prefix.
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id = 'photos' );

-- Allow authenticated users to upload photos
create policy "Authenticated users can upload photos"
  on storage.objects for insert
  with check (
    bucket_id = 'photos'
    and auth.role() = 'authenticated'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow users to update/delete their own photos (optional, based on path convention)
-- Assuming path is user_id/filename
create policy "Users can update their own photos"
  on storage.objects for update
  using ( bucket_id = 'photos' and auth.uid()::text = (storage.foldername(name))[1] );

create policy "Users can delete their own photos"
  on storage.objects for delete
  using ( bucket_id = 'photos' and auth.uid()::text = (storage.foldername(name))[1] );
