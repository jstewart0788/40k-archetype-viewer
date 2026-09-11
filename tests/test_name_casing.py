"""Names must not carry the MFM scrape's apostrophe capitalisation.

The MFM scrape title-cases detachment and unit names with a regex that treats
an apostrophe as a word boundary (data/mfm-11e/src/parse.ts:29), so every
possessive arrives capitalised — "Reaper'S Wager", "Emperor'S Shield" — and
"Mont'ka" arrives as "Mont'Ka". Twelve 11e detachments were affected.

It cannot be repaired by lowercasing whatever follows an apostrophe: plenty of
40k names genuinely carry a capital there and the same data contains them.
`Lion El'Jonson` is capital; `Be'lakor`, `Aun'shi` and `Aetaos'rau'keres` are
not, and they are structurally identical. Only knowledge of the real name
separates them, so the community catalogue — which spells all of them correctly
— is the authority, and a name it does not know passes through untouched.
"""

import os
import sys

import psycopg2
import pytest

# pytest is invoked as `.venv/bin/pytest tests/` by npm run test:data, which does
# not put the repo root on sys.path the way `python -m pytest` does. Same shim as
# tests/test_weapon_catalog_per_datasheet.py:29.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from pipeline.mfm_import import apply_catalogue_casing, load_catalogue_casing

SUSPICIOUS = r"[a-zA-Z]['’][A-Z]"


def _conn():
    return psycopg2.connect(
        host=os.environ.get("DB_HOST", "localhost"),
        port=int(os.environ.get("DB_PORT", "5433")),
        dbname=os.environ.get("DB_NAME", "wh40k_meta"),
        user=os.environ.get("DB_USER", "wh40k"),
        password=os.environ.get("DB_PASSWORD", "localdev"),
    )


@pytest.fixture(scope="module")
def casing():
    idx = load_catalogue_casing()
    if not idx:
        pytest.skip("catalogue not present — clone BSData/wh40k-11e into data/cat-11e")
    return idx


@pytest.mark.parametrize("scraped,expected", [
    ("Marshal'S Household",   "Marshal's Household"),
    ("The Phaeron'S Armoury", "The Phaeron's Armoury"),
    ("Reaper’S Wager",   "Reaper's Wager"),
    ("Mont’Ka",          "Mont'ka"),          # not "Mont'Ka"
    ("Lion El’Jonson",   "Lion El'Jonson"),   # capital J is REAL
    ("Be’Lakor",         "Be'lakor"),         # lowercase l is real
    ("Aun’Shi",          "Aun'shi"),
    ("Aetaos’Rau’Keres", "Aetaos'rau'keres"),
])
def test_catalogue_casing_wins(scraped, expected, casing):
    assert apply_catalogue_casing(scraped, casing) == expected


def test_unknown_names_pass_through_untouched(casing):
    """Never guess. A name the catalogue does not know is left exactly as-is."""
    made_up = "Zzyzx'Q Fictional Detachment"
    assert apply_catalogue_casing(made_up, casing) == made_up


def test_index_is_deterministic(casing):
    """An earlier version took an arbitrary element of a set, which made every
    imported name depend on the hash seed."""
    assert load_catalogue_casing() == casing


def test_no_detachment_carries_the_scrape_bug():
    with _conn() as cn, cn.cursor() as cur:
        cur.execute(
            "SELECT id, name FROM wh_detachments WHERE edition = '11e' AND name ~ %s",
            (SUSPICIOUS,),
        )
        bad = cur.fetchall()
    assert not bad, f"detachments still carry a capital after an apostrophe: {bad}"


def test_datasheet_names_keep_genuine_capitals():
    """The guard must not have over-corrected: Lion El'Jonson keeps its J."""
    with _conn() as cn, cn.cursor() as cur:
        cur.execute("""
            SELECT name FROM wh_datasheet_points
            WHERE name ~* 'el.jonson|be.lakor|aun.shi|c.tan shard of the deceiver'
            ORDER BY 1
        """)
        got = [r[0] for r in cur.fetchall()]
    assert "Lion El'Jonson" in got, f"genuine capital lost: {got}"
    assert "Be'lakor" in got and "Aun'shi" in got, f"over-corrected or missed: {got}"


def test_stratagem_all_caps_names_are_left_alone():
    """ANGEL'S SACRIFICE is correct — the whole name is uppercase by convention.
    76 stratagems match the naive pattern and none of them is a defect."""
    with _conn() as cn, cn.cursor() as cur:
        cur.execute("""
            SELECT count(*) FROM wh_stratagems
            WHERE edition = '11e' AND name ~ %s AND name <> upper(name)
        """, (SUSPICIOUS,))
        assert cur.fetchone()[0] == 0
