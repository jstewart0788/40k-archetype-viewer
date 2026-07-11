-- db/seeds/unit_aliases_v3.sql
-- Third batch — driven by m_list_unit_agg-level frequency analysis after
-- the dbt fix routed through v_list_units_canonical. These are names that
-- still cross the NMF MIN_DATASHEET_FREQ=5 threshold so they would otherwise
-- enter the feature matrix as unique columns despite having a clear
-- canonical match.
--
-- Categories:
--   - apostrophe / curly-quote stripping (Gaunt's Ghosts, The Silent King)
--   - typos (Necrosor → Nekrosor)
--   - missing definite article ("silent king" → "The Silent King")
--   - faction-prefixed canonicals not in v1/v2 (Thousand Sons Rhino, etc.)
--   - parser-detritus patterns: "name: loadout" and "(N models)" suffixes
--   - "char4:" / "char5:" prefix from lieutenants in detached-character lists

BEGIN;

INSERT INTO wh_unit_aliases (alias_text, normalized, datasheet_id, faction_id, locale, source, confidence, notes) VALUES
  -- Apostrophe / curly-quote stripping
  ('Gaunts Ghosts',                       'gaunts ghosts',                                                                                  '000002485', 'AM',  'en', 'manual', 1.0, 'apostrophe strip'),
  ('Silent King',                         'silent king',                                                                                    '000002360', 'NEC', 'en', 'manual', 1.0, 'short for "The Silent King"'),

  -- Typos
  ('Necrosor Ammentar',                   'necrosor ammentar',                                                                              '000004186', 'NEC', 'en', 'manual', 1.0, 'typo: canonical is "Nekrosor Ammentar"'),

  -- Faction-prefixed canonicals
  ('Thousand Sons Rhino',                 'thousand sons rhino',                                                                            '000001022', 'TS',  'en', 'manual', 1.0, 'TS-faction Chaos Rhino'),
  ('World Eaters Daemon Prince',          'world eaters daemon prince',                                                                     '000002624', 'WE',  'en', 'manual', 1.0, 'WE-faction Daemon Prince of Khorne'),
  ('Chaos Warhound Titan',                'chaos warhound titan',                                                                           '000000867', NULL,  'en', 'manual', 1.0, 'Forge World; one Warhound Titan datasheet (TL)'),

  -- Parser-detritus: "name: loadout details" suffix
  ('Deathshroud Terminators (with loadout)', 'deathshroud terminators: deathshroud terminator champion, 2x deathshroud terminator',         '000001371', 'DG',  'en', 'manual', 1.0, 'parser left sub-model breakdown attached'),
  ('Poxwalkers (with count)',             'poxwalkers: 10x poxwalker',                                                                      '000001056', 'DG',  'en', 'manual', 1.0, 'parser left model count attached'),
  ('Foetid Bloat-drone HBL (with loadout)', 'foetid bloat-drone with heavy blight launcher: heavy blight launcher, plague probe',           '000004110', 'DG',  'en', 'manual', 1.0, 'parser detritus'),
  ('Chaos Spawn (with count)',            'chaos spawn: 2x chaos spawn',                                                                    '000001048', 'DG',  'en', 'manual', 1.0, 'parser left count attached; DG-faction Chaos Spawn'),
  ('Chaos Rhino (with loadout)',          'chaos rhino: armoured tracks, havoc launcher, 2x combi-bolter',                                  '000000956', 'CSM', 'en', 'manual', 1.0, 'parser detritus; CSM canonical'),
  ('Callidus Assassin (with loadout)',    'callidus assassin: phase sword and poison blades, neural shredder',                              '000000871', 'AoI', 'en', 'manual', 1.0, 'parser detritus'),
  ('Canoptek Reanimator (with loadout)',  'canoptek reanimator: reanimator''s claws, 2x atomiser beam',                                     '000002112', 'NEC', 'en', 'manual', 1.0, 'parser detritus'),
  ('Cultist Mob (with loadout)',          'cultist mob: cultist champion, 9x cultist w/ autopistol and brutal assault weapon',              '000000946', 'CSM', 'en', 'manual', 1.0, 'parser detritus'),

  -- Parser-detritus: "(N models)" suffixes
  ('Bladeguard Veteran Squad (6 Models)', 'bladeguard veteran squad (6 models)',                                                            '000000071', 'SM',  'en', 'manual', 1.0, 'model-count suffix'),
  ('Infiltrator Squad (5 Models)',        'infiltrator squad (5 models)',                                                                   '000000128', 'SM',  'en', 'manual', 1.0, 'model-count suffix'),
  ('Assault Intercessors With Jump Packs (5 Models)', 'assault intercessors with jump packs (5 models)',                                    '000002776', 'SM',  'en', 'manual', 1.0, 'model-count suffix'),
  ('Commander in Coldstar Battlesuit (with drones)', 'commander in coldstar battlesuit (2x shield drones)',                                 '000000402', 'TAU', 'en', 'manual', 1.0, 'attached drone count'),

  -- "char4:" / "char5:" prefix — combat-patrol-style "Character #N: <unit>"
  ('Char4 Lieutenant With Combi-Weapon',  'char4: 1x lieutenant with combi-weapon',                                                         '000000076', 'SM',  'en', 'manual', 1.0, 'parser char-slot prefix'),
  ('Char5 Lieutenant With Combi-Weapon',  'char5: 1x lieutenant with combi-weapon',                                                         '000000076', 'SM',  'en', 'manual', 1.0, 'parser char-slot prefix'),
  ('Lieutenant With Combi-Weapon (with loadout)', 'lieutenant with combi-weapon: paired combat blades, combi-weapon',                       '000000076', 'SM',  'en', 'manual', 1.0, 'parser detritus'),

  -- Sub-model count patterns (faction-aware: NEC for Flayed Ones)
  ('Flayed Ones (with count)',            'flayed ones: 5x flayed one',                                                                     '000000538', 'NEC', 'en', 'manual', 1.0, 'parser sub-model breakdown'),

  -- Drukhari / Dark Eldar — "scourges" alone is ambiguous (Heavy Weapons vs
  -- Shardcarbines variant). Default to Heavy Weapons since it's the most
  -- common at high level; if NMF clusters separate, that's a follow-up.
  ('Scourges',                            'scourges',                                                                                       '000000662', 'DRU', 'en', 'manual', 0.8, 'ambiguous between Heavy Weapons / Shardcarbines variant; default Heavy Weapons'),

  -- Black Templars Crusaders — already in v1 as faction-prefixed; covering
  -- "primaris" variant
  ('Primaris Crusader Squad',             'primaris crusaders squad',                                                                       '000002799', 'SM',  'en', 'manual', 0.9, 'BT short form for SM Crusader Squad')

ON CONFLICT (normalized, (COALESCE(faction_id, ''))) DO NOTHING;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────
-- STILL UNRESOLVED at ≥5 lists (need datasheets we don't have, or research)
-- ─────────────────────────────────────────────────────────────────────────
-- "uthar the destined" (19 lists, LoV) — character not in current datasheet reference
-- "arcanyst evaluator"  (12 lists, LoV) — datasheet name not recognized
-- "twin lance" (5 lists, T'au) — likely Stormsurge weapon mistaken for unit
-- "infiltrators" (7 lists, SM/DA/Deathwatch) — already aliased, may need plural-form dup
-- "daemon prince" (6 lists, CSM/DG) — too ambiguous; CSM-vs-DG split needs faction-scoped alias
