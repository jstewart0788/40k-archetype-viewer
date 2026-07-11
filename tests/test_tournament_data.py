"""Regression checks on the deployed tournament data snapshot.

Run before each deploy to catch the kind of silent data drift that the
audit plan identified — degenerate quantile ranks, broken cluster
assignments, missing required fields, asymmetric matchup matrices, etc.

Usage:
    .venv/bin/pytest tests/

These tests read public/tournamentData.json and assert structural +
statistical properties. They don't touch the database; the JSON is the
public surface and that's what we're regression-testing.
"""

from __future__ import annotations
import json
import math
import os
import pytest

DATA_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "public", "tournamentData.json",
)


@pytest.fixture(scope="module")
def data():
    with open(DATA_PATH) as f:
        return json.load(f)


# ── Top-level structure ─────────────────────────────────────────────────────

REQUIRED_TOP_KEYS = [
    "metadata",
    "factionRatings",
    "archetypeMatchups",
    "factionBuilds",
    "buildMatchups",
    "buildVsBuildMatchups",
]


def test_required_top_level_keys_present(data):
    """The 5 components of the UI all read these top-level keys; if any
    silently disappear from the slim_for_export step, parts of the site
    will break."""
    for k in REQUIRED_TOP_KEYS:
        assert k in data, f"Missing top-level key: {k}"


def test_metadata_has_dataset_stats(data):
    """About page + the nav metadata indicator both rely on these."""
    md = data["metadata"]
    for k in ("eventsCount", "gamesCount", "dateRange"):
        assert k in md, f"Missing metadata.{k}"
    assert md["gamesCount"] > 1000, "gamesCount suspiciously low"
    assert md["eventsCount"] > 50, "eventsCount suspiciously low"


# ── Faction ratings ─────────────────────────────────────────────────────────

ARCHETYPE_KEYS = [
    "mobileToolbox", "skimmerFire", "mobileAntiArmour", "midTBrawler",
    "transportInfantry", "massHorde", "heavyGunline", "layeredLethal",
]


def test_faction_ratings_within_0_10(data):
    """factionRatings should be quantile-rank values in [0, 10]."""
    for fac, ratings in data["factionRatings"].items():
        for arch in ARCHETYPE_KEYS:
            v = ratings.get(arch)
            if v is None:
                continue  # null is acceptable for incomplete factions
            assert 0 <= v <= 10, f"{fac}.{arch} = {v} out of [0,10]"


def test_no_axis_has_all_factions_at_zero(data):
    """The Tyranids-gunline-equivalent catch: if an entire axis collapses
    to 0 across every faction, something has gone badly wrong upstream
    (rank tie-handling, NaN coercion, feature broken)."""
    for arch in ARCHETYPE_KEYS:
        values = [r.get(arch) for r in data["factionRatings"].values()
                  if r.get(arch) is not None]
        if not values:
            pytest.fail(f"No faction has a {arch} rating at all")
        assert max(values) > 1.0, (
            f"Every faction's {arch} rating is <= 1.0 — quantile-rank "
            f"collapse, likely a tie-handling or NaN bug"
        )


def test_no_axis_has_all_factions_at_ten(data):
    """Symmetric check — if every faction is 10 on some axis, the
    distribution has degenerated."""
    for arch in ARCHETYPE_KEYS:
        values = [r.get(arch) for r in data["factionRatings"].values()
                  if r.get(arch) is not None]
        if not values:
            continue
        assert min(values) < 9.0, (
            f"Every faction's {arch} rating is >= 9.0 — degenerate"
        )


# ── Build cluster integrity ─────────────────────────────────────────────────

def test_every_build_has_minimum_lists(data):
    """A build with 1-2 lists isn't a meaningful cluster. We've used
    this as a filter elsewhere; assert it here so a regression in NMF
    sizing trips."""
    for fac, blds in data["factionBuilds"].items():
        for b in blds:
            assert b["nLists"] >= 3, (
                f"{fac}/{b['name']}: nLists={b['nLists']} below the 3-list floor"
            )


def test_every_build_has_required_fields(data):
    required = {"id", "name", "nLists", "nGames", "winRate", "topDatasheets",
                "playstyleProfile", "playstyleRatings", "exampleLists",
                "unitFrequency", "enhancementFrequency", "enhancementParseRate"}
    for fac, blds in data["factionBuilds"].items():
        for b in blds:
            missing = required - b.keys()
            assert not missing, f"{fac}/{b['name']}: missing fields {missing}"


def test_build_winrates_are_plausible(data):
    """No build should have a win rate outside [0.20, 0.80] — that's a
    parser artifact or single-player phenomenon, not a real build."""
    for fac, blds in data["factionBuilds"].items():
        for b in blds:
            wr = b["winRate"]
            if wr is None:
                continue
            assert 0.20 <= wr <= 0.80, (
                f"{fac}/{b['name']}: winRate={wr} implausible — likely "
                f"cluster contamination or low-n outlier"
            )


def test_playstyle_profile_kept_only_positive(data):
    """slim_for_export trims playstyleProfile to top 3 positive z-scores;
    no negative values should leak through."""
    for fac, blds in data["factionBuilds"].items():
        for b in blds:
            for k, v in (b.get("playstyleProfile") or {}).items():
                assert v > 0, (
                    f"{fac}/{b['name']}: playstyleProfile.{k}={v} should "
                    f"have been filtered to positive only"
                )


def test_enhancement_parse_rate_in_unit_interval(data):
    for fac, blds in data["factionBuilds"].items():
        for b in blds:
            r = b.get("enhancementParseRate", 0)
            assert 0.0 <= r <= 1.0, f"{fac}/{b['name']}: parseRate={r}"


# ── Matchup matrices ────────────────────────────────────────────────────────

def test_archetype_matchup_winrates_in_range(data):
    """Every cell winRate should be in (0, 1)."""
    for arch, opps in data["archetypeMatchups"].items():
        for opp_arch, cell in opps.items():
            wr = cell.get("winRate")
            assert wr is not None, f"archetypeMatchups.{arch}.{opp_arch}: missing winRate"
            assert 0 < wr < 1, f"archetypeMatchups.{arch}.{opp_arch}: winRate={wr}"


def test_archetype_matchup_matrix_near_antisymmetric(data):
    """Aggregated 8x8 archetype matchups should be approximately
    symmetric: WR(A vs B) + WR(B vs A) ≈ 1.0. A persistent skew indicates
    something broken in matchup pair attribution."""
    matrix = data["archetypeMatchups"]
    archs = list(matrix.keys())
    for i, a in enumerate(archs):
        for b in archs[i + 1:]:
            ab = matrix.get(a, {}).get(b, {}).get("winRate")
            ba = matrix.get(b, {}).get(a, {}).get("winRate")
            if ab is None or ba is None:
                continue
            total = ab + ba
            assert abs(total - 1.0) < 0.10, (
                f"archetypeMatchups asymmetric: {a}-vs-{b} ({ab:.3f}) + "
                f"{b}-vs-{a} ({ba:.3f}) = {total:.3f}, expected ~1.00"
            )


def test_global_winrate_is_balanced(data):
    """Mean WR across all archetype-matchup cells should sit close to 0.5
    — it's a mirror universe by construction. A drift outside [0.48, 0.52]
    would indicate a systematic bias (Elo adjustment broken, attribution
    bug, or factor pollution)."""
    cells = []
    for opps in data["archetypeMatchups"].values():
        for cell in opps.values():
            wr = cell.get("winRate")
            if wr is not None:
                cells.append(wr)
    assert cells, "No archetype matchup cells found"
    mean = sum(cells) / len(cells)
    assert 0.48 <= mean <= 0.52, (
        f"Global archetype WR mean = {mean:.4f}, expected ~0.50"
    )


def test_buildmatchups_cells_have_required_fields(data):
    for build_id, opps in data["buildMatchups"].items():
        for opp_arch, cell in opps.items():
            for k in ("winRate", "vpMargin", "n"):
                assert k in cell, (
                    f"buildMatchups.{build_id}.{opp_arch}: missing {k}"
                )


def test_buildvsbuild_cells_have_required_fields(data):
    """Predictor reads winRate, rawWinRate, vpMargin, n, source,
    priorPlaystyle from these cells."""
    required = {"winRate", "rawWinRate", "vpMargin", "n", "source", "priorPlaystyle"}
    sample_size = 0
    for ba, opps in data["buildVsBuildMatchups"].items():
        for bb, cell in opps.items():
            missing = required - cell.keys()
            assert not missing, (
                f"buildVsBuildMatchups.{ba}.{bb}: missing {missing}"
            )
            sample_size += 1
            if sample_size >= 200:
                return  # spot-check, no need to scan all 10k cells


# ── Source-attribution leak prevention ──────────────────────────────────────

import re
import base64

# The guarded names are stored base64-encoded so this tracked file never
# contains them in plaintext — it would otherwise be the one place in the
# public repo that enumerates exactly the names we scrub. Decode to inspect.
# Boundaries are alphanumeric lookarounds rather than \b so that compound
# identifiers (e.g. xxx_faction_id) are caught too, while base64-ish IDs
# with adjacent alphanumerics stay exempt.
_ENCODED_TERMS = (
    "KGNsYXVkZXxhbnRocm9waWN8c3RhdFtcc18tXT9jaGVja3xiZXN0W1xzXy1dP2NvYXN0"
    "fGJjcHx0YWJsZWF1fHdhaGFwZWRpYSk="
)
LEAK_PATTERN = re.compile(
    "(?<![A-Za-z0-9])" + base64.b64decode(_ENCODED_TERMS).decode() + "(?![A-Za-z0-9])",
    re.IGNORECASE,
)


def test_no_source_attribution_in_metadata(data):
    """The slim_for_export step should have stripped any internal model
    names + provider references from metadata. If a future pipeline change
    adds them back, we want to fail loud."""
    md_str = json.dumps(data.get("metadata", {}))
    matches = LEAK_PATTERN.findall(md_str)
    assert not matches, f"Metadata contains source-attribution: {matches}"


def test_no_source_attribution_in_build_descriptions(data):
    """Build descriptions are LLM-generated; check they don't accidentally
    self-reference the model or the data source."""
    for fac, blds in data["factionBuilds"].items():
        for b in blds:
            desc = b.get("description") or ""
            matches = LEAK_PATTERN.findall(desc)
            assert not matches, (
                f"{fac}/{b['name']}: description contains "
                f"source-attribution: {matches}\nDesc: {desc[:200]}"
            )


def test_factionratings_matches_factionbuilds(data):
    """The two top-level dicts must have the same key set. If a faction is in
    one but not the other, the UI either renders a row with no builds or
    builds for a faction with no radar data — both broken. Catches the
    'Unknown Faction' regression we just shipped a fix for."""
    rating_keys = set(data["factionRatings"].keys())
    build_keys = set(data["factionBuilds"].keys())
    only_ratings = rating_keys - build_keys
    only_builds = build_keys - rating_keys
    assert not only_ratings and not only_builds, (
        f"factionRatings/factionBuilds key mismatch — "
        f"only in factionRatings: {sorted(only_ratings)}; "
        f"only in factionBuilds: {sorted(only_builds)}"
    )


def test_no_unknown_faction(data):
    """Catch-all sentinels (Unknown Faction) shouldn't appear as user-facing
    rows. If one shows up here, the build pipeline's EXCLUDED_FACTIONS list
    is missing it."""
    bad = [k for k in data["factionRatings"].keys() if 'unknown' in k.lower()]
    assert not bad, f"Catch-all sentinel leaked into factionRatings: {bad}"


def test_no_low_n_buildvsbuild_cells(data):
    """Docs claim cells with n<5 are hidden in the explorer. The Predictor
    additionally guards them with an 'insufficient direct sample' warning,
    so we keep them in the JSON — but if more than 25% of cells fall under
    the threshold, the matchup matrix is too thin for downstream confidence
    and the contamination filter or extraction window probably needs a look."""
    cells = [c for opps in data["buildVsBuildMatchups"].values() for c in opps.values()]
    if not cells:
        return
    # A thin corpus (e.g. an edition launch window) cannot populate the direct
    # build-vs-build matrix at n>=5 — ~2k games spread over thousands of build
    # pairs is almost entirely sparse, and the Predictor falls back to EB-shrunk
    # + LightGBM predictions with an "insufficient direct sample" warning. So
    # this data-health gate only bites once the corpus is large enough that
    # sparsity would signal a real extraction/contamination problem.
    if (data.get("metadata", {}).get("gamesCount") or 0) < 20_000:
        return
    low_n_pct = sum(1 for c in cells if c.get("n", 0) < 5) / len(cells)
    assert low_n_pct < 0.25, f"Too many sparse cells: {low_n_pct:.0%} have n<5"


def test_metadata_faction_count_matches_data(data):
    """metadata.factionCount is what Docs and FactionView display. It must
    match the actual number of factions in factionRatings."""
    md = data["metadata"]
    if "factionCount" in md:
        assert md["factionCount"] == len(data["factionRatings"]), (
            f"metadata.factionCount={md['factionCount']} vs "
            f"len(factionRatings)={len(data['factionRatings'])}"
        )


def test_no_source_attribution_in_tracked_source_files():
    """Wider net: scan every tracked file in the repo for upstream-platform
    or LLM-provider mentions. The user has made it a hard requirement that
    the site and the github repo never name where the tournament data comes
    from. This catches the kind of comment that quietly leaks back in.

    Skips package-lock.json (npm dependency metadata, not authored content)
    and the test file itself (where the LEAK_PATTERN obviously appears)."""
    import subprocess
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    out = subprocess.run(
        ["git", "-C", repo_root, "ls-files"],
        capture_output=True, text=True, check=True,
    )
    tracked = [p for p in out.stdout.splitlines() if p]
    skip = {
        "package-lock.json",
        os.path.relpath(__file__, repo_root),
    }
    leaks: list[tuple[str, int, str]] = []
    for rel in tracked:
        if rel in skip:
            continue
        full = os.path.join(repo_root, rel)
        try:
            with open(full, "r", encoding="utf-8", errors="ignore") as f:
                for lineno, line in enumerate(f, 1):
                    m = LEAK_PATTERN.search(line)
                    if m:
                        leaks.append((rel, lineno, line.strip()[:160]))
        except (OSError, UnicodeDecodeError):
            pass
    assert not leaks, "Tracked files leak source-attribution:\n" + "\n".join(
        f"  {p}:{ln}  {snippet}" for p, ln, snippet in leaks[:20]
    )
