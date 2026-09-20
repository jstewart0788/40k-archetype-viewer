"""Shape guards for the reference import, from defects a refresh introduced.

All three were found by diffing the reference tables before and after the
2026-09-18 refresh. None raised, and none changed a row count enough to notice:
they moved content sideways.

  * Upstream began filing transport capacity as a `Transport`-typed profile
    named after the unit. That type is excluded as a stat block, so 5 Agents of
    the Imperium datasheets silently lost their transport rule.
  * A weapon gained a '➤' sub-profile marker upstream, which changed its
    normalised name and therefore its id, because the id hashes that name.
  * Punctuation edits to a detachment name produced duplicate rows (covered in
    tests/test_detachment_retirement.py).
"""
import os

import pytest

psycopg2 = pytest.importorskip("psycopg2")

EDITION = "11e"


def _conn():
    try:
        return psycopg2.connect(
            host=os.environ.get("DB_HOST", "127.0.0.1"),
            port=int(os.environ.get("DB_PORT", "5433")),
            dbname=os.environ.get("DB_NAME", "wh40k_meta"),
            user=os.environ.get("DB_USER", "wh40k"),
            password=os.environ.get("DB_PASSWORD", "localdev"),
            connect_timeout=3,
        )
    except Exception as exc:                                # pragma: no cover
        pytest.skip(f"database unavailable: {exc}")


@pytest.fixture(scope="module")
def conn():
    c = _conn()
    yield c
    c.close()


def test_transport_units_carry_their_transport_rule(conn):
    """A TRANSPORT unit whose capacity is missing silently ceases to be one.

    Legends datasheets are exempt: they are not maintained upstream, and the
    five that fail here have been incomplete for longer than this defect.
    """
    with conn.cursor() as cur:
        cur.execute("""
            SELECT s.faction_id, s.name
              FROM wh_datasheet_stats s
              JOIN wh_datasheet_keywords k
                ON k.datasheet_id = s.id AND k.keyword ILIKE 'transport'
             WHERE s.edition = %s AND s.name NOT ILIKE '%%[legends]%%'
               AND NOT EXISTS (SELECT 1 FROM wh_datasheet_abilities a
                                WHERE a.datasheet_id = s.id AND a.name = 'Transport')
             ORDER BY 1, 2""", (EDITION,))
        assert cur.fetchall() == []


def test_transport_rules_are_filed_under_one_name(conn):
    """Both upstream spellings land as 'Transport', not as the unit's name.

    Otherwise "does this thing carry models" is answerable only by knowing which
    week the datasheet was scraped.
    """
    with conn.cursor() as cur:
        cur.execute("""
            SELECT count(*) FROM wh_datasheet_abilities a
              JOIN wh_datasheet_stats s ON s.id = a.datasheet_id
             WHERE s.edition = %s AND a.name = 'Transport'""", (EDITION,))
        assert cur.fetchone()[0] > 150
        cur.execute("""
            SELECT s.name, a.name FROM wh_datasheet_abilities a
              JOIN wh_datasheet_stats s ON s.id = a.datasheet_id
             WHERE s.edition = %s AND a.name = s.name
               AND a.description ILIKE 'this %% transport capacity%%'""", (EDITION,))
        assert cur.fetchall() == []


def test_weapon_names_carry_no_sub_profile_marker(conn):
    """'➤' is presentation. Leaving it in a name changes the weapon's identity.

    Apostrophe-initial Ork weapon names ("'uge choppa") are legitimate, so this
    checks for the marker characters rather than requiring a leading letter.
    """
    with conn.cursor() as cur:
        cur.execute("""
            SELECT DISTINCT name FROM wh_weapon_stats
             WHERE edition = %s AND (name ~ '^[•►➤>]'
                                  OR normalized_name ~ '^[•►➤>]')
             LIMIT 10""", (EDITION,))
        assert cur.fetchall() == []


def test_weapon_ids_are_stable_for_unchanged_profiles(conn):
    """The id hashes the normalised name, so a cosmetic rename re-keys the row.

    Guards the shape that makes that possible rather than the incident: every
    id must be reproducible from (datasheet, type, normalised name).
    """
    import hashlib
    with conn.cursor() as cur:
        cur.execute("""
            SELECT dw.datasheet_id, w.weapon_type, w.normalized_name, w.id
              FROM wh_datasheet_weapons dw
              JOIN wh_weapon_stats w ON w.id = dw.weapon_id
             WHERE w.edition = %s LIMIT 500""", (EDITION,))
        for ds_id, wt, norm, wid in cur.fetchall():
            key = f"{ds_id}|{wt}|{norm}"
            assert wid == f"11e-wpn-{hashlib.md5(key.encode()).hexdigest()[:16]}"
