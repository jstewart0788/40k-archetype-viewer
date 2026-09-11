-- 038: make rule grants queryable instead of trapped in prose.
--
-- Migration 037 recovered the magnitude for rules expressed as a parameterised
-- REFERENCE (`Feel No Pain` + a name-modifier "5+"). It did nothing for the far
-- larger population where a rule is GRANTED by another ability's prose:
--
--   "While this model is leading a unit, models in that unit have the
--    Feel No Pain 5+ ability against mortal wounds."
--
-- Measured 2026-08-18: 102 datasheet-ability rows plus grants in detachment
-- abilities, stratagems and enhancements carry a Feel No Pain magnitude in text
-- alone. None of it was reachable without a regex at the call site, and every
-- consumer that wrote its own regex got a different answer — the same failure
-- that produced this project's repositioning-count disagreement (90 / 104 / 230
-- across three seats measuring the same thing three ways).
--
-- Three things this table exists to keep separable, because conflating any of
-- them silently corrupts a mortal-wound-resistance measurement:
--
--   1. CONDITION. "Feel No Pain 4+ against Psychic Attacks" is NOT mortal-wound
--      resistance. "4+ against Psychic Attacks and mortal wounds" is. A general
--      "Feel No Pain 5+" is, at its stated rate. Brotherhood Librarian vs
--      Karanak differ on exactly this and would otherwise pool.
--   2. MAGNITUDE. 4+ is three times the mitigation of 6+. Where the source
--      omits it, `magnitude_known` is FALSE and the row must be excluded from a
--      weighted feature rather than defaulted — `11e-AoI-exaction-squad`
--      references Feel No Pain with no magnitude anywhere in the catalogue
--      (a stray rule link on the Arbites medi-kit upgrade, whose own text is
--      about returning destroyed models).
--   3. SCOPE. An aura grant is not army-wide. Summing it as though it were
--      overstates coverage; dropping it understates. Both are carried so a
--      consumer can compute a floor and a ceiling and publish the range.
--
-- GRANT vs MENTION is enforced by the extractor, not here: `Regenerative Agony`
-- reads "each time four or more Feel No Pain rolls are successful" and grants
-- nothing. Counting mentions as grants inflates coverage.

CREATE TABLE IF NOT EXISTS rule_grants (
    id                 text PRIMARY KEY,
    edition            text NOT NULL REFERENCES editions(edition) ON UPDATE CASCADE,
    granted_rule       text NOT NULL,
    source_kind        text NOT NULL
                       CHECK (source_kind IN ('datasheet','detachment','stratagem','enhancement')),
    source_id          text NOT NULL,
    source_name        text NOT NULL,
    magnitude          text,
    magnitude_known    boolean NOT NULL,
    applies_to         text NOT NULL
                       CHECK (applies_to IN ('general','mortal_wounds','psychic',
                                             'psychic_and_mortal','other')),
    scope              text NOT NULL
                       CHECK (scope IN ('self','unit','aura','army','unknown')),
    scope_range_inches integer,
    text_hash          text NOT NULL,
    source_text        text NOT NULL,
    imported_at        timestamptz NOT NULL DEFAULT now(),

    -- A known magnitude must actually be present, and an unknown one absent.
    CONSTRAINT rule_grants_magnitude_agrees
        CHECK ((magnitude_known AND magnitude IS NOT NULL)
            OR (NOT magnitude_known AND magnitude IS NULL)),
    -- An aura without a radius is not an aura, it is an unparsed grant.
    CONSTRAINT rule_grants_aura_has_range
        CHECK (scope <> 'aura' OR scope_range_inches IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_rule_grants_rule
    ON rule_grants (edition, granted_rule, applies_to);
CREATE INDEX IF NOT EXISTS idx_rule_grants_source
    ON rule_grants (source_kind, source_id);

COMMENT ON TABLE rule_grants IS
    'One row per (source, granted rule) where an ability, detachment rule, '
    'stratagem or enhancement grants a parameterised core rule in prose. '
    'Written by pipeline/rule_grants.py. Condition, magnitude and scope are '
    'kept separable on purpose — see migration 038 for why each one matters.';
