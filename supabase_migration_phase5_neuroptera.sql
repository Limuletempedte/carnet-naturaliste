-- Phase 5 migration: taxonomic label correction for Neuroptera.
-- Apply in a dedicated release window, separate from functional fixes.

update observations
set taxonomic_group = 'Névroptères'
where taxonomic_group = 'Nervoptère';
