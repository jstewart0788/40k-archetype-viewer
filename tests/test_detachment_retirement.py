"""A withdrawn detachment must not take played lists down with it.

Codex: Orks (MFM v1.4) withdrew five Ork detachments. The importer pruned rows
that vanish upstream, list_detachments cascaded from them, and 404 lists that
had legally fielded one lost their detachment. The symptom pointed the wrong
way, as it did in 2026-08: v_list_detachments falls back to lists.detachment_id,
so coverage looked healthy while the junction was gone. Measured before the fix,
pre-codex Ork junction coverage was 0.668 against 0.970 for every other faction.

Migration 041 keeps retired rows and makes the delete a hard error; these
tests keep both properties true.
"""
import os

import pytest

psycopg2 = pytest.importorskip("psycopg2")

EDITION = "11e"
# Withdrawn by Codex: Orks. Named explicitly because the lists that fielded them
# are the evidence for what the codex changed — the slice most worth keeping.
WITHDRAWN = ["Equatorial Hordes", "Freebooter Krew", "More Dakka",
             "Rollin' Deff", "Speedwaaagh!"]

# (faction, detachment) priced by the field manual but carrying no rule text in
# ANY source we hold. Not a matching failure — the rules are simply not
# published anywhere we read. Remove an entry the moment a source supplies it.
TEXTLESS_IN_EVERY_SOURCE = {("GC", "Brood Brothers Auxilia")}


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


def test_deleting_a_detachment_with_lists_is_refused(conn):
    """The mechanism, not the instruction.

    The importer now retires instead of deleting, but an importer is one
    caller. RESTRICT is what stops the next script, or a manual DELETE, from
    cascading the junction away again.
    """
    with conn, conn.cursor() as cur:
        cur.execute("""SELECT detachment_id FROM list_detachments LIMIT 1""")
        det_id = cur.fetchone()[0]
        with pytest.raises(psycopg2.errors.ForeignKeyViolation):
            cur.execute("DELETE FROM wh_detachments WHERE id = %s", (det_id,))
        conn.rollback()


def test_withdrawn_detachments_are_retired_not_missing(conn):
    with conn.cursor() as cur:
        cur.execute("""SELECT name, retired_in_version FROM wh_detachments
                        WHERE edition = %s AND faction_id = 'ORK'
                          AND name = ANY(%s)""", (EDITION, WITHDRAWN))
        rows = dict(cur.fetchall())
    assert sorted(rows) == sorted(WITHDRAWN)
    assert all(v is not None for v in rows.values())


def test_lists_that_fielded_them_still_have_their_detachment(conn):
    """The lists are the point; the reference row is only how we name it."""
    with conn.cursor() as cur:
        cur.execute("""SELECT count(*) FROM list_detachments ld
                         JOIN wh_detachments d ON d.id = ld.detachment_id
                        WHERE d.retired_in_version IS NOT NULL""")
        assert cur.fetchone()[0] > 500


def test_pre_codex_ork_coverage_matches_other_factions(conn):
    """The figure that exposed the loss: 0.668 against 0.970.

    Held against the rest of the corpus rather than an absolute floor, so it
    keeps working when parsing improves or degrades across the board.
    """
    with conn.cursor() as cur:
        cur.execute("""
            WITH l AS (
              SELECT l.id,
                     (r.resolved_faction_id = 'eZJfglDuWZ') AS ork,
                     EXISTS (SELECT 1 FROM list_detachments ld
                              WHERE ld.list_id = l.id) AS has_det
                FROM lists l
                JOIN events e ON e.id = l.event_id AND e.edition = %s
                JOIN m_resolved_player_faction r ON r.player_id = l.player_id
               WHERE e.event_date < DATE '2026-09-02' AND l.parse_status = 'done')
            SELECT ork, avg(has_det::int) FROM l WHERE ork IS NOT NULL GROUP BY 1
        """, (EDITION,))
        cov = {k: float(v) for k, v in cur.fetchall()}
    assert cov[True] >= cov[False] - 0.05, f"Ork {cov[True]:.3f} vs rest {cov[False]:.3f}"


def test_no_two_detachments_share_a_name_within_a_faction(conn):
    """Punctuation is not identity.

    Upstream dropped the comma from 'Ordo Hereticus, Purgation Force' on
    2026-09-17. Every name comparison in the importers missed, so three
    detachments were duplicated: one copy held the list junction, the other the
    rule text, and both would have been counted in detachment shares.
    """
    with conn.cursor() as cur:
        cur.execute("""
            SELECT faction_id, regexp_replace(lower(name), '[^a-z0-9]', '', 'g') AS k,
                   count(*), array_agg(name)
              FROM wh_detachments WHERE edition = %s
             GROUP BY 1, 2 HAVING count(*) > 1""", (EDITION,))
        assert cur.fetchall() == []


def test_live_detachments_with_lists_have_rule_text(conn):
    """A detachment people are playing that carries no rules is a broken match.

    Retired rows are exempt: their rule text legitimately left with the codex,
    and no current-meta surface reads them.

    SOURCE GAPS ARE ALLOWLISTED, NOT TOLERATED BY THRESHOLD. Brood Brothers
    Auxilia is priced by the field manual and fielded by 13 lists, but no source
    we hold carries its rules — the Genestealer Cults catalogue has no such
    detachment and the reference export has no row for it. A threshold would
    hide the next one; the allowlist makes a new gap fail and is itself checked
    below, so it cannot quietly go stale.
    """
    with conn.cursor() as cur:
        cur.execute("""
            SELECT d.faction_id, d.name, count(DISTINCT ld.list_id) AS lists
              FROM wh_detachments d
              JOIN list_detachments ld ON ld.detachment_id = d.id
             WHERE d.edition = %s AND d.retired_in_version IS NULL
               AND NOT EXISTS (SELECT 1 FROM wh_detachment_abilities a
                                WHERE a.detachment_id = d.id
                                  AND coalesce(a.description, '') <> '')
             GROUP BY 1, 2 HAVING count(DISTINCT ld.list_id) >= 5
             ORDER BY 3 DESC""", (EDITION,))
        found = {(f, n) for f, n, _ in cur.fetchall()}
    assert found <= TEXTLESS_IN_EVERY_SOURCE, found - TEXTLESS_IN_EVERY_SOURCE


def test_allowlisted_gaps_are_still_gaps(conn):
    """Stops the allowlist outliving the gap it documents."""
    with conn.cursor() as cur:
        for faction, name in TEXTLESS_IN_EVERY_SOURCE:
            cur.execute("""SELECT count(*) FROM wh_detachments d
                             JOIN wh_detachment_abilities a ON a.detachment_id = d.id
                            WHERE d.edition = %s AND d.faction_id = %s AND d.name = %s
                              AND coalesce(a.description, '') <> ''""",
                        (EDITION, faction, name))
            assert cur.fetchone()[0] == 0, (
                f"{faction} {name} has rules now — drop it from the allowlist")
