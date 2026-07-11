-- db/seeds/unit_aliases_v2.sql
-- Second batch. Picks up the long tail after v1 (43% → ?% reduction).
-- Mostly model-count prefixes, "(5 models)" suffixes, missing hyphens,
-- typos, and faction-prefix variants we missed in v1.

BEGIN;

INSERT INTO wh_unit_aliases (alias_text, normalized, datasheet_id, faction_id, locale, source, confidence, notes) VALUES
  -- Tempestus Scion variants — no separate "command squad" datasheet exists,
  -- everything maps to the generic Tempestus Scions row.
  ('Scion Command Squad',                          'scion command squad',                                       '000002746', 'AM', 'en', 'manual', 1.0, 'no separate command squad datasheet'),
  ('Militarum Tempestuous Command Squad',          'militarum tempestuous command squad',                       '000002746', 'AM', 'en', 'manual', 1.0, 'no separate command squad datasheet'),

  -- "(N models)" suffixes — parser leaves count in the name
  ('Intercessor Squad (5 Models)',                 'intercessor squad (5 models)',                              '000001157', 'SM', 'en', 'manual', 1.0, 'model-count suffix'),
  ('Scout Squad (5 Models)',                       'scout squad (5 models)',                                    '000001160', 'SM', 'en', 'manual', 1.0, 'model-count suffix'),

  -- model-count prefixes (numbers + Cyrillic х already handled in v1)
  ('10 Khorne Berzerkers',                         '10 khorne berzerkers',                                      '000003582', 'CSM', 'en', 'manual', 0.9, 'model-count prefix; CSM canonical (WE has its own)'),
  ('6x Noise Marines',                             '6x noise marines',                                          '000004099', 'CSM', 'en', 'manual', 1.0, 'model-count prefix'),

  -- missing hyphens / spaces
  ('Foetid Bloat Drone',                           'foetid bloat drone',                                        '000001057', 'DG', 'en', 'manual', 1.0, 'missing hyphen'),
  ('Foetid Bloat Drone With Heavy Blight Launcher','foetid bloat drone with heavy blight launcher',             '000004110', 'DG', 'en', 'manual', 1.0, 'missing hyphen'),
  ('Hekaton Landfortress',                         'hekaton landfortress',                                      '000002604', 'LoV', 'en', 'manual', 1.0, 'missing space: Land Fortress'),

  -- short forms (singular, missing "Squad")
  ('Vanguard Veterans',                            'vanguard veterans',                                         '000001154', 'SM', 'en', 'manual', 1.0, 'short for Vanguard Veteran Squad'),
  ('Bladeguard Veterans',                          'bladeguard veterans',                                       '000000071', 'SM', 'en', 'manual', 1.0, 'short for Bladeguard Veteran Squad'),
  ('Intercessor',                                  'intercessor',                                               '000001157', 'SM', 'en', 'manual', 1.0, 'singular for Intercessor Squad'),
  ('Cadian Squad',                                 'cadian squad',                                              '000002612', 'AM', 'en', 'manual', 1.0, 'short for Cadian Shock Troops'),
  ('Boys',                                         'boys',                                                      '000000016', 'ORK', 'en', 'manual', 1.0, 'misspelling of Boyz'),

  -- typos
  ('Ventari Custodian',                            'ventari custodian',                                         '000001561', 'AC', 'en', 'manual', 1.0, 'typo: canonical is "Venatari Custodians"'),
  ('Beast Boss On Squigasaur',                     'beast boss on squigasaur',                                  '000002490', 'ORK', 'en', 'manual', 1.0, 'typos: Beastboss / Squigosaur'),
  ('Beast Boss',                                   'beast boss',                                                '000002490', 'ORK', 'en', 'manual', 0.8, 'short form of Beastboss On Squigosaur'),

  -- faction-prefixed
  ('Thousand Sons Forgefiend',                     'thousand sons forgefiend',                                  '000001028', 'TS', 'en', 'manual', 1.0, 'faction-prefixed Forgefiend'),
  ('Wardog Stalker',                               'wardog stalker',                                            '000002563', 'QT', 'en', 'manual', 1.0, 'missing space: War Dog Stalker'),
  ('War Dog Stalker',                              'war dog stalker',                                           '000002563', 'QT', 'en', 'manual', 1.0, 'with-space variant'),

  -- chaos faction-prefix variants for legionaries (CSM canonical)
  ('Legionnaires',                                 'legionnaires',                                              '000002570', 'CSM', 'en', 'manual', 0.9, 'spelling variant of CSM Legionaries; could also be AoI Damned but CSM is more common')

ON CONFLICT (normalized, (COALESCE(faction_id, ''))) DO NOTHING;

COMMIT;
