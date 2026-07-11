-- 001_initial_schema.sql
-- WH40K Meta Analysis — initial schema
-- Postgres 16

-- ── Migration tracking ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS schema_migrations (
  id          SERIAL PRIMARY KEY,
  filename    TEXT NOT NULL UNIQUE,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Reference tables ──────────────────────────────────────────────────────────

CREATE TABLE factions (
  id                   TEXT PRIMARY KEY,
  name                 TEXT NOT NULL,
  parent_faction_id    TEXT REFERENCES factions(id),
  parent_faction_name  TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE detachments (
  id          TEXT PRIMARY KEY,
  faction_id  TEXT REFERENCES factions(id),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Core entities ─────────────────────────────────────────────────────────────

CREATE TABLE users (
  id                  TEXT PRIMARY KEY,
  first_name          TEXT,
  last_name           TEXT,
  games_played_total  INT NOT NULL DEFAULT 0,
  first_event_date    DATE,
  last_active_date    DATE,
  active_player       BOOLEAN NOT NULL DEFAULT false,
  elo_reliable        BOOLEAN NOT NULL DEFAULT false, -- games_played >= 20 AND active
  elo_history         JSONB NOT NULL DEFAULT '[]',    -- [{date, skill_score, event_id}]
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id                   TEXT PRIMARY KEY,
  name                 TEXT NOT NULL,
  event_date           TIMESTAMPTZ,
  event_end_date       TIMESTAMPTZ,
  city                 TEXT,
  state                TEXT,
  country              TEXT,
  total_players        INT,
  checked_in           INT,
  dropped              INT,
  rounds               INT,
  is_online            BOOLEAN NOT NULL DEFAULT false,
  hide_lists           BOOLEAN NOT NULL DEFAULT false,
  lists_required       BOOLEAN,
  tier                 TEXT,                           -- 'GT','major','RTT','narrative'
  format               TEXT,                           -- '2000pts','1750pts'
  scoring_system       TEXT,
  vp_max               INT,                            -- scoring ceiling for normalization
  top_cut_size         INT,
  top_cut_avg_skill    REAL,
  top_quartile_skill   REAL,                           -- event quality weight signal
  dataslate_version    TEXT,
  faq_flags            JSONB NOT NULL DEFAULT '[]',    -- faction codes with active FAQ changes
  leagues              JSONB NOT NULL DEFAULT '[]',    -- [{id,name,itc}]
  round_timestamps     JSONB NOT NULL DEFAULT '{}',    -- {round: {started, ended}}
  game_system_id       TEXT,
  fetched_at           TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE players (
  id                     TEXT PRIMARY KEY,
  user_id                TEXT REFERENCES users(id),
  event_id               TEXT NOT NULL REFERENCES events(id),
  faction_id             TEXT REFERENCES factions(id),
  list_id                TEXT,                         -- FK to lists added after lists table
  dropped                BOOLEAN NOT NULL DEFAULT false,
  checked_in             BOOLEAN NOT NULL DEFAULT false,
  final_standing         INT,
  overall_standing       INT,
  final_record_w         INT NOT NULL DEFAULT 0,
  final_record_l         INT NOT NULL DEFAULT 0,
  final_record_d         INT NOT NULL DEFAULT 0,
  made_top_cut           BOOLEAN NOT NULL DEFAULT false,
  bye_rounds             JSONB NOT NULL DEFAULT '[]',  -- [round_number, ...]
  skill_score_at_event   REAL,                         -- derived skill proxy at event time
  battle_points_total    INT,
  margin_of_victory_total INT,
  strength_of_schedule   REAL,                         -- magic_match_percentage_sos
  overall_score          INT,
  metrics                JSONB NOT NULL DEFAULT '{}',  -- raw upstream metrics object
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_id)
);

CREATE TABLE games (
  id                   TEXT PRIMARY KEY,
  event_id             TEXT NOT NULL REFERENCES events(id),
  round                INT NOT NULL,
  table_num            INT,
  is_done              BOOLEAN NOT NULL DEFAULT false,
  game_type            TEXT NOT NULL DEFAULT 'swiss'
                         CHECK (game_type IN ('swiss','top_cut','bye','concession')),
  concession           BOOLEAN NOT NULL DEFAULT false,
  vp_max               INT,                            -- event ceiling for this game
  p1_player_id         TEXT REFERENCES players(id),
  p2_player_id         TEXT REFERENCES players(id),
  p1_vp                INT,
  p2_vp                INT,
  p1_margin            INT,                            -- p1_vp - p2_vp (app-enforced)
  p2_margin            INT,                            -- p2_vp - p1_vp (app-enforced)
  p1_vp_normalized     REAL,                           -- p1_vp / vp_max
  p2_vp_normalized     REAL,
  margin_normalized    REAL,                           -- (p1_vp - p2_vp) / vp_max
  p1_result            SMALLINT CHECK (p1_result IN (0,1,2)), -- 2=win,1=draw,0=loss
  p2_result            SMALLINT CHECK (p2_result IN (0,1,2)),
  p1_first_turn        BOOLEAN,
  p2_first_turn        BOOLEAN,
  p1_record_entering   TEXT,                           -- '3-0-0' entering this round
  p2_record_entering   TEXT,
  scorecard_id         TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Round-by-round VP (if upstream exposes it; sparse in practice)
CREATE TABLE game_rounds (
  id                   SERIAL PRIMARY KEY,
  game_id              TEXT NOT NULL REFERENCES games(id),
  round_number         INT NOT NULL,
  p1_vp_this_round     INT,
  p2_vp_this_round     INT,
  p1_vp_cumulative     INT,
  p2_vp_cumulative     INT,
  UNIQUE (game_id, round_number)
);

-- ── Army lists ────────────────────────────────────────────────────────────────

CREATE TABLE unit_catalog (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  faction_id  TEXT REFERENCES factions(id),
  unit_type   TEXT,
  keywords    JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE unit_points_history (
  id                  SERIAL PRIMARY KEY,
  unit_id             INT NOT NULL REFERENCES unit_catalog(id),
  dataslate_version   TEXT NOT NULL,
  points_per_model    INT,
  unit_size_min       INT,
  unit_size_max       INT,
  effective_from      DATE,
  UNIQUE (unit_id, dataslate_version)
);

CREATE TABLE unit_aliases (
  id            SERIAL PRIMARY KEY,
  alias         TEXT NOT NULL UNIQUE,
  canonical_id  INT REFERENCES unit_catalog(id),
  source        TEXT NOT NULL DEFAULT 'auto'
                  CHECK (source IN ('auto','manual','reviewed')),
  confidence    REAL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE lists (
  id                TEXT PRIMARY KEY,
  player_id         TEXT NOT NULL UNIQUE REFERENCES players(id),
  event_id          TEXT NOT NULL REFERENCES events(id),
  faction_id        TEXT REFERENCES factions(id),
  detachment_id     TEXT REFERENCES detachments(id),
  raw_text          TEXT,
  list_hash         TEXT,                              -- SHA256 of normalized composition
  points_total      INT,
  points_delta      INT,                              -- raw - format limit (flags errors)
  unit_count        INT,
  leader_count      INT,
  parse_status      TEXT NOT NULL DEFAULT 'pending'
                      CHECK (parse_status IN ('pending','done','failed','no_list')),
  parse_confidence  REAL,
  list_status       TEXT,                             -- upstream listStatus field ('passed', etc.)
  archived          BOOLEAN NOT NULL DEFAULT false,
  submitted_at      TIMESTAMPTZ,
  fetched_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Now that lists exists, add FK from players.list_id
ALTER TABLE players ADD CONSTRAINT fk_players_list
  FOREIGN KEY (list_id) REFERENCES lists(id);

CREATE TABLE list_units (
  id                  SERIAL PRIMARY KEY,
  list_id             TEXT NOT NULL REFERENCES lists(id),
  raw_name            TEXT NOT NULL,
  normalized_name     TEXT,
  unit_catalog_id     INT REFERENCES unit_catalog(id),
  quantity            INT NOT NULL DEFAULT 1,
  points              INT,
  is_leader           BOOLEAN NOT NULL DEFAULT false,
  attached_to_unit_id INT REFERENCES list_units(id),
  enhancements        JSONB NOT NULL DEFAULT '[]',
  match_confidence    REAL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Clustering / archetypes ───────────────────────────────────────────────────

CREATE TABLE archetypes (
  id                 SERIAL PRIMARY KEY,
  faction_id         TEXT REFERENCES factions(id),
  detachment_id      TEXT REFERENCES detachments(id),
  name               TEXT,
  nmf_components     JSONB,
  medoid_list_id     TEXT REFERENCES lists(id),
  cluster_method     TEXT,                            -- 'nmf','hdbscan','knn_fallback'
  stability_score    REAL,                            -- Adjusted Rand Index
  dataslate_version  TEXT,
  active             BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE list_archetypes (
  list_id               TEXT NOT NULL REFERENCES lists(id),
  archetype_id          INT NOT NULL REFERENCES archetypes(id),
  assignment_confidence REAL,
  nmf_mixture           JSONB,                        -- soft membership vector
  PRIMARY KEY (list_id, archetype_id)
);

-- ── Materialized aggregation tables ──────────────────────────────────────────

CREATE TABLE faction_matchup_stats (
  id                      SERIAL PRIMARY KEY,
  faction_a_id            TEXT NOT NULL REFERENCES factions(id),
  faction_b_id            TEXT NOT NULL REFERENCES factions(id),
  game_type               TEXT NOT NULL DEFAULT 'all',
  dataslate_version       TEXT NOT NULL,
  n_games                 INT NOT NULL DEFAULT 0,
  n_wins_a                INT NOT NULL DEFAULT 0,
  sum_margin_a            REAL NOT NULL DEFAULT 0,
  sum_sq_margin_a         REAL NOT NULL DEFAULT 0,    -- for running variance (Welford)
  weighted_win_rate       REAL,
  win_rate_lower_ci       REAL,
  win_rate_upper_ci       REAL,
  meets_display_threshold BOOLEAN NOT NULL DEFAULT false, -- n_games >= 30
  computed_at             TIMESTAMPTZ,
  UNIQUE (faction_a_id, faction_b_id, game_type, dataslate_version)
);

CREATE TABLE archetype_matchup_stats (
  archetype_a_id          INT NOT NULL REFERENCES archetypes(id),
  archetype_b_id          INT NOT NULL REFERENCES archetypes(id),
  game_type               TEXT NOT NULL DEFAULT 'all',
  dataslate_version       TEXT NOT NULL,
  n_games                 INT NOT NULL DEFAULT 0,
  n_wins_a                INT NOT NULL DEFAULT 0,
  sum_margin_a            REAL NOT NULL DEFAULT 0,
  sum_sq_margin_a         REAL NOT NULL DEFAULT 0,
  weighted_win_rate       REAL,
  win_rate_lower_ci       REAL,
  win_rate_upper_ci       REAL,
  meets_display_threshold BOOLEAN NOT NULL DEFAULT false,
  computed_at             TIMESTAMPTZ,
  PRIMARY KEY (archetype_a_id, archetype_b_id, game_type, dataslate_version)
);

CREATE TABLE player_career_stats (
  user_id             TEXT PRIMARY KEY REFERENCES users(id),
  games_played        INT NOT NULL DEFAULT 0,
  events_played       INT NOT NULL DEFAULT 0,
  overall_win_rate    REAL,
  weighted_win_rate   REAL,
  avg_vp_margin       REAL,
  vp_margin_stddev    REAL,
  consistency_score   REAL,
  recent_form_3ev     REAL,                           -- last 3 events win rate
  faction_entropy     REAL,
  primary_faction_id  TEXT REFERENCES factions(id),
  skill_percentile    REAL,
  computed_at         TIMESTAMPTZ
);

CREATE TABLE meta_share_by_week (
  id               SERIAL PRIMARY KEY,
  faction_id       TEXT NOT NULL REFERENCES factions(id),
  archetype_id     INT REFERENCES archetypes(id),
  week_start       DATE NOT NULL,
  event_count      INT NOT NULL DEFAULT 0,
  player_count     INT NOT NULL DEFAULT 0,
  list_count       INT NOT NULL DEFAULT 0,
  meta_share       REAL,
  win_rate_that_week REAL,
  UNIQUE (faction_id, archetype_id, week_start)
);

CREATE TABLE faction_player_flux (
  faction_id          TEXT NOT NULL REFERENCES factions(id),
  dataslate_version   TEXT NOT NULL,
  week_start          DATE NOT NULL,
  new_players         INT NOT NULL DEFAULT 0,
  returning_players   INT NOT NULL DEFAULT 0,
  leaving_players     INT NOT NULL DEFAULT 0,
  avg_skill_new       REAL,
  avg_skill_returning REAL,
  PRIMARY KEY (faction_id, dataslate_version, week_start)
);

-- ── Operational ───────────────────────────────────────────────────────────────

CREATE TABLE data_ingestion_log (
  id               SERIAL PRIMARY KEY,
  batch_id         TEXT,
  source_api       TEXT,
  event_id         TEXT,
  records_fetched  INT NOT NULL DEFAULT 0,
  records_inserted INT NOT NULL DEFAULT 0,
  records_skipped  INT NOT NULL DEFAULT 0,
  errors           JSONB NOT NULL DEFAULT '[]',
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at      TIMESTAMPTZ
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX idx_events_date             ON events (event_date);
CREATE INDEX idx_events_tier_date        ON events (tier, event_date);
CREATE INDEX idx_players_user_event      ON players (user_id, event_id);
CREATE INDEX idx_players_event           ON players (event_id);
CREATE INDEX idx_users_active            ON users (active_player, last_active_date);
CREATE INDEX idx_games_event_round       ON games (event_id, round);
CREATE INDEX idx_games_players           ON games (p1_player_id, p2_player_id);
CREATE INDEX idx_games_done              ON games (event_id, is_done);
CREATE INDEX idx_lists_faction_det       ON lists (faction_id, detachment_id, parse_status);
CREATE INDEX idx_lists_hash              ON lists (list_hash);
CREATE INDEX idx_list_units_normalized   ON list_units (normalized_name, list_id);
CREATE INDEX idx_list_units_list         ON list_units (list_id);
CREATE INDEX idx_unit_aliases_alias      ON unit_aliases (alias);
CREATE INDEX idx_faction_matchup         ON faction_matchup_stats (faction_a_id, faction_b_id, game_type, dataslate_version);
CREATE INDEX idx_meta_share_week         ON meta_share_by_week (week_start, faction_id);
