-- 033_detachment_source_of_truth.sql
-- Make `list_detachments` the documented source of truth for detachments, and
-- close the coverage gap on `lists.detachment_id` where it can be closed.
--
-- WHY: two things in this schema both mean "the list's detachment" and they do
-- not agree. Over 11e lists, `lists.detachment_id` is populated for 86.6% while
-- the `list_detachments` junction covers 98.5%. A consumer reading the column
-- silently sees 12 points less data than one reading the junction, and no
-- comment said which to prefer.
--
-- The column is also lossy by construction. 11th-edition armies routinely run
-- TWO detachments — 8,506 of our 11e lists do — and a single foreign key cannot
-- represent that. Of the 1,625 lists where the column is NULL but the junction
-- has rows, only 539 have exactly one detachment; the other 1,086 have two or
-- three and cannot be faithfully collapsed.
--
-- This is the same failure that produced migration 031: a value that looks
-- authoritative, is easy to join to, and is quietly wrong for multi-detachment
-- armies. There, inferring Force Disposition from this column inverted the
-- win-rate ranking. The lesson is worth writing into the schema rather than
-- rediscovering.
--
-- WHAT THIS DOES:
--   1. Backfills the 539 unambiguous cases (junction has exactly one).
--   2. Leaves the 1,086 ambiguous ones NULL. A wrong single answer is worse
--      than an absent one — NULL makes a consumer look at the junction, a
--      plausible-looking arbitrary pick does not.
--   3. Documents both objects so the next reader picks the right one.
--
-- ALSO RECORDED HERE: `wh_detachments.objective` holds the Force Disposition a
-- detachment offers, and it is CURRENT — but it is point-in-time with no
-- history. Field manual v1.1 (effective 2026-07-22) changed the force
-- disposition on roughly 24% of detachments. Measured against lists' declared
-- dispositions, the column is 95.8% consistent for events from 2026-07-22
-- onward and only 71.2% before it. The column is not wrong; it simply describes
-- today's rules and cannot interpret a list built under the previous ones.
--
-- So: `objective` is sound for current analysis and INVALID for historical
-- lists. Either restrict to post-2026-07-22 events or version this column the
-- way migration 030 versioned stratagems. Regardless, a list's own declared
-- disposition (`lists.force_disposition`, migration 031) is always preferable —
-- it is a fact about that list rather than an inference from today's rules.

UPDATE lists l
   SET detachment_id = j.only_det
  FROM (
    SELECT ld.list_id, MIN(ld.detachment_id) AS only_det
      FROM list_detachments ld
      JOIN wh_detachments d ON d.id = ld.detachment_id
     GROUP BY ld.list_id
    HAVING COUNT(DISTINCT ld.detachment_id) = 1
  ) j
 WHERE l.id = j.list_id
   AND l.detachment_id IS NULL;

COMMENT ON COLUMN lists.detachment_id IS
  'ONE detachment, for convenience only. NOT the source of truth: an 11e army '
  'may run several and this cannot represent that, so it is left NULL where the '
  'junction holds more than one. Use list_detachments for anything that must be '
  'complete or correct. Deriving a list''s Force Disposition from this column '
  'inverts disposition win rates — see migration 031.';

COMMENT ON TABLE list_detachments IS
  'Authoritative detachment membership: one row per (list, detachment). Covers '
  '98.5% of 11e lists against lists.detachment_id''s 86.6%, and is the only '
  'place a multi-detachment army is represented faithfully.';

COMMENT ON COLUMN wh_detachments.objective IS
  'Force Disposition this detachment offers under the CURRENT dataslate. '
  'Point-in-time, no history: field manual v1.1 changed this for ~24% of '
  'detachments, so it is 95.8% consistent with lists declared from 2026-07-22 '
  'and only 71.2% before that. Valid for current analysis, INVALID for '
  'historical lists. Prefer lists.force_disposition, which is a fact about the '
  'list rather than an inference from today''s rules.';
