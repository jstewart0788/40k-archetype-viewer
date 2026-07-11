-- 021_datasheet_weapons_11e.sql
-- Datasheet → weapon linkage for the 11th-edition catalog. wh_weapon_stats
-- (migration 020) is a flat deduped weapon catalog; this junction restores
-- which weapons appear on which datasheet so the feature pipeline can build
-- datasheet-default weapon aggregates for 11e (the 10th equivalent derives
-- from wh_wargear, which is per-datasheet already).

CREATE TABLE wh_datasheet_weapons (
  datasheet_id  TEXT NOT NULL REFERENCES wh_datasheet_stats(id) ON DELETE CASCADE,
  weapon_id     TEXT NOT NULL REFERENCES wh_weapon_stats(id) ON DELETE CASCADE,
  PRIMARY KEY (datasheet_id, weapon_id)
);

CREATE INDEX idx_wh_ds_weapons_weapon ON wh_datasheet_weapons (weapon_id);
