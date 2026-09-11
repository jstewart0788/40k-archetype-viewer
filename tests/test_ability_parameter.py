"""Rule parameters must survive the catalogue import.

11e expresses a parameterised core rule as the generic rule plus a modifier
appending the magnitude to the displayed name:

    {"name": "Feel No Pain", "type": "rule",
     "modifiers": [{"type": "append", "field": "name", "value": "5+"}]}

cat_import read `name` and dropped `modifiers`, so 941 instances across 9 rule
names landed with no magnitude — ~14% of all 11e ability play instances. Feel
No Pain is the load-bearing case: 4+ is three times the mitigation of 6+, and
mortal-wound resistance cannot be measured without it.

These tests fail loudly if that regresses, and they also pin the design
decision that `name` stays the BARE rule (see test_name_is_not_parameterised).
"""

import json
import glob
import os
import sys

import psycopg2
import pytest

# pytest is invoked as `.venv/bin/pytest tests/` by npm run test:data, which does
# not put the repo root on sys.path the way `python -m pytest` does. Same shim as
# tests/test_weapon_catalog_per_datasheet.py:29.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from pipeline.cat_import import _rule_parameter

# Measured 2026-08-18 over the 46 11e catalogues. A drop below this means the
# importer, the catalogues, or the modifier grammar changed.
# Modifier-path instances measured directly against the catalogues.
EXPECTED_MODIFIER_INSTANCES = 941
# Total rows in the database, which also includes parameterised rules filed as
# plain abilities whose only text IS the magnitude (Trajann Valoris carries
# `Feel No Pain` with the single characteristic "5+").
EXPECTED_DB_ROWS = 1114
EXPECTED_RULE_NAMES = {
    "Anti", "Deadly Demise", "Feel No Pain", "Firing Deck", "Lone Operative",
    "Rapid Fire", "Scouts", "Super-Heavy Walker", "Sustained Hits",
}


def _conn():
    return psycopg2.connect(
        host=os.environ.get("DB_HOST", "localhost"),
        port=int(os.environ.get("DB_PORT", "5433")),
        dbname=os.environ.get("DB_NAME", "wh40k_meta"),
        user=os.environ.get("DB_USER", "wh40k"),
        password=os.environ.get("DB_PASSWORD", "localdev"),
    )


def _walk_rules(node):
    if isinstance(node, dict):
        if node.get("type") == "rule" and node.get("name"):
            yield node
        for v in node.values():
            yield from _walk_rules(v)
    elif isinstance(node, list):
        for v in node:
            yield from _walk_rules(v)


@pytest.fixture(scope="module")
def catalogue_params():
    found = []
    for path in glob.glob("data/cat-11e/*.json"):
        try:
            doc = json.load(open(path))
        except Exception:
            continue
        for node in _walk_rules(doc):
            p = _rule_parameter(node)
            if p:
                found.append((node["name"], p))
    return found


def test_extractor_finds_every_parameter(catalogue_params):
    """The source data still carries what we measured, and we still read it."""
    assert len(catalogue_params) >= EXPECTED_MODIFIER_INSTANCES, (
        f"only {len(catalogue_params)} parameterised rules found in the "
        f"catalogues, expected at least {EXPECTED_MODIFIER_INSTANCES}"
    )
    assert {n for n, _ in catalogue_params} >= EXPECTED_RULE_NAMES


def test_numeric_values_are_not_dropped():
    """`value` is a JSON number for Firing Deck, not a string."""
    node = {"name": "Firing Deck", "type": "rule",
            "modifiers": [{"type": "append", "field": "name", "value": 2}]}
    assert _rule_parameter(node) == "2"


def test_non_name_modifiers_are_ignored():
    """Only name-modifiers carry the magnitude; others must not leak in."""
    node = {"name": "Some Rule", "type": "rule",
            "modifiers": [{"type": "set", "field": "hidden", "value": "true"}]}
    assert _rule_parameter(node) is None


def test_parameters_reach_the_database():
    """The column is populated after an import, not merely present."""
    with _conn() as cn, cn.cursor() as cur:
        cur.execute("""
            SELECT count(*), count(DISTINCT name)
            FROM wh_datasheet_abilities
            WHERE edition = '11e' AND parameter IS NOT NULL
        """)
        rows, names = cur.fetchone()
    assert rows >= EXPECTED_DB_ROWS, (
        f"{rows} parameterised ability rows in the database, expected at least "
        f"{EXPECTED_DB_ROWS} — has cat_import been re-run since migration 037?"
    )
    assert names >= len(EXPECTED_RULE_NAMES)


def test_feel_no_pain_magnitudes_are_all_present():
    """The case that blocks mortal-wound resistance."""
    with _conn() as cn, cn.cursor() as cur:
        cur.execute("""
            SELECT parameter, count(*)
            FROM wh_datasheet_abilities
            WHERE edition = '11e' AND name = 'Feel No Pain'
            GROUP BY parameter ORDER BY parameter
        """)
        got = dict(cur.fetchall())
    for magnitude in ("4+", "5+", "6+"):
        assert got.get(magnitude), f"no Feel No Pain {magnitude} rows survived import"


def test_unparameterised_rule_rows_have_a_sibling_that_carries_the_magnitude():
    """A bare `Feel No Pain` row is a pointer, not a loss — but only if the
    grant really is somewhere else on the same datasheet.

    14 datasheets reference the generic rule ("This ability always takes the
    form Feel No Pain X+") and take the actual grant from a sibling ability that
    carries BOTH the magnitude and its condition — Karanak's Brass Collar of
    Bloody Vengeance is Feel No Pain 3+ against Psychic Attacks and mortal
    wounds, while the Brotherhood Librarian's Sanctic Hood is 4+ against Psychic
    Attacks only and is therefore NOT mortal-wound resistance.

    The magnitude sits on either side of the rule name and sometimes in the
    sibling's NAME rather than its text — Aberrants carry an ability literally
    named "Feel No Pain 5+" described as "This unit has a 5+ Feel No Pain".

    Note for whoever builds the mortal-wound feature: Kroot Flesh Shaper's text
    reads "Feel Not Pain 6+" in the source data. Match tolerantly or lose it.
    """
    # Measured 2026-08-18: one datasheet references Feel No Pain with no
    # magnitude anywhere on it. That is an upstream gap, not an import bug, and
    # it is pinned here so the test fires if the gap ever GROWS.
    KNOWN_UPSTREAM_GAPS = {"11e-AoI-exaction-squad"}

    with _conn() as cn, cn.cursor() as cur:
        cur.execute("""
            WITH bare AS (
                SELECT datasheet_id FROM wh_datasheet_abilities
                WHERE edition = '11e' AND name = 'Feel No Pain' AND parameter IS NULL
            )
            SELECT b.datasheet_id FROM bare b
            WHERE NOT EXISTS (
                SELECT 1 FROM wh_datasheet_abilities sib
                WHERE sib.datasheet_id = b.datasheet_id
                  AND sib.edition = '11e'
                  AND (
                        sib.name ~* 'feel no[t]? pain\\s*\\d\\+'
                     OR sib.description ~* 'feel no[t]? pain[^.]{0,30}\\d\\+'
                     OR sib.description ~* '\\d\\+[^.]{0,30}feel no[t]? pain'
                  )
            )
        """)
        orphans = {r[0] for r in cur.fetchall()}

    new_gaps = orphans - KNOWN_UPSTREAM_GAPS
    assert not new_gaps, (
        "new datasheets reference Feel No Pain with no magnitude anywhere: "
        + ", ".join(sorted(new_gaps))
    )
    healed = KNOWN_UPSTREAM_GAPS - orphans
    assert not healed, (
        "these upstream gaps are fixed — drop them from KNOWN_UPSTREAM_GAPS: "
        + ", ".join(sorted(healed))
    )


def test_magnitude_only_descriptions_are_split_out():
    """No core rule WITH a library definition may keep a bare magnitude as text.

    Trajann Valoris carried `Feel No Pain` whose only characteristic was "5+",
    which published the magnitude as the rule's text and left it unqueryable.
    Scoped to rules the game system actually defines: `Invulnerable Save` has no
    library entry and its magnitude legitimately IS its whole description.
    """
    DEFINED_RULES = ("Feel No Pain", "Scouts", "Deadly Demise",
                     "Firing Deck", "Rapid Fire", "Sustained Hits")
    with _conn() as cn, cn.cursor() as cur:
        cur.execute("""
            SELECT id, name, description FROM wh_datasheet_abilities
            WHERE edition = '11e'
              AND name = ANY(%s)
              AND description ~ '^\\s*(\\d*D\\d+(\\+\\d+)?|\\d+\\+?|\\d+")\\s*$'
        """, (list(DEFINED_RULES),))
        stragglers = cur.fetchall()
    assert not stragglers, (
        f"{len(stragglers)} abilities still carry a magnitude where their rule "
        f"text belongs, e.g. {stragglers[:3]}"
    )


def test_name_is_not_parameterised():
    """`name` stays the bare rule; consumers match it exactly.

    pipeline/listlab/full.py:85 tests `'scouts' in kw` against lowercased rule
    names. Folding the magnitude into `name` would make that membership test
    silently false for every Scouts unit rather than failing loudly.
    """
    with _conn() as cn, cn.cursor() as cur:
        cur.execute("""
            SELECT count(*) FROM wh_datasheet_abilities
            WHERE edition = '11e'
              AND ability_type = 'rule'
              AND (name ~ '\\d\\+$' OR name ~ '"$' OR name ~ '\\dD\\d')
        """)
        leaked = cur.fetchone()[0]
    assert leaked == 0, f"{leaked} rule rows have the magnitude folded into name"
