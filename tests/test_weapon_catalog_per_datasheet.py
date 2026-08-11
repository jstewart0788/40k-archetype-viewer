"""The weapon catalog must key by datasheet, and must not depend on row order.

Both assertions here are IMPOSSIBLE PROPERTIES, not quality thresholds, per this
repo's convention: a threshold on a quality metric drifts and gets tuned, while
an impossible property either holds or names a real defect.

WHAT WENT WRONG: `load_weapon_catalog` selected from `wh_weapon_stats` with NO
ORDER BY and applied first-write-wins keyed on weapon NAME. A weapon name is not
unique — "close combat weapon" has 397 profiles across 397 datasheets and 41
distinct statlines (attacks 1-6), "power weapon" 143 and 25, and 516 of 2,421
11e names carry conflicting stats. So one arbitrary profile was applied to every
datasheet sharing the name, chosen by heap order, which `cat_import` reshuffles
on every run by deleting and re-inserting the edition.

It was not noise. The surviving profile skewed toward a character's or a heavy
variant rather than the common troop one, so per-list total attacks were
systematically OVERSTATED — fixing it moved them by a median of -8 (p10 -44,
p90 +17) across 11,001 of 11,450 lists.

These tests need the database. They skip when it is unreachable, like the rest
of the DB-backed suite.
"""

from __future__ import annotations
import os
import sys
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

psycopg2 = pytest.importorskip("psycopg2")


@pytest.fixture(scope="module")
def conn():
    try:
        c = psycopg2.connect(
            host=os.environ.get("DB_HOST", "localhost"),
            port=int(os.environ.get("DB_PORT", "5433")),
            dbname=os.environ.get("DB_NAME", "wh40k_meta"),
            user=os.environ.get("DB_USER", "wh40k"),
            password=os.environ.get("DB_PASSWORD", "localdev"),
            connect_timeout=3,
        )
    except Exception as exc:                                  # pragma: no cover
        pytest.skip(f"database unreachable: {exc}")
    yield c
    c.close()


def _target_edition():
    from pipeline.edition import TARGET_EDITION
    return TARGET_EDITION


def test_catalog_does_not_collapse_same_named_weapons(conn):
    """Every name that genuinely differs across datasheets must still differ
    after loading.

    Ground truth comes from SQL, not from the loader, so this cannot be
    satisfied by the loader agreeing with itself. A name-keyed loader scores 0
    distinct-profile names and fails immediately.
    """
    if _target_edition() != "11e":
        pytest.skip("per-datasheet weapon catalog is 11e-only")
    from pipeline.list_features import load_weapon_catalog

    with conn.cursor() as cur:
        # Names that differ ACROSS datasheets — what a (datasheet, name) key is
        # responsible for preserving. Measured by taking one profile per
        # datasheet first, so a weapon that differs only WITHIN a datasheet
        # (see the dual-profile test below) is not counted against this key.
        # The representative per (datasheet, name) must be chosen the SAME way
        # the loader chooses it — smallest weapon id — or the two disagree for
        # dual-profile weapons and this test compares different things.
        cur.execute("""
            SELECT count(*) FROM (
              SELECT nm FROM (
                SELECT DISTINCT ON (dw.datasheet_id, w.normalized_name)
                       w.normalized_name AS nm,
                       (w.attacks, w.strength, w.ap, w.weapon_type)::text AS prof
                  FROM wh_datasheet_weapons dw
                  JOIN wh_weapon_stats w ON w.id = dw.weapon_id
                 WHERE w.edition = '11e'
                 ORDER BY dw.datasheet_id, w.normalized_name, w.id
              ) per_ds
              GROUP BY nm
              HAVING count(DISTINCT prof) > 1
            ) t
        """)
        expected = cur.fetchone()[0]

    assert expected > 0, (
        "no weapon name differs across datasheets in the reference data — "
        "either the catalogue import regressed to one profile per name, or "
        "this test is checking the wrong tables"
    )

    by_ds, _ = load_weapon_catalog(conn)
    seen: dict[str, set] = {}
    for (_ds_id, name), profiles in by_ds.items():
        # Compare the same representative the reference query picks: the first
        # profile, which the loader writes in (datasheet, name, id) order.
        e = profiles[0]
        seen.setdefault(name, set()).add(
            (e["attacks_text"], e["strength"], e["ap"], e["weapon_type"])
        )
    got = sum(1 for variants in seen.values() if len(variants) > 1)

    # >= not ==, deliberately. The failure mode is COLLAPSE, and any collapse
    # drives this below `expected`; a name-keyed loader scores 0 against 242.
    # The catalog legitimately carries MORE keys than the reference query
    # models, because firing-mode rows ("plasma pistol - supercharge") are also
    # written under their base name, and those base keys can vary across
    # datasheets too. Asserting equality would make this test fail whenever the
    # catalogue gains a mode variant — a false alarm about the wrong thing.
    assert got >= expected, (
        f"catalog preserves only {got} across-datasheet weapon variants but the "
        f"reference data has at least {expected}. Distinct profiles are being "
        f"collapsed onto one name — the defect this file exists to prevent."
    )


def test_dual_profile_weapons_keep_both_profiles(conn):
    """A weapon carrying BOTH a shooting and a melee profile on one datasheet
    must keep both.

    Castellan axes and abyssal lances shoot AND fight — 48 names across 119
    (datasheet, name) pairs, every one a melee/ranged dual rather than a data
    error. Keeping a single profile let the id tie-break silently decide whether
    such a weapon counted toward melee or ranged attack volume, charging one
    phase with everything and the other with nothing.

    So catalog values are LISTS. One parsed weapon string still counts as ONE
    match; each profile contributes its attacks to its own phase.
    """
    if _target_edition() != "11e":
        pytest.skip("per-datasheet weapon catalog is 11e-only")
    from pipeline.list_features import load_weapon_catalog

    with conn.cursor() as cur:
        cur.execute("""
            SELECT dw.datasheet_id, w.normalized_name
              FROM wh_datasheet_weapons dw
              JOIN wh_weapon_stats w ON w.id = dw.weapon_id
             WHERE w.edition = '11e'
             GROUP BY 1, 2
            HAVING count(DISTINCT w.weapon_type) > 1
        """)
        duals = cur.fetchall()

    assert duals, (
        "no dual-profile weapons found in the reference data — either the "
        "catalogue import regressed, or this test is reading the wrong tables"
    )

    by_ds, by_name = load_weapon_catalog(conn)
    # The loader strips the leading '➤' mode marker from keys, so normalize the
    # reference names the same way or this compares two different strings.
    missing = [
        (ds, nm) for ds, nm in duals
        if len({p["weapon_type"]
                for p in by_ds.get((ds, (nm or "").lstrip("➤").strip()), [])}) < 2
    ]
    assert not missing, (
        f"{len(missing)} of {len(duals)} dual-profile weapons lost a profile, "
        f"e.g. {missing[:3]}. Their attacks are being charged entirely to one "
        f"phase."
    )

    # The name-only fallback must NOT do this. It is keyed by name alone, so
    # accumulating every profile would make "close combat weapon" carry all 397
    # datasheets' profiles and charge one parsed string with the sum — which is
    # exactly the bug this suite caught during development.
    worst = max(len(v) for v in by_name.values())
    assert worst == 1, (
        f"the name-only fallback holds up to {worst} profiles under one name; "
        f"it must keep exactly one deterministic representative, or a single "
        f"weapon string is charged with the sum of every datasheet's version"
    )


def test_catalog_is_independent_of_row_order(conn):
    """Loading twice under different scan strategies must give the same answer.

    This is the property the old loader lacked: with no ORDER BY, the winner was
    whatever the heap returned, so a plan change or a catalogue re-import could
    silently alter a statline with no code change.
    """
    if _target_edition() != "11e":
        pytest.skip("per-datasheet weapon catalog is 11e-only")
    from pipeline.list_features import load_weapon_catalog

    first_ds, first_name = load_weapon_catalog(conn)
    with conn.cursor() as cur:
        cur.execute("SET LOCAL enable_seqscan = off")
        second_ds, second_name = load_weapon_catalog(conn)
    conn.rollback()

    def sig(d):
        return {k: tuple(p["attacks_text"] for p in v) for k, v in d.items()}

    assert sig(first_ds) == sig(second_ds), (
        "per-datasheet catalog changed between two loads in one session — "
        "resolution still depends on row order"
    )
    assert sig(first_name) == sig(second_name), (
        "name-only fallback catalog changed between two loads — the fallback "
        "is non-deterministic even if the primary map is not"
    )
