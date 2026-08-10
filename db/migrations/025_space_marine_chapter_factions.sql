-- 025_space_marine_chapter_factions.sql
-- Make the six Space Marine chapters first-class factions with a parent link.
--
-- WHY: `wh_factions` had a single 'SM' row, and cat_import's FACTION_OVERRIDES
-- mapped Black Templars / Blood Angels / Dark Angels / Deathwatch / Space Wolves
-- onto it. `faction_bridge` did the same from the upstream side. Consequences:
--   1. Chapter datasheets collided with generic Space Marine ones on
--      (faction, name) and the loser was DROPPED — 11e-SM-terminator-squad held
--      Black Templars' version ("Judgement of the Weak") while the generic one
--      ("Fury of the First") vanished.
--   2. Nothing downstream could tell a Blood Angels list from an Ultramarines
--      one at the reference level, so chapter-specific rules were unreachable.
--
-- MEASURED 2026-08-10 — the chapters are NOT self-contained, which is why this
-- needs a hierarchy rather than a flat split. Units defined per catalogue:
--     Space Marines  159  (the shared core range)
--     Black Templars  20  (11 unique + 9 chapter-specific redefinitions)
--     Blood Angels    27  (0 shared, 27 unique)
--     Dark Angels     19  (0 shared)
--     Space Wolves    41  (0 shared)
--     Deathwatch      16  (0 shared)
-- A Blood Angels army fields Intercessors from the SPACE MARINES catalogue plus
-- its own 27. So "does this unit belong to this army?" must resolve against the
-- faction AND its ancestors. Contrast the Chaos legions, which each redefine the
-- shared range in their own catalogue (Chaos Rhino exists under CSM/DG/EC/TS/WE
-- independently) and therefore need no parent link.
--
-- The upstream results source already tracks all six chapters as distinct
-- factions and m_faction_canonical correctly leaves them alone
-- (is_parent_bucket = false for each) — its parent-bucket concept is about
-- grand-alliance umbrella labels (Chaos / Xenos / Imperium), not chapters.
-- This migration only fixes the REFERENCE side, which flattened them.

ALTER TABLE wh_factions
  ADD COLUMN parent_faction_id TEXT REFERENCES wh_factions(id) ON UPDATE CASCADE;

COMMENT ON COLUMN wh_factions.parent_faction_id IS
  'Faction this one inherits a shared datasheet range from (Space Marine '
  'chapters -> SM). NULL for factions whose catalogue is self-contained.';

INSERT INTO wh_factions (id, name, parent_faction_id) VALUES
  ('BT', 'Black Templars', 'SM'),
  ('BA', 'Blood Angels',   'SM'),
  ('DA', 'Dark Angels',    'SM'),
  ('DW', 'Deathwatch',     'SM'),
  ('SW', 'Space Wolves',   'SM')
ON CONFLICT (id) DO NOTHING;

-- Point each upstream chapter id at its own reference faction. These were all
-- pinned to 'SM' by the auto-seed in build_ui_data.py.
UPDATE faction_bridge SET wh_faction_id = 'BT',
  notes = 'chapter faction, migration 025' WHERE source_faction_id = 'XDhvAp4VAz';
UPDATE faction_bridge SET wh_faction_id = 'BA',
  notes = 'chapter faction, migration 025' WHERE source_faction_id = 'H1zsiowQJ9';
UPDATE faction_bridge SET wh_faction_id = 'DA',
  notes = 'chapter faction, migration 025' WHERE source_faction_id = 'GcG4M2kIYD';
UPDATE faction_bridge SET wh_faction_id = 'DW',
  notes = 'chapter faction, migration 025' WHERE source_faction_id = 'Zea8E4FEC4';
UPDATE faction_bridge SET wh_faction_id = 'SW',
  notes = 'chapter faction, migration 025' WHERE source_faction_id = 'XnBFIW8mKk';
-- SDmMBAJZf8 "Space Marines (Astartes)" stays on 'SM' — it IS the parent.

-- Self-and-ancestors lookup. Recursive so a deeper hierarchy (successor
-- chapters under a First Founding chapter) works without another migration.
CREATE OR REPLACE VIEW v_faction_lineage AS
WITH RECURSIVE lineage(faction_id, ancestor_id, depth) AS (
  SELECT id, id, 0 FROM wh_factions
  UNION ALL
  SELECT l.faction_id, f.parent_faction_id, l.depth + 1
    FROM lineage l
    JOIN wh_factions f ON f.id = l.ancestor_id
   WHERE f.parent_faction_id IS NOT NULL
     AND l.depth < 10          -- cycle guard
)
SELECT faction_id, ancestor_id, depth FROM lineage;

COMMENT ON VIEW v_faction_lineage IS
  'Each faction mapped to itself and every ancestor it inherits datasheets '
  'from. Use for "does this unit belong to this army?" — a Blood Angels list '
  'legitimately fields Space Marine core units.';
