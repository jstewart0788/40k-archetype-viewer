-- 015_list_detachments.sql
-- Multi-detachment groundwork for 11th edition (fixture-independent).
--
-- 10th: exactly one detachment per list (lists.detachment_id, single FK).
-- 11th: armies may field MULTIPLE detachments (2-3 Detachment Points) plus a
-- submitted "force disposition". This junction represents 0..N detachments per
-- list WITHOUT disturbing the single-edition (10e) data:
--   * backfilled 1:1 from lists.detachment_id (every current list is 10th), and
--   * v_list_detachments falls back to lists.detachment_id for any list without
--     junction rows.
-- So every read through the view is a verified no-op for current data and only
-- becomes multiplicity-aware once the 11e parser populates multiple rows.
-- lists.detachment_id is retained as the denormalized "primary" detachment.
--
-- The PARSER/WRITER are NOT changed here: detecting multiple detachments needs
-- real 11th list exports (the export format is days old — do not guess). When
-- those fixtures arrive, the writer populates list_detachments with N rows and
-- the view + downstream math already accommodate them.

CREATE TABLE list_detachments (
  list_id            TEXT    NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  detachment_id      TEXT    NOT NULL REFERENCES wh_detachments(id) ON UPDATE CASCADE ON DELETE CASCADE,
  slot_index         INT     NOT NULL DEFAULT 0,   -- parse order; primary = 0
  is_primary         BOOLEAN NOT NULL DEFAULT false,
  detachment_points  INT,                          -- 11th DP cost when known; NULL for 10th
  parsed_raw         TEXT,                          -- raw detachment string the parser saw
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, detachment_id)
);
CREATE INDEX idx_list_detachments_det ON list_detachments (detachment_id);

-- Backfill 1:1 from the existing single column (all current lists are 10th).
INSERT INTO list_detachments (list_id, detachment_id, slot_index, is_primary, parsed_raw)
SELECT l.id, l.detachment_id, 0, true, l.parsed_detachment_raw
FROM lists l
WHERE l.detachment_id IS NOT NULL
ON CONFLICT (list_id, detachment_id) DO NOTHING;

-- Single read seam for "the detachment(s) a list runs". Junction rows where
-- present; otherwise fall back to the denormalized lists.detachment_id so lists
-- written before the junction is populated still resolve. For all current data
-- this returns exactly one row per list — identical to reading lists.detachment_id.
CREATE VIEW v_list_detachments AS
  SELECT list_id, detachment_id, slot_index, is_primary
  FROM list_detachments
  UNION
  SELECT l.id, l.detachment_id, 0, true
  FROM lists l
  WHERE l.detachment_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM list_detachments ld WHERE ld.list_id = l.id);
