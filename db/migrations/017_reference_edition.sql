-- 017_reference_edition.sql
-- Edition-scope the rules-reference layer so 10th and 11th reference data
-- coexist (same principle as events.edition in 014). The reference tables were
-- a single 10th-edition reference snapshot with no edition marker; importing
-- 11th reference data would otherwise overwrite 10th and break 10th
-- reproducibility. Detachment NAMES repeat across editions (e.g. Necrons
-- "Awakened Dynasty" exists in both), so resolution must key on (edition, name).
--
-- Also captures two 11th-native detachment fields the MFM provides:
--   dp        — Detachment Points cost (validates the parser's detachment_points)
--   objective — the detachment's force-disposition objective

ALTER TABLE wh_detachments
  ADD COLUMN edition   TEXT NOT NULL DEFAULT '10e' REFERENCES editions(edition) ON UPDATE CASCADE,
  ADD COLUMN dp        INT,
  ADD COLUMN objective TEXT;

ALTER TABLE wh_enhancements
  ADD COLUMN edition   TEXT NOT NULL DEFAULT '10e' REFERENCES editions(edition) ON UPDATE CASCADE;

-- Existing rows are all 10th (default handles the backfill). Name lookups become
-- edition-scoped.
CREATE INDEX IF NOT EXISTS idx_wh_detachments_edition_name ON wh_detachments (edition, lower(name));
CREATE INDEX IF NOT EXISTS idx_wh_enhancements_edition_name ON wh_enhancements (edition, normalized_name);
