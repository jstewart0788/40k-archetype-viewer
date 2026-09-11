"""Tripwires for the Legends / rename resolution tiers added in migration 039.

The defect these guard against is not "a unit fails to resolve" — it is a rule
that treats failing to resolve as failing to be LEGAL. Measured on the
2026-09-10 corpus, Ork lists split three ways:

    clean                    818 lists  54.7% win  +6.51 VP
    holds a Legends unit     295 lists  62.5% win  +11.70 VP
    holds a deleted unit      65 lists  50.7% win  +3.41 VP

so the slice a naive gate would delete first is the faction's strongest. A
resolution-keyed exclusion scores precision 0.076 and correlates r=-0.19 with
list_features.weapon_match_confidence — it detects badly-parsed lists, not
illegal ones, and guard R3 bars it from user-facing advice on exactly that
basis. These tests keep the resolver honest so no one is tempted to build it.
"""
import os

import pytest

psycopg2 = pytest.importorskip("psycopg2")


def _conn():
    try:
        return psycopg2.connect(
            host=os.environ.get("DB_HOST", "127.0.0.1"),
            port=int(os.environ.get("DB_PORT", "5433")),
            dbname=os.environ.get("DB_NAME", "wh40k_meta"),
            user=os.environ.get("DB_USER", "wh40k"),
            password=os.environ.get("DB_PASSWORD", "localdev"),
        )
    except Exception as exc:                                # pragma: no cover
        pytest.skip(f"database unavailable: {exc}")


def test_legends_datasheets_resolve():
    """A Legends unit is playable and must resolve to a statline.

    wh_datasheet_stats names it 'lootas [legends]'; wh_datasheet_points names
    the same unit 'lootas' with is_legends=TRUE. A player types neither, so
    before 039 these were invisible — 350 Ork lists carried a unit the
    pipeline treated as unknown.
    """
    with _conn() as cn, cn.cursor() as cur:
        cur.execute("""
            SELECT normalized_name, resolution_tier
              FROM mv_datasheet_resolution
             WHERE army_faction_id = 'ORK'
               AND normalized_name IN ('lootas', 'burna boyz')
        """)
        got = dict(cur.fetchall())
    assert got.get("lootas") == "legends", f"lootas unresolved or mis-tiered: {got}"
    assert got.get("burna boyz") == "legends", f"burna boyz unresolved or mis-tiered: {got}"


def test_renamed_datasheets_resolve_to_the_new_name():
    with _conn() as cn, cn.cursor() as cur:
        cur.execute("""
            SELECT normalized_name, datasheet_id
              FROM mv_datasheet_resolution
             WHERE army_faction_id = 'ORK'
               AND normalized_name IN ('wartrakk', 'rukkatrukk squigbuggy')
        """)
        got = dict(cur.fetchall())
    assert got.get("wartrakk") == "11e-ORK-wartrakks", got
    assert got.get("rukkatrukk squigbuggy") == "11e-ORK-rukkatrukk-squigbuggies", got


def test_legends_tier_never_outranks_a_live_datasheet():
    """THE ONE THAT MATTERS.

    is_legends is set per (faction, name), not per name: 'deathwatch terminator
    squad' is Legends for Imperial Agents and live for Deathwatch; 'venerable
    dreadnought' is Legends for Space Marines and live for Grey Knights and
    Space Wolves. A name-keyed rule read Deathwatch as 95.9% Legends-exposed
    when the true figure is zero, and would have deleted the faction from the
    site. The Legends tier is ranked below 'foreign' so a live datasheet of the
    same name always wins; this asserts that ordering holds.
    """
    with _conn() as cn, cn.cursor() as cur:
        cur.execute("""
            SELECT r.army_faction_id, r.normalized_name, r.resolution_tier
              FROM mv_datasheet_resolution r
             WHERE r.resolution_tier = 'legends'
               AND EXISTS (
                     SELECT 1 FROM wh_datasheet_stats s
                      WHERE s.edition = '11e'
                        AND s.normalized_name = r.normalized_name)
        """)
        shadowed = cur.fetchall()
    assert not shadowed, (
        f"{len(shadowed)} name(s) resolved to a Legends row while a live "
        f"datasheet of the same name exists: {shadowed[:5]}"
    )


def test_genuinely_removed_datasheets_still_do_not_resolve():
    """The converse guard: 039 must not paper over a real deletion.

    These four Ork buggies left the catalogue entirely at MFM v1.4 — absent
    from wh_datasheet_stats AND wh_datasheet_points under every faction. If a
    future alias or fuzzy tier starts resolving them, the distinction between
    'renamed' and 'deleted' has collapsed and any downstream legality signal
    built on it is wrong.
    """
    removed = ["shokkjump dragsta", "boomdakka snazzwagon",
               "kustom boosta-blasta", "megatrakk scrapjet"]
    with _conn() as cn, cn.cursor() as cur:
        cur.execute("""
            SELECT normalized_name FROM mv_datasheet_resolution
             WHERE army_faction_id = 'ORK' AND normalized_name = ANY(%s)
        """, (removed,))
        resolved = [r[0] for r in cur.fetchall()]
    assert not resolved, f"removed datasheets should not resolve: {resolved}"


def test_resolution_is_deterministic():
    """The unique index is the real guard; this fails louder if it is dropped."""
    with _conn() as cn, cn.cursor() as cur:
        cur.execute("""
            SELECT COUNT(*) FROM (
              SELECT army_faction_id, normalized_name
                FROM mv_datasheet_resolution
               GROUP BY 1, 2 HAVING COUNT(*) > 1) t
        """)
        assert cur.fetchone()[0] == 0
