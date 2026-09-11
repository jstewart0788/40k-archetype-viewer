-- 036_rule_text_provenance.sql
-- Record WHICH catalogue file a rule's text came from.
--
-- WHY: `wh_datasheet_abilities.description` was NULL on 1,829 rows across 33
-- rule names — Oath of Moment (366 datasheets), Templar Vows (246), Dark Pacts
-- (128), Waaagh! (94), Reanimation Protocols (67). The importer indexed rule
-- text from the game-system file only, which holds CORE rules; every FACTION
-- rule is defined in its own faction catalogue and so resolved to nothing.
--
-- The fix reads all 46 catalogues, which introduces a contamination risk this
-- column exists to make testable: 248 of 5,438 named rules (4.6%) carry more
-- than one DISTINCT text across files. `Leader` appears in 33 files with
-- different attach lists; `Transport` in 11 with different capacities;
-- `Executioner` is a weapon profile in one file and an ability in another.
-- Resolving such a name from the wrong file silently gives a datasheet another
-- faction's rule — the same shape as the migration-028 defect, where one
-- shared map let two sites disagree on 9.1% of rows.
--
-- Resolution is therefore scoped: the datasheet's OWN catalogue, then its
-- faction Library, then the game system, then globally but ONLY when the name
-- is unambiguous everywhere. This column records which of those won, so a test
-- can assert no row took its text from a foreign faction's file.
--
-- NULL means the text was not resolved from a catalogue (either absent, or
-- ambiguous with no justifiable source). NULL is the honest answer; a guess
-- is not.

ALTER TABLE wh_datasheet_abilities
  ADD COLUMN IF NOT EXISTS rule_text_source TEXT;

COMMENT ON COLUMN wh_datasheet_abilities.rule_text_source IS
  'Catalogue file basename the description was resolved from (migration 036). '
  'NULL means unresolved — never treat NULL as "no such rule". 4.6% of rule '
  'names carry conflicting text across files, so text must be resolved '
  'file-scoped and this column is what makes that auditable.';
