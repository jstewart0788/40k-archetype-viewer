-- 028_faction_aware_datasheet_resolution.sql
-- One shared, deterministic map from (army faction, unit name) -> datasheet.
--
-- WHY: unit rows were resolved to a reference datasheet by NAME ALONE. 315 of
-- 1,410 11e datasheet names (22%) exist under more than one faction — the Chaos
-- legions each redefine the shared range in their own catalogue, and daemon
-- units appear under the daemon faction AND under the legions that ally them.
-- Datasheet ids are '11e-<FACTION>-<slug>', so `ORDER BY id LIMIT 1` resolved
-- alphabetically by faction code: a Death Guard list's Chaos Spawn got the
-- Chaos Space Marines row (T5) instead of Death Guard's own (T7).
--
-- WHY A SHARED RELATION AND NOT TWO FIXED LATERALS: the two resolution sites
-- (v_list_units_canonical and dbt's m_list_features_raw) ALREADY DISAGREE with
-- each other on 16,785 of 183,758 11e unit rows (9.1%) — the first orders by
-- id, the second had a bare LIMIT 1 with no ORDER BY at all. Two copies of a
-- rule drift; one relation cannot disagree with itself. The UNIQUE index below
-- is the standing proof: a catalogue load that introduces genuine ambiguity
-- fails the REFRESH loudly instead of silently picking a winner.
--
-- MEASURED BLAST RADIUS, so nobody re-derives it: 26,114 11e rows change their
-- datasheet id, across 5,317 lists. But 92% of those land on a row with
-- byte-identical stats and weapons — only ~8,365 rows (3,459 lists) actually
-- change a downstream feature value. This is a DETERMINISM and rot-resistance
-- fix, not an accuracy fix. Nothing user-facing moves: build identity and unit
-- frequency key on NAME (m_list_unit_agg), and the contamination quarantine
-- reads only `canonical_datasheet_id IS NOT NULL`, which is unchanged because
-- tier 'foreign' below preserves a match wherever one exists today.
--
-- EDITION: hardcoded 11e, like migration 023. This file reads the 10e
-- wh_datasheets table ONLY as a hop for the alias layer (wh_unit_aliases is
-- FK'd to 10e ids and re-keying its 118 rows is not worth it); the edition
-- guardrail test carries an explicit allowlist entry for that.

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
)
SELECT DISTINCT ON (army_faction_id, normalized_name)
       army_faction_id,
       normalized_name,
       datasheet_id,
       datasheet_faction_id,
       CASE WHEN rank_key = 0  THEN 'own'
            WHEN rank_key < 50 THEN 'ancestor'
            WHEN rank_key < 60 THEN 'foreign'
            ELSE 'alias' END AS resolution_tier
  FROM cand
 ORDER BY army_faction_id, normalized_name, rank_key, datasheet_id;

-- Determinism assertion, not merely an access path. Tiers 'own' and 'ancestor'
-- are provably single-candidate today (zero duplicate
-- (edition, faction_id, normalized_name) rows; lineage depth maxes at 1 and no
-- faction has two ancestors at equal depth), so the datasheet_id tie-break is
-- never exercised there. If a future catalogue load breaks that, the REFRESH
-- fails here instead of quietly changing a statline.
CREATE UNIQUE INDEX mv_datasheet_resolution_pk
  ON mv_datasheet_resolution (army_faction_id, normalized_name);

COMMENT ON MATERIALIZED VIEW mv_datasheet_resolution IS
  'Single source of truth for (army faction, unit name) -> 11e datasheet. '
  'Refresh after any catalogue import and BEFORE dbt: it depends only on '
  'wh_datasheet_stats / wh_factions / wh_unit_aliases, never on list data. '
  'resolution_tier is provenance: own > ancestor > foreign > alias. Treat '
  'tier=foreign as "allied unit or unresolved ambiguity", never as confident.';

COMMENT ON COLUMN mv_datasheet_resolution.army_faction_id IS
  'wh_factions.id of the fielding army, or ''*'' for lists whose faction '
  'cannot be resolved. Join with COALESCE(<army faction>, ''*'').';

-- ── Site 1: repoint the canonical view at the shared map ────────────────────
-- This gets SIMPLER, not more complex: two correlated LATERALs collapse into
-- one index lookup, and the faction is joined INSIDE the view rather than left
-- to each caller. Leaving it to callers is precisely what let the two sites
-- drift apart in the first place.
--
-- FACTION SOURCE is v_lists_with_wh_faction, deliberately, even though
-- m_resolved_player_faction would resolve 220 more lists. That model is a dbt
-- TABLE materialisation: a migration-owned view depending on it would be
-- CASCADE-dropped or block the rebuild the next time dbt runs — the same
-- silent-cascade class that once destroyed the whole detachment junction.
-- v_lists_with_wh_faction reads base tables only and is verified 1:1 with
-- lists (92,771 = 92,771, zero fan-out), so it cannot duplicate unit rows.
-- Upgrading THAT view is the follow-up; doing it there improves both
-- resolution sites and the contamination quarantine together, in step.
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

COMMENT ON VIEW v_list_units_canonical IS
  'List units resolved to 11e datasheets through mv_datasheet_resolution, '
  'preferring the army''s own faction then its ancestors. canonical_faction_id '
  'is now trustworthy (migration 023''s warning no longer applies); '
  'resolution_tier says how confident the match is.';
