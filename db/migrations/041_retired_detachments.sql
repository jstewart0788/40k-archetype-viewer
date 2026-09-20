-- 041_retired_detachments.sql
-- A detachment that leaves the field manual is RETIRED, not deleted, and the
-- junction can no longer be destroyed by a reference refresh.
--
-- WHY: Codex: Orks (MFM v1.4) removed five Ork detachments — Equatorial Hordes,
-- Freebooter Krew, More Dakka!, Rollin' Deff and Speedwaaagh!. mfm_import
-- prunes rows that vanish upstream, and list_detachments cascaded from them, so
-- every pre-codex Ork list that ran one lost its detachment. Measured
-- 2026-09-18: pre-codex Ork junction coverage 0.668 against 0.970 for every
-- other faction, and 404 lists whose raw text names one of the five have no
-- junction row at all.
--
-- The games are not invalidated by the detachment being withdrawn — they were
-- played, legally, under the rules of the day, and they are exactly the
-- evidence for what the codex changed. 038-era reasoning applies: "does not
-- appear in the current reference data" is not "was never fielded".
--
-- 027's comment claimed vanished rows "genuinely should take their junction
-- rows with them". That was true while the only reason a row vanished was a
-- scrape artefact. A codex makes withdrawal a real, dated event, so the
-- assumption no longer holds.
--
-- RESTRICT IS THE POINT. The importer is also being fixed to retire rather than
-- delete, but an instruction in one importer is not a guarantee: a future
-- script, a manual DELETE or a fresh importer would cascade again, and the
-- damage is invisible (v_list_detachments falls back to lists.detachment_id, so
-- coverage reads 1.0 while the junction is gone). With RESTRICT the delete
-- fails loudly instead.

ALTER TABLE wh_detachments
  ADD COLUMN IF NOT EXISTS retired_in_version TEXT,
  ADD COLUMN IF NOT EXISTS retired_at DATE;

ALTER TABLE wh_detachments
  DROP CONSTRAINT IF EXISTS wh_detachments_retired_in_version_fkey;
ALTER TABLE wh_detachments
  ADD CONSTRAINT wh_detachments_retired_in_version_fkey
  FOREIGN KEY (retired_in_version) REFERENCES dataslate_versions(version) ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS idx_wh_detachments_live
  ON wh_detachments (edition, faction_id) WHERE retired_in_version IS NULL;

ALTER TABLE list_detachments
  DROP CONSTRAINT list_detachments_detachment_id_fkey;
ALTER TABLE list_detachments
  ADD CONSTRAINT list_detachments_detachment_id_fkey
  FOREIGN KEY (detachment_id) REFERENCES wh_detachments(id)
  ON UPDATE CASCADE ON DELETE RESTRICT;

COMMENT ON COLUMN wh_detachments.retired_in_version IS
  'Set when the detachment stopped being legal: the rules version that removed '
  'it. Rows are kept so lists played while it was legal keep their detachment. '
  'Readers describing the CURRENT meta must filter retired_in_version IS NULL; '
  'readers describing past games must not.';
