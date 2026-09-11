"""Tripwire: every 11e rule reference must carry its text, from a justifiable file.

WHY THIS EXISTS
---------------
`wh_datasheet_abilities` stores two kinds of row. `ability_type='Abilities'` is
text printed on the datasheet. `ability_type='rule'` is a REFERENCE to a rule
defined once elsewhere — Oath of Moment, Waaagh!, Deep Strike, Hazardous.

The importer originally indexed rule text from the game-system file only. That
file holds CORE rules, so core references resolved and every FACTION rule
resolved to nothing. Measured 2026-08-17: 1,829 rows across 33 names were NULL,
including Oath of Moment (366 datasheets), Templar Vows (246), Dark Pacts (128),
Waaagh! (94) and Reanimation Protocols (67).

That is not a cosmetic gap. A rules layer built while the game's army-wide rules
are empty strings measures its own coverage against the wrong denominator, and
downstream analysis silently treats "no text" as "no effect".

The fix reads all 46 catalogues, which creates the risk THIS test guards:
248 of 5,438 named rules (4.6%) carry more than one distinct text across files.
`Leader` appears in 33 files with different attach lists. Resolving a name from
the wrong file hands a datasheet another faction's rule — the migration-028
defect shape, where one shared map let two sites disagree on 9.1% of rows.
Resolution is therefore file-scoped, and `rule_text_source` (migration 036)
records which file won so this test can check it.
"""
from __future__ import annotations

import os

import pytest

# Names legitimately carrying different text on different datasheets.
# These are NOT shared rules and must never be collapsed to one definition:
#   Leader / Support — the text IS the per-datasheet attach list.
#   Conversion       — genuinely differs in the source (12" for CSM, 24" others).
#   One Shot         — Genestealer Cults' own file overrides the game-system
#                      wording; that is the scoping precedence working.
# A name appearing here that is NOT in this set means a new conflict was
# introduced and must be explained before it is added.
EXPECTED_MULTI_TEXT = {"Leader", "Support", "Conversion", "One Shot"}


def _conn():
    psycopg2 = pytest.importorskip("psycopg2")
    try:
        return psycopg2.connect(
            host=os.environ.get("DB_HOST", "127.0.0.1"),
            port=int(os.environ.get("DB_PORT", "5433")),
            dbname=os.environ.get("DB_NAME", "wh40k_meta"),
            user=os.environ.get("DB_USER", "wh40k"),
            password=os.environ.get("DB_PASSWORD", "localdev"),
            connect_timeout=5,
        )
    except Exception as exc:                                    # pragma: no cover
        pytest.skip(f"database unreachable: {exc}")


def test_no_rule_reference_lacks_text():
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT name, count(*) FROM wh_datasheet_abilities
                 WHERE edition='11e' AND ability_type='rule' AND description IS NULL
                 GROUP BY name ORDER BY 2 DESC
            """)
            missing = cur.fetchall()
    finally:
        conn.close()
    assert not missing, (
        f"{sum(n for _, n in missing)} rule rows across {len(missing)} names have no "
        f"text: {[n for n, _ in missing][:8]}. A rule reference with no definition "
        "reads downstream as 'this unit has no such rule'. Faction rules live in "
        "their FACTION catalogue, not the game-system file — check the resolution "
        "scope in cat_import._resolve_rule_text."
    )


def test_no_unexplained_conflicting_rule_text():
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT name, count(DISTINCT md5(description))
                  FROM wh_datasheet_abilities
                 WHERE edition='11e' AND ability_type='rule' AND description IS NOT NULL
                 GROUP BY name HAVING count(DISTINCT md5(description)) > 1
            """)
            conflicts = {n: c for n, c in cur.fetchall()}
    finally:
        conn.close()
    unexpected = {n: c for n, c in conflicts.items() if n not in EXPECTED_MULTI_TEXT}
    assert not unexpected, (
        f"Rule names carrying conflicting text that are not on the allowlist: "
        f"{unexpected}. Either the name is genuinely per-datasheet (add it to "
        "EXPECTED_MULTI_TEXT with the reason) or a rule resolved from the wrong "
        "faction's catalogue — check rule_text_source on the offending rows."
    )


def test_resolved_rule_text_records_its_source():
    """Text that came from a catalogue must say which one, or it is unauditable."""
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT count(*) FROM wh_datasheet_abilities
                 WHERE edition='11e' AND ability_type='rule'
                   AND description IS NOT NULL AND rule_text_source IS NULL
            """)
            orphan = cur.fetchone()[0]
    finally:
        conn.close()
    assert orphan == 0, (
        f"{orphan} rule rows carry text with no rule_text_source. Provenance is "
        "what makes the file-scoped resolution checkable; text without it cannot "
        "be audited for cross-faction contamination."
    )
