-- 008_detachment_resolution.sql
-- Wire lists.detachment_id and archetypes.detachment_id to wh_detachments
-- (the the datasheet reference source of truth) instead of the empty upstream-derived
-- `detachments` table. upstream's public API doesn't return detachment info, so
-- that table never received any data.
--
-- Also adds:
--   - lists.parsed_detachment_raw — what the parser/LLM extracted, kept
--     verbatim for audit + non-English fallback resolution
--   - wh_detachment_aliases — manual + auto-discovered translations and
--     spelling variants. Resolver checks here when raw text doesn't match
--     wh_detachments.name. Seed grows from parser_warnings over time.

-- 1) Drop old FKs to legacy detachments table
ALTER TABLE lists      DROP CONSTRAINT IF EXISTS lists_detachment_id_fkey;
ALTER TABLE archetypes DROP CONSTRAINT IF EXISTS archetypes_detachment_id_fkey;

-- 2) Drop the unused legacy table
DROP TABLE IF EXISTS detachments;

-- 3) Re-point FKs at wh_detachments (same id type: TEXT)
ALTER TABLE lists
  ADD CONSTRAINT lists_detachment_id_fkey
  FOREIGN KEY (detachment_id) REFERENCES wh_detachments(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE archetypes
  ADD CONSTRAINT archetypes_detachment_id_fkey
  FOREIGN KEY (detachment_id) REFERENCES wh_detachments(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- 4) Raw parsed string (audit + future re-resolution)
ALTER TABLE lists ADD COLUMN IF NOT EXISTS parsed_detachment_raw TEXT;
CREATE INDEX IF NOT EXISTS idx_lists_parsed_det_raw
  ON lists (lower(parsed_detachment_raw))
  WHERE parsed_detachment_raw IS NOT NULL;

-- 5) Alias table — resolves variants, translations, and spelling drift
CREATE TABLE IF NOT EXISTS wh_detachment_aliases (
  id              SERIAL PRIMARY KEY,
  detachment_id   TEXT NOT NULL REFERENCES wh_detachments(id) ON DELETE CASCADE,
  alias_text      TEXT NOT NULL,
  normalized      TEXT NOT NULL,             -- casefold + collapse whitespace
  locale          TEXT,                      -- 'en'|'zh'|'es'|... NULL = unknown
  source          TEXT NOT NULL DEFAULT 'manual',  -- 'manual'|'auto'|'llm'
  confidence      REAL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_wh_det_alias_norm
  ON wh_detachment_aliases (normalized);
CREATE INDEX IF NOT EXISTS idx_wh_det_aliases_detachment
  ON wh_detachment_aliases (detachment_id);
