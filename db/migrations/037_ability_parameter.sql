-- 037: recover rule parameters dropped by the catalogue importer.
--
-- 11e catalogues express a parameterised core rule as a generic `type: 'rule'`
-- infoLink plus a modifier that APPENDS the magnitude to the displayed name:
--
--   {"name": "Feel No Pain", "type": "rule",
--    "modifiers": [{"type": "append", "field": "name", "value": "5+"}]}
--
-- cat_import read `name` and discarded `modifiers`, so every one of these rows
-- landed as the bare rule with no magnitude. Measured 2026-08-18 across the 46
-- 11e catalogues: 943 instances over 42 distinct (name, value) combinations —
-- Deadly Demise D3/D6/1/D6+2/2D6/3D6, Feel No Pain 4+/5+/6+, Scouts 6"/7"/8"/9",
-- Firing Deck 2/6/10/11/12/15, Sustained Hits 1. That is ~14% of all 11e ability
-- play instances carrying no magnitude at all.
--
-- Why a separate column instead of folding the value into `name`:
-- consumers match the rule by exact name. pipeline/listlab/full.py:85 does
-- `'scouts' in kw` against lowercased rule names, so renaming the row to
-- 'Scouts 6"' would silently drop every scout / deep-strike / infiltrate tag
-- rather than failing loudly. `name` therefore stays the bare rule and the
-- magnitude lands beside it. Additive and reversible: DROP COLUMN restores the
-- previous behaviour exactly.
--
-- Feel No Pain is the load-bearing case — 4+ is three times the mitigation of
-- 6+, and mortal-wound resistance cannot be measured without it.

ALTER TABLE wh_datasheet_abilities
    ADD COLUMN IF NOT EXISTS parameter text;

COMMENT ON COLUMN wh_datasheet_abilities.parameter IS
    'Magnitude appended to a parameterised core rule by a catalogue name-modifier '
    '(e.g. "5+" for Feel No Pain, "6""" for Scouts, "D3" for Deadly Demise). '
    'NULL for rules that take no parameter and for all non-rule ability rows.';

CREATE INDEX IF NOT EXISTS idx_wh_ds_abilities_param
    ON wh_datasheet_abilities (edition, lower(name))
    WHERE parameter IS NOT NULL;
