-- 003_player_ratings.sql
-- Output tables for the joint Bayesian hierarchical rating model
-- (pipeline/rating.py). Owner: Python pipeline layer.
--
-- The Python script TRUNCATEs and INSERTs each fit. Tables are migration-
-- defined (not dbt-materialized) because the schema is fixed and the writer
-- is Python, not dbt.

CREATE TABLE player_ratings (
  user_id          TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  n_games          INT  NOT NULL,
  skill_mean       REAL NOT NULL,        -- logit-scale: 0 = average pilot
  skill_std        REAL NOT NULL,
  skill_lo90       REAL NOT NULL,        -- 5th  percentile of posterior
  skill_hi90       REAL NOT NULL,        -- 95th percentile of posterior
  skill_score      REAL NOT NULL,        -- sigmoid(skill_mean), [0, 1] for game_weights
  fitted_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  model_version    TEXT NOT NULL,        -- e.g. 'bt-hierarchical-v1'
  ingest_version   INT  NOT NULL DEFAULT 1
);

CREATE INDEX idx_player_ratings_skill_mean ON player_ratings (skill_mean DESC);
CREATE INDEX idx_player_ratings_n_games    ON player_ratings (n_games DESC);

CREATE TABLE faction_effects (
  faction_id       TEXT PRIMARY KEY REFERENCES factions(id) ON DELETE CASCADE,
  effect_mean      REAL NOT NULL,        -- logit-scale, centered at 0
  effect_std       REAL NOT NULL,
  effect_lo90      REAL NOT NULL,
  effect_hi90      REAL NOT NULL,
  n_games          INT  NOT NULL,
  fitted_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  model_version    TEXT NOT NULL,
  ingest_version   INT  NOT NULL DEFAULT 1
);

-- Diagnostic table — one row per fit. MCMC convergence checks live here.
CREATE TABLE rating_model_runs (
  id                 SERIAL PRIMARY KEY,
  model_version      TEXT NOT NULL,
  fitted_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  n_games_used       INT  NOT NULL,
  n_users            INT  NOT NULL,
  n_factions         INT  NOT NULL,
  n_samples          INT  NOT NULL,
  n_warmup           INT  NOT NULL,
  n_chains           INT  NOT NULL,
  max_rhat           REAL,                -- > 1.01 = poor convergence
  min_ess            REAL,                -- effective sample size, lower bound
  divergences        INT,                 -- NUTS divergent transitions
  duration_seconds   REAL,
  data_window_start  DATE,
  notes              TEXT
);
