"""The rules-version spine must stay complete, closed and self-maintaining.

Migration 027 seeded two versions and tagged the events that existed that day.
Nothing tagged an event for the next five weeks: the extractor only handles 10th
edition and classify_editions sets `edition` after the fact. 338 of 733 11e
events sat NULL, v1.1 was left open when v1.2 shipped, and because
build_ui_data reads "the version with no successor" as the current one, every
composition panel on the site was built from 122 events in a ten-day window
while presenting itself as the current meta.

Nothing errored. These are the assertions that would have made it loud.
"""
import os
import sys
from datetime import date

import pytest

psycopg2 = pytest.importorskip("psycopg2")

# `.venv/bin/pytest tests/` does not put the repo root on sys.path the way
# `python -m pytest` does. Same shim as tests/test_rule_grants.py:26.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

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


def test_every_event_carries_a_rules_version(conn):
    with conn.cursor() as cur:
        cur.execute("""SELECT count(*) FROM events
                        WHERE edition = %s AND event_date IS NOT NULL
                          AND dataslate_version IS NULL""", (EDITION,))
        assert cur.fetchone()[0] == 0


def test_versions_cover_the_corpus_without_gaps(conn):
    """Every day from the first event to the last resolves to exactly one version.

    A gap is worse than a missing row: the events inside it read as "no rules
    version", which is indistinguishable from "not yet classified".
    """
    with conn.cursor() as cur:
        cur.execute("""SELECT min(event_date)::date, max(event_date)::date
                         FROM events WHERE edition = %s""", (EDITION,))
        first, last = cur.fetchone()
        cur.execute("""
            SELECT d::date FROM generate_series(%s::date, %s::date, '1 day') d
             WHERE rules_version_asof(%s, d::date) IS NULL""",
                    (first, last, EDITION))
        assert cur.fetchall() == []


def test_open_version_is_the_newest_one(conn):
    """At most one version may be open, and it must be the last published.

    v1.1 stayed open for five weeks after v1.2 superseded it, which is what
    pinned the composition panels to July.
    """
    with conn.cursor() as cur:
        cur.execute("""SELECT version, effective_from FROM dataslate_versions
                        WHERE edition = %s AND superseded_at IS NULL""", (EDITION,))
        open_rows = cur.fetchall()
        assert len(open_rows) == 1
        cur.execute("""SELECT max(effective_from) FROM dataslate_versions
                        WHERE edition = %s""", (EDITION,))
        assert open_rows[0][1] == cur.fetchone()[0]


def test_tag_survives_a_later_edition_classification(conn):
    """The trigger, not a one-shot UPDATE, is what keeps the tag true.

    Reproduces the exact sequence that produced the 338 NULLs: a row arrives or
    is re-classified after the version rows were seeded. Rolled back.
    """
    with conn, conn.cursor() as cur:
        cur.execute("""SELECT id FROM events
                        WHERE edition = %s AND dataslate_version IS NOT NULL
                        LIMIT 1""", (EDITION,))
        eid = cur.fetchone()[0]
        cur.execute("UPDATE events SET edition = NULL WHERE id = %s", (eid,))
        cur.execute("UPDATE events SET edition = %s WHERE id = %s", (EDITION, eid))
        cur.execute("SELECT dataslate_version FROM events WHERE id = %s", (eid,))
        assert cur.fetchone()[0] is not None
        conn.rollback()


def test_current_rules_window_is_the_newest_version_we_hold_games_for(conn):
    """build_ui_data's composition population, re-derived independently here.

    Asserts the two properties that failed in production: it is not empty, and
    it is anchored on the corpus's own latest event rather than on whichever
    version row happens to have no successor.
    """
    from pipeline.build_ui_data import fetch_current_rules_list_ids
    ids = fetch_current_rules_list_ids(conn)
    assert len(ids) > 0
    with conn.cursor() as cur:
        cur.execute("""SELECT rules_version_asof(%s, max(event_date)::date)
                         FROM events WHERE edition = %s""", (EDITION, EDITION))
        expected = cur.fetchone()[0]
        cur.execute("""
            SELECT DISTINCT e.dataslate_version
              FROM events e JOIN lists l ON l.event_id = e.id
              JOIN players p ON p.list_id = l.id
             WHERE p.list_id = ANY(%s)""", (list(ids),))
        assert [r[0] for r in cur.fetchall()] == [expected]


def test_a_future_version_cannot_empty_the_window(conn):
    """A release staged ahead of its date must not become "current".

    This is the failure mode the date predicate is there to prevent: the old
    `superseded_at IS NULL` test would select the staged row, match no events
    and blank every composition panel without raising.
    """
    import pipeline.build_ui_data as bud
    with conn, conn.cursor() as cur:
        bud._current_rules_cache = None
        before = len(bud.fetch_current_rules_list_ids(conn))
        cur.execute("""UPDATE dataslate_versions SET superseded_at = %s
                        WHERE edition = %s AND superseded_at IS NULL""",
                    (date(2099, 1, 1), EDITION))
        cur.execute("""INSERT INTO dataslate_versions
                       (version, edition, effective_from, superseded_at, notes)
                       VALUES ('11e-test-staged', %s, %s, NULL, 'test fixture')""",
                    (EDITION, date(2099, 1, 1)))
        bud._current_rules_cache = None
        assert len(bud.fetch_current_rules_list_ids(conn)) == before
        conn.rollback()
    bud._current_rules_cache = None
