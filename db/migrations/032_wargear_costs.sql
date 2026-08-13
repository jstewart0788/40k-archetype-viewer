-- 032_wargear_costs.sql
-- Record per-item wargear costs, which nothing in the reference layer carries.
--
-- WHY: some datasheets charge points for individual wargear choices — "per
-- Thunder Hammer, 5 pts", "per Twin lascannon, 5 pts". None of our three
-- existing sources has them:
--   * the pipe-delimited datasheet export's options file has 0 rows mentioning
--     points at all;
--   * the community catalogue resolves those entries with costs = null;
--   * the field-manual YAML carries only model-count tiers.
--
-- The consequence is that unit costs are understated wherever wargear is paid
-- for. A 10-model Terminator Assault Squad reads 310 in our data and 360 on a
-- real roster, because ten thunder hammers cost 50. Any "what fits in 2,000
-- points" analysis is wrong by that amount, silently, and only for some units.
--
-- The official field manual publishes these under a WARGEAR OPTIONS heading per
-- datasheet, so they are imported from there rather than inferred.
--
-- SCOPE: this is a narrow correction — roughly one or two datasheets per
-- faction charge for wargear. It is recorded separately from
-- wh_datasheet_points rather than folded into `pricing`, because the two have
-- different shapes: pricing is a function of model count, wargear cost is a
-- function of how many of an item you take, and only the roster knows that.
--
-- Consumers pricing a specific list must add: base cost for the model count,
-- plus (count of each paid item x its cost). Consumers reasoning about a
-- datasheet in the abstract should keep using wh_datasheet_points alone.

CREATE TABLE IF NOT EXISTS wh_wargear_costs (
  edition          TEXT NOT NULL REFERENCES editions(edition) ON UPDATE CASCADE,
  -- The page a row came from. In the key because the same datasheet appears on
  -- several faction pages (a Terminator Assault Squad is listed for Space
  -- Marines, Dark Angels, Space Wolves and Black Templars) and per-chapter
  -- costs genuinely differ elsewhere in the manual, so they cannot be merged.
  source_slug      TEXT NOT NULL,
  faction_id       TEXT REFERENCES wh_factions(id),
  datasheet_name   TEXT NOT NULL,
  normalized_name  TEXT NOT NULL,       -- datasheet, casefolded for joining
  wargear_name     TEXT NOT NULL,
  wargear_norm     TEXT NOT NULL,       -- wargear item, casefolded
  cost             INTEGER NOT NULL,    -- points PER ITEM taken
  source_version   TEXT,                -- field-manual version this came from
  imported_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (edition, source_slug, normalized_name, wargear_norm)
);

CREATE INDEX IF NOT EXISTS idx_wh_wargear_costs_datasheet
  ON wh_wargear_costs (edition, normalized_name);

COMMENT ON TABLE wh_wargear_costs IS
  'Per-item wargear point costs from the official field manual. Absent from '
  'every other reference source we import. Add to the model-count cost in '
  'wh_datasheet_points when pricing an actual roster.';
COMMENT ON COLUMN wh_wargear_costs.cost IS
  'Points for ONE of this item. A unit taking ten of a 5pt item pays 50.';

-- Track which field-manual version the reference layer reflects, so a stale
-- import is visible rather than silent.
CREATE TABLE IF NOT EXISTS wh_reference_versions (
  edition       TEXT NOT NULL REFERENCES editions(edition) ON UPDATE CASCADE,
  source        TEXT NOT NULL,          -- e.g. 'field-manual-web'
  version       TEXT NOT NULL,          -- e.g. '1.2'
  observed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (edition, source)
);

COMMENT ON TABLE wh_reference_versions IS
  'What version of each upstream reference the DB currently reflects. Compare '
  'against dataslate_versions: a mismatch means the points layer is stale.';
