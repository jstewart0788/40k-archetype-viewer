"""Tripwire: pooling both sides of every game MUST give exactly 50%.

WHY THIS EXISTS
---------------
`games.p1_result` is 2=win, 1=draw, 0=loss. Every game therefore contributes a
result and its exact mirror, so unioning both sides of every game and computing
a win rate is 50.000% BY CONSTRUCTION. Any deviation means the query is wrong —
before any conclusion drawn from it can be right.

Measured 2026-08-16: 13.2% of 11e games (3,696 of 28,005) carry a NULL
`p1_result`. A query that filters on result VALUES without also excluding NULLs
counts them in the denominator and never in the numerator, deflating every rate
by ~13%. That is exactly what happened to a force-disposition analysis, which
reported Take and Hold at 48.5% and Reconnaissance at 48.6% — every disposition
below 50%, which is impossible when both sides are pooled. Corrected, the same
query gives Take and Hold 51.7% and Disruption 46.5%.

The failure mode is nasty because the RANKING survives roughly intact while
every absolute number is wrong, so the output looks plausible. The symmetry
check is the only cheap thing that catches it.

WHAT THIS CHECKS
----------------
1. The pooled rate over non-NULL results is exactly 50% (arithmetic sanity).
2. `p1_result` only ever holds 0, 1, 2 or NULL (encoding sanity).
3. The NULL rate is reported, and fails only if it moves sharply — the NULLs
   are upstream data we do not control, so their existence is not a defect;
   silently counting them is.
"""
from __future__ import annotations

import os

import pytest

MAX_NULL_RATE = 0.25   # alarm threshold, not a target: measured 0.13


def _conn():
    psycopg2 = pytest.importorskip("psycopg2")
    try:
        return psycopg2.connect(
            host=os.environ.get("DB_HOST", "localhost"),
            port=int(os.environ.get("DB_PORT", "5433")),
            dbname=os.environ.get("DB_NAME", "wh40k_meta"),
            user=os.environ.get("DB_USER", "wh40k"),
            password=os.environ.get("DB_PASSWORD", "localdev"),
            connect_timeout=5,
        )
    except Exception as exc:                                    # pragma: no cover
        pytest.skip(f"database unreachable: {exc}")


def test_pooled_win_rate_is_exactly_fifty_percent():
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                WITH s AS (
                  SELECT p1_result AS r FROM games WHERE p1_result IS NOT NULL
                  UNION ALL
                  SELECT CASE p1_result WHEN 2 THEN 0 WHEN 0 THEN 2 ELSE 1 END
                    FROM games WHERE p1_result IS NOT NULL
                )
                SELECT count(*),
                       (count(*) FILTER (WHERE r = 2) + 0.5 * count(*) FILTER (WHERE r = 1))
                         / NULLIF(count(*), 0)
                  FROM s
            """)
            n, rate = cur.fetchone()
    finally:
        conn.close()

    assert n > 0, "no games with a non-NULL result — cannot verify encoding"
    assert abs(float(rate) - 0.5) < 1e-9, (
        f"Pooling both sides of every game gave {float(rate)*100:.4f}%, not 50%. "
        "This is arithmetically impossible for a correct query over a correct "
        "table, so either p1_result no longer means 2=win/1=draw/0=loss, or the "
        "table now holds unpaired rows. Do NOT reinterpret downstream win rates "
        "until this passes."
    )


def test_result_encoding_has_no_unexpected_values():
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT DISTINCT p1_result FROM games
                 WHERE p1_result IS NOT NULL AND p1_result NOT IN (0, 1, 2)
            """)
            bad = [r[0] for r in cur.fetchall()]
    finally:
        conn.close()
    assert not bad, (
        f"games.p1_result holds values outside 0/1/2: {bad}. The encoding is "
        "2=win, 1=draw, 0=loss; anything else silently breaks every win rate."
    )


def test_null_result_rate_is_stable():
    """NULL results are upstream data we do not control. This does not fail on
    their existence — it fails if the rate moves enough to change conclusions,
    and it exists so the number stays visible rather than being rediscovered."""
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT count(*),
                       count(*) FILTER (WHERE p1_result IS NULL)
                  FROM games
            """)
            total, nulls = cur.fetchone()
    finally:
        conn.close()

    assert total > 0, "games table is empty"
    rate = nulls / total
    assert rate <= MAX_NULL_RATE, (
        f"{nulls}/{total} games ({rate*100:.1f}%) have a NULL result, above the "
        f"{MAX_NULL_RATE*100:.0f}% alarm threshold. Every query that filters on "
        "result values must exclude NULLs explicitly or it will under-report by "
        "roughly this fraction."
    )
