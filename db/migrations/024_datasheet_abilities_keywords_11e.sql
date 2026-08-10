-- 024_datasheet_abilities_keywords_11e.sql
-- The missing 11th-edition datasheet reference layer: ability text and keywords.
--
-- WHY: `wh_abilities` (7,142 rows) and `wh_keywords` (11,650) are a single 10th-
-- edition snapshot keyed to `wh_datasheets`, which has no edition column and was
-- never rebuilt for 11th. 789 of 1,844 11e datasheets don't even name-match it.
-- Consumers have been reading 10e rules for 11e units all along:
--   name_archetypes.py      — 'Epic Hero' detection + display names (BUILD NAMING)
--   list_features.py        — has_lone_op
--   score_playstyle_shifts  — faction shift scoring
-- The gap is not academic: on 2026-08-10 it hid Vanguard Veterans' "Vanguard
-- Assault" (Lethal Hits on the charge), Terminator Squad's "Fury of the First"
-- (+1 Hit vs the Oath target) and Aggressors' "Close-quarters Firepower" from a
-- unit-level analysis, all of which had to be read from raw catalogue JSON.
--
-- Source is the community catalogue (data/cat-11e), which carries 5,583
-- `Abilities` profiles and 1,661 category entries. Both are populated by
-- pipeline/cat_import.py in the same pass that builds wh_datasheet_stats.
--
-- CASCADE NOTE (see defect H): both tables hang off wh_datasheet_stats with
-- ON DELETE CASCADE, and cat_import DELETEs wh_datasheet_stats WHERE
-- edition='11e' before reinserting. That is intended — the same run repopulates
-- these tables immediately. It is NOT safe for any other process to delete from
-- wh_datasheet_stats without rebuilding these. The mfm_import cascade incident
-- (list_detachments, and silently wh_detachment_shifts) is the precedent.
--
-- Keyed per (datasheet, ability) / (datasheet, keyword) rather than globally
-- deduped by name — the same lesson as the 2026-08-10 wh_weapon_stats fix, where
-- name-only keying collapsed 6 distinct Thunder Hammer profiles into 1.

CREATE TABLE wh_datasheet_abilities (
  id            TEXT PRIMARY KEY,
  edition       TEXT NOT NULL REFERENCES editions(edition) ON UPDATE CASCADE,
  datasheet_id  TEXT NOT NULL REFERENCES wh_datasheet_stats(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  ability_type  TEXT,          -- source profile typeName: 'Abilities', 'Orders', ...
  imported_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wh_ds_abilities_datasheet ON wh_datasheet_abilities (datasheet_id);
CREATE INDEX idx_wh_ds_abilities_name      ON wh_datasheet_abilities (edition, lower(name));

COMMENT ON TABLE wh_datasheet_abilities IS
  'Per-datasheet ability text, 11e+, from the community catalogue. Edition-scoped '
  'replacement for wh_abilities (10e-only, keyed to wh_datasheets).';


CREATE TABLE wh_datasheet_keywords (
  datasheet_id  TEXT NOT NULL REFERENCES wh_datasheet_stats(id) ON DELETE CASCADE,
  keyword       TEXT NOT NULL,
  edition       TEXT NOT NULL REFERENCES editions(edition) ON UPDATE CASCADE,
  imported_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (datasheet_id, keyword)
);

CREATE INDEX idx_wh_ds_keywords_keyword ON wh_datasheet_keywords (edition, keyword);

COMMENT ON TABLE wh_datasheet_keywords IS
  'Per-datasheet keywords, 11e+, resolved from catalogue categoryLinks. '
  'Edition-scoped replacement for wh_keywords (10e-only). Includes the keywords '
  'build naming depends on, notably "Epic Hero".';
