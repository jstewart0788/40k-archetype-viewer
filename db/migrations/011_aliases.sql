-- 011_aliases.sql
-- Tracked alias tables for entity-name normalization (Phase 2 of the data
-- audit). The deterministic normalization (NFKC, casefold, smart-quote →
-- ASCII, whitespace) lives in pipeline/list_parser.py:_normalize_name. This
-- layer is for *judgmental* mappings: GW renames, i18n drift (Spanish/
-- French/German exports), typos, abbreviations, and the upstream-faction →
-- the datasheet reference-faction bridge.
--
-- Tables added here:
--   - wh_unit_aliases   — drifted unit names → canonical wh_datasheets row
--   - faction_bridge    — upstream factions.id → the datasheet reference wh_factions.id
--   - player_identity   — multiple users.id → one canonical_player_id
--
-- Already exists (from 008_detachment_resolution.sql):
--   - wh_detachment_aliases — drifted detachment header text → wh_detachments
--
-- Architecture: raw tables (list_units, players, etc.) untouched for
-- forensics. Alias tables map raw → canonical with provenance. Canonical
-- views (created in pipeline/dbt/queries) LEFT JOIN aliases and COALESCE
-- to canonical. Downstream consumers query the views.

BEGIN;

-- ── wh_unit_aliases ─────────────────────────────────────────────────────────
-- Maps raw_normalized_name observed in list_units to a canonical wh_datasheet.
-- Only used when the raw name doesn't directly match wh_datasheets.normalized_name.
-- Mirror of wh_detachment_aliases pattern (built in 008).

CREATE TABLE IF NOT EXISTS wh_unit_aliases (
  id                     SERIAL PRIMARY KEY,
  datasheet_id           TEXT NOT NULL REFERENCES wh_datasheets(id) ON DELETE CASCADE,
  alias_text             TEXT NOT NULL,
                              -- The raw_name as it appeared in list_units.
  normalized             TEXT NOT NULL,
                              -- _normalize_name(alias_text). Used for the
                              -- lookup join.
  faction_id             TEXT REFERENCES wh_factions(id),
                              -- Optional faction scope. NULL = match any
                              -- faction (universal abbreviations). When set,
                              -- alias only fires when list's bridged
                              -- wh_faction matches.
  locale                 TEXT,
                              -- 'en' | 'es' | 'fr' | 'de' | 'pt' | 'it' |
                              -- 'pl' — drives i18n alias buckets.
  source                 TEXT NOT NULL DEFAULT 'manual',
                              -- 'manual' | 'auto_fuzzy' | 'auto_i18n' |
                              -- 'auto_singularize' | 'auto_chapter_strip' |
                              -- 'auto_honorific'.
  confidence             REAL,
                              -- 0.0–1.0. Manual = 1.0; fuzzy = trigram score.
  notes                  TEXT,
                              -- Free-text rationale ("GW April-2026 rename",
                              -- "Spanish translation", "Player abbreviation").
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by            TEXT,
                              -- Who approved manual / queue-reviewed entries.
  CONSTRAINT chk_unit_alias_source
    CHECK (source IN ('manual','auto_fuzzy','auto_i18n','auto_singularize',
                      'auto_chapter_strip','auto_honorific','auto'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wh_unit_alias_norm_fac
  ON wh_unit_aliases (normalized, COALESCE(faction_id, ''));
CREATE INDEX IF NOT EXISTS idx_wh_unit_aliases_datasheet
  ON wh_unit_aliases (datasheet_id);
CREATE INDEX IF NOT EXISTS idx_wh_unit_aliases_locale
  ON wh_unit_aliases (locale) WHERE locale IS NOT NULL;

COMMENT ON TABLE wh_unit_aliases IS
  'Maps drifted unit names (typos, i18n, GW renames, abbreviations) to canonical wh_datasheets entries. LEFT JOIN at query time; never overwrite raw list_units.';


-- ── faction_bridge ──────────────────────────────────────────────────────────
-- upstream factions.id → the datasheet reference wh_factions.id. The two ID schemes are disjoint
-- (upstream Firestore-style alphanumeric vs the datasheet reference 2-3 letter codes), and the
-- bridge needs human curation: Marines chapters all map to SM, "Genestealer
-- Cult" (upstream) ↔ "Genestealer Cults" (the datasheet reference), apostrophe-variant matching.
-- Catch-all factions (Chaos, Imperium, Xenos, Forces of the Hive Mind,
-- Unknown Faction) have no entry — they don't map cleanly to a single
-- wh_faction.

CREATE TABLE IF NOT EXISTS faction_bridge (
  source_faction_id TEXT NOT NULL PRIMARY KEY REFERENCES factions(id) ON DELETE CASCADE,
  wh_faction_id  TEXT NOT NULL REFERENCES wh_factions(id),
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_faction_bridge_wh ON faction_bridge (wh_faction_id);

COMMENT ON TABLE faction_bridge IS
  'Bridge between upstream factions.id (player-side) and the datasheet reference wh_factions.id (datasheet-side).';


-- ── player_identity ─────────────────────────────────────────────────────────
-- Many users.id rows in upstream can represent the same physical player (separate
-- email signups, organization-level vs personal accounts, etc.). This table
-- groups them under a canonical player identity for cross-event tracking
-- without ever overwriting users.first_name/last_name.

CREATE TABLE IF NOT EXISTS player_identity (
  user_id              TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  canonical_player_id  INT NOT NULL,
                            -- Group key. All users.id values sharing this
                            -- canonical_player_id are the same human.
  source               TEXT NOT NULL DEFAULT 'manual',
                            -- 'manual' | 'auto_exact_name' |
                            -- 'auto_fuzzy_name+faction' |
                            -- 'auto_metaphone' | 'auto_initial_expansion'.
  confidence           REAL,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by          TEXT,
  CONSTRAINT chk_player_identity_source
    CHECK (source IN ('manual','auto_exact_name','auto_fuzzy_name+faction',
                      'auto_metaphone','auto_initial_expansion','auto'))
);

CREATE INDEX IF NOT EXISTS idx_player_identity_canonical
  ON player_identity (canonical_player_id);

COMMENT ON TABLE player_identity IS
  'Maps upstream users.id → canonical player. Multiple upstream user_ids can collapse to one human. Never overwrite users; always JOIN through this when you want cross-event aggregation per real player.';


COMMIT;
