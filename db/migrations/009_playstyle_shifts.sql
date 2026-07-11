-- 009_playstyle_shifts.sql
-- Per-detachment and per-faction playstyle shift vectors. Numeric features
-- authored by an LLM reading rule-text, used as informative priors on
-- hierarchical Bayesian random effects in the matchup model.
--
-- Eight axes, agreed via game/stats expert review:
--   mobility, durability, shooting_potency, melee_potency,
--   control, action_economy, trade, debuff
-- Range: -1.0 to +1.0. Same axes for both tables so a list's effective
-- shift = faction_shift + detachment_shift component-wise.
--
-- Provenance fields are load-bearing — the matchup model pins to a fixed
-- prompt_version, and re-scoring is a deliberate versioned event with
-- Procrustes alignment between old and new vectors.

CREATE TABLE IF NOT EXISTS wh_detachment_shifts (
  detachment_id          TEXT PRIMARY KEY REFERENCES wh_detachments(id) ON DELETE CASCADE,
  mobility_shift         NUMERIC(4,3) NOT NULL,
  durability_shift       NUMERIC(4,3) NOT NULL,
  shooting_potency_shift NUMERIC(4,3) NOT NULL,
  melee_potency_shift    NUMERIC(4,3) NOT NULL,
  control_shift          NUMERIC(4,3) NOT NULL,
  action_economy_shift   NUMERIC(4,3) NOT NULL,
  trade_shift            NUMERIC(4,3) NOT NULL,
  debuff_shift           NUMERIC(4,3) NOT NULL,
  rationale              TEXT,                         -- LLM's short justification
  model_version          TEXT NOT NULL,                -- e.g. "an-llm-model"
  prompt_version         TEXT NOT NULL,                -- our hash/tag of the prompt
  scored_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT shifts_in_range CHECK (
    mobility_shift         BETWEEN -1.0 AND 1.0 AND
    durability_shift       BETWEEN -1.0 AND 1.0 AND
    shooting_potency_shift BETWEEN -1.0 AND 1.0 AND
    melee_potency_shift    BETWEEN -1.0 AND 1.0 AND
    control_shift          BETWEEN -1.0 AND 1.0 AND
    action_economy_shift   BETWEEN -1.0 AND 1.0 AND
    trade_shift            BETWEEN -1.0 AND 1.0 AND
    debuff_shift           BETWEEN -1.0 AND 1.0
  )
);
CREATE INDEX IF NOT EXISTS idx_wh_det_shifts_prompt ON wh_detachment_shifts(prompt_version);

CREATE TABLE IF NOT EXISTS wh_faction_shifts (
  faction_id             TEXT PRIMARY KEY REFERENCES wh_factions(id) ON DELETE CASCADE,
  mobility_shift         NUMERIC(4,3) NOT NULL,
  durability_shift       NUMERIC(4,3) NOT NULL,
  shooting_potency_shift NUMERIC(4,3) NOT NULL,
  melee_potency_shift    NUMERIC(4,3) NOT NULL,
  control_shift          NUMERIC(4,3) NOT NULL,
  action_economy_shift   NUMERIC(4,3) NOT NULL,
  trade_shift            NUMERIC(4,3) NOT NULL,
  debuff_shift           NUMERIC(4,3) NOT NULL,
  rationale              TEXT,
  model_version          TEXT NOT NULL,
  prompt_version         TEXT NOT NULL,
  scored_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT faction_shifts_in_range CHECK (
    mobility_shift         BETWEEN -1.0 AND 1.0 AND
    durability_shift       BETWEEN -1.0 AND 1.0 AND
    shooting_potency_shift BETWEEN -1.0 AND 1.0 AND
    melee_potency_shift    BETWEEN -1.0 AND 1.0 AND
    control_shift          BETWEEN -1.0 AND 1.0 AND
    action_economy_shift   BETWEEN -1.0 AND 1.0 AND
    trade_shift            BETWEEN -1.0 AND 1.0 AND
    debuff_shift           BETWEEN -1.0 AND 1.0
  )
);
CREATE INDEX IF NOT EXISTS idx_wh_fac_shifts_prompt ON wh_faction_shifts(prompt_version);

-- Audit log of every score event. Rationale + raw response saved for
-- coherence checks and Procrustes alignment between prompt versions.
CREATE TABLE IF NOT EXISTS wh_shift_score_runs (
  id              SERIAL PRIMARY KEY,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ,
  scope           TEXT NOT NULL,           -- 'detachments' | 'factions'
  model_version   TEXT NOT NULL,
  prompt_version  TEXT NOT NULL,
  n_targets       INT,
  n_succeeded     INT,
  n_failed        INT,
  notes           TEXT
);
