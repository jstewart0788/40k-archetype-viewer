-- 007_detachment_reference.sql
-- Detachment-tier the datasheet reference data: detachments, their abilities, stratagems
-- and enhancements. Lets us derive list-level "detachment archetype" features
-- (does this detachment lean melee/ranged, fight-on-death, sustained, etc.)
-- and identify which enhancement strings on a list map to which actual rule.
--
-- Naming: same `wh_*` family as 006.

CREATE TABLE IF NOT EXISTS wh_detachments (
  id          TEXT PRIMARY KEY,
  faction_id  TEXT REFERENCES wh_factions(id),
  name        TEXT NOT NULL,
  legend      TEXT,
  type        TEXT,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wh_detachments_faction ON wh_detachments(faction_id);
CREATE INDEX IF NOT EXISTS idx_wh_detachments_name    ON wh_detachments(lower(name));

CREATE TABLE IF NOT EXISTS wh_detachment_abilities (
  id            TEXT PRIMARY KEY,
  faction_id    TEXT REFERENCES wh_factions(id),
  detachment_id TEXT REFERENCES wh_detachments(id) ON DELETE CASCADE,
  detachment    TEXT,                    -- name as text (some rows lack a fk)
  name          TEXT NOT NULL,
  legend        TEXT,
  description   TEXT
);
CREATE INDEX IF NOT EXISTS idx_wh_det_ab_detachment ON wh_detachment_abilities(detachment_id);

CREATE TABLE IF NOT EXISTS wh_stratagems (
  id            TEXT PRIMARY KEY,
  faction_id    TEXT REFERENCES wh_factions(id),
  detachment_id TEXT REFERENCES wh_detachments(id) ON DELETE CASCADE,
  detachment    TEXT,
  name          TEXT NOT NULL,
  cp_cost       INT,
  type          TEXT,                    -- 'Battle Tactic Stratagem' / 'Strategic Ploy' / etc.
  turn          TEXT,                    -- 'Your turn' / 'Either turn'
  phase         TEXT,                    -- 'Movement phase' / 'Fight phase' / ...
  legend        TEXT,
  description   TEXT
);
CREATE INDEX IF NOT EXISTS idx_wh_strat_detachment ON wh_stratagems(detachment_id);
CREATE INDEX IF NOT EXISTS idx_wh_strat_phase      ON wh_stratagems(phase);

CREATE TABLE IF NOT EXISTS wh_enhancements (
  id              TEXT PRIMARY KEY,
  faction_id      TEXT REFERENCES wh_factions(id),
  detachment_id   TEXT REFERENCES wh_detachments(id) ON DELETE CASCADE,
  detachment      TEXT,
  name            TEXT NOT NULL,
  normalized_name TEXT NOT NULL,         -- for matching list_enhancements text
  cost            INT,                   -- pts
  legend          TEXT,
  description     TEXT
);
CREATE INDEX IF NOT EXISTS idx_wh_enh_detachment ON wh_enhancements(detachment_id);
CREATE INDEX IF NOT EXISTS idx_wh_enh_norm       ON wh_enhancements(normalized_name);
