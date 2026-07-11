-- 002_pipeline_v2.sql
-- Schema additions for the JS-extractor → Postgres → dbt(rules) → Python(model) pipeline.
-- Driven by the three-agent review (game expert / stats expert / architect).
-- See projects/wh40k-meta/design.md for the rationale behind each block.

-- ── Dataslate version registry ────────────────────────────────────────────────
-- Promotes dataslate_version from free-text to a real table. Per-faction FAQ
-- discontinuities live here, not on events.

CREATE TABLE dataslate_versions (
  version            TEXT PRIMARY KEY,
  effective_from     DATE NOT NULL,
  superseded_at      DATE,
  faq_for_factions   JSONB NOT NULL DEFAULT '[]',  -- factions with mid-window FAQ shifts
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the data window's anchor.
INSERT INTO dataslate_versions (version, effective_from, notes)
VALUES (
  'november-2025-dataslate',
  '2025-11-01',
  'Data window opens here per design doc — meaningful meta shift. The March 2026 dataslate barely changed anything; do not re-anchor.'
);

-- Wire existing dataslate_version columns to the registry.
ALTER TABLE events
  ADD CONSTRAINT fk_events_dataslate
  FOREIGN KEY (dataslate_version) REFERENCES dataslate_versions(version)
  ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE archetypes
  ADD CONSTRAINT fk_archetypes_dataslate
  FOREIGN KEY (dataslate_version) REFERENCES dataslate_versions(version)
  ON UPDATE CASCADE;

ALTER TABLE faction_matchup_stats
  ADD CONSTRAINT fk_fms_dataslate
  FOREIGN KEY (dataslate_version) REFERENCES dataslate_versions(version)
  ON UPDATE CASCADE;

ALTER TABLE archetype_matchup_stats
  ADD CONSTRAINT fk_ams_dataslate
  FOREIGN KEY (dataslate_version) REFERENCES dataslate_versions(version)
  ON UPDATE CASCADE;

ALTER TABLE faction_player_flux
  ADD CONSTRAINT fk_fpf_dataslate
  FOREIGN KEY (dataslate_version) REFERENCES dataslate_versions(version)
  ON UPDATE CASCADE;

-- ── ingest_version: replay marker for normalization-bug recovery ──────────────
-- Bumped in extractor code when normalization changes. Lets the analysis layer
-- pin to a known-good version while a backfill is in flight.

ALTER TABLE games       ADD COLUMN ingest_version INT NOT NULL DEFAULT 1;
ALTER TABLE players     ADD COLUMN ingest_version INT NOT NULL DEFAULT 1;
ALTER TABLE lists       ADD COLUMN ingest_version INT NOT NULL DEFAULT 1;
ALTER TABLE list_units  ADD COLUMN ingest_version INT NOT NULL DEFAULT 1;

-- ── Denormalize hot read columns onto games ───────────────────────────────────
-- The matchup query path is games × players × events filtered by date+tier.
-- These values are immutable post-game; no consistency hazard.

ALTER TABLE games
  ADD COLUMN event_date    TIMESTAMPTZ,
  ADD COLUMN p1_user_id    TEXT REFERENCES users(id),
  ADD COLUMN p1_faction_id TEXT REFERENCES factions(id),
  ADD COLUMN p2_user_id    TEXT REFERENCES users(id),
  ADD COLUMN p2_faction_id TEXT REFERENCES factions(id);

-- ── Mission / deployment metadata (game-expert top finding) ───────────────────
-- VP margin distributions are dominated by mission interaction (~15-20pt swings).
-- Pooling across mission packs without these columns inflates regression noise
-- and pushes archetype matchup cells artificially toward 50%.

ALTER TABLE events
  ADD COLUMN mission_pack TEXT;        -- 'Pariah Nexus', 'WTC 2026', 'GW Leviathan', etc.

ALTER TABLE games
  ADD COLUMN primary_mission   TEXT,   -- 'Take and Hold', 'Scorched Earth', ...
  ADD COLUMN deployment_map    TEXT,   -- 'Hammer and Anvil', 'Search and Destroy', ...
  ADD COLUMN secondaries_pack  TEXT;   -- 'fixed' | 'tactical' | 'kill' (upstream/event format)

-- ── Concession typology (game-expert: tabling vs time-out are different signals) ─
-- Existing `concession BOOLEAN` stays for the simple case. concession_type adds
-- the ceiling-vs-attrition signal that horde armies systematically lose to.

ALTER TABLE games
  ADD COLUMN concession_type TEXT
    CHECK (concession_type IS NULL
        OR concession_type IN ('tabled','time','sportsmanship','dropped','none'));

-- ── List hash split: structural vs full-equipment ─────────────────────────────
-- Two lists differing only in enhancement allocation play very differently.
-- Clustering wants units-only similarity; audit/dedup wants exact match.

ALTER TABLE lists RENAME COLUMN list_hash TO list_hash_units;
ALTER TABLE lists ADD COLUMN list_hash_full TEXT;

DROP INDEX idx_lists_hash;
CREATE        INDEX idx_lists_hash_units ON lists (list_hash_units);
CREATE UNIQUE INDEX idx_lists_hash_full_done
  ON lists (list_hash_full) WHERE parse_status = 'done';

-- ── game_weights: materialized rule-layer weights ────────────────────────────
-- recency_basis_date stamps the query basis: a query at 03:00 returns the
-- same numbers as one at 23:00 because both join the same basis row.
-- Recomputed nightly by the dbt rules layer.

CREATE TABLE game_weights (
  game_id              TEXT PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  recency_basis_date   DATE NOT NULL,
  event_quality_w      REAL,            -- top-quartile-skill derived weight (event-level)
  recency_w            REAL,            -- piecewise-or-GAM(weeks_ago); model-layer choice
  opponent_skill_w_p1  REAL,            -- weight scaling p1's result by p2's skill
  opponent_skill_w_p2  REAL,
  combined_w_p1        REAL,            -- multiplicative product used in matchup SUM
  combined_w_p2        REAL,
  ingest_version       INT NOT NULL DEFAULT 1,
  computed_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_game_weights_basis ON game_weights (recency_basis_date);

-- ── pipeline_run_log: cross-job run history with git_sha ─────────────────────
-- data_ingestion_log covers extraction only. Every dbt invocation, Python job,
-- and orchestrator wrapper writes here. git_sha is load-bearing for "why did
-- last Tuesday's matchup matrix look weird."

CREATE TABLE pipeline_run_log (
  id              SERIAL PRIMARY KEY,
  job_name        TEXT NOT NULL,                   -- 'extract', 'dbt:rules', 'dbt:agg', 'pipeline.archetype_cluster'
  git_sha         TEXT,
  status          TEXT NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running','succeeded','failed','cancelled')),
  rows_affected   BIGINT,
  params          JSONB NOT NULL DEFAULT '{}',
  error           TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ
);

CREATE INDEX idx_pipeline_run_log_job_started ON pipeline_run_log (job_name, started_at DESC);

-- ── Index changes: drop redundant, add the analysis-path covers ──────────────
-- idx_games_event_round duplicates idx_games_done minus the partial filter.
-- Postgres will pick the wrong one half the time.

DROP INDEX idx_games_event_round;

CREATE INDEX idx_games_done_event_round
  ON games (event_id, round) WHERE is_done;

-- Covering index: matchup queries hit (user_id, faction_id, list_id, skill) per player_id.
-- INCLUDE avoids the heap fetch.
CREATE INDEX idx_players_event_cover
  ON players (event_id)
  INCLUDE (user_id, faction_id, list_id, skill_score_at_event);

-- 12-month / games-in-window gate scans this; partial filter cuts the tail.
CREATE INDEX idx_users_active_partial
  ON users (last_active_date) WHERE active_player;

-- Denormalized join keys on games: index for the analysis-layer paths.
CREATE INDEX idx_games_event_date  ON games (event_date);
CREATE INDEX idx_games_p1_user     ON games (p1_user_id);
CREATE INDEX idx_games_p2_user     ON games (p2_user_id);
CREATE INDEX idx_games_p1_faction  ON games (p1_faction_id);
CREATE INDEX idx_games_p2_faction  ON games (p2_faction_id);

-- Mission-pack lookup for within-pack VP normalization (stats-expert).
CREATE INDEX idx_events_mission_pack ON events (mission_pack);
