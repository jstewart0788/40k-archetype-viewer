-- 023_canonical_view_11e.sql
-- Repoint v_list_units_canonical from the 10th-edition reference tables to the
-- 11th-edition ones.
--
-- WHY: migrations 012/013 built this view against `wh_datasheets`, which is a
-- single 10th-edition snapshot from the old reference source and has no edition
-- column. It was never updated for 11th. Everything downstream that asks "does
-- this unit exist, and whose is it?" has therefore been answering from 10e data
-- for the whole 11th-edition run — including the faction-contamination check in
-- build_ui_data.fetch_contaminated_list_ids(), which quarantines lists from
-- clustering, NMF assignment, example lists and unit-frequency rollups.
--
-- Measured 2026-08-10 over 11e list_units (183,758 squad rows):
--     resolves via wh_datasheet_stats (11e) : 181,710  (98.9%)
--     resolves via wh_datasheets     (10e) : 180,314  (98.1%)
-- so this is a small net GAIN in coverage, not a trade.
--
-- ALIASES: wh_unit_aliases.datasheet_id is a FK to wh_datasheets(id) — 10e ids.
-- Re-keying 118 alias rows to 11e ids would be a data migration with its own
-- failure modes, so instead the alias path takes an extra hop: alias -> its 10e
-- datasheet -> that datasheet's normalized_name -> the 11e row of the same name.
-- Alias value is preserved without touching the alias table.
--
-- DETERMINISM: the LATERALs keep the original LIMIT 1 (some names legitimately
-- exist under several factions — Forge World / Legends entries live under
-- SM/CSM/DG/EC/TS/WE at once, see migration 013), but now ORDER BY id first so
-- the arbitrary pick is at least stable across runs. Callers that care about the
-- multi-faction case test EXISTS against their own faction separately rather
-- than trusting canonical_faction_id.
--
-- Edition is hardcoded to '11e' rather than parameterised: views cannot read dbt
-- vars, and this matches existing practice in m_list_unit_agg / m_datasheet_stats.
-- 10e support is droppable by directive.

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
  COALESCE(ds_direct.id, ds_alias.id)                  AS canonical_datasheet_id,
  COALESCE(ds_direct.faction_id, ds_alias.faction_id)  AS canonical_faction_id,
  CASE
    WHEN ds_direct.id IS NOT NULL THEN 'direct'
    WHEN ds_alias.id  IS NOT NULL THEN 'alias'
  END                                                  AS alias_source
FROM list_units lu
LEFT JOIN LATERAL (
  SELECT s.id, s.faction_id
    FROM wh_datasheet_stats s
   WHERE s.edition = '11e'
     AND s.normalized_name = lu.normalized_name
   ORDER BY s.id
   LIMIT 1
) ds_direct ON true
LEFT JOIN LATERAL (
  SELECT s.id, s.faction_id
    FROM wh_unit_aliases ua
    JOIN wh_datasheets d10 ON d10.id = ua.datasheet_id
    JOIN wh_datasheet_stats s
      ON s.edition = '11e'
     AND s.normalized_name = d10.normalized_name
   WHERE ua.normalized = lu.normalized_name
   ORDER BY s.id
   LIMIT 1
) ds_alias ON true;

COMMENT ON VIEW v_list_units_canonical IS
  'list_units resolved to canonical 11e wh_datasheet_stats rows via direct match '
  'or wh_unit_aliases (alias hop goes through the 10e row''s name). Use instead of '
  'joining wh_datasheet_stats directly so alias-resolved units participate.';
