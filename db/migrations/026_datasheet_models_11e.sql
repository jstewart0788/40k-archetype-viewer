-- 026_datasheet_models_11e.sql
-- Per-MODEL stat lines. A datasheet is a container of models, and 11e routinely
-- puts several with different statlines on one datasheet: a character plus an
-- attached bodyguard (Chaplain Grimaldus W4 + Cenobyte Servitor W1, Dark Apostle
-- W4 + Dark Disciple W1), or a genuinely mixed squad (Accursed Cultists =
-- Mutant W1 + Torment W3).
--
-- WHY: wh_datasheet_stats holds ONE stat line per datasheet, taken from the
-- first typeName='Unit' profile found in the catalogue subtree — which on a
-- character-plus-bodyguard sheet is the BODYGUARD. Measured 2026-08-10: 38
-- datasheets import a statline that is not their highest-wound model. Chaplain
-- Grimaldus imported as W1/Sv3+, Dark Apostle as W1/Sv6+, and Wolf Guard
-- Headtakers (255 appearances) as W1/Sv6+ — the Hunting Wolves profile. Those
-- feed m_list_features_raw's toughness / wound-pool / save aggregates and on
-- into the playstyle axes and the matchup model.
--
-- Scope: 1,714 datasheets → 1,927 model rows. 1,550 are single-model; 142 have
-- two; a handful have 3-11. Every profile in the catalogue carries a name, so
-- models are identifiable rather than positional.
--
-- wh_datasheet_stats is NOT replaced — it keeps one row per datasheet, now
-- carrying the PRIMARY model's line (the profile whose name matches the
-- datasheet, else the highest-wound one). Every existing consumer keeps working
-- and simply gets a correct statline; anything that needs the full picture
-- joins this table.
--
-- CASCADE NOTE (defect H): this hangs off wh_datasheet_stats ON DELETE CASCADE,
-- and cat_import deletes that table's 11e rows before reinserting. Intended —
-- the same run repopulates. No other process may delete from wh_datasheet_stats
-- without rebuilding this.

CREATE TABLE wh_datasheet_models (
  id                 TEXT PRIMARY KEY,
  edition            TEXT NOT NULL REFERENCES editions(edition) ON UPDATE CASCADE,
  datasheet_id       TEXT NOT NULL REFERENCES wh_datasheet_stats(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  movement           TEXT,
  toughness          INT,
  save               TEXT,
  wounds             INT,
  objective_control  INT,
  leadership         TEXT,
  invuln_save        TEXT,
  is_primary         BOOLEAN NOT NULL DEFAULT false,
  imported_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wh_ds_models_datasheet ON wh_datasheet_models (datasheet_id);
CREATE INDEX idx_wh_ds_models_name      ON wh_datasheet_models (edition, lower(name));
-- At most one primary per datasheet.
CREATE UNIQUE INDEX uq_wh_ds_models_primary
  ON wh_datasheet_models (datasheet_id) WHERE is_primary;

COMMENT ON TABLE wh_datasheet_models IS
  'Every model profile on a datasheet, 11e+. wh_datasheet_stats carries the '
  'primary model only; join here for mixed-profile units (character + bodyguard, '
  'Mutant/Torment squads).';
