"""Prose-granted rules must be extracted with condition, magnitude and scope intact.

Every assertion here corresponds to a way this extraction was, or nearly was,
built wrong:

  * pooling "against Psychic Attacks" with "against mortal wounds" — the
    Brotherhood Librarian's Sanctic Hood is NOT mortal-wound resistance while
    Karanak's Brass Collar is, and an unconditional feature counts both;
  * counting a MENTION as a grant — `Regenerative Agony` reads "each time four
    or more Feel No Pain rolls are successful" and grants nothing;
  * losing a grant to a source-data typo — Kroot Flesh Shaper reads
    "Feel Not Pain 6+";
  * treating an aura as army-wide — `Improbable Shield` reaches 6";
  * importing 10e rows as 11e — `wh_enhancements` mixes editions and
    `wh_detachment_abilities` has no edition column at all.
"""

import os
import sys

import psycopg2
import pytest

# pytest is invoked as `.venv/bin/pytest tests/` by npm run test:data, which does
# not put the repo root on sys.path the way `python -m pytest` does. Same shim as
# tests/test_weapon_catalog_per_datasheet.py:29.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from pipeline.rule_grants import classify_condition, parse_grant, parse_scope


def _conn():
    return psycopg2.connect(
        host=os.environ.get("DB_HOST", "localhost"),
        port=int(os.environ.get("DB_PORT", "5433")),
        dbname=os.environ.get("DB_NAME", "wh40k_meta"),
        user=os.environ.get("DB_USER", "wh40k"),
        password=os.environ.get("DB_PASSWORD", "localdev"),
    )


# ── pure parsing ──────────────────────────────────────────────────────────

def test_mention_is_not_a_grant():
    """The failure that would inflate coverage."""
    assert parse_grant(
        "Each time four or more Feel No Pain rolls are successful for "
        "HAEMONCULUS COVENS models from your army in a single phase, you gain "
        "1 Pain token."
    ) is None


def test_source_typo_is_still_captured():
    """Kroot Flesh Shaper, 'Rites of Feasting' — real text, real typo."""
    g = parse_grant(
        "While this model is leading a unit, models in that unit have the "
        "Feel Not Pain 6+ ability."
    )
    assert g and g["magnitude"] == "6+" and g["applies_to"] == "general"


@pytest.mark.parametrize("clause,expected", [
    ("Psychic Attacks", "psychic"),
    ("mortal wounds", "mortal_wounds"),
    ("Psychic Attacks and mortal wounds", "psychic_and_mortal"),
    ("ranged attacks", "other"),
    ("something we have never seen", "other"),
])
def test_condition_classification_is_fail_closed(clause, expected):
    """An unrecognised condition counts for nothing — never as 'general'."""
    assert classify_condition(clause) == expected


def test_psychic_only_is_not_mortal_wound_resistance():
    """Sanctic Hood vs Brass Collar — the pair that must not pool."""
    hood = parse_grant(
        "While this model is leading a unit, models in that unit have the "
        "Feel No Pain 4+ ability against Psychic Attacks."
    )
    collar = parse_grant(
        "The bearer has the Feel No Pain 3+ ability against Psychic Attacks "
        "and mortal wounds."
    )
    assert hood["applies_to"] == "psychic"
    assert collar["applies_to"] == "psychic_and_mortal"


def test_aura_range_is_parsed():
    scope, rng = parse_scope(
        'While a friendly Legiones Daemonica Tzeentch unit is within 6" of the '
        "bearer, models in that unit have the Feel No Pain 4+ ability against "
        "Psychic Attacks and mortal wounds.",
        "Improbable Shield (Aura)",
    )
    assert (scope, rng) == ("aura", 6)


def test_magnitude_is_never_invented():
    g = parse_grant("Models in this unit have the Feel No Pain ability.")
    assert g is not None
    assert g["magnitude"] is None and g["magnitude_known"] is False


def test_markup_does_not_hide_the_condition():
    """Descriptions carry <br>, <b> and <span> that break sentence splitting."""
    g = parse_grant(
        "<b>EFFECT:</b> Until the end of the phase, models in that unit have "
        "the <b>Feel No Pain 5+</b> ability against mortal wounds."
    )
    assert g and g["applies_to"] == "mortal_wounds"


# ── what actually landed ──────────────────────────────────────────────────

def test_all_four_grant_paths_are_represented():
    """A single-table search is how the Scintillating Legion mechanism was
    missed the first time — it lives in an enhancement, not a detachment rule."""
    with _conn() as cn, cn.cursor() as cur:
        cur.execute("""
            SELECT source_kind, count(*) FROM rule_grants
            WHERE edition = '11e' AND granted_rule = 'Feel No Pain'
            GROUP BY 1
        """)
        by_kind = dict(cur.fetchall())
    for kind in ("datasheet", "detachment", "stratagem", "enhancement"):
        assert by_kind.get(kind), f"no Feel No Pain grants found via {kind}"


def test_no_10e_rows_leaked_in():
    """wh_enhancements mixes editions; wh_detachment_abilities has no edition
    column and must reach it through wh_detachments."""
    with _conn() as cn, cn.cursor() as cur:
        cur.execute("""
            SELECT count(*) FROM rule_grants g
            JOIN wh_enhancements e ON e.id = g.source_id
            WHERE g.source_kind = 'enhancement' AND e.edition <> g.edition
        """)
        assert cur.fetchone()[0] == 0
        cur.execute("""
            SELECT count(*) FROM rule_grants g
            JOIN wh_detachments d ON d.id = g.source_id
            WHERE g.source_kind = 'detachment' AND d.edition <> g.edition
        """)
        assert cur.fetchone()[0] == 0


def test_the_conditional_split_is_material():
    """If this ever collapses to zero the condition parsing has silently broken
    and every psychic-only grant is being counted as mortal-wound resistance."""
    with _conn() as cn, cn.cursor() as cur:
        cur.execute("""
            SELECT count(*) FILTER (WHERE applies_to IN ('psychic','other')),
                   count(*)
            FROM rule_grants WHERE edition = '11e' AND granted_rule = 'Feel No Pain'
        """)
        excluded, total = cur.fetchone()
    assert total > 100, f"only {total} grants extracted, expected well over 100"
    assert excluded > 0, (
        "no grants classified as psychic-only or other — an unconditional "
        "feature would count every one of them as mortal-wound resistance"
    )


def test_named_cases_land_correctly():
    """The three the owner and the panel argued over."""
    expected = {
        "Improbable Shield (Aura)":        ("4+", "psychic_and_mortal", "aura"),
        "Brass Collar of Bloody Vengeance": ("3+", "psychic_and_mortal", "self"),
        "Sanctic Hood":                    ("4+", "psychic", "unit"),
    }
    with _conn() as cn, cn.cursor() as cur:
        cur.execute("""
            SELECT DISTINCT source_name, magnitude, applies_to, scope
            FROM rule_grants WHERE source_name = ANY(%s)
        """, (list(expected),))
        got = {r[0]: (r[1], r[2], r[3]) for r in cur.fetchall()}
    for name, want in expected.items():
        assert got.get(name) == want, f"{name}: expected {want}, got {got.get(name)}"
