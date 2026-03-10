-- Phase 6 migration: optional count breakdown per observation.
-- Adds male/female/unidentified fields with consistency constraints.

alter table observations
  add column if not exists male_count int,
  add column if not exists female_count int,
  add column if not exists unidentified_count int;

alter table observations
  add constraint observations_male_count_non_negative_check
  check (male_count is null or male_count >= 0) not valid;

alter table observations
  add constraint observations_female_count_non_negative_check
  check (female_count is null or female_count >= 0) not valid;

alter table observations
  add constraint observations_unidentified_count_non_negative_check
  check (unidentified_count is null or unidentified_count >= 0) not valid;

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
  ) not valid;

alter table observations validate constraint observations_male_count_non_negative_check;
alter table observations validate constraint observations_female_count_non_negative_check;
alter table observations validate constraint observations_unidentified_count_non_negative_check;
alter table observations validate constraint observations_count_breakdown_sum_check;
