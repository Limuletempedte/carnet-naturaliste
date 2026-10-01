-- Theme 12 : Valeur produit — nouveaux champs métier
-- Date: 2026-04-20
-- VP-04 (habitat), VP-05 (multi-observateur), VP-08 (phénologie)
-- Non destructif, zero-downtime, les colonnes sont toutes optionnelles.

ALTER TABLE observations
  ADD COLUMN IF NOT EXISTS habitat text,
  ADD COLUMN IF NOT EXISTS phenology text,
  ADD COLUMN IF NOT EXISTS observers text[];

-- Note : pas de CHECK constraint sur les valeurs enum — on reste permissif côté DB,
-- la validation stricte se fait côté client (types.ts enums Habitat/Phenology).
-- Observers est un text[] nullable ; côté client on stocke null quand vide (pas []).
