-- 013_canonical_view_fix.sql
-- The 012 view multiplied rows when a unit name appeared in multiple
-- wh_datasheets rows (~650 Forge World / Legends names exist under
-- SM/CSM/DG/EC/TS/WE simultaneously). Replace the LEFT JOINs with LATERAL
-- LIMIT 1 so each list_units row produces exactly one canonical row.

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
    ELSE NULL
  END AS alias_source
FROM list_units lu
LEFT JOIN LATERAL (
  SELECT id, faction_id FROM wh_datasheets ds
  WHERE ds.normalized_name = lu.normalized_name
  LIMIT 1
) ds_direct ON true
LEFT JOIN LATERAL (
  SELECT ds.id, ds.faction_id FROM wh_unit_aliases ua
  JOIN wh_datasheets ds ON ds.id = ua.datasheet_id
  WHERE ua.normalized = lu.normalized_name
  LIMIT 1
) ds_alias ON true;
