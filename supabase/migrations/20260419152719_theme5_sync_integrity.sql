-- Theme 5: Sync & Integrity corrections
-- Date: 2026-04-04
-- Non-destructive migration — safe for zero-downtime deployment

-- SI-18: FK ON DELETE CASCADE (allows user account deletion per GDPR art. 17)
ALTER TABLE observations DROP CONSTRAINT IF EXISTS observations_user_id_fkey;
ALTER TABLE observations
  ADD CONSTRAINT observations_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- SI-19: RLS UPDATE WITH CHECK (prevents user_id transfer between accounts)
DROP POLICY IF EXISTS "Users can update their own observations" ON observations;
CREATE POLICY "Users can update their own observations"
  ON observations FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- SI-22: CHECK constraints on text column lengths
ALTER TABLE observations
  ADD CONSTRAINT observations_location_max_length_check
  CHECK (location IS NULL OR char_length(location) <= 500) NOT VALID;
ALTER TABLE observations VALIDATE CONSTRAINT observations_location_max_length_check;

ALTER TABLE observations
  ADD CONSTRAINT observations_comment_max_length_check
  CHECK (comment IS NULL OR char_length(comment) <= 5000) NOT VALID;
ALTER TABLE observations VALIDATE CONSTRAINT observations_comment_max_length_check;

ALTER TABLE observations
  ADD CONSTRAINT observations_latin_name_max_length_check
  CHECK (latin_name IS NULL OR char_length(latin_name) <= 200) NOT VALID;
ALTER TABLE observations VALIDATE CONSTRAINT observations_latin_name_max_length_check;

-- SI-23: taxonomic_group NOT NULL DEFAULT 'Autre'
UPDATE observations SET taxonomic_group = 'Autre' WHERE taxonomic_group IS NULL;
ALTER TABLE observations ALTER COLUMN taxonomic_group SET DEFAULT 'Autre';
ALTER TABLE observations
  ADD CONSTRAINT observations_taxonomic_group_not_null_check
  CHECK (taxonomic_group IS NOT NULL) NOT VALID;
ALTER TABLE observations VALIDATE CONSTRAINT observations_taxonomic_group_not_null_check;

-- SI-24: Protect created_at from modification via trigger
CREATE OR REPLACE FUNCTION public.set_observations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  NEW.created_at = OLD.created_at;  -- Prevent client modification
  RETURN NEW;
END;
$$;

-- SI-29: DOWN statements (rollback reference)
-- ALTER TABLE observations DROP CONSTRAINT IF EXISTS observations_user_id_fkey;
-- ALTER TABLE observations ADD CONSTRAINT observations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
-- DROP POLICY IF EXISTS "Users can update their own observations" ON observations;
-- CREATE POLICY "Users can update their own observations" ON observations FOR UPDATE USING (auth.uid() = user_id);
-- ALTER TABLE observations DROP CONSTRAINT IF EXISTS observations_location_max_length_check;
-- ALTER TABLE observations DROP CONSTRAINT IF EXISTS observations_comment_max_length_check;
-- ALTER TABLE observations DROP CONSTRAINT IF EXISTS observations_latin_name_max_length_check;
-- ALTER TABLE observations DROP CONSTRAINT IF EXISTS observations_taxonomic_group_not_null_check;
-- ALTER TABLE observations ALTER COLUMN taxonomic_group DROP DEFAULT;
-- CREATE OR REPLACE FUNCTION public.set_observations_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = timezone('utc'::text, now()); RETURN NEW; END; $$;
