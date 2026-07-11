-- 019_datasheet_stats_11e.sql
-- 11th-edition datasheet STAT LINES (M/T/Sv/W/OC/Ld/invuln), extracted from the
-- community BattleScribe-format catalog (JSON). This is the durability layer the
-- 10th pipeline gets from m_datasheet_stats; the 11th equivalent lands here.
--
-- Separate, edition-scoped table (like wh_datasheet_points, migration 018) so the
-- 10th feature pipeline's name-based datasheet resolution is untouched. Wiring
-- these into m_list_features_raw for 11e is a later step and needs edition-aware
-- canonicalization in dbt. Weapons/keywords are not extracted here yet.

CREATE TABLE wh_datasheet_stats (
  id               TEXT PRIMARY KEY,
  edition          TEXT NOT NULL REFERENCES editions(edition) ON UPDATE CASCADE,
  faction_id       TEXT REFERENCES wh_factions(id),
  name             TEXT NOT NULL,
  normalized_name  TEXT NOT NULL,
  movement         TEXT,       -- e.g. '5"'
  toughness        INT,
  save             TEXT,       -- e.g. '2+'
  wounds           INT,
  objective_control INT,
  leadership       TEXT,       -- e.g. '6+'
  invuln_save      TEXT,       -- e.g. '4+' (NULL if none)
  source_catalogue TEXT,
  imported_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wh_ds_stats_edition_name ON wh_datasheet_stats (edition, normalized_name);
CREATE INDEX idx_wh_ds_stats_faction ON wh_datasheet_stats (faction_id);
