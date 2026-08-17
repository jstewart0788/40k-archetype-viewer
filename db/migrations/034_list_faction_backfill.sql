-- 034_list_faction_backfill.sql
-- Populate lists.faction_id, which has been NULL on every row since the column
-- was created.
--
-- WHY: measured 2026-08-16, `lists.faction_id` was NULL for all 94,002 lists
-- across BOTH editions — 80,333 10e and 13,669 11e. The column has never held a
-- value. That is worse than not having the column at all, because it reads as a
-- valid filter: `WHERE faction_id = 'AM'` returns zero rows and
-- `GROUP BY faction_id` returns a single '(null)' bucket, and neither errors.
--
-- This produced a real wrong answer, not a hypothetical one. An investigation
-- into double-Leader attachments grouped 591 affected hosts by
-- lists.faction_id, silently got nothing, fell back to a different join, and
-- reported a per-faction breakdown (Astra Militarum 52.9%, Death Guard 41.2%)
-- that was entirely fabricated. The true rates had to be recovered from the
-- army name in raw_text. See the support-ability-gap note in project memory.
--
-- SOURCE: the payload's own `army.id`. Note this is the UPSTREAM faction id
-- (e.g. 'N9IViEnkWo' = Astra Militarum) and `lists.faction_id` is FK'd to
-- `factions`, which is keyed by exactly those ids — so this is a direct key
-- match with no name resolution in the middle. All 13,581 extractable ids
-- resolve; coverage is 99.4% of 11e lists.
--
-- DO NOT match on `army.name` instead. `factions` holds DUPLICATE names under
-- different ids — Necrons, Orks, Leagues of Votann, World Eaters and Imperial
-- Agents each appear more than once — so a name lookup is ambiguous and would
-- need a LIMIT 1 tie-break, i.e. a guess. The id is unambiguous.
--
-- NOT the same table as `wh_factions`. That one is the RULES reference, keyed
-- by short codes ('AM', 'DG', 'SM'). Joining a list to rules data still goes
-- through the name or an explicit mapping; this column is the upstream key and
-- the FK enforces that.
--
-- The 88 rows (0.6%) with no army id in the payload stay NULL, as do any rows
-- whose id is absent from `factions`. NULL means unknown — never a faction.

UPDATE lists l
   SET faction_id = f.id
  FROM factions f
 WHERE l.faction_id IS NULL
   AND l.raw_text IS NOT NULL
   AND f.id = substring(l.raw_text from '"army":\{"id":"([^"]+)"');

COMMENT ON COLUMN lists.faction_id IS
  'Upstream faction id the player DECLARED, from the payload''s army.id '
  '(migration 034), FK to factions.id. NULL means the payload carried no army '
  'id — never treat NULL as a faction and never infer one from it. Before 034 '
  'this was NULL on all 94,002 rows, which silently broke every query that '
  'grouped or filtered by it. NOTE: this is NOT wh_factions.id — that table is '
  'the rules reference keyed by short codes (AM/DG/SM) and is a different '
  'namespace. Some faction NAMES map to several ids here, so resolve by id.';

CREATE INDEX IF NOT EXISTS idx_lists_faction_id
  ON lists (faction_id) WHERE faction_id IS NOT NULL;
