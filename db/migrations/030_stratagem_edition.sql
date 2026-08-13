-- 030_stratagem_edition.sql
-- Give stratagems an edition, so 11th-edition rules stop being served under
-- 11th-edition detachment names while actually being 10th-edition content.
--
-- WHY: `wh_enhancements` gained an `edition` column in 017; `wh_stratagems`
-- did not. Every row in it is 10th-edition, imported from the datasheet
-- reference's 10e export. Queries joined stratagems to detachments by NAME,
-- and because many detachment names carry over between editions (e.g.
-- 'Reclamation Force', 'Gladius Task Force'), those joins silently returned
-- 10e stratagems for 11e detachments. Verified before this migration: ZERO
-- stratagem rows attached to a detachment name that exists only in 11e, while
-- 258 attached to names that also exist in 10e. Any analysis reading that
-- table was reading the wrong edition's rules with no way to notice.
--
-- The gap was concentrated in 1-DP detachments — 66 of 82 had no stratagems at
-- all, against 4 of 142 at 2 DP and 0 of 46 at 3 DP — because those detachments
-- are 11e-only and so had no 10e name to collide with.
--
-- ID COLLISION: the two editions reuse stratagem ids (1,427 of the 1,664 ids in
-- the 11e export already exist as 10e rows, describing different rules). The
-- importer therefore prefixes 11e ids with '11e-', matching the convention
-- already used for 11e detachment ids ('11e-space-marines-fulguris-task-force').
-- That keeps the primary key a single column and leaves 10e ids untouched.
--
-- DETACHMENT LINKAGE: 10e detachment ids are numeric ('000000748'); 11e ids are
-- slugs. A stratagem's `detachment_id` can therefore only ever resolve within
-- its own edition. The importer resolves 11e rows by detachment NAME against
-- 11e detachments and leaves `detachment_id` NULL where the catalogue has no
-- matching detachment, retaining the name in `detachment` either way.
--
-- SAFE ON EXISTING DATA: existing rows are all 10e and the column default
-- records that without rewriting them. Nothing is deleted here.

ALTER TABLE wh_stratagems
  ADD COLUMN IF NOT EXISTS edition TEXT NOT NULL DEFAULT '10e'
    REFERENCES editions(edition) ON UPDATE CASCADE;

-- Stratagems are looked up per edition, either by detachment or by the type
-- prefix that distinguishes matched play from the other game modes sharing
-- this table ('Core ...' vs 'Boarding Actions – ...' vs 'Challenger – ...').
CREATE INDEX IF NOT EXISTS idx_wh_stratagems_edition_detachment
  ON wh_stratagems (edition, lower(detachment));
CREATE INDEX IF NOT EXISTS idx_wh_stratagems_edition_type
  ON wh_stratagems (edition, type);

COMMENT ON COLUMN wh_stratagems.edition IS
  'Edition these stratagem rules belong to. NEVER join stratagems to '
  'detachments by name without also constraining edition — detachment names '
  'recur across editions with different rules behind them.';

COMMENT ON COLUMN wh_stratagems.type IS
  'Source and category, e.g. "Core - Battle Tactic Stratagem", "Fulguris Task '
  'Force Stratagem", "Boarding Actions - Strategic Ploy Stratagem". This table '
  'mixes GAME MODES: rows for Boarding Actions and Challenger sit alongside '
  'matched-play ones and all have a NULL detachment, so filtering on "no '
  'detachment" pulls in stratagems that matched play cannot use.';
