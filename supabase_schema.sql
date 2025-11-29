-- Enable UUID extension
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
  photo_url text, -- URL to Supabase Storage
  wikipedia_image text,
  sound_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

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

-- 3. Users can update their own observations
create policy "Users can update their own observations"
  on observations for update
  using (auth.uid() = user_id);

-- 4. Users can delete their own observations
create policy "Users can delete their own observations"
  on observations for delete
  using (auth.uid() = user_id);

-- Create Storage Bucket for Photos
insert into storage.buckets (id, name, public) values ('photos', 'photos', true);

-- Storage Policies
-- Allow public read access to photos
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id = 'photos' );

-- Allow authenticated users to upload photos
create policy "Authenticated users can upload photos"
  on storage.objects for insert
  with check ( bucket_id = 'photos' and auth.role() = 'authenticated' );

-- Allow users to update/delete their own photos (optional, based on path convention)
-- Assuming path is user_id/filename
create policy "Users can update their own photos"
  on storage.objects for update
  using ( bucket_id = 'photos' and auth.uid()::text = (storage.foldername(name))[1] );

create policy "Users can delete their own photos"
  on storage.objects for delete
  using ( bucket_id = 'photos' and auth.uid()::text = (storage.foldername(name))[1] );
