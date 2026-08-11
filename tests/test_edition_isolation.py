"""Tripwire: no pipeline stage may read a 10th-edition-only reference table
while the pipeline is targeting a later edition.

WHY THIS EXISTS
---------------
Six reference tables are a single 10th-edition snapshot from the legacy
reference import. They carry no `edition` column, so nothing about a query
against them looks wrong — you get rows, they are just the wrong edition's
rows. Measured 2026-08-10: 789 of 1,853 11e datasheets had no row at all in
that snapshot, and four live pipeline stages were reading it:

  * build naming read 'Epic Hero' + display names from it, so any unit absent
    from the 10e snapshot silently scored FALSE and lost its centrepiece
  * the faction-contamination check decided whether an 11e unit belonged to
    its army using 10e datasheets
  * faction playstyle scoring fed 10e ability text to the model
  * list_features.has_lone_op was never populated at all

Every defect this repo has hit for weeks shares one signature: confident
output from missing or wrong input, with nothing raising. Thresholds on
quality metrics do not catch that. A structural assertion does.

WHAT IT CHECKS
--------------
Reads (FROM / JOIN / INTO / UPDATE) of the legacy tables in pipeline code and
dbt models, ignoring comments — prose ABOUT the migration is expected and must
not trip the guard. Anything not in ALLOWED fails.

Skipped entirely when the pipeline targets 10e, where these tables are correct.
"""
from __future__ import annotations

import base64
import glob
import os
import re

import pytest

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

# Reference tables that exist ONLY as a 10th-edition snapshot: no edition
# column, never rebuilt for 11e. Their edition-scoped replacements are
# wh_datasheet_stats / wh_datasheet_models / wh_datasheet_abilities /
# wh_datasheet_keywords / wh_weapon_stats (migrations 019-026).
LEGACY_TABLES = (
    "wh_datasheets",
    "wh_abilities",
    "wh_keywords",
    "wh_wargear",
    "wh_models",
    "wh_stratagems",
)

# (path suffix, table) -> why this read is legitimate.
#
# Keep this list SHORT and justified. A new entry means either a real
# exception or a regression being waved through; prefer repointing the query.
ALLOWED: dict[tuple[str, str], str] = {
    ("pipeline/build_ui_data.py", "wh_datasheets"):
        "Alias hop only. wh_unit_aliases.datasheet_id is a FK to the 10e table, "
        "so an alias resolves via the 10e row's NAME into the 11e table. "
        "Re-keying 118 alias rows was judged riskier than the extra join.",
    ("pipeline/list_features.py", "wh_wargear"):
        "Inside the explicit `if TARGET_EDITION == '10e'` branch of "
        "load_weapon_catalog; the 11e path reads wh_weapon_stats.",
    ("db/migrations/012_canonical_views.sql", "wh_datasheets"):
        "Historical: this migration CREATED the original 10e canonical view "
        "when 10e was the target. Migration 023 then repointed that view onto "
        "wh_datasheet_stats and 028 replaced it again, so the read no longer "
        "exists in the live database — only in this immutable file. Migrations "
        "are forward-only and are never edited; allowlisting is the only "
        "option short of not scanning migrations, which is what hid the "
        "genuine 023 hop for a day.",
    ("db/migrations/013_canonical_view_fix.sql", "wh_datasheets"):
        "Same as 012 — a 10e-era fix to the same view, long superseded.",
    ("db/migrations/023_canonical_view_11e.sql", "wh_datasheets"):
        "Alias hop, same reason as build_ui_data.py above: wh_unit_aliases is "
        "FK'd to 10e datasheet ids, so an alias resolves via the 10e row's "
        "NAME into the 11e table. Superseded in practice by migration 028, "
        "which moved the hop into mv_datasheet_resolution — this entry stays "
        "only because migrations are forward-only and the file is immutable.",
    ("db/migrations/028_faction_aware_datasheet_resolution.sql", "wh_datasheets"):
        "Same alias hop, now centralised in mv_datasheet_resolution so it "
        "exists in exactly one place instead of once per resolution site.",
}

# The legacy importer owns these tables and must reference them. Its filename
# contains an upstream source name, and tests/ is tracked — the repo forbids
# such names in tracked files (see test_no_source_attribution_in_tracked_source_files),
# so it is encoded here for exactly the same reason the leak terms are.
_LEGACY_IMPORTER = base64.b64decode("d2FoYXBlZGlhX2ltcG9ydC5weQ==").decode()

# Comment strippers. Prose about the migration mentions these tables
# constantly and is not a read.
_BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)
_LINE_COMMENT = re.compile(r"(--|#)[^\n]*")

_READ = re.compile(
    r"\b(?:FROM|JOIN|INTO|UPDATE)\s+(?:public\.)?(" + "|".join(LEGACY_TABLES) + r")\b",
    re.IGNORECASE,
)


def _target_edition() -> str:
    """Read the single edition gate from dbt_project.yml."""
    path = os.path.join(REPO, "dbt", "dbt_project.yml")
    with open(path, encoding="utf-8") as fh:
        m = re.search(r"^\s*target_edition:\s*['\"]?([0-9]+e)", fh.read(), re.MULTILINE)
    assert m, "could not read target_edition from dbt_project.yml"
    return m.group(1)


def _scanned_files() -> list[str]:
    files = sorted(glob.glob(os.path.join(REPO, "pipeline", "*.py")))
    files += sorted(glob.glob(os.path.join(REPO, "dbt", "models", "**", "*.sql"),
                              recursive=True))
    # Migrations were a blind spot until 2026-08-10: they DEFINE the views the
    # pipeline reads, so a 10e table reached through a view was invisible to a
    # guard that only scanned callers. Migration 023's alias hop had sat
    # unscanned since the day this test shipped.
    files += sorted(glob.glob(os.path.join(REPO, "db", "migrations", "*.sql")))
    # dbt/target holds compiled copies of the same models — duplicate hits.
    return [f for f in files
            if os.sep + "target" + os.sep not in f
            and os.path.basename(f) != _LEGACY_IMPORTER]


def _strip_comments(text: str) -> str:
    return _LINE_COMMENT.sub("", _BLOCK_COMMENT.sub("", text))


@pytest.mark.skipif(
    _target_edition() == "10e",
    reason="targeting 10e — the legacy reference tables are the correct source",
)
def test_no_legacy_edition_table_reads():
    violations: list[str] = []
    for full in _scanned_files():
        rel = os.path.relpath(full, REPO).replace(os.sep, "/")
        try:
            with open(full, encoding="utf-8", errors="ignore") as fh:
                src = fh.read()
        except OSError:
            continue
        body = _strip_comments(src)
        for line_no, line in enumerate(body.splitlines(), start=1):
            for table in _READ.findall(line):
                if (rel, table.lower()) in ALLOWED:
                    continue
                violations.append(f"{rel}:{line_no} reads {table.lower()} — {line.strip()[:90]}")

    assert not violations, (
        "Pipeline code reads 10th-edition-only reference tables while targeting "
        f"{_target_edition()}. These tables have no edition column, so the query "
        "returns rows silently belonging to the wrong edition.\n"
        "Repoint to the edition-scoped tables (wh_datasheet_stats / _models / "
        "_abilities / _keywords, wh_weapon_stats), or add a justified entry to "
        "ALLOWED in this file.\n\n  " + "\n  ".join(violations)
    )


def test_allowlist_entries_are_still_real():
    """An allowlist entry that no longer matches anything is stale and would
    hide a future regression behind a rule nobody re-reads."""
    stale = []
    for (rel, table), _reason in ALLOWED.items():
        full = os.path.join(REPO, rel)
        if not os.path.exists(full):
            stale.append(f"{rel} (file missing)")
            continue
        with open(full, encoding="utf-8", errors="ignore") as fh:
            body = _strip_comments(fh.read())
        if table not in [t.lower() for t in _READ.findall(body)]:
            stale.append(f"{rel} no longer reads {table}")
    assert not stale, (
        "Stale entries in ALLOWED — the exception is no longer needed, so remove "
        "it rather than leaving a permanent hole: " + "; ".join(stale)
    )


# ── Shared-name detachment copies must stay interchangeable ─────────────────

def test_shared_detachment_copies_differ_only_in_points():
    """A detachment name shared across factions must have identical rules in
    every copy, differing at most in its detachment-point cost.

    WHY THIS IS A TRIPWIRE AND NOT A FIX. Space Marine chapters became
    first-class factions, so each shared detachment now exists once per chapter
    — 16 names, up to 6 copies each. 1,270 of 17,007 junction rows bind a list
    to a DIFFERENT faction's copy than the army's own.

    That is currently HARMLESS, and this test is what keeps it harmless. Every
    consumer re-resolves by NAME: the detachment view groups on
    (faction, name), and the points check walks the faction lineage by name
    rather than trusting the junction. Measured 2026-08-11: all 16 shared names
    have byte-identical ability text across copies, and only two — Stormlance
    Task Force and Bastion Task Force — differ at all, in `dp` alone, which is
    exactly what the lineage lookup exists to resolve.

    If a future dataslate makes one chapter's copy of a shared detachment carry
    different RULES, that assumption breaks silently: lists would inherit
    whichever copy the junction happened to bind, and nothing would error. This
    test fires first, and the fix then is to re-resolve the junction with
    faction_id (resolve_detachment_from_candidates already accepts one; the
    call sites do not pass it).
    """
    import psycopg2
    try:
        conn = psycopg2.connect(
            host=os.environ.get("DB_HOST", "localhost"),
            port=int(os.environ.get("DB_PORT", "5433")),
            dbname=os.environ.get("DB_NAME", "wh40k_meta"),
            user=os.environ.get("DB_USER", "wh40k"),
            password=os.environ.get("DB_PASSWORD", "localdev"),
            connect_timeout=3,
        )
    except Exception as exc:                                   # pragma: no cover
        import pytest
        pytest.skip(f"database unreachable: {exc}")

    edition = _target_edition()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                WITH shared AS (
                  SELECT name FROM wh_detachments
                   WHERE edition = %s GROUP BY name HAVING count(*) > 1
                )
                SELECT wd.name, count(DISTINCT coalesce(a.sig, ''))
                  FROM wh_detachments wd
                  JOIN shared s ON s.name = wd.name
                  LEFT JOIN LATERAL (
                    SELECT string_agg(da.name || '|' || coalesce(da.description, ''),
                                      '~' ORDER BY da.name) AS sig
                      FROM wh_detachment_abilities da
                     WHERE da.detachment_id = wd.id
                  ) a ON TRUE
                 WHERE wd.edition = %s
                 GROUP BY wd.name
                HAVING count(DISTINCT coalesce(a.sig, '')) > 1
            """, (edition, edition))
            divergent = cur.fetchall()
    finally:
        conn.close()

    assert not divergent, (
        "These shared-name detachments now have DIFFERENT rules per faction "
        "copy, so binding a list to the wrong copy silently gives it the wrong "
        "rules: "
        + ", ".join(f"{n} ({c} distinct ability sets)" for n, c in divergent)
        + ". Re-resolve list_detachments with faction_id before shipping."
    )
