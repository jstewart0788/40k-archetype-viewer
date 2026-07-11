import { archetypeGroups } from '../data/archetypeData';
import { archetypes } from '../data/dataIntegration';
import { useTournamentData } from '../data/TournamentDataContext';
import { wrColor as wrColorBucket } from '../data/winRateColor';
import ArchetypeTooltip from './ArchetypeTooltip';
import { useState } from 'react';

const ARCH_GROUP_MAP = Object.fromEntries(
  Object.entries(archetypeGroups).flatMap(([gKey, g]) =>
    g.members.map(m => [m, { key: gKey, ...g }])
  )
);

const wrColor = (wr) => wrColorBucket(wr).text;
const wrBg    = (wr) => wrColorBucket(wr).bg;

const ArchetypeDetail = () => {
  const { integratedFactionRatings: factionRatings, raw: tournamentData } = useTournamentData();
  const [selectedArchetype, setSelectedArchetype] = useState('mobileToolbox');

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-6 py-8 max-w-7xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-3">
            Playstyle Guide
          </h1>
          <p className="text-slate-400 text-base max-w-2xl mx-auto">
            What each of the eight playstyle archetypes means, which factions express it, and how each one matches up.
          </p>
        </div>

        {/* Mobile/tablet: horizontal chip strip — sticky under nav for quick switching */}
        <div className="lg:hidden sticky top-16 z-30 -mx-6 px-6 py-2 mb-4 bg-slate-900/85 backdrop-blur border-b border-slate-700/60">
          <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {Object.keys(archetypes).map((archetypeKey) => {
              const archetype = archetypes[archetypeKey];
              const active = selectedArchetype === archetypeKey;
              return (
                <button
                  key={archetypeKey}
                  onClick={() => setSelectedArchetype(archetypeKey)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors ${
                    active
                      ? 'bg-slate-700 text-white'
                      : 'bg-slate-800/70 text-slate-300 hover:text-white hover:bg-slate-700/60'
                  }`}
                  style={{
                    borderColor: active ? archetype.color : 'rgba(100, 116, 139, 0.3)',
                    color: active ? '#fff' : undefined,
                  }}
                >
                  <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ backgroundColor: archetype.color }} />
                  {archetype.shortName}
                </button>
              );
            })}
          </div>
        </div>

        {/* Wiki-Style Layout with Sidebar (lg+ only) */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar — desktop only */}
          <div className="hidden lg:block lg:col-span-1">
            <div className="bg-slate-800 rounded-xl p-5 sticky top-20">
              <h3 className="text-white font-bold mb-4 text-lg">Playstyles</h3>
              <nav className="space-y-2">
                {Object.keys(archetypes).map((archetypeKey) => {
                  const archetype = archetypes[archetypeKey];
                  return (
                    <button
                      key={archetypeKey}
                      onClick={() => setSelectedArchetype(archetypeKey)}
                      className={`w-full text-left px-4 py-3 rounded-lg transition-all text-sm font-medium border-l-4 ${
                        selectedArchetype === archetypeKey
                          ? 'bg-slate-700 text-white'
                          : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 hover:text-white'
                      }`}
                      style={{
                        borderLeftColor: selectedArchetype === archetypeKey ? archetype.color : 'transparent'
                      }}
                    >
                      {archetype.shortName}
                    </button>
                  );
                })}
              </nav>

              {/* Quick Matchup Reference */}
              <div className="mt-6 pt-6 border-t border-slate-700">
                <h4 className="text-white font-semibold mb-3 text-sm">Quick Reference</h4>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span>
                    <span className="text-slate-400">Strong Against</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-rose-400">✗</span>
                    <span className="text-slate-400">Weak Against</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sky-400">≈</span>
                    <span className="text-slate-400">Skill Matchup</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="lg:col-span-3">
            {(() => {
              const archetype = archetypes[selectedArchetype];

              // Live matchup row from data (replaces hand-coded pairingMatrix)
              const matchupRow = tournamentData.archetypeMatchups?.[selectedArchetype] || {};
              const matchupNotes = tournamentData.archetypeMatchupNotes?.[selectedArchetype] || {};
              const matchupCells = Object.keys(archetypes)
                .map((opp) => ({
                  opp,
                  cell: matchupRow[opp],
                  note: matchupNotes[opp],
                }))
                // Drop the diagonal mirror cell (vs same archetype) — it's
                // 50.0% by definition, not a measurement, and mixing it in
                // with real cells lets a reader treat it as evidence.
                .filter(x => x.cell && x.opp !== selectedArchetype)
                .sort((a, b) => b.cell.winRate - a.cell.winRate);

              // Get top factions
              const factionsByRating = Object.entries(factionRatings)
                .map(([faction, ratings]) => ({
                  faction,
                  rating: ratings[selectedArchetype]
                }))
                .filter(item => item.rating !== null)
                .sort((a, b) => b.rating - a.rating)
                .slice(0, 8);

              return (
                <div className="bg-slate-800 rounded-xl p-8 shadow-xl">
                  {/* Header */}
                  <div className="mb-6 pb-6 border-b border-slate-700">
                    <h2 className="text-3xl font-bold mb-3" style={{ color: archetype.color }}>
                      {archetype.name}
                    </h2>
                    <p className="text-slate-300 text-base leading-relaxed">
                      {archetype.definition}
                    </p>
                  </div>

                  {/* Core Characteristics */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    {/* Strengths */}
                    <div>
                      <h3 className="text-lg font-bold text-green-400 mb-3">Strengths</h3>
                      <ul className="space-y-2">
                        {archetype.strengths.map((strength, i) => (
                          <li key={i} className="text-slate-300 text-sm flex items-start leading-relaxed">
                            <span className="text-green-400 mr-2 mt-1">▸</span>
                            <span>{strength}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Weaknesses */}
                    <div>
                      <h3 className="text-lg font-bold text-red-400 mb-3">Weaknesses</h3>
                      <ul className="space-y-2">
                        {archetype.weaknesses.map((weakness, i) => (
                          <li key={i} className="text-slate-300 text-sm flex items-start leading-relaxed">
                            <span className="text-red-400 mr-2 mt-1">▸</span>
                            <span>{weakness}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Live matchup data — Elo-adjusted across all factions */}
                  {matchupCells.length > 0 && (
                    <div className="mb-8 p-5 bg-slate-700/30 rounded-lg border border-slate-600">
                      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
                        <h3 className="text-lg font-bold text-white">Matchup Analysis</h3>
                        <div className="text-xs text-slate-400">
                          Elo-adjusted · sorted by win rate
                        </div>
                      </div>
                      <div className="space-y-3">
                        {matchupCells.map(({ opp, cell, note }) => {
                          const oa = archetypes[opp];
                          const group = ARCH_GROUP_MAP[opp];
                          const isMirror = opp === selectedArchetype;
                          return (
                            <div
                              key={opp}
                              className={`rounded-lg border-l-4 border ${wrBg(cell.winRate)} p-4 ${
                                isMirror ? 'opacity-70' : ''
                              }`}
                              style={{ borderLeftColor: oa.color }}
                            >
                              <div className="flex justify-between items-start gap-3 mb-2">
                                <div className="min-w-0">
                                  <ArchetypeTooltip archetypeKey={opp} side="top">
                                    <span className="font-semibold text-white cursor-help">
                                      vs {oa.name}
                                      {isMirror && <span className="text-slate-500 italic ml-2 text-xs">mirror</span>}
                                    </span>
                                  </ArchetypeTooltip>
                                  <div className="text-[10px] uppercase tracking-wide" style={{ color: group?.color }}>
                                    {group?.label}
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <div className={`text-2xl font-bold ${wrColor(cell.winRate)}`}>
                                    {(cell.winRate * 100).toFixed(1)}%
                                  </div>
                                  <div className="text-xs text-slate-400">
                                    VP {cell.vpMargin >= 0 ? '+' : ''}{cell.vpMargin.toFixed(1)} · n={cell.n.toLocaleString()}
                                  </div>
                                </div>
                              </div>
                              {note && (
                                <p className="text-sm text-slate-300 leading-relaxed mt-2">{note}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Top Performing Factions */}
                  <div>
                    <h3 className="text-lg font-bold text-white mb-4">Top Performing Factions</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {factionsByRating.map((item, i) => {
                        let ratingBg = 'bg-slate-600';
                        let barColor = 'bg-slate-500';

                        if (item.rating >= 8) {
                          ratingBg = 'bg-green-600';
                          barColor = 'bg-green-500';
                        } else if (item.rating >= 5) {
                          ratingBg = 'bg-yellow-600';
                          barColor = 'bg-yellow-500';
                        } else {
                          ratingBg = 'bg-red-600';
                          barColor = 'bg-red-500';
                        }

                        return (
                          <div key={i} className="flex items-center gap-3 bg-slate-700/40 rounded-lg p-3">
                            <div className={`${ratingBg} text-white rounded px-3 py-1 font-bold text-base min-w-[45px] text-center`}>
                              {item.rating}
                            </div>
                            <div className="flex-grow min-w-0">
                              <div className="text-white font-medium text-sm truncate">{item.faction}</div>
                              <div className="h-1.5 bg-slate-600 rounded-full overflow-hidden mt-1">
                                <div
                                  className={`h-full ${barColor}`}
                                  style={{ width: `${(item.rating / 10) * 100}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ArchetypeDetail;
