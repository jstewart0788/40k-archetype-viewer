import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { factions, archetypeGroups } from '../data/archetypeData';
import { archetypes } from '../data/dataIntegration';
import { useTournamentData } from '../data/TournamentDataContext';
import { wrColor as wrColorBucket } from '../data/winRateColor';
import ArchetypeTooltip from './ArchetypeTooltip';
import InfoPopover from './InfoPopover';

// Display-only: drop the "(Astartes)" parenthetical from "Space Marines
// (Astartes)". The data key keeps the parenthesis; only the rendered label
// changes.
const displayFactionName = (name) =>
  typeof name === 'string' ? name.replace(/\s*\(Astartes\)\s*$/i, '') : name;

const ARCH_GROUP_MAP = Object.fromEntries(
  Object.entries(archetypeGroups).flatMap(([gKey, g]) =>
    g.members.map(m => [m, { key: gKey, ...g }])
  )
);

const formatPct = (p) => `${(p * 100).toFixed(1)}%`;
const formatVp  = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`;
const formatN   = (n) =>
  n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;

const wrColor = wrColorBucket;

// Top playstyle archetype this build embodies. Note: in v3 the basis is
// non-negative (NMF projection clipped to ≥0), so the "filter to positives"
// step is now mostly defensive — it handles edge cases where projection
// pseudo-inverse returns a tiny negative due to numerical noise.
function buildPlaystyles(build, n = 2) {
  if (!build?.playstyleProfile) return [];
  return Object.entries(build.playstyleProfile)
    .filter(([, v]) => (v ?? 0) > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, val]) => ({ key, val, archetype: archetypes[key] }));
}

const SORT_OPTIONS = [
  { key: 'best',  label: 'Best WR' },
  { key: 'worst', label: 'Worst WR' },
  { key: 'name',  label: 'A → Z' },
];

const MatchupExplorer = () => {
  const { factionBuilds, buildMatchups: allBuildMatchups, raw: tournamentData } = useTournamentData();
  const [searchParams] = useSearchParams();
  // Hydrate from `?faction=...&build=...` if linked from a build card.
  const initialFaction = (() => {
    const f = searchParams.get('faction');
    return f && factions.includes(f) ? f : factions[0];
  })();
  const [selectedFaction, setSelectedFaction] = useState(initialFaction);
  const builds = factionBuilds[selectedFaction] || [];

  const initialBuildId = (() => {
    const raw = searchParams.get('build');
    const parsed = raw != null ? Number(raw) : NaN;
    if (!Number.isNaN(parsed) && builds.some(b => b.id === parsed)) return parsed;
    return builds[0]?.id ?? null;
  })();
  const [selectedBuildId, setSelectedBuildId] = useState(initialBuildId);
  const [sortBy, setSortBy] = useState('best');
  // Reset build when faction changes
  useEffect(() => {
    setSelectedBuildId(builds[0]?.id ?? null);
  }, [selectedFaction]);  // eslint-disable-line react-hooks/exhaustive-deps

  const build = builds.find(b => b.id === selectedBuildId) || null;

  // Lookup matchup data for this build
  const buildMatchups = build ? (allBuildMatchups[String(build.id)] || {}) : {};

  // Tactical notes — keyed by the build's dominant playstyle
  const buildPlaystyleList = buildPlaystyles(build, 1);
  const dominantPlay = buildPlaystyleList[0]?.key;
  const matchupNotes = (dominantPlay && tournamentData.archetypeMatchupNotes?.[dominantPlay]) || {};

  const matchupCells = useMemo(() => {
    if (!build) return [];
    const cells = Object.keys(archetypes).map((opp) => {
      const cell = buildMatchups[opp];
      const note = matchupNotes[opp];
      return { opp, cell, note };
    });
    // Sort: cells with data come first; sort by chosen criterion;
    // cells without data sink to the bottom (they'd otherwise leave
    // gaps mid-list).
    const withData = cells.filter(c => c.cell);
    const noData = cells.filter(c => !c.cell);
    if (sortBy === 'best')  withData.sort((a, b) => (b.cell.winRate ?? 0) - (a.cell.winRate ?? 0));
    if (sortBy === 'worst') withData.sort((a, b) => (a.cell.winRate ?? 0) - (b.cell.winRate ?? 0));
    if (sortBy === 'name')  withData.sort((a, b) => archetypes[a.opp].name.localeCompare(archetypes[b.opp].name));
    return [...withData, ...noData];
  }, [build, buildMatchups, matchupNotes, sortBy]);

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-6 py-8 max-w-7xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-3">Matchup Explorer</h1>
          <p className="text-slate-300 text-base max-w-2xl mx-auto">
            Pick one of <em>your</em> builds and see how it does against each of the eight opposing playstyle archetypes.
          </p>
          <p className="text-slate-400 text-sm mt-2 max-w-2xl mx-auto">
            Looking to compare two specific lists head-to-head instead? Use the <Link to="/predict" className="underline decoration-dotted underline-offset-2 hover:text-purple-300">Predictor</Link>.
          </p>
        </div>

        {/* Selectors */}
        <div className="bg-slate-800 rounded-2xl shadow-2xl p-6 mb-6 max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-medium mb-2 text-sm">Your faction</label>
              <select
                value={selectedFaction}
                onChange={(e) => setSelectedFaction(e.target.value)}
                className="w-full bg-slate-700 text-white rounded-lg px-4 py-3 font-medium border border-slate-600 focus:border-purple-500 outline-none"
              >
                {factions.map(f => <option key={f} value={f}>{displayFactionName(f)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-2 text-sm">Your build</label>
              {builds.length > 0 ? (
                <select
                  value={selectedBuildId ?? ''}
                  onChange={(e) => setSelectedBuildId(parseInt(e.target.value, 10))}
                  className="w-full bg-slate-700 text-white rounded-lg px-4 py-3 font-medium border border-slate-600 focus:border-purple-500 outline-none"
                >
                  {builds.map(b => {
                    const wr = b.winRate != null ? `${(b.winRate * 100).toFixed(1)}%` : '—';
                    return (
                      <option key={b.id} value={b.id}>
                        {b.name} — {b.nLists.toLocaleString()} lists · {wr} WR
                      </option>
                    );
                  })}
                </select>
              ) : (
                <div className="text-slate-500 text-sm italic px-4 py-3 bg-slate-700/50 rounded-lg">
                  No builds available for this faction (insufficient list data)
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Build context strip */}
        {build && (
          <div className="bg-slate-800 rounded-2xl shadow-2xl p-6 mb-6 max-w-5xl mx-auto">
            <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
              <div>
                <h2 className="text-2xl font-bold text-white">{build.name}</h2>
                <div className="text-sm text-slate-400 mt-1">
                  {displayFactionName(selectedFaction)} · {build.nLists.toLocaleString()} lists · {build.nGames.toLocaleString()} games
                </div>
              </div>
              {build.winRate != null && (
                <div className="text-right">
                  <div className={`text-3xl font-bold ${wrColor(build.winRate).text}`}>
                    {(build.winRate * 100).toFixed(1)}%
                  </div>
                  <div className="text-xs text-slate-400">overall win rate</div>
                </div>
              )}
            </div>

            {/* Playstyle tags */}
            <div className="flex gap-2 flex-wrap mb-3">
              {buildPlaystyles(build, 3).map(t => (
                <ArchetypeTooltip key={t.key} archetypeKey={t.key} side="bottom">
                  <span
                    className="px-3 py-1 rounded-full text-xs font-medium border cursor-help"
                    style={{ borderColor: t.archetype.color, color: t.archetype.color }}
                  >
                    {t.archetype.shortName}
                    <span className="opacity-60 ml-1">({t.val >= 0 ? '+' : ''}{t.val.toFixed(2)})</span>
                  </span>
                </ArchetypeTooltip>
              ))}
            </div>

            {/* Description */}
            {build.description && (
              <p className="text-sm text-slate-300 leading-relaxed mb-3 whitespace-pre-line">
                {build.description}
              </p>
            )}

            {/* Top datasheets */}
            {build.topDatasheets?.length > 0 && (
              <div className="text-xs text-slate-400 leading-relaxed">
                <span className="text-slate-500">Defining datasheets: </span>
                {build.topDatasheets.map(t => t.datasheet).join(', ')}
              </div>
            )}
          </div>
        )}

        {/* Matchup grid */}
        {build && (
          <div className="bg-slate-800 rounded-2xl shadow-2xl p-6 mb-6 max-w-5xl mx-auto">
            <div className="flex items-baseline justify-between mb-4 gap-3 flex-wrap">
              <h3 className="text-xl font-bold text-white inline-flex items-center gap-2">
                <span>vs each opponent playstyle</span>
                <InfoPopover topic="matchup" />
              </h3>
              {/* Color legend (chart key) — muted styling, desktop only */}
              <div className="hidden sm:block text-[11px] text-slate-400">
                <span className="text-green-400/90">≥55%</span>
                {' · '}<span className="text-yellow-400/90">48–52%</span>
                {' · '}<span className="text-red-400/90">≤45%</span>
              </div>
            </div>

            {/* Sort chips */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <span className="text-xs text-slate-500">Sort:</span>
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setSortBy(opt.key)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    sortBy === opt.key
                      ? 'bg-slate-700 text-white border-purple-500/60'
                      : 'bg-slate-800/60 text-slate-300 border-slate-600/60 hover:bg-slate-700/60 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {matchupCells.map(({ opp, cell, note }) => {
                const a = archetypes[opp];
                const group = ARCH_GROUP_MAP[opp];
                const c = wrColor(cell?.winRate ?? 0.5);

                // Confidence-by-opacity: very low-n cells are visually dimmed
                // so users naturally read confident colors as confident data.
                // Cells with n < 5 are hard-hidden — the prediction is too
                // noisy to be worth showing alongside cells with 100+ games.
                const n = cell?.n ?? 0;
                if (cell && n < 5) return null;
                // Map log(n) to opacity in [0.55, 1.0]. n=5 → 0.55, n=20 →
                // 0.78, n=50 → 0.91, n=100+ → 1.0.
                const opacity = cell
                  ? Math.min(1, 0.55 + 0.45 * Math.log(Math.max(n, 1)) / Math.log(100))
                  : 0.7;

                return (
                  <div
                    key={opp}
                    style={{ borderLeftColor: a.color, borderLeftWidth: 4, opacity }}
                    className={`rounded-lg p-4 border-2 transition-opacity ${cell ? c.bg : 'bg-slate-700/30 border-slate-600'} ${
                      cell?.lowConfidence ? 'border-dashed' : ''
                    }`}
                  >
                    <div className="flex justify-between items-start gap-3 mb-2">
                      <div className="min-w-0">
                        <ArchetypeTooltip archetypeKey={opp} side="top">
                          <span className="font-semibold text-white cursor-help">vs {a.name}</span>
                        </ArchetypeTooltip>
                        <div className="text-[10px] uppercase tracking-wide" style={{ color: group?.color }}>
                          {group?.label}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {cell ? (
                          <>
                            <div className={`text-2xl font-bold ${c.text}`}>{formatPct(cell.winRate)}</div>
                            <div className="text-xs text-slate-400 leading-tight">
                              VP {formatVp(cell.vpMargin)} · n={formatN(cell.n)}
                            </div>
                          </>
                        ) : (
                          <div className="text-sm text-slate-500 italic">no data</div>
                        )}
                      </div>
                    </div>
                    {note && (
                      <p className="text-xs text-slate-300 leading-relaxed mt-2">{note}</p>
                    )}
                  </div>
                );
              })}
            </div>

          </div>
        )}
      </div>
    </div>
  );
};

export default MatchupExplorer;
