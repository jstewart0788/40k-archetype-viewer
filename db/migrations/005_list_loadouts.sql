-- 005_list_loadouts.sql
-- Per-squad row semantics for list_units + dedicated enhancements table +
-- parser provenance tracking + 'llm_pending' parse status.
--
-- Row shape decision (from the three-agent review): one row per squad.
-- Aggregations to (list_id, datasheet) grain come from a dbt window view
-- (m_list_unit_agg). Per-squad rows let loadout-aware queries be clean
-- joins rather than JSONB-unnest gymnastics, and the (list × datasheet)
-- feature matrix for NMF is one SELECT DISTINCT off the view.

-- ── list_units: shift to per-squad rows ─────────────────────────────────────

ALTER TABLE list_units
  DROP COLUMN quantity,                                  -- ambiguous semantics under the old design
  DROP COLUMN enhancements,                              -- moved to list_enhancements
  ADD COLUMN squad_idx       INT  NOT NULL DEFAULT 0,    -- 0-indexed within (list_id, normalized_name)
  ADD COLUMN n_models        INT,                        -- total models in this squad
  ADD COLUMN unit_role       TEXT,                       -- 'character'|'battleline'|'vehicle'|'monster'|'infantry'|'mounted'|'fortification'
  ADD COLUMN weapons         JSONB NOT NULL DEFAULT '[]',  -- weapon names this squad carries
  ADD COLUMN equipment       JSONB NOT NULL DEFAULT '[]',  -- non-weapon wargear: wings, multi-trackers, halos, drones
  ADD COLUMN sub_models      JSONB NOT NULL DEFAULT '[]',  -- [{name, count, weapons:[], equipment:[]}, ...]
  ADD COLUMN parser_version  INT  NOT NULL DEFAULT 1,
  ADD COLUMN parse_method    TEXT NOT NULL DEFAULT 'regex'
                                   CHECK (parse_method IN ('regex','llm','manual')),
  ADD COLUMN parsed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD CONSTRAINT list_units_weapons_array    CHECK (jsonb_typeof(weapons)    = 'array'),
  ADD CONSTRAINT list_units_equipment_array  CHECK (jsonb_typeof(equipment)  = 'array'),
  ADD CONSTRAINT list_units_sub_models_array CHECK (jsonb_typeof(sub_models) = 'array');

COMMENT ON TABLE list_units IS
  'One row per squad. Aggregations to (list_id, datasheet) grain come from m_list_unit_agg dbt view.';
COMMENT ON COLUMN list_units.squad_idx       IS '0-indexed position of this squad within (list_id, normalized_name).';
COMMENT ON COLUMN list_units.n_models        IS 'Total models in this squad. Sum of sub_models[*].count.';
COMMENT ON COLUMN list_units.weapons         IS 'Weapons carried by this squad (e.g. ["plasma rifle","missile pod"]).';
COMMENT ON COLUMN list_units.equipment       IS 'Non-weapon wargear (wings, multi-tracker, shield generator, halo). Distinct from weapons because Sunforge vs Fireknife Crisis is partly an equipment swap.';
COMMENT ON COLUMN list_units.sub_models      IS '[{name, count, weapons:[], equipment:[]}] per-sub-model breakdown.';
COMMENT ON COLUMN list_units.parse_method    IS 'How this row was produced: regex parser, LLM fallback, or manual.';

-- Re-create the FK with ON DELETE CASCADE so re-parse can safely DELETE+INSERT.
ALTER TABLE list_units DROP CONSTRAINT list_units_list_id_fkey;
ALTER TABLE list_units ADD CONSTRAINT list_units_list_id_fkey
  FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE;

-- GIN indexes for filter queries: "lists with melta", "lists with wings"
CREATE INDEX idx_list_units_weapons   ON list_units USING GIN (weapons   jsonb_path_ops);
CREATE INDEX idx_list_units_equipment ON list_units USING GIN (equipment jsonb_path_ops);
CREATE INDEX idx_list_units_role      ON list_units (unit_role);

-- ── list_enhancements: dedicated relational table ───────────────────────────

CREATE TABLE list_enhancements (
  id               SERIAL PRIMARY KEY,
  list_id          TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  list_unit_id     INT  REFERENCES list_units(id) ON DELETE SET NULL,  -- which character carries it (when known)
  enhancement_name TEXT NOT NULL,
  normalized_name  TEXT,                              -- casefolded for joins
  points           INT,
  parser_version   INT NOT NULL DEFAULT 1,
  parsed_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_list_enh_list ON list_enhancements (list_id);
CREATE INDEX idx_list_enh_name ON list_enhancements (normalized_name);

COMMENT ON TABLE list_enhancements IS
  'One row per enhancement taken on a character. Detachment-level analysis "what % of Custodes Shield Host lists run X enhancement" reads from here.';

-- ── lists.parse_status: add llm_pending ────────────────────────────────────

ALTER TABLE lists DROP CONSTRAINT lists_parse_status_check;
ALTER TABLE lists ADD CONSTRAINT lists_parse_status_check
  CHECK (parse_status IN ('pending', 'done', 'failed', 'no_list', 'llm_pending'));
