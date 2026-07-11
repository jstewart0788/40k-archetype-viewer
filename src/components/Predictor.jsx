import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { factions, archetypeGroups } from '../data/archetypeData';
import { archetypes } from '../data/dataIntegration';
import { useTournamentData } from '../data/TournamentDataContext';
import ArchetypeTooltip from './ArchetypeTooltip';
import InfoPopover from './InfoPopover';

const ARCH_GROUP_MAP = Object.fromEntries(
  Object.entries(archetypeGroups).flatMap(([gKey, g]) =>
    g.members.map(m => [m, { key: gKey, ...g }])
  )
);

// Display-only: drop the "(Astartes)" parenthetical from "Space Marines
// (Astartes)" so labels render cleanly. The data key keeps the parenthesis.
const displayFactionName = (name) =>
  typeof name === 'string' ? name.replace(/\s*\(Astartes\)\s*$/i, '') : name;

// Verdict bucket from win rate
function verdictBucket(wr) {
  if (wr >= 0.65) return { label: 'Hard favored', color: 'text-emerald-400' };
  if (wr >= 0.575) return { label: 'Favored',     color: 'text-green-400' };
  if (wr >= 0.525) return { label: 'Slight edge', color: 'text-lime-400' };
  if (wr >  0.475) return { label: 'Coinflip',    color: 'text-yellow-400' };
  if (wr >= 0.425) return { label: 'Slight underdog', color: 'text-orange-400' };
  if (wr >= 0.35)  return { label: 'Unfavored',   color: 'text-red-400' };
  return                  { label: 'Bad matchup', color: 'text-rose-500' };
}

// Confidence label from sample size
function confidenceLabel(n, source) {
  if (source === 'direct' && n >= 100) return 'high';
  if (source === 'direct' && n >= 30)  return 'medium';
  if (source === 'shrunk')              return 'low (shrunk to playstyle prior)';
  if (source === 'prior')               return 'very low (full playstyle prior)';
  return 'medium';
}

// Find the dominant playstyle for a build — highest positive z-score only.
// (A strongly-negative score means "least like X", not "is X".)
function topPlaystyle(build) {
  if (!build?.playstyleProfile) return null;
  const ranked = Object.entries(build.playstyleProfile)
    .filter(([, v]) => (v ?? 0) > 0)
    .sort((a, b) => b[1] - a[1]);
  return ranked[0]?.[0] ?? null;
}

// ── Paste-list parsing (used for "auto-fill from list text") ────────────────
//
// Extracts likely unit names from a pasted army-list text in any common
// army-list text, normalizes them (casefold + smart-quote → ASCII +
// whitespace collapse), and returns the set. We then score every known
// build by how strongly its `unitFrequency` overlaps with the user's set
// — the closer the match, the more likely that build is what the user
// brought.
//
// Not a substitute for a real list-to-build classifier (that's task #56's
// architecture), but for the Predictor's purpose — "find me the closest
// build to compare against" — this is enough.

const UNIT_LINE_RE = /^\s*(?:Char\d+:\s*)?(?:\d+x\s+)?([A-Z][A-Za-z'’\- ]+?)\s*\(\s*\d{2,4}\s*p(?:oints?|ts)\s*\)/gm;

function normalizeUnitName(s) {
  return (s || '')
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function extractUnitNamesFromList(rawText) {
  if (!rawText) return [];
  const seen = new Set();
  const out = [];
  for (const m of rawText.matchAll(UNIT_LINE_RE)) {
    const norm = normalizeUnitName(m[1]);
    if (!norm || seen.has(norm)) continue;
    // Filter out obvious non-units: titles + battle-size headers
    if (/^(combat patrol|incursion|strike force|onslaught|skirmish|boarding actions?|boarding patrol)\b/i.test(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out;
}

// Score every build by Jaccard-ish overlap of user's unit set against
// build's unitFrequency (weighted by pct, so high-pct units in the build
// count more). Returns sorted list of {faction, build, score} descending.
function rankBuildMatches(userUnitSet, factionBuildsByFac) {
  const userSet = new Set(userUnitSet);
  if (userSet.size === 0) return [];
  const ranked = [];
  for (const [faction, blds] of Object.entries(factionBuildsByFac)) {
    for (const b of blds) {
      const freq = b.unitFrequency || [];
      // Sum pct for each user unit that appears in this build's freq table
      let overlapWeight = 0;
      let overlapCount = 0;
      for (const f of freq) {
        if (userSet.has(f.datasheet)) {
          overlapWeight += f.pct;
          overlapCount += 1;
        }
      }
      if (overlapCount === 0) continue;
      // Normalize: divide by sqrt(union size) — discourages "this build
      // happens to share one common unit with everyone".
      const score = overlapWeight / Math.sqrt(Math.max(userUnitSet.length, 1));
      ranked.push({ faction, build: b, score, overlapCount });
    }
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

// Recent picks history (localStorage)
const RECENT_KEY = 'predictor_recent_v1';
function loadRecent() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch { return []; }
}
function saveRecent(entry) {
  const cur = loadRecent();
  const filtered = cur.filter(e => e.key !== entry.key);
  const next = [entry, ...filtered].slice(0, 6);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

const Predictor = () => {
  const { factionBuilds, buildVsBuildMatchups, lgbmBvbMatrix, raw: tournamentData } = useTournamentData();
  const [searchParams] = useSearchParams();
  // Hydrate "You" side from `?factionA=...&buildA=...` if linked here
  // (e.g. from a build card's "Use as 'You' in Predictor →").
  const initialFactionA = (() => {
    const f = searchParams.get('factionA');
    return f && factions.includes(f) ? f : factions[0];
  })();
  const initialBuildAId = (() => {
    const raw = searchParams.get('buildA');
    const parsed = raw != null ? Number(raw) : NaN;
    return Number.isNaN(parsed) ? null : parsed;
  })();
  const [factionA, setFactionA] = useState(initialFactionA);
  const [buildAId, setBuildAId] = useState(initialBuildAId);
  const [factionB, setFactionB] = useState(factions[1]);
  const [buildBId, setBuildBId] = useState(null);
  const [recent, setRecent] = useState(() => loadRecent());

  // Paste-list state — separate textareas for each side. When the user
  // pastes a list, we extract unit names and auto-set the faction + the
  // most-similar known build. The pasted text is kept as a small UX
  // affordance so the user can revise.
  const [pasteA, setPasteA] = useState('');
  const [pasteB, setPasteB] = useState('');
  const [matchA, setMatchA] = useState(null); // { faction, build, score, overlapCount } | null
  const [matchB, setMatchB] = useState(null);
  const [showPasteA, setShowPasteA] = useState(false);
  const [showPasteB, setShowPasteB] = useState(false);

  const buildsA = factionBuilds[factionA] || [];
  const buildsB = factionBuilds[factionB] || [];
  // Default each side to its top build when faction changes
  const effectiveA = buildsA.find(b => b.id === buildAId) || buildsA[0] || null;
  const effectiveB = buildsB.find(b => b.id === buildBId) || buildsB[0] || null;

  const handleFactionAChange = (f) => { setFactionA(f); setBuildAId(null); };
  const handleFactionBChange = (f) => { setFactionB(f); setBuildBId(null); };

  // Auto-fill from pasted list — parse, rank, jump to the best match.
  const autoFillFromPaste = (rawText, side) => {
    const units = extractUnitNamesFromList(rawText);
    if (units.length === 0) {
      const setMatch = side === 'A' ? setMatchA : setMatchB;
      setMatch({ noUnits: true, units: [] });
      return;
    }
    const ranked = rankBuildMatches(units, factionBuilds);
    const top = ranked[0];
    const setMatch = side === 'A' ? setMatchA : setMatchB;
    if (!top || top.score < 0.2) {
      setMatch({ noMatch: true, units, ranked: ranked.slice(0, 3) });
      return;
    }
    setMatch({ ...top, units, ranked: ranked.slice(0, 3) });
    if (side === 'A') {
      setFactionA(top.faction);
      setBuildAId(top.build.id);
    } else {
      setFactionB(top.faction);
      setBuildBId(top.build.id);
    }
  };

  // Look up matchup cell
  const cell = useMemo(() => {
    if (!effectiveA || !effectiveB) return null;
    const c = buildVsBuildMatchups[String(effectiveA.id)]?.[String(effectiveB.id)];
    return c || null;
  }, [effectiveA, effectiveB]);

  // Tactical note from playstyle pair
  const tacticalNote = useMemo(() => {
    if (!effectiveA || !effectiveB) return null;
    const aPlay = topPlaystyle(effectiveA);
    const bPlay = topPlaystyle(effectiveB);
    if (!aPlay || !bPlay) return null;
    const note = (tournamentData.archetypeMatchupNotes || {})[aPlay]?.[bPlay];
    return note ? { note, aPlay, bPlay } : null;
  }, [effectiveA, effectiveB]);

  const isMirror = effectiveA?.id === effectiveB?.id;

  // Persist this matchup as recent
  const persist = () => {
    if (!effectiveA || !effectiveB) return;
    saveRecent({
      key: `${effectiveA.id}-${effectiveB.id}`,
      factionA, buildAId: effectiveA.id, buildAName: effectiveA.name,
      factionB, buildBId: effectiveB.id, buildBName: effectiveB.name,
      ts: Date.now(),
    });
    setRecent(loadRecent());
  };

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-6 py-8 max-w-7xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-3">Matchup Predictor</h1>
          <p className="text-slate-300 text-base max-w-2xl mx-auto">
            Pick <em>two specific builds</em> — yours and your opponent's — and get a head-to-head win-rate prediction from real games of that exact matchup.
          </p>
          <p className="text-slate-400 text-sm mt-2 max-w-2xl mx-auto">
            Just want to know how your build does against general playstyle archetypes? Use the <Link to="/matchups" className="underline decoration-dotted underline-offset-2 hover:text-purple-300">Matchup Explorer</Link>.
          </p>
        </div>

        {/* Pickers — two columns side-by-side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 max-w-5xl mx-auto">
          {/* You */}
          <div className="bg-slate-800 rounded-2xl p-5 border-l-4 border-emerald-500">
            <div className="text-sm font-semibold text-emerald-300 mb-3 uppercase tracking-wide">You</div>

            {/* Paste-list shortcut */}
            <button
              type="button"
              onClick={() => setShowPasteA((v) => !v)}
              className="text-xs text-emerald-300 hover:text-emerald-200 underline decoration-dotted mb-2 px-2 py-2 min-h-[44px] inline-flex items-center"
            >
              {showPasteA ? 'Hide list-paste' : 'Or paste your army list ↓'}
            </button>
            {showPasteA && (
              <div className="mb-3">
                <textarea
                  value={pasteA}
                  onChange={(e) => setPasteA(e.target.value)}
                  placeholder="Paste your full army list — any format with 'Unit Name (NN points)' lines…"
                  rows={5}
                  className="w-full bg-slate-700/70 text-slate-100 text-xs rounded-md px-2 py-1.5 border border-slate-600 focus:border-emerald-500 outline-none font-mono"
                />
                <div className="flex items-center gap-2 mt-1.5">
                  <button
                    type="button"
                    onClick={() => autoFillFromPaste(pasteA, 'A')}
                    className="text-xs px-3 py-1 rounded bg-emerald-600/80 hover:bg-emerald-500 text-white font-medium"
                  >
                    Match to closest build
                  </button>
                  {pasteA && (
                    <button
                      type="button"
                      onClick={() => { setPasteA(''); setMatchA(null); }}
                      className="text-xs text-slate-400 hover:text-slate-200"
                    >
                      Clear
                    </button>
                  )}
                </div>
                {matchA && (
                  <div className="mt-2 text-xs">
                    {matchA.noUnits ? (
                      <div className="text-rose-300">No unit lines found. List should have lines like "Captain (75 points)".</div>
                    ) : matchA.noMatch ? (
                      <div className="text-amber-300">
                        Couldn't confidently match {matchA.units.length} extracted unit{matchA.units.length === 1 ? '' : 's'} to any known build.
                        Possible candidates (low confidence):{' '}
                        {(matchA.ranked || []).map((r, i) => (
                          <span key={r.build.id}>
                            {i > 0 && ', '}
                            <button onClick={() => { setFactionA(r.faction); setBuildAId(r.build.id); }} className="text-emerald-300 underline">
                              {displayFactionName(r.faction)} · {r.build.name}
                            </button>
                          </span>
                        ))}.
                      </div>
                    ) : (
                      <div className="text-emerald-300">
                        Matched <span className="font-semibold">{displayFactionName(matchA.faction)} · {matchA.build.name}</span> ({matchA.overlapCount} unit{matchA.overlapCount === 1 ? '' : 's'} overlap, score {matchA.score.toFixed(2)}).{' '}
                        Auto-filled below — adjust if wrong.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <label className="block text-slate-300 text-xs font-medium mb-1">Faction</label>
            <select
              value={factionA}
              onChange={(e) => handleFactionAChange(e.target.value)}
              className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 mb-3 text-sm border border-slate-600 focus:border-emerald-500 outline-none"
            >
              {factions.map(f => <option key={f} value={f}>{displayFactionName(f)}</option>)}
            </select>
            <label className="block text-slate-300 text-xs font-medium mb-1">Build</label>
            {buildsA.length > 0 ? (
              <select
                value={effectiveA?.id ?? ''}
                onChange={(e) => setBuildAId(parseInt(e.target.value, 10))}
                className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm border border-slate-600 focus:border-emerald-500 outline-none"
              >
                {buildsA.map(b => {
                  const wr = b.winRate != null ? `${(b.winRate * 100).toFixed(0)}%` : '—';
                  return (
                    <option key={b.id} value={b.id}>
                      {b.name} · {b.nLists.toLocaleString()} lists · {wr} WR
                    </option>
                  );
                })}
              </select>
            ) : (
              <div className="text-xs italic text-slate-500 px-3 py-2 bg-slate-700/40 rounded">No builds for this faction.</div>
            )}
          </div>

          {/* Opponent */}
          <div className="bg-slate-800 rounded-2xl p-5 border-l-4 border-rose-500">
            <div className="text-sm font-semibold text-rose-300 mb-3 uppercase tracking-wide">Opponent</div>

            {/* Paste-list shortcut */}
            <button
              type="button"
              onClick={() => setShowPasteB((v) => !v)}
              className="text-xs text-rose-300 hover:text-rose-200 underline decoration-dotted mb-2 px-2 py-2 min-h-[44px] inline-flex items-center"
            >
              {showPasteB ? 'Hide list-paste' : "Or paste opponent's army list ↓"}
            </button>
            {showPasteB && (
              <div className="mb-3">
                <textarea
                  value={pasteB}
                  onChange={(e) => setPasteB(e.target.value)}
                  placeholder="Paste opponent's full army list…"
                  rows={5}
                  className="w-full bg-slate-700/70 text-slate-100 text-xs rounded-md px-2 py-1.5 border border-slate-600 focus:border-rose-500 outline-none font-mono"
                />
                <div className="flex items-center gap-2 mt-1.5">
                  <button
                    type="button"
                    onClick={() => autoFillFromPaste(pasteB, 'B')}
                    className="text-xs px-3 py-1 rounded bg-rose-600/80 hover:bg-rose-500 text-white font-medium"
                  >
                    Match to closest build
                  </button>
                  {pasteB && (
                    <button
                      type="button"
                      onClick={() => { setPasteB(''); setMatchB(null); }}
                      className="text-xs text-slate-400 hover:text-slate-200"
                    >
                      Clear
                    </button>
                  )}
                </div>
                {matchB && (
                  <div className="mt-2 text-xs">
                    {matchB.noUnits ? (
                      <div className="text-rose-300">No unit lines found. List should have lines like "Captain (75 points)".</div>
                    ) : matchB.noMatch ? (
                      <div className="text-amber-300">
                        Couldn't confidently match {matchB.units.length} extracted unit{matchB.units.length === 1 ? '' : 's'} to any known build.
                        Possible candidates (low confidence):{' '}
                        {(matchB.ranked || []).map((r, i) => (
                          <span key={r.build.id}>
                            {i > 0 && ', '}
                            <button onClick={() => { setFactionB(r.faction); setBuildBId(r.build.id); }} className="text-rose-300 underline">
                              {displayFactionName(r.faction)} · {r.build.name}
                            </button>
                          </span>
                        ))}.
                      </div>
                    ) : (
                      <div className="text-rose-300">
                        Matched <span className="font-semibold">{displayFactionName(matchB.faction)} · {matchB.build.name}</span> ({matchB.overlapCount} unit{matchB.overlapCount === 1 ? '' : 's'} overlap, score {matchB.score.toFixed(2)}).{' '}
                        Auto-filled below — adjust if wrong.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <label className="block text-slate-300 text-xs font-medium mb-1">Faction</label>
            <select
              value={factionB}
              onChange={(e) => handleFactionBChange(e.target.value)}
              className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 mb-3 text-sm border border-slate-600 focus:border-rose-500 outline-none"
            >
              {factions.map(f => <option key={f} value={f}>{displayFactionName(f)}</option>)}
            </select>
            <label className="block text-slate-300 text-xs font-medium mb-1">Build</label>
            {buildsB.length > 0 ? (
              <select
                value={effectiveB?.id ?? ''}
                onChange={(e) => setBuildBId(parseInt(e.target.value, 10))}
                className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm border border-slate-600 focus:border-rose-500 outline-none"
              >
                {buildsB.map(b => {
                  const wr = b.winRate != null ? `${(b.winRate * 100).toFixed(0)}%` : '—';
                  return (
                    <option key={b.id} value={b.id}>
                      {b.name} · {b.nLists.toLocaleString()} lists · {wr} WR
                    </option>
                  );
                })}
              </select>
            ) : (
              <div className="text-xs italic text-slate-500 px-3 py-2 bg-slate-700/40 rounded">No builds for this faction.</div>
            )}
          </div>
        </div>

        {/* Result card */}
        {effectiveA && effectiveB && cell && !isMirror && (() => {
          const verdict = verdictBucket(cell.winRate);
          const conf = confidenceLabel(cell.n, cell.source);
          const wrPct = Math.round(cell.winRate * 100);
          const vp = cell.vpMargin;
          const vpStr = `${vp >= 0 ? '+' : ''}${vp.toFixed(1)}`;

          // LightGBM second-opinion lookup. The matrix is keyed by
          // build_id strings; null when the pipeline ran without the
          // trained model (graceful fallback to EB-only verdict).
          const lgbmRate = lgbmBvbMatrix
            ? lgbmBvbMatrix[String(effectiveA.id)]?.[String(effectiveB.id)]
            : null;
          // Agreement classifier: how close is the list-feature model
          // to the historical EB cell? <2pp = high (both signals point
          // the same way with the same magnitude); 2-5pp = moderate
          // (same direction, different magnitude); >5pp = low (signals
          // disagree — list features predict something the historical
          // matchup record doesn't, or vice versa). The user reads
          // "high" as "trust this verdict more"; "low" as "the list-
          // feature model thinks this is a different matchup than the
          // historical record suggests — there's something the cell
          // isn't capturing."
          let lgbmAgree = null;
          if (lgbmRate != null) {
            const diffPp = Math.abs(lgbmRate - cell.winRate) * 100;
            if (diffPp < 2)      lgbmAgree = { label: 'high',     tone: 'text-emerald-400' };
            else if (diffPp < 5) lgbmAgree = { label: 'moderate', tone: 'text-yellow-400' };
            else                 lgbmAgree = { label: 'low',      tone: 'text-rose-400' };
          }
          // Sample-size gate: under 5 direct games the verdict is essentially
          // the playstyle prior with cosmetic numbers attached. Don't show the
          // 5xl "Hard favored" headline; users will read it as confident
          // when the data is anything but. Dim the verdict block in [5, 30)
          // so the visual confidence tracks the sample size.
          const tooFewGames = cell.n < 5;
          const verdictOpacity = tooFewGames
            ? 1.0
            : Math.min(1, 0.6 + 0.4 * Math.log(Math.max(cell.n, 1)) / Math.log(100));
          return (
            <div className="bg-slate-800 rounded-2xl shadow-2xl p-8 mb-6 max-w-5xl mx-auto">
              {tooFewGames ? (
                <div className="text-center mb-6 rounded-lg border border-yellow-700/40 bg-yellow-900/20 p-4">
                  <div className="text-yellow-300 text-lg font-bold mb-1">Insufficient direct sample</div>
                  <div className="text-slate-300 text-sm">
                    Only {cell.n} direct game{cell.n === 1 ? '' : 's'} of {effectiveA.name} vs {effectiveB.name} in the dataset.
                    Any prediction would essentially be the build-vs-playstyle prior with build names attached.
                    {tacticalNote && <> See the game plan below for how the playstyles tend to interact.</>}
                  </div>
                </div>
              ) : (
                <div className="text-center mb-6 transition-opacity" style={{ opacity: verdictOpacity }}>
                  <div className={`text-5xl font-bold ${verdict.color} mb-2`}>{verdict.label}</div>
                  <div className="text-3xl text-white font-semibold">
                    <span className={verdict.color}>{wrPct}%</span> win
                    <span className="text-slate-500 mx-3">·</span>
                    <span className="text-slate-200">{vpStr} VP</span>
                  </div>
                  {/* 90% credible interval from the partial-pooling fit when
                      available — gives the user a real range to read instead
                      of a false-precision point estimate. Falls back to the
                      Wilson CI on raw rate for older runs. */}
                  {cell.winRateLo90 != null && cell.winRateHi90 != null ? (
                    <div className="text-slate-400 text-sm mt-2">
                      90% interval{' '}
                      <span className="text-slate-200 font-medium">
                        {(cell.winRateLo90 * 100).toFixed(1)}%–{(cell.winRateHi90 * 100).toFixed(1)}%
                      </span>
                    </div>
                  ) : null}
                  <div className="text-slate-400 text-sm mt-1">
                    Confidence: <span className="text-slate-200 font-medium">{conf}</span>
                    {' '}({cell.n.toLocaleString()} game{cell.n === 1 ? '' : 's'} of this matchup)
                  </div>
                  {lgbmRate != null && (
                    // Second-opinion line: same number from a different
                    // angle. The historical cell answers "what happened
                    // when these builds met"; the list-feature model
                    // answers "what does the matchup math say given
                    // each build's unit composition." Agreement
                    // qualifies how much we trust the verdict.
                    <div className="text-slate-400 text-xs mt-2 inline-flex items-center gap-2 flex-wrap justify-center">
                      <span className="text-slate-500">List-feature model</span>
                      <span className="text-slate-200 font-medium tabular-nums">{Math.round(lgbmRate * 100)}%</span>
                      <span className="text-slate-600">·</span>
                      <span className="text-slate-500">agreement</span>
                      <span className={`font-semibold ${lgbmAgree.tone}`}>{lgbmAgree.label}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Build pair summary */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-700/30 border-l-4 border-emerald-500 rounded-lg p-4">
                  <div className="text-emerald-300 text-xs uppercase tracking-wide mb-1">Your build</div>
                  <div className="font-semibold text-white">{effectiveA.name}</div>
                  <div className="text-slate-400 text-xs">{displayFactionName(factionA)} · {effectiveA.nLists.toLocaleString()} lists in dataset</div>
                  <div className="text-slate-400 text-xs mt-1">
                    Core: {effectiveA.topDatasheets?.slice(0, 3).map(t => t.datasheet).join(', ')}
                  </div>
                </div>
                <div className="bg-slate-700/30 border-l-4 border-rose-500 rounded-lg p-4">
                  <div className="text-rose-300 text-xs uppercase tracking-wide mb-1">Opponent build</div>
                  <div className="font-semibold text-white">{effectiveB.name}</div>
                  <div className="text-slate-400 text-xs">{displayFactionName(factionB)} · {effectiveB.nLists.toLocaleString()} lists in dataset</div>
                  <div className="text-slate-400 text-xs mt-1">
                    Core: {effectiveB.topDatasheets?.slice(0, 3).map(t => t.datasheet).join(', ')}
                  </div>
                </div>
              </div>

              {/* Tactical narrative */}
              {tacticalNote && (
                <div className="bg-slate-700/30 rounded-lg p-4 mb-4 border border-slate-600">
                  <div className="text-slate-300 text-xs font-semibold uppercase tracking-wide mb-2">
                    Game plan{' '}
                    <ArchetypeTooltip archetypeKey={tacticalNote.aPlay} side="bottom">
                      <span className="cursor-help text-emerald-400 normal-case">
                        ({archetypes[tacticalNote.aPlay].shortName}
                      </span>
                    </ArchetypeTooltip>
                    <span className="text-slate-400 normal-case"> vs </span>
                    <ArchetypeTooltip archetypeKey={tacticalNote.bPlay} side="bottom">
                      <span className="cursor-help text-rose-400 normal-case">
                        {archetypes[tacticalNote.bPlay].shortName})
                      </span>
                    </ArchetypeTooltip>
                  </div>
                  <p className="text-sm text-slate-200 leading-relaxed">{tacticalNote.note}</p>
                </div>
              )}

              {/* One-line tilt-prevention reminder. Full methodology +
                  shrinkage explanation lives in the verdict popover. */}
              <div className="text-[11px] text-slate-500 inline-flex items-center gap-2">
                <span>60% favorite still loses 4 in 10.</span>
                <InfoPopover topic="predictor" />
              </div>

              <div className="mt-4 text-center">
                <button
                  onClick={persist}
                  className="text-xs px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300"
                >
                  Save matchup
                </button>
              </div>
            </div>
          );
        })()}

        {/* Mirror match: side-by-side feature comparison */}
        {effectiveA && effectiveB && isMirror && (
          <div className="bg-slate-800 rounded-2xl p-8 mb-6 max-w-5xl mx-auto">
            <div className="text-center mb-4">
              <div className="text-3xl font-bold text-yellow-400">Mirror match</div>
              <div className="text-slate-400 text-sm mt-1">
                Same build on both sides — the matchup is a coinflip + skill. The interesting question is which version is built better.
              </div>
            </div>
            <div className="text-center text-slate-300 text-sm">
              Open the <Link to="/" className="text-purple-400 hover:text-purple-300">Factions page</Link> to compare specific list features.
            </div>
          </div>
        )}

        {/* No matchup data */}
        {effectiveA && effectiveB && !cell && !isMirror && (
          <div className="bg-slate-800 rounded-2xl p-6 mb-6 max-w-5xl mx-auto text-center">
            <div className="text-yellow-400 font-semibold">No matchup data yet</div>
            <div className="text-slate-400 text-sm mt-1">
              We don't have any games of {effectiveA.name} vs {effectiveB.name} in the dataset. Try a different combination.
            </div>
          </div>
        )}

        {/* Recent matchups */}
        {recent.length > 0 && (
          <div className="bg-slate-800/40 rounded-xl p-4 max-w-5xl mx-auto">
            <div className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-2">Recent</div>
            <div className="flex flex-wrap gap-2">
              {recent.map(r => (
                <button
                  key={r.key}
                  onClick={() => {
                    setFactionA(r.factionA); setBuildAId(r.buildAId);
                    setFactionB(r.factionB); setBuildBId(r.buildBId);
                  }}
                  className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded px-3 py-1.5"
                >
                  {r.buildAName} <span className="text-slate-500 mx-1">vs</span> {r.buildBName}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Predictor;
