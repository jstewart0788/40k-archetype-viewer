-- 010_list_features.sql
-- Per-list playstyle feature vectors. Substrate for the matchup prediction
-- model. Built by pipeline/list_features.py from m_list_features_raw
-- (squad×datasheet×weapon aggregates) plus squad-precise weapon matching
-- against wh_wargear and curated binary loadout flags.
--
-- Versioning (per architect review): feature_version is part of the PK so
-- a refresh writes new rows alongside old ones. Old features stay queryable
-- until garbage-collected. Bump the version when feature set changes
-- semantically (new columns / new normalization / new flag list).
--
-- Shifts are NOT denormalized onto this row — JOIN to wh_detachment_shifts
-- and wh_faction_shifts at query time. Their version lifecycle is separate.

CREATE TABLE IF NOT EXISTS list_features (
  list_id                  TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  feature_version          TEXT NOT NULL,
  computed_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Passthrough identity
  detachment_id            TEXT,
  faction_id               TEXT,
  points_total             INT,

  -- Topology
  n_squads                 SMALLINT,
  n_models_total           SMALLINT,
  avg_unit_size            REAL,
  n_characters             SMALLINT,
  n_battleline_squads      SMALLINT,
  n_transports             SMALLINT,
  n_distinct_datasheets    SMALLINT,
  n_squads_unmatched       SMALLINT,

  -- Mobility
  bulk_avg_movement        REAL,
  top_max_movement         SMALLINT,

  -- Durability
  bulk_avg_toughness       REAL,
  top_max_toughness        SMALLINT,
  bulk_avg_save_armor      REAL,
  bulk_wound_pool          INT,
  top_wound_sum            INT,
  n_squads_with_invuln     SMALLINT,
  n_squads_mixed_profile   SMALLINT,

  -- Control
  total_oc                 INT,

  -- Datasheet-default weapon counts (carryforward from m_list_features_raw)
  n_weapons_indirect       INT,
  n_weapons_devastating    INT,
  n_weapons_lethal         INT,
  n_weapons_sustained      INT,
  n_weapons_torrent        INT,
  n_weapons_precision      INT,
  n_weapons_psychic        INT,
  n_weapons_anti_infantry  INT,
  n_weapons_anti_vehicle   INT,
  n_weapons_anti_monster   INT,
  n_weapons_melta          INT,
  n_weapons_assault        INT,
  n_weapons_str_8plus      INT,
  n_weapons_ap_2plus       INT,
  n_weapons_range_ge36     INT,
  pts_melee_weighted       REAL,
  pts_ranged_weighted      REAL,

  -- Squad-precise refinements (the matched-weapon view of the same axes)
  sp_n_weapons_matched     INT,                -- weapons resolved to wh_wargear
  sp_n_weapons_total       INT,                -- total weapon entries across squads
  weapon_match_confidence  REAL,               -- sp_matched / sp_total ∈ [0,1]
  sp_n_indirect            INT,
  sp_n_anti_vehicle        INT,
  sp_n_anti_infantry       INT,
  sp_n_high_ap             INT,                -- AP <= -2
  sp_n_str_8plus           INT,
  sp_n_devastating         INT,
  sp_n_lethal              INT,
  sp_n_sustained           INT,
  sp_n_precision           INT,
  sp_n_long_range          INT,                -- range >= 36"
  sp_melee_attack_volume   INT,                -- Σ A across matched melee weapons
  sp_ranged_attack_volume  INT,                -- Σ A across matched ranged weapons

  -- Binary loadout flags (high-signal weapons that swing matchups —
  -- robust to name normalization variants per stats expert)
  has_fusion               BOOLEAN NOT NULL DEFAULT FALSE,
  has_meltagun             BOOLEAN NOT NULL DEFAULT FALSE,
  has_lascannon            BOOLEAN NOT NULL DEFAULT FALSE,
  has_railgun              BOOLEAN NOT NULL DEFAULT FALSE,
  has_thermal_spear        BOOLEAN NOT NULL DEFAULT FALSE,
  has_haywire              BOOLEAN NOT NULL DEFAULT FALSE,
  has_volkite              BOOLEAN NOT NULL DEFAULT FALSE,
  has_plasma               BOOLEAN NOT NULL DEFAULT FALSE,
  has_grav                 BOOLEAN NOT NULL DEFAULT FALSE,
  has_disintegrator        BOOLEAN NOT NULL DEFAULT FALSE,
  has_flamer               BOOLEAN NOT NULL DEFAULT FALSE,
  has_heavy_bolter         BOOLEAN NOT NULL DEFAULT FALSE,
  has_assault_cannon       BOOLEAN NOT NULL DEFAULT FALSE,
  has_basilisk             BOOLEAN NOT NULL DEFAULT FALSE,
  has_manticore            BOOLEAN NOT NULL DEFAULT FALSE,
  has_mortar               BOOLEAN NOT NULL DEFAULT FALSE,
  has_eviscerator          BOOLEAN NOT NULL DEFAULT FALSE,
  has_chainfist            BOOLEAN NOT NULL DEFAULT FALSE,
  has_thunder_hammer       BOOLEAN NOT NULL DEFAULT FALSE,
  has_power_fist           BOOLEAN NOT NULL DEFAULT FALSE,
  has_relic_blade          BOOLEAN NOT NULL DEFAULT FALSE,
  has_force_weapon         BOOLEAN NOT NULL DEFAULT FALSE,
  has_eldar_lance          BOOLEAN NOT NULL DEFAULT FALSE,    -- haywire/lance/d-cannon
  has_psychic              BOOLEAN NOT NULL DEFAULT FALSE,    -- any psychic weapon
  has_lone_op              BOOLEAN NOT NULL DEFAULT FALSE,    -- any unit with Lone Op ability

  PRIMARY KEY (list_id, feature_version)
);
CREATE INDEX IF NOT EXISTS idx_list_features_version  ON list_features (feature_version);
CREATE INDEX IF NOT EXISTS idx_list_features_faction  ON list_features (faction_id);
CREATE INDEX IF NOT EXISTS idx_list_features_det      ON list_features (detachment_id);
