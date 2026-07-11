-- 012_canonical_views.sql
-- Canonical-name views over the alias tables introduced in 011_aliases.sql.
-- Downstream consumers (dbt models, Python pipeline scripts) query these
-- views instead of joining to wh_datasheets / wh_detachments directly so
-- alias-resolved names participate in the join automatically.

-- v_list_units_canonical
-- ─────────────────────────
-- For each list_units row, resolve to a canonical wh_datasheets row by
-- either direct normalized_name match, or via wh_unit_aliases.
--
-- Columns:
--   list_id, raw_name, normalized_name, squad_idx, n_models, points,
--     is_leader, unit_role  — passthrough from list_units
--   canonical_datasheet_id  — wh_datasheets.id, or NULL if no resolution
--   canonical_faction_id    — wh_datasheets.faction_id of the resolved row
--   alias_source            — 'direct' (name matched a datasheet directly)
--                            | 'alias' (matched via wh_unit_aliases)
--                            | NULL (still unresolved — typo / missing)

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
LEFT JOIN wh_datasheets ds_direct
  ON ds_direct.normalized_name = lu.normalized_name
LEFT JOIN wh_unit_aliases ua
  ON ua.normalized = lu.normalized_name
LEFT JOIN wh_datasheets ds_alias
  ON ds_alias.id = ua.datasheet_id;

COMMENT ON VIEW v_list_units_canonical IS
  'list_units rows resolved to canonical wh_datasheets via direct match or wh_unit_aliases. Use instead of joining to wh_datasheets directly so alias-resolved units participate in the join.';


-- v_lists_with_wh_faction
-- ─────────────────────────
-- For each list, resolve the player's upstream faction to a the datasheet reference faction id
-- via faction_bridge. Marines chapters all collapse to SM. Catch-all
-- factions (Chaos, Imperium, Xenos) are excluded — they don't bridge.

CREATE OR REPLACE VIEW v_lists_with_wh_faction AS
SELECT
  l.id                AS list_id,
  l.detachment_id,
  l.parse_status,
  l.points_total,
  p.faction_id        AS source_faction_id,
  fb.wh_faction_id    AS wh_faction_id,
  f.name              AS source_faction_name
FROM lists l
LEFT JOIN players p ON p.list_id = l.id
LEFT JOIN factions f ON f.id = p.faction_id
LEFT JOIN faction_bridge fb ON fb.source_faction_id = p.faction_id;

COMMENT ON VIEW v_lists_with_wh_faction IS
  'lists joined to player.faction_id and bridged to wh_factions.id. wh_faction_id is NULL for catch-all factions (Chaos, Imperium, Xenos).';
