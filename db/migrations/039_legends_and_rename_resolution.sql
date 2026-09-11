-- 039: let the resolver see a Legends datasheet and a renamed one.
--
-- WHY: Codex: Orks (MFM v1.4, 2026-09-02) moved Lootas and Burna Boyz to
-- Legends and renamed Wartrakk -> Wartrakks, Rukkatrukk Squigbuggy ->
-- Rukkatrukk Squigbuggies. None of the four resolve today, so 350 Ork lists
-- (26% of the faction) carry a unit the pipeline treats as unknown.
--
-- Neither is a deletion, and the distinction is the whole point. Measured on
-- the 2026-09-10 corpus, Ork lists split:
--     clean                    818 lists  54.7% win  +6.51 VP
--     holds a Legends unit     295 lists  62.5% win  +11.70 VP
--     holds a deleted unit      65 lists  50.7% win  +3.41 VP
-- The Legends slice is the faction's STRONGEST. A rule that treats
-- "doesn't resolve" as "can't be fielded" would delete it — 27.6% of the
-- sample, taking one published build from 59 lists to 6 — and would delete the
-- renames too, which are simply the same units under new spellings. That rule
-- scores precision 0.076 (938 false positives to catch 77 real ones) and
-- correlates r=-0.19 with list_features.weapon_match_confidence, which bars it
-- under guard R3: it detects badly-parsed lists, not illegal ones.
--
-- TWO TIERS, both ranked BELOW every direct match (own=0, ancestor=depth,
-- foreign=50) so a live datasheet always beats a Legends or renamed one:
--
--   rank 55  legends  — wh_datasheet_stats names a Legends unit
--                       'lootas [legends]'; wh_datasheet_points names the same
--                       unit 'lootas' with is_legends=TRUE. The two reference
--                       tables disagree, and stripping the suffix is what
--                       closes the gap. Only 2 of 547 suffixed names collide
--                       with a live row, and the direct tier outranks in both.
--   rank 57  rename   — wh_unit_aliases cannot express this: its datasheet_id
--                       is FK'd to the 10e wh_datasheets table, so an
--                       11e-only new name is unreachable through it.
--                       '11e-rukkatrukk squigbuggies' has no 10e row at all.
--
-- Faction scoping is mandatory, not tidiness. is_legends is set per
-- (faction, name): 'deathwatch terminator squad' is Legends for Imperial
-- Agents and live for Deathwatch; 'venerable dreadnought' is Legends for Space
-- Marines and live for Grey Knights and Space Wolves. A name-keyed rule read
-- Deathwatch as 95.9% Legends-exposed when the true figure is zero. That is
-- migration 028's defect recurring one table over — resolve through the
-- lineage, never through the name alone.

CREATE TABLE IF NOT EXISTS wh_datasheet_renames (
    edition         TEXT NOT NULL REFERENCES editions(edition) ON UPDATE CASCADE,
    faction_id      TEXT NOT NULL,
    old_normalized  TEXT NOT NULL,
    new_normalized  TEXT NOT NULL,
    evidence        TEXT NOT NULL,
    similarity      REAL,
    PRIMARY KEY (edition, faction_id, old_normalized)
);

COMMENT ON TABLE wh_datasheet_renames IS
  'Datasheets an edition renamed in place. Populated by HUMAN REVIEW of the '
  'proposals pipeline/mfm_import.py prints from the MFM git history — never '
  'auto-applied. Rename-vs-deletion is not machine-decidable: at v1.4 the two '
  'true renames scored 0.941/0.909 on difflib and the next candidate '
  '(Kannonwagon -> Gunwagon) scored 0.632, which may itself be a real rename. '
  'A wrong row silently attributes one unit''s statline to another.';

INSERT INTO wh_datasheet_renames
  (edition, faction_id, old_normalized, new_normalized, evidence, similarity)
VALUES
  ('11e','ORK','wartrakk','wartrakks',
   'MFM v1.4 (2026-09-02) removed "Wartrakk", added "Wartrakks"; 148 corpus lists.', 0.941),
  ('11e','ORK','rukkatrukk squigbuggy','rukkatrukk squigbuggies',
   'MFM v1.4 (2026-09-02) removed "Rukkatrukk Squigbuggy", added "Rukkatrukk Squigbuggies"; 41 corpus lists.', 0.909)
ON CONFLICT (edition, faction_id, old_normalized) DO NOTHING;

DROP MATERIALIZED VIEW IF EXISTS mv_datasheet_resolution CASCADE;

CREATE MATERIALIZED VIEW mv_datasheet_resolution AS
WITH lineage AS MATERIALIZED (
  SELECT faction_id, ancestor_id, depth FROM v_faction_lineage
),
cand AS (
  -- Tier 'own' (rank 0) and 'ancestor' (rank = lineage depth). A Blood Angels
  -- army fields Intercessors from the Space Marines catalogue, so the ancestor
  -- tier is load-bearing, not a nicety. Chapter copies win over the parent's
  -- where both exist: all 9 chapter redefinitions carry stats identical to the
  -- parent and equal-or-richer ability/weapon/keyword sets, so preferring the
  -- chapter cannot regress a statline.
  SELECT fl.faction_id AS army_faction_id, s.normalized_name,
         s.id AS datasheet_id, s.faction_id AS datasheet_faction_id,
         fl.depth AS rank_key
    FROM lineage fl
    JOIN wh_datasheet_stats s
      ON s.edition = '11e' AND s.faction_id = fl.ancestor_id

  UNION ALL

  -- Tier 'foreign' (rank 50). Kept deliberately: allied / "soup" units are
  -- LEGAL — Imperial Agents in an Imperium army, daemons in a Chaos legion
  -- army — and 2,149 rows resolve this way with no same-faction candidate at
  -- all. Removing this tier would NULL those ids and collapse the contamination
  -- quarantine (which tests `canonical_datasheet_id IS NOT NULL`) to zero,
  -- readmitting genuinely contaminated lists into clustering.
  -- CAVEAT, stated so it is auditable rather than invisible: where several
  -- foreign factions define the name and none is in the army's lineage, the
  -- `id` tie-break is ALPHABETICAL BY FACTION CODE and is a coin flip. 567 rows
  -- are genuinely ambiguous this way. Read resolution_tier='foreign' to find
  -- them; do not mistake them for confident answers.
  SELECT wf.id, s.normalized_name, s.id, s.faction_id, 50
    FROM wh_factions wf
   CROSS JOIN wh_datasheet_stats s
   WHERE s.edition = '11e'

  UNION ALL

  -- Sentinel '*' for lists with no resolvable army faction (they exist: force
  -- disposition ids and grand-alliance umbrella labels carry no faction row).
  -- Those rows stay faction-blind by necessity, NOT by oversight.
  SELECT '*', s.normalized_name, s.id, s.faction_id, 50
    FROM wh_datasheet_stats s
   WHERE s.edition = '11e'

  UNION ALL

  -- Alias tiers (rank 60+), ranked BELOW every direct match so that today's
  -- COALESCE(direct, alias) precedence is preserved exactly. Aliases catch
  -- singular/plural and diacritic variants the parser emits ("myphitic
  -- blight-haulers" -> "myphitic blight-hauler", "kharn" -> "khârn").
  SELECT wf.id, ua.normalized, s.id, s.faction_id,
         60 + COALESCE(fl.depth, 5)
    FROM wh_factions wf
   CROSS JOIN wh_unit_aliases ua
    JOIN wh_datasheets d10 ON d10.id = ua.datasheet_id
    JOIN wh_datasheet_stats s
      ON s.edition = '11e' AND s.normalized_name = d10.normalized_name
    LEFT JOIN lineage fl
      ON fl.faction_id = wf.id AND fl.ancestor_id = s.faction_id

  UNION ALL

  SELECT '*', ua.normalized, s.id, s.faction_id, 70
    FROM wh_unit_aliases ua
    JOIN wh_datasheets d10 ON d10.id = ua.datasheet_id
    JOIN wh_datasheet_stats s
      ON s.edition = '11e' AND s.normalized_name = d10.normalized_name
  UNION ALL

  -- rank 55: LEGENDS, suffix stripped, resolved through the lineage.
  -- wh_datasheet_stats names a Legends unit 'lootas [legends]';
  -- wh_datasheet_points names the same unit 'lootas' with is_legends=TRUE.
  -- The two reference tables disagree and a player types neither suffix, so
  -- 350 Ork lists carried a unit the pipeline treated as unknown. Ranked
  -- BELOW foreign (50) deliberately: the resolver's job is to find a
  -- STATLINE, and a live datasheet of the same name is the better statline.
  -- Legality is a separate concern and is carried by wh_datasheet_points
  -- .is_legends, not by this view.
  SELECT fl.faction_id, regexp_replace(s.normalized_name, '\s*\[legends\]\s*$', ''),
         s.id, s.faction_id, 55 + fl.depth
    FROM lineage fl
    JOIN wh_datasheet_stats s
      ON s.edition = '11e' AND s.faction_id = fl.ancestor_id
   WHERE s.normalized_name ~ '\[legends\]\s*$'

  UNION ALL

  -- rank 57: RENAMES, human-approved only. wh_unit_aliases cannot express
  -- these: its datasheet_id is FK'd to the 10e wh_datasheets table, so an
  -- 11e-only new name ('rukkatrukk squigbuggies') is unreachable through it.
  SELECT fl.faction_id, r.old_normalized, s.id, s.faction_id, 57 + fl.depth
    FROM wh_datasheet_renames r
    JOIN lineage fl ON fl.ancestor_id = r.faction_id
    JOIN wh_datasheet_stats s
      ON s.edition = r.edition AND s.faction_id = r.faction_id
     AND s.normalized_name = r.new_normalized
   WHERE r.edition = '11e'

)
SELECT DISTINCT ON (army_faction_id, normalized_name)
       army_faction_id,
       normalized_name,
       datasheet_id,
       datasheet_faction_id,
       CASE WHEN rank_key = 0  THEN 'own'
            WHEN rank_key < 50 THEN 'ancestor'
            WHEN rank_key < 55 THEN 'foreign'
            WHEN rank_key < 57 THEN 'legends'
            WHEN rank_key < 60 THEN 'rename'
            ELSE 'alias' END AS resolution_tier
  FROM cand
 ORDER BY army_faction_id, normalized_name, rank_key, datasheet_id;

CREATE UNIQUE INDEX mv_datasheet_resolution_pk
  ON mv_datasheet_resolution (army_faction_id, normalized_name);

-- Recreate the view the CASCADE drops. Body is 028's verbatim; the two new
-- tiers read as 'direct' in alias_source because a Legends or renamed match is
-- a real datasheet. resolution_tier carries the detail for anyone who needs it.
CREATE OR REPLACE VIEW v_list_units_canonical AS
SELECT
  lu.list_id,
  lu.raw_name,
  lu.normalized_name,
  lu.squad_idx,
  lu.n_models,
  lu.points,
  lu.is_leader,
  lu.unit_role,
  r.datasheet_id          AS canonical_datasheet_id,
  r.datasheet_faction_id  AS canonical_faction_id,
  CASE WHEN r.resolution_tier = 'alias'  THEN 'alias'
       WHEN r.datasheet_id IS NOT NULL   THEN 'direct' END AS alias_source,
  r.resolution_tier
FROM list_units lu
LEFT JOIN v_lists_with_wh_faction lf ON lf.list_id = lu.list_id
LEFT JOIN mv_datasheet_resolution r
       ON r.army_faction_id = COALESCE(lf.wh_faction_id, '*')
      AND r.normalized_name = lu.normalized_name;
