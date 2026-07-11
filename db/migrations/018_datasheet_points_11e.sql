-- 018_datasheet_points_11e.sql
-- 11th-edition datasheet availability + points, from the official Munitorum
-- Field Manual scrape. Kept in a SEPARATE table (not mixed into wh_datasheets)
-- so the 10th feature pipeline's name-based datasheet resolution can't be
-- corrupted by same-named 11th entries. This is the "which units exist in 11th,
-- at what cost, and which are Legends" catalog — it does NOT carry stat lines
-- (T/W/Sv/M) or weapons; those come from the fuller 11th catalog (phase B).
--
-- For a Leader/Support unit the MFM lists the bodyguards it may attach to, so
-- attach_to is the 11th leader→bodyguard reference that complements the parser's
-- attachment extraction (migration 016).

CREATE TABLE wh_datasheet_points (
  id               TEXT PRIMARY KEY,
  edition          TEXT NOT NULL REFERENCES editions(edition) ON UPDATE CASCADE,
  faction_id       TEXT REFERENCES wh_factions(id),
  name             TEXT NOT NULL,
  normalized_name  TEXT NOT NULL,
  role             TEXT,                              -- MFM role, e.g. 'leader'
  attach_to        JSONB NOT NULL DEFAULT '[]',       -- bodyguard unit names a leader may join
  is_legends       BOOLEAN NOT NULL DEFAULT false,
  base_points      INT,                               -- cheapest listed cost (quick lookup)
  pricing          JSONB NOT NULL DEFAULT '[]',       -- full pricing (model-count / requisition tiers)
  imported_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wh_ds_points_edition_name ON wh_datasheet_points (edition, normalized_name);
CREATE INDEX idx_wh_ds_points_faction ON wh_datasheet_points (faction_id);
