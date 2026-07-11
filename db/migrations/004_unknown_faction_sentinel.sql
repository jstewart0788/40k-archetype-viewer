-- 004_unknown_faction_sentinel.sql
-- Sentinel faction row for games whose upstream-tag is a parent bucket
-- (Chaos / Xenos / Forces of the Hive Mind) AND no list is available to
-- infer the real faction. Surfaces as a distinct "Unknown Faction" label
-- in rankings rather than (a) silently dropping the game or (b) merging
-- it under whichever parent bucket it happened to fall in.

INSERT INTO factions (id, name)
VALUES ('UNKNOWN', 'Unknown Faction')
ON CONFLICT (id) DO NOTHING;
