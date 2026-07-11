-- 006_datasheet_reference.sql
-- Datasheet stats imported from the datasheet reference CSV exports. Powers playstyle
-- features (mobility, durability, weapon range mix, anti-elite/horde profile)
-- which feed cross-faction list clustering and the matchup model.
--
-- Source: https://the datasheet reference/wh40k10ed/  (pipe-delimited CSVs)
-- Refresh per dataslate via scripts/fetch-the datasheet reference.sh.
--
-- Naming: `wh_*` to keep them clearly third-party-imported and prevent
-- collision with our extractor tables. Joining to list_units happens via
-- normalized_name (casefold + smart-quote → ascii + collapsed whitespace).

CREATE TABLE IF NOT EXISTS wh_factions (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  link  TEXT
);

CREATE TABLE IF NOT EXISTS wh_datasheets (
  id              TEXT PRIMARY KEY,         -- e.g. '000000882'
  name            TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  faction_id      TEXT REFERENCES wh_factions(id),
  source_id       TEXT,                     -- the datasheet reference source/codex id
  role            TEXT,                     -- Battleline | Other | Character | Epic Hero | Dedicated Transport | Allied | Fortification
  loadout_html    TEXT,
  is_transport    BOOLEAN NOT NULL DEFAULT FALSE,
  is_virtual      BOOLEAN NOT NULL DEFAULT FALSE,
  damaged_w       INT,
  damaged_text    TEXT,
  link            TEXT,
  imported_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wh_datasheets_norm    ON wh_datasheets(normalized_name);
CREATE INDEX IF NOT EXISTS idx_wh_datasheets_faction ON wh_datasheets(faction_id);

-- Per-(datasheet, sub-model) physical stats. A datasheet can have multiple
-- model lines (e.g. "Sergeant" vs "Marines" rows on a squad).
CREATE TABLE IF NOT EXISTS wh_models (
  datasheet_id   TEXT NOT NULL REFERENCES wh_datasheets(id) ON DELETE CASCADE,
  line           INT NOT NULL,
  name           TEXT NOT NULL,
  movement       INT,                        -- inches; NULL if not a model that moves (artillery, etc.)
  toughness      INT,
  save_armor     INT,                        -- 4 means 4+
  save_invuln    INT,                        -- 5 means 5++; NULL if none
  invuln_descr   TEXT,                       -- conditional invuln blurb
  wounds         INT,
  leadership     INT,
  oc             INT,
  base_size      TEXT,
  PRIMARY KEY (datasheet_id, line)
);

-- One row per weapon profile on a datasheet. Same datasheet can list a weapon
-- once (line) with multiple lines_in_wargear if the profile is multi-mode.
CREATE TABLE IF NOT EXISTS wh_wargear (
  datasheet_id    TEXT NOT NULL REFERENCES wh_datasheets(id) ON DELETE CASCADE,
  line            INT NOT NULL,
  line_in_wargear INT,
  dice            TEXT,
  name            TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  description     TEXT,                      -- ability text: "anti-infantry 4+, rapid fire 1, ..."
  abilities       JSONB NOT NULL DEFAULT '[]',-- parsed list of ability tokens (lowercase)
  weapon_type     TEXT NOT NULL CHECK (weapon_type IN ('ranged','melee')),
  range_inches    INT,                       -- NULL for melee
  attacks         TEXT,                      -- "3" or "D6" or "D6+1" — keep as text
  ws_bs           INT,                       -- nullable when "N/A"
  strength        INT,
  ap              INT,                       -- 0 or negative
  damage          TEXT,                      -- "2" or "D3+1"
  PRIMARY KEY (datasheet_id, line)
);
CREATE INDEX IF NOT EXISTS idx_wh_wargear_norm    ON wh_wargear(normalized_name);
CREATE INDEX IF NOT EXISTS idx_wh_wargear_dssht   ON wh_wargear(datasheet_id);
CREATE INDEX IF NOT EXISTS idx_wh_wargear_type    ON wh_wargear(weapon_type);
CREATE INDEX IF NOT EXISTS idx_wh_wargear_abilities_gin ON wh_wargear USING GIN (abilities jsonb_path_ops);

CREATE TABLE IF NOT EXISTS wh_keywords (
  datasheet_id        TEXT NOT NULL REFERENCES wh_datasheets(id) ON DELETE CASCADE,
  keyword             TEXT NOT NULL,
  model_constraint    TEXT,                  -- empty for whole-datasheet keywords
  is_faction_keyword  BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (datasheet_id, keyword, model_constraint)
);
CREATE INDEX IF NOT EXISTS idx_wh_keywords_keyword ON wh_keywords(keyword);

-- Datasheet-level abilities (Core / Faction / Datasheet). Powers signals
-- like "has Deep Strike", "has Stealth", "has Lone Operative" without
-- pattern-matching free-text descriptions.
CREATE TABLE IF NOT EXISTS wh_abilities (
  datasheet_id  TEXT NOT NULL REFERENCES wh_datasheets(id) ON DELETE CASCADE,
  line          INT NOT NULL,
  ability_id    TEXT,                        -- the datasheet reference's catalogue id (NULL for inline)
  model_constraint TEXT,
  name          TEXT,
  description   TEXT,
  ability_type  TEXT,                        -- Core | Faction | Datasheet | Wargear | ...
  parameter     TEXT,
  PRIMARY KEY (datasheet_id, line)
);
CREATE INDEX IF NOT EXISTS idx_wh_abilities_name ON wh_abilities(name);
CREATE INDEX IF NOT EXISTS idx_wh_abilities_type ON wh_abilities(ability_type);

-- Track import provenance. One row per ingest run.
CREATE TABLE IF NOT EXISTS wh_import_runs (
  id              SERIAL PRIMARY KEY,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ,
  source_url_base TEXT,
  files_imported  JSONB,                     -- {"Datasheets.csv": 1313, ...}
  notes           TEXT
);
