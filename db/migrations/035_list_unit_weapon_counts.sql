-- 035_list_unit_weapon_counts.sql
-- Record HOW MANY of each weapon a squad fields, not just which weapons it has.
--
-- WHY: `list_units.weapons` is a bare array of names — ["Plasma incinerator",
-- "Bolt pistol", ...] — with no quantities, and `sub_models` is '[]' on
-- 1,349,935 of 1,350,008 rows. The parser was discarding the leading quantity
-- ("9x Plasma incinerator") with `re.sub(r"^\d+x\s+", "", ...)` before storing
-- the name.
--
-- Without counts a unit's real output is not computable, and the failure is
-- silent and confident. A substitution screen built on "best weapon x every
-- model" scored a Tactical Squad at 13.16 anti-tank damage per 100 points —
-- it carries ONE heavy weapon, appears in 17 lists, and has 18% loadout
-- consistency. Devastators scored 7.68 the same way. Both were fantasy, and
-- nothing in the data contradicted them. Found 2026-08-16.
--
-- ADDITIVE, NOT A REPLACEMENT. `weapons` keeps its shape because consumers
-- read it as a text array (list_features.py uses jsonb_array_elements_text,
-- m_list_unit_agg.sql concatenates it into a loadout signature). Changing that
-- shape would break both silently. This column sits alongside it.
--
-- SHAPE: a JSON object, weapon name -> integer count, e.g.
--   {"Plasma incinerator": 10, "Plasma pistol": 1, "Close combat weapon": 10}
-- Empty object '{}' means the parser found no quantified weapon lines for that
-- unit — which is different from "the unit has no weapons", so do not treat an
-- empty object as zero guns.
--
-- BACKFILL: none here. The counts only exist in raw_text and recovering them
-- requires re-running the parser, which is a pipeline step rather than a
-- migration. Rows written before that re-run keep '{}'.

ALTER TABLE list_units
  ADD COLUMN IF NOT EXISTS weapon_counts JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN list_units.weapon_counts IS
  'Weapon name -> quantity fielded by this squad, e.g. {"Plasma incinerator": '
  '10}. Companion to `weapons`, which holds names only and must keep that '
  'shape for existing consumers. Empty {} means the parser found no quantified '
  'weapon lines — NOT that the unit is unarmed. Never compute a unit''s output '
  'by multiplying one weapon across every model; that is the exact error this '
  'column exists to prevent.';

-- Consumers filter to units that actually have counts before computing output.
CREATE INDEX IF NOT EXISTS idx_list_units_has_weapon_counts
  ON list_units (list_id) WHERE weapon_counts <> '{}'::jsonb;
