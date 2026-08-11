-- 027_rules_versions_11e.sql
-- Give `dataslate_versions` an edition, non-overlapping validity, and the two
-- 11th-edition rules versions; then tag every 11e event with the version it
-- was played under.
--
-- WHY: unit points and detachment-point costs change when the publisher issues
-- a points update, and the pipeline stores exactly one snapshot of each. Two
-- thirds of the 11e corpus predates the one patch in the window, so anything
-- costing a list against current values is wrong for those games. Proven from
-- the upstream scrape's own history: one detachment went 2 DP to 3, and the
-- pairing it was in disappears from the corpus four days later.
--
-- ONE BOUNDARY, NOT THREE. Seeded from the in-band `version:` field carried by
-- every faction YAML, NOT from commit dates. The upstream repo has four data
-- commits but only two published versions — meta.yaml reads version "1.0" at
-- 2026-06-17 AND 2026-06-23, then "1.1" at 2026-07-22. The two June commits
-- changed zero points and zero DP values; they are scraper corrections inside
-- v1.0. Seeding a version per commit would encode our own scrape fixes as
-- publisher repricings, dated inside the corpus. Version identity is content,
-- not commit history — which also survives a force-push, a rewritten upstream
-- history, or a shallow re-clone.
--
-- EFFECTIVE DATES come from meta.yaml's `lastUpdated`, which is the data date;
-- the commit lands a day later (nightly scrape). v1.0 is dated before the
-- edition's first event, so every early event resolves cleanly.
--
-- EDITION IS REQUIRED, and not merely for tidiness: 10th edition's last event
-- and 11th edition's first are BOTH 2026-06-20, so a date-only lookup
-- cross-assigns. It is also NOT NULL so the exclusion constraint below
-- actually fires — with a nullable column the `=` operator yields NULL on the
-- pre-existing row and the constraint silently enforces nothing.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE dataslate_versions ADD COLUMN edition TEXT;

-- The pre-existing row is 10th-edition and currently unbounded, so it overlaps
-- everything we are about to insert. Close it at the edition boundary first.
UPDATE dataslate_versions
   SET edition = '10e',
       superseded_at = COALESCE(superseded_at, DATE '2026-06-20')
 WHERE edition IS NULL;

ALTER TABLE dataslate_versions ALTER COLUMN edition SET NOT NULL;
ALTER TABLE dataslate_versions
  ADD CONSTRAINT dataslate_versions_edition_fkey
  FOREIGN KEY (edition) REFERENCES editions(edition) ON UPDATE CASCADE;

INSERT INTO dataslate_versions (version, edition, effective_from, superseded_at, notes) VALUES
  ('11e-mfm-1.0', '11e', DATE '2026-06-17', DATE '2026-07-22',
   'Field manual v1.0. Seeded from the in-band version field, not commit history: '
   'the 2026-06-22 and 2026-06-23 upstream commits are both still v1.0 and changed '
   'no points or detachment costs.'),
  ('11e-mfm-1.1', '11e', DATE '2026-07-22', NULL,
   'Field manual v1.1. Changed 369 unit prices, 10 detachment-point costs and the '
   'force disposition on ~24% of detachments. Three detachments got MORE expensive '
   '(2 DP to 3), which made seven previously-legal pairings impossible.')
ON CONFLICT (version) DO NOTHING;

-- No two versions of the same edition may claim the same day. Half-open range
-- so a superseded_at date belongs to the NEXT version, matching how a patch
-- takes effect on its publication date.
ALTER TABLE dataslate_versions
  ADD CONSTRAINT dataslate_versions_no_overlap
  EXCLUDE USING gist (
    edition WITH =,
    daterange(effective_from, superseded_at, '[)') WITH &&
  );

-- Tag events on (edition, date). NULL on all 395 11e events before this.
UPDATE events e
   SET dataslate_version = v.version
  FROM dataslate_versions v
 WHERE v.edition = e.edition
   AND e.event_date::date >= v.effective_from
   AND (v.superseded_at IS NULL OR e.event_date::date < v.superseded_at)
   AND e.dataslate_version IS DISTINCT FROM v.version;

COMMENT ON COLUMN dataslate_versions.edition IS
  'Edition this rules version belongs to. Required: 10e and 11e events overlap '
  'on 2026-06-20, so a date-only lookup cross-assigns.';
