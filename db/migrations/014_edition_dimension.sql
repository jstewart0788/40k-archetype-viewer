-- 014_edition_dimension.sql
-- First-class game-edition dimension (10th vs 11th).
--
-- Why this is explicit and not date-derived:
--   The tournament data source exposes NO edition/format/version/ruleset field.
--   Probed 2026-06-22, two days after the 11th-edition launch: a single
--   game-system id spans both editions, the event payload carries no ruleset
--   marker, and ~18% of post-launch events mention an edition only in free
--   text — mixed, e.g. "Farewell 10th edition" tournaments dated AFTER the
--   2026-06-20 launch weekend. During the codex-transition period a faction
--   without an 11th codex keeps its 10th codex rules, so 10th and 11th events
--   coexist on the same weekend.
--
-- Rules encoded here:
--   * edition is NULL when unknown. Downstream marts exclude Unknown from
--     edition-specific analytics (handled in the dbt rules layer).
--   * Date is authoritative in ONE direction only: an event before the 11th
--     launch is unambiguously 10th (11th did not exist yet). A post-launch
--     event is Unknown until explicitly classified.
--   * Free text may set edition_hint for a human review queue, but NEVER sets
--     the authoritative edition column.

-- ── Edition registry ──────────────────────────────────────────────────────────

CREATE TABLE editions (
  edition      TEXT PRIMARY KEY,            -- '10e', '11e'
  name         TEXT NOT NULL,
  launched_on  DATE NOT NULL,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO editions (edition, name, launched_on, notes) VALUES
  ('10e', 'Warhammer 40,000 — 10th Edition', '2023-06-24',
   'Leviathan launch box. The entire pre-2026-06-20 data window is 10th edition.'),
  ('11e', 'Warhammer 40,000 — 11th Edition', '2026-06-20',
   'Armageddon launch box. Leader/Support double attachment + multi-detachment army building. Codex transition: factions without an 11th codex keep 10th codex rules.');

-- ── Edition columns on events ─────────────────────────────────────────────────

ALTER TABLE events
  ADD COLUMN edition        TEXT REFERENCES editions(edition) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD COLUMN edition_source TEXT,   -- provenance: 'pre-11e-launch-date' | 'manual' | 'unclassified-post-launch' | 'unknown-no-date'
  ADD COLUMN edition_hint   TEXT;   -- advisory free-text guess ('10e'/'11e') for the review queue; NEVER authoritative

-- ── Authoritative backfill ────────────────────────────────────────────────────
-- Every event before the 11th launch is unambiguously 10th edition.
UPDATE events
   SET edition        = '10e',
       edition_source = 'pre-11e-launch-date'
 WHERE event_date < '2026-06-20'::date
   AND edition IS NULL;

-- Defensive: stamp provenance on rows the backfill could not classify, so the
-- review query (edition IS NULL) always carries a reason.
UPDATE events
   SET edition_source = 'unknown-no-date'
 WHERE event_date IS NULL AND edition IS NULL AND edition_source IS NULL;

UPDATE events
   SET edition_source = 'unclassified-post-launch'
 WHERE event_date >= '2026-06-20'::date AND edition IS NULL AND edition_source IS NULL;

CREATE INDEX IF NOT EXISTS idx_events_edition ON events (edition);
