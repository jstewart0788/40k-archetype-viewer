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
    # Both drive the search-by-detachment view and were absent from this list,
    # so either could have vanished from the payload without a test noticing.
    "detachmentViews",
    "detachmentListPool",
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
    sizing trips.

    Asserted on nListsTotal (the whole cluster), not nLists. Since the
    unfieldable-army rule, nLists counts only members that can still be
    fielded — a build whose detachment combination was made illegal by a
    points patch legitimately drops to 1-2 there while its cluster is
    unchanged. Judging NMF sizing on the filtered count would fire on a
    rules change rather than on a clustering regression."""
    for fac, blds in data["factionBuilds"].items():
        for b in blds:
            n = b.get("nListsTotal", b["nLists"])
            assert n >= 3, (
                f"{fac}/{b['name']}: nListsTotal={n} below the 3-list floor"
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
    """Win rates must be internally consistent, and implausible only where the
    sample is big enough for "implausible" to mean anything.

    The previous version asserted 0.20 <= winRate <= 0.80 on every build
    regardless of sample size. Across builds ranging from 15 to 310 games that
    fires roughly 6% of weeks even when every build is truly a 50% build — it
    was testing luck, not plausibility, and it blocked a deploy on a 16-3-2
    record that is entirely consistent with a genuinely strong build.

    The sample-size-independent tripwire is the gap between the Elo-adjusted
    and raw win rates. Cluster contamination, a broken Elo join or duplicated
    games all blow past it; a hot streak in a thin sample does not. Its
    sensitivity does not decay as n falls.
    """
    ELO_ADJ_MAX_GAP = 0.15   # observed max 0.065
    WIDE = (0.05, 0.95)      # gross-contamination bound, all builds
    NARROW = (0.20, 0.80)    # original bound, only where n supports it
    NARROW_MIN_GAMES = 40

    for fac, blds in data["factionBuilds"].items():
        for b in blds:
            wr, raw = b["winRate"], b["rawWinRate"]
            w, l, dr, ng = b["wins"], b["losses"], b["draws"], b["nGames"]

            assert w + l + dr == ng, (
                f"{fac}/{b['name']}: wins+losses+draws={w+l+dr} != nGames={ng}"
            )
            assert ng >= b["nLists"], (
                f"{fac}/{b['name']}: nGames={ng} < nLists={b['nLists']}"
            )
            if raw is not None and (w + l) > 0:
                assert abs(raw - round(w / (w + l), 3)) <= 0.002, (
                    f"{fac}/{b['name']}: rawWinRate={raw} disagrees with its "
                    f"own record {w}-{l}"
                )
            if wr is None:
                continue
            assert WIDE[0] <= wr <= WIDE[1], (
                f"{fac}/{b['name']}: winRate={wr} outside {WIDE} — gross "
                f"contamination, not a thin sample"
            )
            if raw is not None:
                assert abs(wr - raw) <= ELO_ADJ_MAX_GAP, (
                    f"{fac}/{b['name']}: Elo-adjusted {wr} vs raw {raw} differ "
                    f"by {abs(wr-raw):.3f} — the adjustment should never move a "
                    f"build this far; suspect cluster contamination or a bad join"
                )
            if ng >= NARROW_MIN_GAMES:
                assert NARROW[0] <= wr <= NARROW[1], (
                    f"{fac}/{b['name']}: winRate={wr} implausible at n={ng} "
                    f"games — likely cluster contamination"
                )


def test_build_names_are_names(data):
    """A build name must be a NAME, not prose.

    2026-08-04: four builds shipped to the public site with raw model refusal
    text as their name ("I need to stop and flag a critical error in the input
    data. **The datasheets listed are NOT Ork units.**"). The model was right —
    those clusters held the wrong faction entirely, because upstream Force
    Disposition ids were being read as factions — but its objection became the
    product. The detachment guards check what a name CLAIMS; nothing checked
    that it was a name.
    """
    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    from pipeline.name_archetypes import is_valid_name_shape

    bad = []
    for fac, blds in data["factionBuilds"].items():
        for b in blds:
            if not is_valid_name_shape(b.get("name") or ""):
                bad.append(f"{fac}: {(b.get('name') or '')[:70]!r}")
    assert not bad, f"{len(bad)} build name(s) are not names:\n  " + "\n  ".join(bad[:10])


def test_no_detachment_misattribution(data):
    """A build must never be presented as running a detachment it doesn't run.

    Generated prose used to assert things like "this is War Horde at its most
    character-dense" on a build fielding Green Tide — a correct rule attached
    to the wrong detachment. Naming an OPPOSING faction's detachment is fine
    (descriptions reference what beats the build); claiming one of your own
    faction's detachments that the build doesn't field is the defect.
    """
    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    from pipeline.attribution_guard import find_violations

    # Detachment -> faction, derived from the snapshot itself so the test stays
    # database-free. A detachment is "own-faction" for a build if any build in
    # that same faction fields it.
    by_faction: dict[str, set[str]] = {}
    dp_by_name: dict[str, int] = {}
    for fac, blds in data["factionBuilds"].items():
        for b in blds:
            for m in (b.get("detachmentMix") or []):
                by_faction.setdefault(fac, set()).add(m["name"].lower())
                if m.get("dp"):
                    dp_by_name[m["name"].lower()] = m["dp"]

    failures = []
    for fac, blds in data["factionBuilds"].items():
        legal = by_faction.get(fac, set())
        if not legal:
            continue
        for b in blds:
            for field, is_name in (("name", True), ("description", False)):
                text = b.get(field) or ""
                for v in find_violations(b, text, legal, dp_by_name,
                                         name_field=is_name):
                    failures.append(
                        f"{fac}/{b['name']} [{field}]: claims '{v['detachment']}' "
                        f"(runs it {v['share']:.0%}, reason={v['reason']})"
                    )

    assert not failures, (
        f"{len(failures)} detachment misattribution(s):\n  " + "\n  ".join(failures[:20])
    )


def test_detachment_mix_reads_all_slots(data):
    """detachmentMix must come from every detachment slot, not lists.detachment_id.

    11e armies field a 2 DP main plus a 1 DP dip; reading a single stored slot
    reports whichever one sorted first and mislabels the dip as the build's
    detachment. Multi-slot builds therefore have shares summing above 1.0, and
    every entry carries its DP cost.
    """
    builds = [b for blds in data["factionBuilds"].values() for b in blds]
    with_mix = [b for b in builds if b.get("detachmentMix")]
    assert with_mix, "no build has a detachmentMix"

    for b in with_mix:
        for m in b["detachmentMix"]:
            assert "dp" in m, f"{b['name']}: detachmentMix entry missing dp"
            assert 0 <= m["pct"] <= 1.0, f"{b['name']}: pct {m['pct']} out of range"

    # At least one build must show multi-detachment armies, else we're still
    # reading a single slot.
    multi = [b for b in with_mix
             if sum(m["pct"] for m in b["detachmentMix"]) > 1.05]
    assert multi, (
        "no build has detachment shares summing above 1.0 — detachmentMix "
        "looks like it is still reading a single detachment slot per list"
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


# ── detachment view: population invariants ──────────────────────────────────
# These assert IMPOSSIBLE properties, not quality thresholds. Every one of them
# was violated in the payload published on 2026-08-10, because the view built
# four different list populations and divided one by another.

def test_detachment_unit_frequency_within_its_denominator(data):
    """A unit cannot appear in more lists than the view counted.

    Fired on 420 of 3,072 rows (max 1.542) when the numerator came from every
    list holding the detachment — no requirement to have played, no edition
    gate, no unfieldable filter — while the denominator counted only lists that
    had played an eligible game.
    """
    for fac, cells in (data.get("detachmentViews") or {}).items():
        for c in cells:
            denom = c.get("unitFrequencyNLists", c["nLists"])
            for u in c.get("unitFrequency") or []:
                assert u["nLists"] <= denom, (
                    f"{fac}/{c['name']}: {u['datasheet']} in {u['nLists']} lists "
                    f"but the view counted only {denom}")
                assert u["pct"] <= 1.0, (
                    f"{fac}/{c['name']}: {u['datasheet']} pct={u['pct']}")


def test_detachment_nlists_agrees_with_winrate_population(data):
    """nLists must count the lists the win rate was computed from.

    Thousand Sons "Hexwarp Thrallband" published nLists=146 beside a win rate
    derived from 10 lists, because the win rate excluded armies that cannot be
    fielded under current points and the list count did not.
    """
    for fac, cells in (data.get("detachmentViews") or {}).items():
        for c in cells:
            assert c["nLists"] <= c.get("nListsTotal", c["nLists"]), (
                f"{fac}/{c['name']}: nLists {c['nLists']} > nListsTotal")
            assert c["wins"] + c["losses"] + c["draws"] == c["nGames"], (
                f"{fac}/{c['name']}: W/L/D does not sum to nGames")
            if c["nGames"] > 0:
                assert c["nLists"] > 0, (
                    f"{fac}/{c['name']}: {c['nGames']} games from 0 lists")


def test_detachment_examples_resolve_in_pool(data):
    """Every example id must exist in its faction's pool — a dangling id
    renders as a blank card."""
    pool = data.get("detachmentListPool") or {}
    for fac, cells in (data.get("detachmentViews") or {}).items():
        for c in cells:
            for lid in c.get("exampleListIds") or []:
                assert lid in pool.get(fac, {}), (
                    f"{fac}/{c['name']}: example {lid} missing from the pool")


def test_build_unit_frequency_within_its_denominator(data):
    """Same invariant on the build view. It holds today, and nothing guarded
    it — the identical defect shipped on the detachment view for weeks."""
    for fac, builds in data["factionBuilds"].items():
        for b in builds:
            denom = b.get("unitFrequencyNLists") or b.get("nLists")
            if not denom:
                continue
            for u in b.get("unitFrequency") or []:
                assert u["nLists"] <= denom and u["pct"] <= 1.0, (
                    f"{fac}/{b['name']}: {u['datasheet']} {u['nLists']}/{denom} "
                    f"pct={u['pct']}")
