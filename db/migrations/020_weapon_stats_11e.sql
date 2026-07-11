-- 020_weapon_stats_11e.sql
-- 11th-edition weapon catalog (S/AP/D/range/attacks/skill + keywords), extracted
-- from the community catalog JSON. The 10th equivalent is wh_wargear.
--
-- In this pipeline the weapons parsed from each list are primary; this catalog is
-- the reference used to enrich them (a parsed weapon name → its AP/strength and
-- keywords like Devastating Wounds / Lethal Hits / Sustained Hits), and a
-- fallback for datasheet-default loadouts. Edition-scoped, keyed by normalized
-- name; a weapon appears on many datasheets so rows are deduped to distinct
-- (type, name).

CREATE TABLE wh_weapon_stats (
  id               TEXT PRIMARY KEY,
  edition          TEXT NOT NULL REFERENCES editions(edition) ON UPDATE CASCADE,
  name             TEXT NOT NULL,
  normalized_name  TEXT NOT NULL,
  weapon_type      TEXT,        -- 'ranged' | 'melee'
  range            TEXT,        -- e.g. '24"' or 'Melee'
  attacks          TEXT,        -- may be a dice string, e.g. 'D6'
  skill            TEXT,        -- BS/WS, e.g. '3+'
  strength         INT,
  ap               INT,
  damage           TEXT,        -- may be a dice string
  keywords         JSONB NOT NULL DEFAULT '[]',
  imported_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wh_weapon_stats_edition_name ON wh_weapon_stats (edition, normalized_name);
