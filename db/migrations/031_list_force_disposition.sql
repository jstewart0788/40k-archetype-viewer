-- 031_list_force_disposition.sql
-- Store the DECLARED Force Disposition on the list, instead of inferring it.
--
-- WHY: an 11th-edition army selects detachments with its Detachment Points, and
-- each detachment offers a Force Disposition — but the army declares exactly
-- ONE of them for the battle. An army running two detachments therefore has two
-- available and one declared, and nothing in our schema recorded which.
--
-- The obvious substitute is `lists.detachment_id -> wh_detachments.objective`.
-- That is wrong, and wrong in a way that inverts conclusions rather than merely
-- adding noise: `detachment_id` holds whichever single detachment the parser
-- treated as primary, which for a two-detachment army is arbitrary with respect
-- to what the player declared.
--
-- Measured both ways on the same 11e games (2026-08-13):
--
--   inferred from detachment      declared (this column)
--   ------------------------      ----------------------
--   Disruption      52.7%  best   Disruption      46.4%  WORST
--   Take and Hold   50.7%         Take and Hold   51.4%  best
--
-- The inferred version ranked Disruption first and Take and Hold fourth; the
-- declared version reverses them. Both pool to exactly 50.0% across all
-- dispositions, because that symmetry is guaranteed by unioning both sides of
-- every game — so the usual sanity check passes on BOTH and cannot distinguish
-- them. It validates the arithmetic, not the choice of variable.
--
-- The value is present in the raw payload the extractor already stores, as
-- `subFaction.name` (upstream labels the field "Force Disposition"). This
-- migration promotes it to a column so no consumer has to re-derive it, and
-- backfills from raw_text for rows captured before the extractor wrote it.
--
-- NULL means the payload carried no subFaction — roughly 41% of 11e lists.
-- That is genuinely unknown, not a default; do not treat it as any disposition.

ALTER TABLE lists
  ADD COLUMN IF NOT EXISTS force_disposition TEXT;

COMMENT ON COLUMN lists.force_disposition IS
  'Force Disposition the army DECLARED, from the payload''s subFaction.name. '
  'NULL means not captured. NEVER infer this from lists.detachment_id: a '
  'multi-detachment army has several available and declares one, and using the '
  'detachment inverts disposition win-rate rankings.';

-- Backfill everything already ingested.
UPDATE lists
   SET force_disposition = NULLIF(
         substring(raw_text from '"subFaction":\{[^}]*"name":"([^"]+)"'), '')
 WHERE force_disposition IS NULL
   AND raw_text IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lists_force_disposition
  ON lists (force_disposition)
  WHERE force_disposition IS NOT NULL;
