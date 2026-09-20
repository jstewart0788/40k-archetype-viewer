-- 040_mfm_versions_1_2_to_1_4.sql
-- Record MFM v1.2, v1.3 and v1.4, and make event tagging self-maintaining.
--
-- WHY: 027 seeded v1.0 and v1.1 and tagged the events that existed that day.
-- Nothing has tagged an event since. The extractor only tags 10th-edition
-- events (db/extractorWriter.js dataslateForEdition), and classify_editions
-- sets `edition` AFTER 027's one-shot UPDATE ran, so events that were Unknown
-- at the time never got a version even when they predate v1.1. Measured
-- 2026-09-18: 338 of 733 11e events carry NULL — 18 before v1.1, 10 inside
-- v1.1, and 310 after v1.2 was published. Adding the missing versions alone
-- would leave the first 28 untagged and re-break the moment new events land.
--
-- The tag matters beyond bookkeeping: build_ui_data reads "the version with no
-- successor" to decide which lists describe the CURRENT meta, so with v1.1
-- left open the composition panels have been built from the 122 events between
-- 2026-07-24 and 2026-08-02.
--
-- DATES ARE THE PUBLISHER'S, NOT OURS. `lastUpdated` in the upstream meta.yaml,
-- same rule as 027. v1.3 is dated 2026-08-26 but only reached the scrape on
-- 2026-09-01, so a commit-date seed would have mis-stated it by six days and
-- put 2 events on the wrong side of the boundary.
--
-- A CODEX IS NOT AN MFM VERSION. Codex: Orks landed with v1.4 but a codex can
-- ship outside a points update, changes one faction rather than all of them,
-- and rewrites datasheets rather than prices. That belongs in a per-faction
-- release table, not here; this migration deliberately only completes the MFM
-- spine. See the release work that follows it.

-- v1.1 has been open since 027. Close it at v1.2's start; the exclusion
-- constraint added by 027 rejects this migration outright if the ranges touch.
UPDATE dataslate_versions
   SET superseded_at = DATE '2026-08-05'
 WHERE version = '11e-mfm-1.1' AND superseded_at IS NULL;

INSERT INTO dataslate_versions (version, edition, effective_from, superseded_at, notes) VALUES
  ('11e-mfm-1.2', '11e', DATE '2026-08-05', DATE '2026-08-26',
   'Field manual v1.2. Small: 44 changelog entries, mostly per-model-count '
   'price rows for Inceptor Squads across the chapter factions, plus four new '
   'Aeldari units.'),
  ('11e-mfm-1.3', '11e', DATE '2026-08-26', DATE '2026-09-02',
   'Field manual v1.3. The large one: 1,365 changelog entries across 21 '
   'factions. Published 2026-08-26; reached the upstream scrape 2026-09-01.'),
  ('11e-mfm-1.4', '11e', DATE '2026-09-02', NULL,
   'Field manual v1.4. 250 changelog entries, nearly all Orks — it accompanies '
   'Codex: Orks, which also moved Lootas and Burna Boyz to Legends and retired '
   'five Ork detachments. The codex itself is a separate rules release.')
ON CONFLICT (version) DO NOTHING;

-- Resolve the version in force for an (edition, date). Half-open ranges, so a
-- version's own superseded_at belongs to its successor.
CREATE OR REPLACE FUNCTION rules_version_asof(p_edition TEXT, p_date DATE)
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT v.version
    FROM dataslate_versions v
   WHERE v.edition = p_edition
     AND p_date >= v.effective_from
     AND (v.superseded_at IS NULL OR p_date < v.superseded_at)
   ORDER BY v.effective_from DESC
   LIMIT 1
$$;

-- Tag on write, so an event cannot enter or be re-classified without a version.
-- A trigger rather than a step in the refresh script on purpose: the last two
-- taggers were one-shot statements in a migration and a branch in the
-- extractor that only handled 10th edition, and both stopped silently.
CREATE OR REPLACE FUNCTION events_tag_rules_version()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.edition IS NOT NULL AND NEW.event_date IS NOT NULL THEN
    NEW.dataslate_version := COALESCE(
      rules_version_asof(NEW.edition, NEW.event_date::date),
      NEW.dataslate_version);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_tag_rules_version_trg ON events;
CREATE TRIGGER events_tag_rules_version_trg
  BEFORE INSERT OR UPDATE OF edition, event_date ON events
  FOR EACH ROW EXECUTE FUNCTION events_tag_rules_version();

-- Backfill every edition, not just 11e: the same gap exists wherever an event
-- was classified after its version rows were seeded.
UPDATE events e
   SET dataslate_version = rules_version_asof(e.edition, e.event_date::date)
 WHERE e.edition IS NOT NULL
   AND e.event_date IS NOT NULL
   AND e.dataslate_version IS DISTINCT FROM rules_version_asof(e.edition, e.event_date::date);

COMMENT ON FUNCTION rules_version_asof(TEXT, DATE) IS
  'Points/detachment-cost version in force for an edition on a date. Rules that '
  'change per faction (codex releases) are NOT modelled here.';
