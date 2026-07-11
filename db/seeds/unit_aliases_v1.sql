-- db/seeds/unit_aliases_v1.sql
-- First batch of wh_unit_aliases seeded from list_units rows that don't
-- resolve to a canonical wh_datasheets entry.
--
-- Categories represented:
--   1. canonical-name variants — short name / GW rename (e.g. "Marneus Calgar"
--      → "Marneus Calgar in Armour of Antilochus")
--   2. diacritic stripping — "kharn" vs "khârn", "kahl" vs "kâhl"
--   3. typos — "scorpekh" vs "skorpekh", "atillan" vs "attilan"
--   4. faction-prefixed names — "Black Templars Repulsor Executioner",
--      "World Eaters Chaos Spawn"
--   5. parenthetical clutter — "Intercessor Squad (Battle-ready)"
--   6. model-count prefixes — "10x Wyches", "5х Troupe" (Cyrillic х)
--   7. apostrophe stripping — "be'lakor" → "belakor"
--   8. i18n (French) — "cavaliers krootox", "lances étincelantes"
--
-- Selection rule: only included when there is exactly one unambiguous
-- canonical wh_datasheets row. Genuinely ambiguous names (e.g. "scouts",
-- "cultists", "pathfinders" — depend on faction context) are listed at the
-- bottom as needs-mapping comments for follow-up.

BEGIN;

INSERT INTO wh_unit_aliases (alias_text, normalized, datasheet_id, faction_id, locale, source, confidence, notes) VALUES
  -- canonical-name variants (GW renames / short forms)
  ('Marneus Calgar',                       'marneus calgar',                                '000004183', NULL, 'en', 'manual', 1.0, 'short name for "...in Armour of Antilochus"'),
  ('Captain Sicarius',                     'captain sicarius',                              '000004184', NULL, 'en', 'manual', 1.0, 'players use rank prefix; canonical is "Cato Sicarius"'),
  ('Lieutenant Titus',                     'lieutenant titus',                              '000004187', 'SM', 'en', 'manual', 1.0, 'players mistitle rank; canonical is "Captain Titus"'),

  -- diacritic stripping
  ('Kharn The Betrayer',                   'kharn the betrayer',                            '000002622', 'WE', 'en', 'manual', 1.0, 'diacritic strip: "Khârn"'),
  ('Brokhyr Thunderkyn',                   'brokhyr thunderkyn',                            '000002603', 'LoV', 'en', 'manual', 1.0, 'diacritic strip: "Brôkhyr"'),
  ('Thunderkyn',                           'thunderkyn',                                    '000002603', 'LoV', 'en', 'manual', 1.0, 'short form of Brôkhyr Thunderkyn'),
  ('Kahl',                                 'kahl',                                          '000002594', 'LoV', 'en', 'manual', 1.0, 'diacritic strip: "Kâhl"'),
  ('Belakor',                              'belakor',                                       '000001148', 'CD', 'en', 'manual', 1.0, 'apostrophe strip: "Be''lakor"'),

  -- typos
  ('Scorpekh Lord',                        'scorpekh lord',                                 '000002109', 'NEC', 'en', 'manual', 1.0, 'typo: "Skorpekh"'),
  ('Scorpekh Destroyers',                  'scorpekh destroyers',                           '000002110', 'NEC', 'en', 'manual', 1.0, 'typo: "Skorpekh"'),
  ('Cthonian Berserks',                    'cthonian berserks',                             '000002600', 'LoV', 'en', 'manual', 1.0, 'typo: canonical is "Beserks" not "Berserks"'),
  ('Atillan Rough Riders',                 'atillan rough riders',                          '000002616', 'AM', 'en', 'manual', 1.0, 'typo: "Attilan"'),
  ('Beast Snagga Boys',                    'beast snagga boys',                             '000002494', 'ORK', 'en', 'manual', 1.0, 'typo: canonical is "Boyz"'),
  ('Squighog Boys',                        'squighog boys',                                 '000002496', 'ORK', 'en', 'manual', 1.0, 'typo: canonical is "Boyz"'),

  -- faction-prefixed names → strip prefix → canonical (universal)
  ('Black Templars Repulsor Executioner',  'black templars repulsor executioner',           '000002790', NULL, 'en', 'manual', 1.0, 'BT uses SM dex; strip faction prefix'),
  ('Black Templars Impulsor',              'black templars impulsor',                       '000002786', NULL, 'en', 'manual', 1.0, 'BT uses SM dex'),
  ('Black Templars Gladiator Lancer',      'black templars gladiator lancer',               '000002787', NULL, 'en', 'manual', 1.0, 'BT uses SM dex'),
  ('Grey Knights Razorback',               'grey knights razorback',                        '000000395', 'GK', 'en', 'manual', 1.0, 'GK has its own Razorback datasheet'),
  ('Death Guard Rhino',                    'death guard rhino',                             '000001047', 'DG', 'en', 'manual', 1.0, 'DG-faction Chaos Rhino'),

  -- world eaters faction-prefixed (map to WE-faction datasheets)
  ('World Eaters Chaos Spawn',             'world eaters chaos spawn',                      '000002633', 'WE', 'en', 'manual', 1.0, 'faction-prefixed Chaos Spawn'),
  ('World Eaters Forgefiend',              'world eaters forgefiend',                       '000002638', 'WE', 'en', 'manual', 1.0, 'faction-prefixed Forgefiend'),
  ('World Eaters Rhino',                   'world eaters rhino',                            '000002640', 'WE', 'en', 'manual', 1.0, 'WE-faction Chaos Rhino'),

  -- thousand sons + tzeentch faction-prefixed
  ('Thousand Sons Sorcerer In Terminator Armour', 'thousand sons sorcerer in terminator armour', '000001017', 'TS', 'en', 'manual', 1.0, 'faction-prefixed'),
  ('Tzeentch Soul Grinder',                'tzeentch soul grinder',                         '000001151', 'CD', 'en', 'manual', 1.0, 'mark-of-Tzeentch Soul Grinder'),
  ('Nurgle Soul Grinder',                  'nurgle soul grinder',                           '000001151', 'CD', 'en', 'manual', 1.0, 'mark-of-Nurgle Soul Grinder'),
  ('Venerable Chaos Land Raider',          'venerable chaos land raider',                   '000000962', 'CSM', 'en', 'manual', 1.0, '"venerable" cosmetic prefix'),

  -- parenthetical clutter
  ('Intercessor Squad (Battle-ready)',     'intercessor squad (battle-ready)',              '000001157', NULL, 'en', 'manual', 1.0, 'parenthetical clutter'),
  ('Assault Intercessor Squad (Battle-ready)', 'assault intercessor squad (battle-ready)',  '000001606', NULL, 'en', 'manual', 1.0, 'parenthetical clutter'),
  ('Tzaangor Enlightened w/ Fatecaster Greatbows', 'tzaangor enlightened w/ fatecaster greatbows', '000004122', 'TS', 'en', 'manual', 1.0, 'w/ → with; specific weapon variant'),
  ('Cadian Shock Troops Squads',           'cadian shock troops squads',                    '000002612', 'AM', 'en', 'manual', 1.0, 'extra "squads" suffix'),
  ('Kasrkin Squad',                        'kasrkin squad',                                 '000002615', 'AM', 'en', 'manual', 1.0, 'extra "squad" suffix'),
  ('Catachan Squad',                       'catachan squad',                                '000002614', 'AM', 'en', 'manual', 1.0, 'short for Catachan Jungle Fighters'),
  ('Battle Sister Squad',                  'battle sister squad',                           '000000903', 'AS', 'en', 'manual', 1.0, 'singular vs "Battle Sisters Squad"'),
  ('Boyz Squad',                           'boyz squad',                                    '000000016', 'ORK', 'en', 'manual', 1.0, 'extra "squad" suffix'),

  -- model-count prefixes (10x, 5x, Cyrillic 1х/5х)
  ('10x Wyches',                           '10x wyches',                                    '000000646', 'DRU', 'en', 'manual', 1.0, 'model-count prefix'),
  ('5x Infractors',                        '5x infractors',                                 '000004080', NULL, 'en', 'manual', 0.9, 'model-count prefix; verify "Infractors" canonical name'),
  ('1х Starweaver',                        '1х starweaver',                                 '000002541', 'AE', 'en', 'manual', 1.0, 'Cyrillic х model-count prefix'),
  ('5х Troupe',                            '5х troupe',                                     '000002536', 'AE', 'en', 'manual', 1.0, 'Cyrillic х model-count prefix'),
  ('2 Spawn',                              '2 spawn',                                       '000000960', 'CSM', 'en', 'manual', 1.0, 'model-count prefix; map to Chaos Spawn (CSM canonical)'),
  ('Spawn',                                'spawn',                                         '000000960', 'CSM', 'en', 'manual', 0.9, 'short for Chaos Spawn'),

  -- short forms / abbreviations
  ('Sword Brethren',                       'sword brethren',                                '000002798', 'SM', 'en', 'manual', 1.0, 'short for Sword Brethren Squad'),
  ('Primaris Sword Brethren',              'primaris sword brethren',                       '000002798', 'SM', 'en', 'manual', 1.0, 'redundant Primaris prefix'),
  ('Tempestuous Scions',                   'tempestous scions',                             '000002746', 'AM', 'en', 'manual', 1.0, 'misspelling of Tempestus Scions'),
  ('Scion Squad',                          'scion squad',                                   '000002746', 'AM', 'en', 'manual', 1.0, 'short for Tempestus Scions'),
  ('Rough Riders',                         'rough riders',                                  '000002616', 'AM', 'en', 'manual', 1.0, 'short for Attilan Rough Riders'),
  ('Incursors',                            'incursors',                                     '000001159', 'SM', 'en', 'manual', 1.0, 'short for Incursor Squad'),
  ('Outrider',                             'outrider',                                      '000002712', 'SM', 'en', 'manual', 1.0, 'short for Outrider Squad'),
  ('Bloat-drone',                          'bloat-drone',                                   '000001057', 'DG', 'en', 'manual', 1.0, 'short for Foetid Bloat-drone'),
  ('Bullgryn',                             'bullgryn',                                      '000000723', 'AM', 'en', 'manual', 1.0, 'short for Bullgryn Squad'),
  ('Retributors',                          'retributors',                                   '000000908', 'AS', 'en', 'manual', 1.0, 'short for Retributor Squad'),
  ('Myphitic Blight Hauler',               'myphitic blight hauler',                        '000001374', 'DG', 'en', 'manual', 1.0, 'missing hyphen'),
  ('Pain Boy',                             'pain boy',                                      '000000013', 'ORK', 'en', 'manual', 1.0, 'space typo: Painboy'),
  ('Broadside Battlesuit',                 'broadside battlesuit',                          '000000433', 'TAU', 'en', 'manual', 1.0, 'singular vs "Broadside Battlesuits"'),

  -- French translations
  ('Cavaliers Krootox',                    'cavaliers krootox',                             '000000414', 'TAU', 'fr', 'manual', 1.0, 'French: Krootox Riders'),
  ('Lances Étincelantes',                  'lances étincelantes',                           '000000602', 'AE', 'fr', 'manual', 1.0, 'French: Shining Spears'),
  ('Gardiens Du Vent',                     'gardiens du vent',                              '000000591', 'AE', 'fr', 'manual', 1.0, 'French: Windriders ("guardians of the wind")'),
  ('Carnivores Kroot',                     'carnivores kroot',                              '000000413', 'TAU', 'fr', 'manual', 1.0, 'French word order: Kroot Carnivores')

ON CONFLICT (normalized, (COALESCE(faction_id, ''))) DO NOTHING;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────
-- NEEDS MAPPING (left for follow-up — context required to disambiguate)
-- ─────────────────────────────────────────────────────────────────────────
-- "scouts" (26 occ) — Wolf Scouts? Scout Squad? Eldar Rangers? need faction
-- "pathfinders" (31 occ) — Tau Pathfinder Team or VSG Vigilant Pathfinders
-- "cultists" (19 occ) — Accursed/Negavolt/DG Cultists; need faction
-- "krieg battleline" (36 occ) — placeholder, not a real datasheet name
-- "uthar the destined" (21 occ) — likely GSC character; not in current scrape?
-- "neurothrope" (16 occ) — Tyranid; not in current scrape?
-- "saccageurs krootox" (18 occ) — French "raider" Krootox; Riders or Rampagers?
-- "cérastes" (16 occ) — French; uncertain unit
-- "wych elves" (16 occ) — non-standard; Wyches?
-- "plague cyst" (16 occ) — uncertain
-- "plague corpse" (13 occ) — uncertain
-- "berserks" (17 occ) — Khorne Berzerkers (WE/CSM) vs Cthonian Beserks (LoV)?
-- "ogryn body guard" (21 occ) — Nork Deddog?
-- "despoiler" (13 occ) — Abaddon vs Knight Despoiler
-- "primaris crusaders squad" (21 occ) — Crusader Squad (BT) or Sisters Crusaders?
-- "fulgrim's guard" / "custodian fulgrim's guard" (72 occ) — Custodes detachment-locked unit, name varies
-- "arcanyst evaluator" (17 occ) — uncertain
-- "gretchins & runtherds" (16 occ) — combo squad; map to Gretchin?
-- "legionnaires" (23 occ) — Damned Legionnaires (AoI) or CSM Legionaries?
-- "scourges" (49 occ) — Heavy Weapons or Shardcarbines variant?
-- "pink horrors? i hardly know her!" (25 occ) — joke list; map to Pink Horrors low-confidence
