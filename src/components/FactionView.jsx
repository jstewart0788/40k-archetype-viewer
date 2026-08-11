import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { factions, archetypeFlags, archetypeGroups, archetypeRadarOrder } from '../data/archetypeData';
import { archetypes } from '../data/dataIntegration';
import { useTournamentData } from '../data/TournamentDataContext';
import { wrColor as wrColorBucket } from '../data/winRateColor';
import { ciAroundAdjusted } from '../data/winRateStats';
import { SHOW_PLAYSTYLE } from '../featureFlags';
import ArchetypeTooltip from './ArchetypeTooltip';
import InfoPopover from './InfoPopover';
import Sparkline from './Sparkline';

// Display-only: strip the "(Astartes)" parenthetical from "Space Marines
// (Astartes)" so buttons and labels read cleanly. The faction key in our data
// is still the parenthesised form — only the displayed text changes.
const displayFactionName = (name) =>
  typeof name === 'string' ? name.replace(/\s*\(Astartes\)\s*$/i, '') : name;

// Quick lookup: archetype key → group object (for tick coloring)
const ARCHETYPE_GROUP_MAP = Object.fromEntries(
  Object.entries(archetypeGroups).flatMap(([gKey, g]) =>
    g.members.map(m => [m, { key: gKey, ...g }])
  )
);

// Map shortName → archetype key (the radar uses shortName as dataKey)
const SHORTNAME_TO_KEY = Object.fromEntries(
  Object.entries(archetypes).map(([k, v]) => [v.shortName, k])
);

// Reusable rich tooltip card body — used for both the Recharts data-point tooltip
// and the portal-rendered label hover tooltip. `rating` is optional.
const ArchetypeHoverCard = ({ archKey, rating }) => {
  const arch = archetypes[archKey];
  if (!arch) return null;
  const group = ARCHETYPE_GROUP_MAP[archKey];
  return (
    <div
      className="bg-slate-900/95 backdrop-blur-sm border-2 rounded-lg shadow-2xl p-3 max-w-xs"
      style={{ borderColor: arch.color }}
    >
      <div className="flex justify-between items-baseline mb-1">
        <div className="text-base font-bold" style={{ color: arch.color }}>{arch.name}</div>
        {rating != null && (
          <div className="text-xl font-bold ml-3" style={{ color: arch.color }}>
            {typeof rating === 'number' ? rating.toFixed(1) : '—'}
          </div>
        )}
      </div>
      {group && (
        <div className="text-[10px] uppercase tracking-wide mb-2" style={{ color: group.color }}>
          {group.label}
        </div>
      )}
      <div className="text-xs text-slate-200 leading-relaxed mb-2">{arch.definition}</div>
      {arch.counters && (
        <div className="text-[11px] text-slate-300 leading-relaxed mb-1">
          <span className="text-emerald-400 font-semibold">Counters: </span>
          {arch.counters}
        </div>
      )}
      {arch.weakTo && (
        <div className="text-[11px] text-slate-300 leading-relaxed">
          <span className="text-rose-400 font-semibold">Weak to: </span>
          {arch.weakTo}
        </div>
      )}
    </div>
  );
};

// Recharts data-point tooltip — wraps ArchetypeHoverCard with a rating value.
const ArchetypeRadarTooltip = ({ active, payload }) => {
  if (!active || !payload?.[0]) return null;
  const shortName = payload[0].payload?.archetype;
  const archKey = SHORTNAME_TO_KEY[shortName];
  if (!archKey) return null;
  return <ArchetypeHoverCard archKey={archKey} rating={payload[0].value} />;
};

// Spoke-label tick factory — closes over hover handlers so labels can fire
// onMouseEnter/Leave/Move into FactionView state, which renders a portal'd
// tooltip (since SVG can't host HTML children).
const makeColoredAngleTick = ({ onEnter, onMove, onLeave }) => {
  const ColoredAngleTick = ({ payload, x, y, textAnchor }) => {
    const archKey = SHORTNAME_TO_KEY[payload.value];
    const group = archKey && ARCHETYPE_GROUP_MAP[archKey];
    const fill = group ? group.color : '#f1f5f9';
    return (
      <text
        x={x}
        y={y}
        textAnchor={textAnchor}
        fill={fill}
        fontSize={13}
        fontWeight={600}
        style={{ paintOrder: 'stroke', stroke: '#0f172a', strokeWidth: 3, cursor: 'help' }}
        onMouseEnter={(e) => archKey && onEnter(archKey, e.clientX, e.clientY)}
        onMouseMove={(e) => archKey && onMove(e.clientX, e.clientY)}
        onMouseLeave={onLeave}
      >
        {payload.value}
      </text>
    );
  };
  return ColoredAngleTick;
};

// Title-case unit names: capitalize first letter of each word, preserve
// internal apostrophes ("C'tan Shard" not "C'Tan Shard"), keep small
// connectors lowercase ("of", "the", "and") unless first/last.
const _SMALL_WORDS = new Set(['of', 'the', 'a', 'an', 'and', 'in', 'on', 'with', 'for', 'to']);
function titleCaseUnit(s) {
  if (!s) return s;
  const words = s.split(/(\s+)/);
  return words.map((w, i) => {
    if (/^\s+$/.test(w)) return w;
    const lower = w.toLowerCase();
    const isFirstOrLast = i === 0 || i === words.length - 1;
    if (!isFirstOrLast && _SMALL_WORDS.has(lower)) return lower;
    // Capitalize the first alphabetic character; leave the rest untouched
    return w.replace(/^([^a-z]*)([a-z])/i, (_, pfx, ch) => pfx + ch.toUpperCase());
  }).join('');
}

// Map a build's playstyle profile (raw projection scores) to the build's
// dominant playstyle archetypes. v3 NMF projection is non-negative by
// construction (clipped to ≥0), so the > 0 filter handles only numerical
// noise — by convention "0 on this axis" means "no signal", not "anti".
function topPlaystyles(profile, n = 2) {
  if (!profile) return [];
  return Object.entries(profile)
    .filter(([, v]) => (v ?? 0) > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, val]) => ({ key, val, archetype: archetypes[key] }));
}

const LAST_FACTION_KEY = 'nachmund.lastFaction';

// A single off-meta winning list (a winning list that doesn't belong to any
// shown build). Renders record + provenance + the parsed list, mirroring the
// per-build example cards.
function OffMetaListCard({ ex }) {
  const [open, setOpen] = useState(false);
  const wr = (ex.winRate ?? 0) * 100;
  let wrCl = 'text-yellow-400';
  if (wr >= 65) wrCl = 'text-emerald-400';
  else if (wr >= 55) wrCl = 'text-green-400';
  else if (wr < 45) wrCl = 'text-red-400';
  const dets = ex.detachments?.length ? ex.detachments : (ex.detachment ? [{ name: ex.detachment }] : []);
  return (
    <div className="rounded-lg bg-slate-800/60 border border-slate-700 p-4">
      <div className="flex justify-between items-start gap-2 mb-2 pb-2 border-b border-slate-700">
        <div className="min-w-0">
          <div className="text-white font-semibold truncate">{ex.eventName || ex.title || 'Tournament list'}</div>
          <div className="text-slate-400 text-[11px] mt-0.5">
            {ex.playerName && <span className="text-amber-300">{ex.playerName}</span>}
            {ex.playerName && ex.eventDate && <span> · </span>}
            {ex.eventDate && <span className="text-slate-500">{ex.eventDate}</span>}
          </div>
          <div className="text-slate-400 text-[11px] mt-0.5">
            {dets.map((d, i) => (
              <span key={i}>{i > 0 && ' · '}<span className="text-purple-300">{d.name}{d.dp != null && <span className="text-purple-500"> ({d.dp} DP)</span>}</span></span>
            ))}
          </div>
          {ex.forceDispositions?.length > 0 && (
            <div className="text-slate-400 text-[11px] mt-0.5">
              <span className="text-slate-500">Force Disposition:</span>{' '}
              <span className="text-sky-300">{ex.forceDispositions.join(' · ')}</span>
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className={`text-base font-bold ${wrCl}`}>{ex.record}</div>
          <div className={`text-[11px] font-semibold ${wrCl}`}>{wr.toFixed(0)}% · {ex.games}g</div>
          {ex.pointsTotal != null && <div className="text-emerald-300 font-mono text-xs mt-0.5">{ex.pointsTotal} pts</div>}
        </div>
      </div>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="text-xs font-medium text-purple-300 hover:text-purple-200 inline-flex items-center gap-1">
        {open ? 'Hide list ▴' : 'Show list ▾'}
      </button>
      {open && (
        <div className="mt-2 space-y-3">
          {(ex.sections || []).map((sec, sIdx) => (
            <div key={sIdx}>
              <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">{sec.name}</div>
              <ul className="space-y-2">
                {(sec.units || []).map((u, uIdx) => (
                  <li key={uIdx} className="text-[12px]">
                    <div className="flex justify-between items-baseline gap-2">
                      <span className="text-slate-200 font-medium">{u.name}</span>
                      {u.points != null && <span className="text-slate-400 font-mono shrink-0">{u.points} pts</span>}
                    </div>
                    {u.modelRows?.length > 0 ? (
                      <ul className="pl-3 mt-1 space-y-0.5">
                        {u.modelRows.map((r, rIdx) => (
                          <li key={rIdx} className="text-[11px] leading-relaxed">
                            <span className="text-slate-300 font-medium">{r.count}× {r.name}</span>
                            {r.wargear?.length > 0 && <span className="text-slate-400"> — {r.wargear.join(', ')}</span>}
                          </li>
                        ))}
                      </ul>
                    ) : u.wargear?.length > 0 && (
                      <div className="text-slate-400 text-[11px] pl-3 mt-0.5 leading-relaxed">{u.wargear.join(' · ')}</div>
                    )}
                    {u.enhancement && (
                      <div className="text-purple-300 text-[11px] pl-3 mt-0.5">
                        <span className="text-purple-500 font-semibold">Enhancement:</span> {u.enhancement}
                      </div>
                    )}
                    {u.attachedUnits?.length > 0 && (
                      <ul className="ml-3 mt-1.5 pl-2 space-y-1 border-l-2 border-purple-800/50">
                        {u.attachedUnits.map((au, aIdx) => (
                          <li key={aIdx} className="text-[12px]">
                            <span className="text-slate-200 font-medium">{au.name}
                              <span className="ml-2 text-[9px] bg-purple-700/40 text-purple-300 px-1.5 py-0.5 rounded uppercase tracking-wide">{au.attachedRole || 'Attached'}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {!(ex.sections || []).length && (
            <div className="text-slate-500 italic text-[12px]">Couldn't parse this list's structure.</div>
          )}
        </div>
      )}
    </div>
  );
}

const FactionView = () => {
  const { integratedFactionRatings: factionRatings, factionBuilds, unassignedWinningLists, detachmentViews, detachmentListPool, dataMetadata } = useTournamentData();
  const [searchParams] = useSearchParams();

  // Hydrate from URL params first (search palette, deep link, share),
  // then localStorage (returning users land on what they actually
  // play), finally falling back to the first faction.
  const [selectedFaction, setSelectedFaction] = useState(() => {
    const fromUrl = searchParams.get('faction');
    if (fromUrl && factions.includes(fromUrl)) return fromUrl;
    try {
      const saved = window.localStorage?.getItem(LAST_FACTION_KEY);
      if (saved && factions.includes(saved)) return saved;
    } catch { /* localStorage unavailable, e.g. SSR or strict privacy mode */ }
    return factions[0];
  });
  // Persist on change so the next visit hydrates with it.
  useEffect(() => {
    try { window.localStorage?.setItem(LAST_FACTION_KEY, selectedFaction); } catch { /* noop */ }
  }, [selectedFaction]);
  const [selectedBuild, setSelectedBuild] = useState(() => {
    const b = searchParams.get('build');
    return b != null && b !== '' ? Number(b) : null;
  });
  const [buildTab, setBuildTab] = useState('description'); // 'description' | 'examples' | 'units'

  // When URL params change while we're already mounted (e.g. navigating
  // from the search palette while on this page), refresh the selection
  // to match the new URL — URL stays the source of truth for shareable
  // links.
  useEffect(() => {
    const f = searchParams.get('faction');
    const b = searchParams.get('build');
    if (f && factions.includes(f) && f !== selectedFaction) {
      setSelectedFaction(f);
      setSelectedBuild(b != null && b !== '' ? Number(b) : null);
      setBuildTab('description');
    } else if (b !== null && b !== '' && Number(b) !== selectedBuild) {
      setSelectedBuild(Number(b));
      setBuildTab('description');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  // Per-listId expansion state for example lists on mobile (always-shown on desktop)
  const [expandedExamples, setExpandedExamples] = useState({});
  const toggleExample = (lid) =>
    setExpandedExamples((s) => ({ ...s, [lid]: !s[lid] }));
  const buildCardRefs = useRef({});
  const detailPanelRef = useRef(null);
  const lastScrolledBuildRef = useRef(null);
  const [hoveredArch, setHoveredArch] = useState(null); // { key, x, y } | null
  const radarTickRef = useRef(null);
  if (!radarTickRef.current) {
    radarTickRef.current = makeColoredAngleTick({
      onEnter: (key, x, y) => setHoveredArch({ key, x, y }),
      onMove: (x, y) => setHoveredArch((h) => (h ? { ...h, x, y } : h)),
      onLeave: () => setHoveredArch(null),
    });
  }

  const factionRatingsRow = factionRatings[selectedFaction] || {};
  const builds = factionBuilds[selectedFaction] || [];
  const offMetaLists = (unassignedWinningLists && unassignedWinningLists[selectedFaction]) || [];
  const factionDetachments = (detachmentViews && detachmentViews[selectedFaction]) || [];
  const factionListPool = (detachmentListPool && detachmentListPool[selectedFaction]) || {};
  const [selectedDetachment, setSelectedDetachment] = useState('');
  useEffect(() => { setSelectedDetachment(''); }, [selectedFaction]);
  const detachmentObj = factionDetachments.find(d => d.name === selectedDetachment) || null;
  // Infinite-scroll reveal for the off-meta winning-lists section.
  const [offMetaVisible, setOffMetaVisible] = useState(8);
  useEffect(() => { setOffMetaVisible(8); }, [selectedFaction]);
  const offMetaSentinel = useRef(null);
  useEffect(() => {
    const node = offMetaSentinel.current;
    if (!node || offMetaVisible >= offMetaLists.length) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) setOffMetaVisible((n) => n + 8);
    }, { rootMargin: '400px' });
    io.observe(node);
    return () => io.disconnect();
  }, [offMetaVisible, offMetaLists.length]);

  // When a build is selected, use its 0-10 ratings instead of the faction's
  const selectedBuildObj = selectedBuild != null
    ? builds.find(b => b.id === selectedBuild)
    : null;
  const ratings = selectedBuildObj?.playstyleRatings
    ? { ...factionRatingsRow, ...selectedBuildObj.playstyleRatings }
    : factionRatingsRow;

  // When a build is selected, scroll the detail panel into view if not already
  // visible. Works for both dropdown-driven and card-click selection since the
  // panel always renders below the card grid.
  useEffect(() => {
    if (selectedBuild == null) return;
    if (lastScrolledBuildRef.current === selectedBuild) return;
    const id = requestAnimationFrame(() => {
      const el = detailPanelRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const visible = rect.top >= 64 && rect.bottom <= window.innerHeight;
      if (!visible) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
    lastScrolledBuildRef.current = selectedBuild;
    return () => cancelAnimationFrame(id);
  }, [selectedBuild]);

  // Radar data in clockwise group-clustered order: aggressive → tactical →
  // defensive → static (gaming-expert visual recommendation).
  const radarData = archetypeRadarOrder.map(archetypeKey => ({
    archetype: archetypes[archetypeKey].shortName,
    rating: ratings[archetypeKey] ?? 0,
    fullMark: 10,
  }));

  // Top 3 archetypes by rating (sparse default view per stats expert).
  const topArchetypes = Object.keys(archetypes)
    .map(k => ({ key: k, rating: ratings[k] ?? 0 }))
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 3);

  // Active flags — surface only when share is meaningful.
  const FLAG_THRESH = 0.05;
  const activeFlags = Object.entries(archetypeFlags)
    .filter(([key]) => (ratings[`${key}Share`] ?? 0) >= FLAG_THRESH)
    .map(([key, def]) => ({
      key, ...def, share: ratings[`${key}Share`] ?? 0,
    }));

  return (
    <div className="relative min-h-screen">
      {/* Portal'd hover tooltip for radar spoke labels — positioned at cursor */}
      {hoveredArch && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed',
            left: hoveredArch.x + 14,
            top: hoveredArch.y + 14,
            pointerEvents: 'none',
            zIndex: 1000,
          }}
        >
          <ArchetypeHoverCard archKey={hoveredArch.key} />
        </div>,
        document.body
      )}
      {/* Hero — sits on top of the page-wide bg, lighter overlay zone so the image reads more strongly here */}
      <div className="relative w-full pt-14 pb-12">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(to bottom, rgba(15, 23, 42, 0) 0%, rgba(15, 23, 42, 0) 70%, rgba(15, 23, 42, 0.4) 100%)',
          }}
        />
        <div className="relative container mx-auto px-6 max-w-7xl">
          {/* Hero text */}
          <div className="text-center mb-10">
            <div className="text-slate-300 text-xs uppercase tracking-[0.32em] mb-3" style={{ textShadow: '0 1px 6px rgba(0, 0, 0, 0.85)' }}>
              {dataMetadata.editionLabel || '10th Edition'} Meta Analysis
            </div>
            <h1
              className="font-display tracking-[0.15em] uppercase text-5xl sm:text-6xl md:text-7xl text-slate-100 mb-4"
              style={{ textShadow: '0 0 32px rgba(0, 0, 0, 0.95), 0 0 16px rgba(168, 85, 247, 0.45)' }}
            >
              Nachmund
            </h1>
            <p className="text-slate-200 text-lg max-w-2xl mx-auto" style={{ textShadow: '0 1px 8px rgba(0, 0, 0, 0.9)' }}>
              Pick your faction (or your opponent's) below to see what's winning right now and which builds are rising. Or jump to the <Link to="/predict" className="underline decoration-dotted underline-offset-2 hover:text-purple-300">Predictor</Link> to compare two specific lists.
            </p>
            <p className="text-slate-400 text-sm max-w-2xl mx-auto mt-2" style={{ textShadow: '0 1px 8px rgba(0, 0, 0, 0.9)' }}>
              Built from {dataMetadata.gamesCount?.toLocaleString() || 'tournament'} games over {dataMetadata.dateRange || 'the last 6 months'}, skill-adjusted and time-weighted toward current meta.
            </p>
            {dataMetadata.source === 'manual' && (
              <div className="mt-4 inline-block bg-yellow-900/30 border border-yellow-600 rounded-lg px-4 py-2">
                <span className="text-yellow-400 font-medium text-sm">
                  ⚠ Using Manual Ratings
                </span>
              </div>
            )}
          </div>

          {/* Faction picker — wrap-grid on tablet+, native <select> on phone */}
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl font-semibold text-white mb-4 text-center" style={{ textShadow: '0 1px 8px rgba(0, 0, 0, 0.9)' }}>
              Select a Faction
            </h2>

            {/* Mobile: native select — tap-friendly, no 1600px wall of buttons */}
            <div className="md:hidden px-2">
              <select
                value={selectedFaction}
                onChange={(e) => { setSelectedFaction(e.target.value); setSelectedBuild(null); setBuildTab('description'); }}
                className="w-full bg-purple-600 text-white text-base font-medium rounded-lg border border-purple-500/60 px-4 py-3.5 focus:border-purple-400 focus:ring-1 focus:ring-purple-400 outline-none cursor-pointer shadow-lg"
              >
                {factions.map((faction) => (
                  <option key={faction} value={faction}>{displayFactionName(faction)}</option>
                ))}
              </select>
            </div>

            {/* Tablet+: wrap-grid of buttons */}
            <div className="hidden md:flex flex-wrap gap-3 justify-center">
              {factions.map((faction) => (
                <button
                  key={faction}
                  onClick={() => { setSelectedFaction(faction); setSelectedBuild(null); setBuildTab('description'); }}
                  style={{ minWidth: '180px', maxWidth: '240px' }}
                  className={`
                    px-6 py-4 rounded-lg font-medium transition-all duration-200 text-sm
                    ${selectedFaction === faction
                      ? 'bg-purple-600 text-white shadow-lg'
                      : 'bg-slate-700/70 backdrop-blur-sm text-slate-200 hover:bg-blue-600 hover:text-white'
                    }
                  `}
                >
                  {displayFactionName(faction)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="relative container mx-auto px-6 pb-8 pt-8 max-w-7xl">

        {/* Faction name (always shown). */}
        <h2 className="text-3xl font-bold text-white text-center mb-6">{displayFactionName(selectedFaction)}</h2>

        {/* Headline (list-composition flags + playstyle archetype ratings) —
            hidden in early-edition mode; see src/featureFlags.js */}
        {SHOW_PLAYSTYLE && (
        <div className="bg-slate-800 rounded-2xl shadow-2xl p-6 mb-6 max-w-5xl mx-auto">
          <div className="flex items-baseline justify-between flex-wrap gap-3 mb-4">
            <h2 className="text-3xl font-bold text-white">{displayFactionName(selectedFaction)}</h2>
            <div className="flex gap-2 flex-wrap">
              {activeFlags.map(flag => (
                <span
                  key={flag.key}
                  title={flag.definition}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border"
                  style={{
                    color: flag.color,
                    borderColor: flag.color,
                    backgroundColor: `${flag.color}1a`,
                  }}
                >
                  <span>{flag.icon}</span>
                  <span>{flag.name}</span>
                  <span className="opacity-75">{Math.round(flag.share * 100)}% of lists</span>
                </span>
              ))}
            </div>
          </div>

          {/* Top 3 archetypes — sparse default view */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {topArchetypes.map((t, i) => {
              const a = archetypes[t.key];
              const group = ARCHETYPE_GROUP_MAP[t.key];
              return (
                <ArchetypeTooltip key={t.key} archetypeKey={t.key} side="bottom">
                  <span
                    className="block bg-slate-700/40 rounded-lg p-4 border-l-4 cursor-help w-full"
                    style={{ borderLeftColor: a.color }}
                  >
                    <span className="flex justify-between items-start">
                      <span className="block">
                        <span className="block text-xs text-slate-400 mb-0.5">#{i + 1}</span>
                        <span className="block font-semibold text-white">{a.name}</span>
                        <span className="block text-xs uppercase tracking-wide" style={{ color: group?.color }}>
                          {group?.label}
                        </span>
                      </span>
                      <span className="text-3xl font-bold" style={{ color: a.color }}>
                        {t.rating.toFixed(1)}
                      </span>
                    </span>
                  </span>
                </ArchetypeTooltip>
              );
            })}
          </div>
        </div>
        )}

        {/* Win Rate Card */}
        {ratings.winRate != null && (() => {
          const wrBucket = wrColorBucket(ratings.winRate);
          const pct = Math.round(ratings.winRate * 1000) / 10;
          const ci = ciAroundAdjusted(
            ratings.winRate,
            ratings.winRateWins,
            ratings.winRateLosses,
            ratings.winRateDraws,
          );
          return (
            <div className={`rounded-2xl shadow-2xl p-6 mb-6 max-w-5xl mx-auto border ${wrBucket.bg}`}>
              <h3 className="text-lg font-semibold text-slate-300 mb-4 text-center inline-flex items-center gap-2 w-full justify-center">
                <span>Skill-adjusted Win Rate</span>
                <InfoPopover topic="winrate" />
              </h3>
              <div className="flex items-center justify-center gap-10 flex-wrap">
                <div className="text-center">
                  <div className={`text-5xl font-bold ${wrBucket.text}`}>{pct}%</div>
                  {ci && (
                    <div className="text-slate-400 text-xs mt-1.5">
                      90% CI · <span className="text-slate-300 tabular-nums">{(ci.lo * 100).toFixed(1)}%–{(ci.hi * 100).toFixed(1)}%</span>
                    </div>
                  )}
                </div>
                <div className="text-center">
                  <div className="text-2xl font-semibold text-white">
                    {ratings.winRateWins}W / {ratings.winRateLosses}L / {ratings.winRateDraws}D
                  </div>
                  <div className="text-slate-400 text-sm mt-1">
                    {ratings.games?.toLocaleString()} games · {dataMetadata.dateRange}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}


        {/* Playstyle Ratings + Radar — hidden in early-edition mode (featureFlags). */}
        {SHOW_PLAYSTYLE && (<>
        {/* Archetype Ratings panel — name + rating only, hover for definition.
            Inline horizontal scale legend on the right. */}
        <div className="bg-slate-800 rounded-2xl shadow-2xl p-6 mb-6 max-w-5xl mx-auto">
          <div className="flex items-baseline justify-between flex-wrap gap-3 mb-3">
            <h3 className="text-xl font-bold text-white inline-flex items-center gap-2">
              <span>Playstyle Ratings</span>
              <InfoPopover topic="playstyles" />
            </h3>
            <div className="hidden sm:flex items-center gap-2.5 text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 bg-green-600/80 rounded-sm" />
                <span>8-10</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 bg-yellow-600/80 rounded-sm" />
                <span>5-7</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 bg-red-600/80 rounded-sm" />
                <span>0-4</span>
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {archetypeRadarOrder.map(archetypeKey => {
              const archetype = archetypes[archetypeKey];
              const rating = ratings[archetypeKey];
              const group = ARCHETYPE_GROUP_MAP[archetypeKey];
              let ratingBg = 'bg-slate-600';
              if (rating != null) {
                if (rating >= 8) ratingBg = 'bg-green-600';
                else if (rating >= 5) ratingBg = 'bg-yellow-600';
                else ratingBg = 'bg-red-600';
              }
              return (
                <ArchetypeTooltip key={archetypeKey} archetypeKey={archetypeKey} side="bottom">
                  <span
                    className="flex justify-between items-center bg-slate-700/30 border-l-4 rounded px-3 py-2 cursor-help w-full"
                    style={{ borderLeftColor: archetype.color }}
                  >
                    <span className="min-w-0 mr-2">
                      <span className="block font-semibold text-sm truncate" style={{ color: archetype.color }}>
                        {archetype.shortName}
                      </span>
                      <span className="block text-[10px] sm:text-[11px] uppercase tracking-wide opacity-75" style={{ color: group?.color }}>
                        {group?.label}
                      </span>
                    </span>
                    <span className={`${ratingBg} text-white px-2 py-0.5 rounded text-sm font-bold shrink-0`}>
                      {rating != null ? rating.toFixed(1) : 'N/A'}
                    </span>
                  </span>
                </ArchetypeTooltip>
              );
            })}
          </div>
        </div>

        {/* Radar Chart Section */}
        <div className="bg-slate-800 rounded-2xl shadow-2xl p-8 mb-8 max-w-5xl mx-auto">
          <div className="flex items-start justify-between flex-wrap gap-4 mb-4">
            <div className="min-w-0">
              <h3 className="text-2xl font-bold text-white mb-2 inline-flex items-center gap-2">
                <span>All 8 Playstyles</span>
                <InfoPopover topic="playstyles" />
              </h3>
              {builds.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <label htmlFor="radar-build-select" className="text-xs text-slate-400">
                    Show on radar:
                  </label>
                  <select
                    id="radar-build-select"
                    value={selectedBuild ?? ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      const next = v === '' ? null : Number(v);
                      // Suppress the auto-scroll effect — user wants to watch
                      // the radar morph, not get yanked down to the cards.
                      lastScrolledBuildRef.current = next;
                      setSelectedBuild(next);
                    }}
                    className="bg-slate-700 text-white text-sm font-medium rounded-md border border-slate-600 px-3 py-1.5 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none cursor-pointer hover:bg-slate-600 transition-colors max-w-[280px]"
                  >
                    <option value="">{displayFactionName(selectedFaction)} (faction average)</option>
                    {builds.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="hidden md:flex gap-3 flex-wrap text-xs shrink-0">
              {Object.entries(archetypeGroups).map(([key, g]) => (
                <span key={key} className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block w-3 h-3 rounded-full"
                    style={{ backgroundColor: g.color }}
                  />
                  <span className="text-slate-300 font-medium">{g.label}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Mobile: horizontal bar list — same data, readable at 375px,
              and tap-friendly (radar spoke labels collide + hover-tooltips
              don't work on touch). */}
          <div className="md:hidden space-y-2 mt-2">
            {radarData.map((d) => {
              const archKey = SHORTNAME_TO_KEY[d.archetype];
              const arch = archetypes[archKey];
              const group = ARCHETYPE_GROUP_MAP[archKey];
              const pct = Math.max(0, Math.min(100, (d.rating / 10) * 100));
              return (
                <div
                  key={archKey}
                  className="bg-slate-700/40 rounded-lg p-3 border-l-4"
                  style={{ borderLeftColor: arch?.color }}
                >
                  <div className="flex justify-between items-baseline mb-1.5 gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate" style={{ color: arch?.color }}>
                        {arch?.name}
                      </div>
                      <div className="text-[10px] uppercase tracking-wide" style={{ color: group?.color }}>
                        {group?.label}
                      </div>
                    </div>
                    <div className="text-xl font-bold tabular-nums shrink-0" style={{ color: arch?.color }}>
                      {d.rating.toFixed(1)}
                    </div>
                  </div>
                  <div className="h-1.5 bg-slate-800/80 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: arch?.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop: radar chart */}
          <div className="hidden md:flex justify-center items-center" style={{ height: '450px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="#64748b" strokeWidth={1.5} />
                <PolarAngleAxis
                  dataKey="archetype"
                  tick={radarTickRef.current}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 10]}
                  ticks={[2, 4, 6, 8, 10]}
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  axisLine={false}
                  tickFormatter={(v) => v === 10 ? '' : String(v)}
                />
                <Radar
                  name={displayFactionName(selectedFaction)}
                  dataKey="rating"
                  stroke="#8b5cf6"
                  fill="url(#colorGradient)"
                  fillOpacity={0.7}
                  strokeWidth={3}
                />
                <defs>
                  <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.8}/>
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.6}/>
                  </linearGradient>
                </defs>
                <Tooltip content={<ArchetypeRadarTooltip />} />
                <Legend
                  wrapperStyle={{
                    paddingTop: '20px',
                    color: '#e2e8f0'
                  }}
                  formatter={(value) => <span style={{ color: '#f1f5f9' }}>{value}</span>}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
        </>)}

        {/* Common Builds — faction-specific NMF archetypes (Phase 5) */}
        {builds.length > 0 && (
          <div className="bg-slate-800 rounded-2xl shadow-2xl p-6 mb-6 max-w-5xl mx-auto">
            <div className="flex items-baseline justify-between flex-wrap gap-3 mb-3">
              <h3 className="text-2xl font-bold text-white inline-flex items-center gap-2">
                <span>Common Builds</span>
                <InfoPopover topic="builds" />
              </h3>
              <div className="text-xs text-slate-400">
                Sorted by current adoption · {builds.length} build{builds.length === 1 ? '' : 's'} from {ratings.games?.toLocaleString() || ''} games
              </div>
            </div>

            {/* Compact one-line momentum key — full per-direction copy lives
                in the Builds info popover. */}
            <div className="text-[11px] text-slate-400 mb-4 pb-3 border-b border-slate-700/60 flex flex-wrap gap-x-3 gap-y-1 items-center">
              <span className="inline-flex items-center gap-1"><span className="text-emerald-400 font-semibold">↑</span> rising</span>
              <span className="text-slate-600">·</span>
              <span className="inline-flex items-center gap-1"><span className="text-rose-400 font-semibold">↓</span> falling</span>
              <span className="text-slate-600">·</span>
              <span className="inline-flex items-center gap-1"><span className="text-sky-400 font-semibold">=</span> stable</span>
              <span className="text-slate-600">·</span>
              <span className="inline-flex items-center gap-1"><span className="text-amber-300 font-semibold">✦</span> emerging</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {builds.map(build => {
                const isOpen = selectedBuild === build.id;
                const tops = topPlaystyles(build.playstyleProfile, 2);
                const wrPct = build.winRate != null ? (build.winRate * 100).toFixed(1) : null;
                const wrColor = build.winRate != null ? wrColorBucket(build.winRate).text : 'text-slate-400';
                // Momentum (representation share Δ between last 30 days
                // and prior 60 days). Null direction = below volume floor;
                // we render nothing rather than a low-confidence badge.
                const momDir   = build.momentumDirection;
                const momDelta = build.momentumDelta;
                const momRecent = build.listShareRecent;
                const momPrior  = build.listSharePrior;
                // The "refuge" case: a build is rising in adoption but its
                // win rate is below 50%. Players are moving toward it from a
                // worse build, not because the build itself is meta-strong.
                // Glanceably distinct from "rising AND winning" so users
                // don't read a refuge build as a thriving one (Blood Angels
                // Bladeguard Beatdown post-Q1-2026 is the canonical case).
                const isRefuge   = momDir === 'up' && build.winRate != null && build.winRate < 0.50;
                const isReluctant = momDir === 'down' && build.winRate != null && build.winRate >= 0.52;
                let momIcon = null, momTone = '', momTitle = '';
                if (momDir === 'up' && !isRefuge) {
                  momIcon = '↑'; momTone = 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10';
                } else if (isRefuge) {
                  momIcon = '↑'; momTone = 'text-amber-300 border-amber-400/50 bg-amber-500/10';
                } else if (momDir === 'down' && !isReluctant) {
                  momIcon = '↓'; momTone = 'text-rose-400 border-rose-500/40 bg-rose-500/10';
                } else if (isReluctant) {
                  momIcon = '↓'; momTone = 'text-amber-300 border-amber-400/50 bg-amber-500/10';
                } else if (momDir === 'flat') {
                  momIcon = '='; momTone = 'text-sky-400 border-sky-500/30 bg-sky-500/10';
                } else if (momDir === 'emerging') {
                  momIcon = '✦'; momTone = 'text-amber-300 border-amber-400/50 bg-amber-500/10';
                }
                if (momDir === 'emerging' && momRecent != null) {
                  momTitle = `Emerging: ${(momRecent * 100).toFixed(1)}% of ${selectedFaction} lists in the last 30 days. No comparable prior-window baseline — this build cluster is new enough that its prior-60-day share isn't statistically meaningful.`;
                } else if (isRefuge && momRecent != null && momPrior != null && momDelta != null) {
                  const sign = momDelta >= 0 ? '+' : '';
                  momTitle = `Rising adoption (${sign}${(momDelta * 100).toFixed(1)} pp) but the build's win rate is below 50%. Players are likely moving from a worse build — treat this as a refuge signal, not "this build is meta-strong."`;
                } else if (isReluctant && momDelta != null) {
                  momTitle = `Falling adoption despite a winning record (${(build.winRate * 100).toFixed(1)}%). Players may be over-correcting away from a build that's still performing — or anticipating a nerf.`;
                } else if (momDir != null && momRecent != null && momPrior != null && momDelta != null) {
                  const sign = momDelta >= 0 ? '+' : '';
                  momTitle = `Adoption: ${(momRecent * 100).toFixed(1)}% of ${selectedFaction} lists in the last 30 days, ${(momPrior * 100).toFixed(1)}% in the prior 60 days (days 31–90). Δ ${sign}${(momDelta * 100).toFixed(1)} pp.`;
                }
                return (
                  <button
                    key={build.id}
                    type="button"
                    ref={(el) => { buildCardRefs.current[build.id] = el; }}
                    onClick={() => {
                      const opening = !isOpen;
                      lastScrolledBuildRef.current = opening ? build.id : null;
                      setSelectedBuild(opening ? build.id : null);
                      if (opening) setBuildTab('description');
                    }}
                    className={`text-left rounded-lg border p-4 transition-colors scroll-mt-24 ${
                      isOpen
                        ? 'border-purple-500 bg-slate-700/40 ring-2 ring-purple-500/70'
                        : 'border-slate-700 bg-slate-700/20 hover:bg-slate-700/40'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-3 mb-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="font-semibold text-white truncate">{build.name}</div>
                          {momIcon && (
                            <span
                              title={momTitle}
                              className={`shrink-0 inline-flex items-center justify-center w-5 h-5 text-xs font-bold rounded border ${momTone}`}
                            >
                              {momIcon}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {momRecent != null ? (
                            <>
                              <span title={momTitle} className="cursor-help">
                                {(momRecent * 100).toFixed(0)}% adoption
                              </span>
                              {momDir === 'up' && !isRefuge && momDelta != null && (
                                <span className="text-emerald-400" title={momTitle}>
                                  {' '}↑ +{(momDelta * 100).toFixed(0)} pp
                                </span>
                              )}
                              {isRefuge && momDelta != null && (
                                <span className="text-amber-300" title={momTitle}>
                                  {' '}↑ +{(momDelta * 100).toFixed(0)} pp{' '}
                                  <span className="ml-0.5 px-1 py-px rounded text-[9px] uppercase tracking-wide font-semibold bg-amber-500/15 text-amber-200 border border-amber-400/40">refuge</span>
                                </span>
                              )}
                              {momDir === 'down' && !isReluctant && momDelta != null && (
                                <span className="text-rose-400" title={momTitle}>
                                  {' '}↓ {(momDelta * 100).toFixed(0)} pp
                                </span>
                              )}
                              {isReluctant && momDelta != null && (
                                <span className="text-amber-300" title={momTitle}>
                                  {' '}↓ {(momDelta * 100).toFixed(0)} pp{' '}
                                  <span className="ml-0.5 px-1 py-px rounded text-[9px] uppercase tracking-wide font-semibold bg-amber-500/15 text-amber-200 border border-amber-400/40">sticky</span>
                                </span>
                              )}
                              {momDir === 'emerging' && (
                                <span className="text-amber-300 font-semibold" title={momTitle}>
                                  {' '}✦ new
                                </span>
                              )}
                              {' · '}
                            </>
                          ) : null}
                          {build.nLists.toLocaleString()} lists · {build.nGames.toLocaleString()} games
                        </div>
                      </div>
                      {/* Superseded: this build's detachment combination is no
                          longer legal, so too few games remain under current
                          rules to state a win rate. Showing the survivors would
                          be worse than saying nothing — one such build keeps two
                          games, both wins, which would read as 80%. */}
                      {wrPct == null && build.winRateSuppressed && (
                        <div className="shrink-0 flex flex-col items-end gap-0.5 max-w-[9.5rem]">
                          <div className="text-[11px] font-semibold text-amber-400 leading-tight text-right">
                            No current-rules win rate
                          </div>
                          <div className="text-[10px] text-slate-500 leading-snug text-right">
                            This build&rsquo;s detachment combination is no longer legal.
                            {build.nGames ? ` Only ${build.nGames} game${build.nGames === 1 ? '' : 's'} remain.` : ''}
                          </div>
                        </div>
                      )}
                      {wrPct != null && (
                        <div className="shrink-0 flex flex-col items-end gap-0.5">
                          <div className={`text-2xl font-bold leading-none ${wrColor}`}>{wrPct}%</div>
                          {/* 6-month raw monthly WR sparkline. Tells the user
                              whether this build is winning more (or less) than
                              it used to, distinct from the adoption-momentum
                              arrow — a build can be falling in adoption while
                              winning more, or rising while losing more. */}
                          {Array.isArray(build.winRateTrend) && build.winRateTrend.length >= 2 && (() => {
                            const trend = build.winRateTrend;
                            const last = trend[trend.length - 1]?.winRate;
                            const first = trend[0]?.winRate;
                            // Tone the line to match where the trend ends so a
                            // glance reads as good/neutral/bad without a separate legend.
                            let stroke = '#94a3b8'; // slate
                            if (typeof last === 'number') {
                              if (last >= 0.55) stroke = '#34d399';
                              else if (last < 0.45) stroke = '#f87171';
                              else stroke = '#fbbf24';
                            }
                            const tooltip = `Monthly raw WR · ${trend.map((p) =>
                              `${p.month?.slice(0, 7) ?? '?'}: ${(p.winRate * 100).toFixed(0)}% (n=${p.n})`
                            ).join(' · ')}` + (typeof first === 'number' && typeof last === 'number'
                              ? ` · Δ ${((last - first) * 100).toFixed(1)} pp`
                              : '');
                            return (
                              <span title={tooltip} className="cursor-help">
                                <Sparkline data={trend} accent={stroke} width={68} height={18} />
                              </span>
                            );
                          })()}
                        </div>
                      )}
                    </div>

                    {SHOW_PLAYSTYLE && tops.length > 0 && (
                      <div className="flex gap-2 flex-wrap text-xs text-slate-300 mb-2">
                        {tops.map(t => (
                          <span
                            key={t.key}
                            className="px-2 py-0.5 rounded border"
                            style={{ borderColor: t.archetype.color, color: t.archetype.color }}
                          >
                            {t.archetype.shortName}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="text-xs text-slate-400 leading-relaxed">
                      <span className="text-slate-500">Core: </span>
                      {build.topDatasheets.slice(0, 4).map(t => t.datasheet).join(', ')}
                    </div>

                    {build.detachmentMix?.length > 0 && (
                      <div className="text-xs text-slate-400 leading-relaxed mt-1">
                        <span className="text-slate-500">Detachments: </span>
                        {build.detachmentMix.slice(0, 3).map((d, i) => (
                          <span key={d.name}>
                            {i > 0 && <span className="text-slate-600">, </span>}
                            <span className="text-slate-300">{d.name}</span>
                            <span className="text-slate-500"> {Math.round(d.pct * 100)}%</span>
                          </span>
                        ))}
                      </div>
                    )}

                    {!isOpen && build.description && (
                      <p className="text-xs text-slate-400 leading-relaxed mt-2 line-clamp-2">
                        {build.description.split('\n')[0]}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>


            {/* Detail panel — replaces inline card expansion to avoid layout reflow */}
            {selectedBuildObj && (
              <div
                ref={detailPanelRef}
                className="mt-5 bg-slate-900/40 border border-purple-500/40 rounded-lg p-5 scroll-mt-24"
              >
                <div className="flex justify-between items-start gap-3 mb-4 pb-3 border-b border-slate-700">
                  <div className="min-w-0">
                    <h4 className="text-lg font-bold text-white truncate">{selectedBuildObj.name}</h4>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {selectedBuildObj.nLists.toLocaleString()} lists · {selectedBuildObj.nGames.toLocaleString()} games
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { lastScrolledBuildRef.current = null; setSelectedBuild(null); }}
                    aria-label="Close detail"
                    className="text-slate-400 hover:text-white p-2.5 min-w-[44px] min-h-[44px] inline-flex items-center justify-center shrink-0 rounded hover:bg-slate-700"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Tab strip */}
                <div className="flex gap-1 -mb-px pt-3">
                  {[
                    { key: 'description', label: 'Description' },
                    { key: 'examples',    label: `Example Lists (${selectedBuildObj.exampleLists?.length ?? 0})` },
                    { key: 'units',       label: 'Unit Frequency' },
                  ].map(t => (
                    <button
                      key={t.key}
                      onClick={() => setBuildTab(t.key)}
                      className={`px-3 py-2.5 min-h-[44px] inline-flex items-center text-sm font-medium rounded-t-md border-b-2 transition-colors ${
                        buildTab === t.key
                          ? 'text-white border-purple-500 bg-slate-700/50'
                          : 'text-slate-400 border-transparent hover:text-white'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <div className="pt-4 border-t border-slate-700 text-xs">
                  {buildTab === 'description' && (
                    <div className="space-y-3">
                      {selectedBuildObj.description && (
                        <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                          {selectedBuildObj.description}
                        </p>
                      )}
                      <div className="text-slate-400">
                        <span className="text-slate-500">All defining datasheets: </span>
                        <span className="text-slate-300">
                          {selectedBuildObj.topDatasheets.map(t => `${t.datasheet} (${t.weight})`).join(', ')}
                        </span>
                      </div>
                      <div className="text-slate-400">
                        <span className="text-slate-500">Record: </span>
                        <span className="text-slate-300">
                          {selectedBuildObj.wins}W / {selectedBuildObj.losses}L / {selectedBuildObj.draws}D
                        </span>
                        {selectedBuildObj.massShare > 0 && (
                          <span className="text-slate-500 ml-3">
                            cluster mass: {(selectedBuildObj.massShare * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                      {/* Cross-page jumps — golden paths #2 and #4. */}
                      <div className="flex flex-wrap gap-3 pt-3 border-t border-slate-800">
                        <Link
                          to={`/matchups?faction=${encodeURIComponent(selectedFaction)}&build=${selectedBuildObj.id}`}
                          className="inline-flex items-center gap-1 text-purple-400 hover:text-purple-300 text-sm"
                        >
                          See matchups for this build →
                        </Link>
                        <Link
                          to={`/predict?factionA=${encodeURIComponent(selectedFaction)}&buildA=${selectedBuildObj.id}`}
                          className="inline-flex items-center gap-1 text-purple-400 hover:text-purple-300 text-sm"
                        >
                          Use as "You" in Predictor →
                        </Link>
                      </div>
                    </div>
                  )}

                  {buildTab === 'examples' && (
                    <div className="space-y-4">
                      {(selectedBuildObj.exampleLists || []).map((ex, i) => (
                        <div key={ex.listId} className="rounded-lg bg-slate-800/60 border border-slate-700 p-4">
                          {/* List header — title + faction + detachment + points */}
                          <div className="flex justify-between items-start gap-2 mb-3 pb-2 border-b border-slate-700">
                            <div className="min-w-0">
                              <div className="text-white font-semibold">
                                {ex.eventName || ex.title || `Example #${i + 1}`}
                              </div>
                              {(ex.playerName || ex.eventDate || (ex.eventRecord && ex.eventRecord !== '0-0') || ex.finalStanding) && (
                                <div className="text-slate-400 text-[11px] mt-0.5">
                                  {ex.playerName && <span className="text-amber-300">{ex.playerName}</span>}
                                  {ex.playerName && ex.eventDate && <span> · </span>}
                                  {ex.eventDate && <span className="text-slate-500">{ex.eventDate}</span>}
                                  {(ex.playerName || ex.eventDate) && ex.eventRecord && ex.eventRecord !== '0-0' && <span> · </span>}
                                  {ex.eventRecord && ex.eventRecord !== '0-0' && <span className="text-slate-300">{ex.eventRecord} record</span>}
                                  {ex.finalStanding != null && ex.finalStanding > 0 && (
                                    <span className="text-slate-500"> ({ex.finalStanding}{['th','st','nd','rd'][ex.finalStanding%10 < 4 && Math.floor(ex.finalStanding/10) !== 1 ? ex.finalStanding%10 : 0]} place)</span>
                                  )}
                                </div>
                              )}
                              <div className="text-slate-400 text-[11px] mt-0.5">
                                {ex.faction && <span className="text-slate-300">{displayFactionName(ex.faction)}</span>}
                                {/* All detachments the list fields (11e allows several);
                                    fall back to the single legacy field. */}
                                {(ex.detachments?.length
                                  ? ex.detachments
                                  : ex.detachment ? [{ name: ex.detachment }] : []
                                ).map((d, di) => (
                                  <span key={di}> · <span className="text-purple-300">
                                    {d.name}
                                    {d.dp != null && <span className="text-purple-500"> ({d.dp} DP)</span>}
                                  </span></span>
                                ))}
                                {ex.games != null && (
                                  <span> · <span className="text-slate-300">{ex.wins}W/{ex.losses}L/{ex.draws}D over {ex.games} games</span></span>
                                )}
                              </div>
                              {/* Force disposition: what the player submitted, or — when the
                                  list doesn't say — what their detachments grant access to. */}
                              {ex.detachments?.length > 0 && (
                                <div className="text-slate-400 text-[11px] mt-0.5">
                                  <span className="text-slate-500">Force Disposition:</span>{' '}
                                  {ex.forceDispositions?.length ? (
                                    <span className="text-sky-300">{ex.forceDispositions.join(' · ')}</span>
                                  ) : (() => {
                                    const objectives = [...new Set(
                                      ex.detachments.map((d) => d.objective).filter(Boolean)
                                    )];
                                    return objectives.length ? (
                                      <span className="text-slate-400">
                                        not listed — has access to{' '}
                                        <span className="text-sky-400">{objectives.join(' · ')}</span>
                                      </span>
                                    ) : (
                                      <span className="text-slate-500 italic">not listed</span>
                                    );
                                  })()}
                                </div>
                              )}
                              {ex.title && ex.eventName && ex.title !== ex.eventName && (
                                <div className="text-slate-500 text-[10px] mt-0.5 italic leading-relaxed">
                                  List title: "{ex.title}"
                                </div>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              {ex.pointsTotal != null && (
                                <div className="text-emerald-300 font-mono text-sm">{ex.pointsTotal} pts</div>
                              )}
                              {ex.winRate != null && (() => {
                                const v = ex.winRate * 100;
                                let cl = 'text-yellow-400';
                                if (v >= 65) cl = 'text-emerald-400';
                                else if (v >= 55) cl = 'text-green-400';
                                else if (v < 45) cl = 'text-red-400';
                                return (
                                  <div className={`text-base font-bold mt-0.5 ${cl}`}>
                                    {v.toFixed(0)}% WR
                                  </div>
                                );
                              })()}
                            </div>
                          </div>

                          {/* Mobile-only: show/hide units toggle. Default
                              collapsed on phones because a parsed 2,000-pt list
                              is ~12 units × 4-8 sub-rows of dense text. */}
                          <button
                            type="button"
                            onClick={() => toggleExample(ex.listId)}
                            className="md:hidden mb-2 text-xs font-medium text-purple-300 hover:text-purple-200 inline-flex items-center gap-1"
                          >
                            {expandedExamples[ex.listId] ? 'Hide units ▴' : 'Show units ▾'}
                          </button>

                          {/* Sections + units (or raw fallback if parse failed) — hidden on mobile until expanded */}
                          <div className={expandedExamples[ex.listId] ? 'block' : 'hidden md:block'}>
                          {(ex.sections || []).length === 0 && ex.rawText ? (
                            <pre className="text-slate-300 text-[12px] whitespace-pre-wrap font-mono leading-snug bg-slate-900/40 rounded p-3 border border-slate-700">
                              {ex.rawText.trim()}
                            </pre>
                          ) : (ex.sections || []).length > 0 ? (
                            <div className="space-y-3">
                              {ex.sections.map((sec, sIdx) => (
                                <div key={sIdx}>
                                  <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
                                    {sec.name}
                                  </div>
                                  <ul className="space-y-2">
                                    {sec.units.map((u, uIdx) => {
                                      const hasRows = u.modelRows?.length > 0;
                                      const hasFlatWargear = u.wargear?.length > 0;
                                      const hasAnyParsed = hasRows || hasFlatWargear || u.enhancement;
                                      return (
                                      <li key={uIdx} className="text-[12px]">
                                        <div className="flex justify-between items-baseline gap-2">
                                          <span className="text-slate-200 font-medium">
                                            {u.name}
                                            {u.flags?.includes('Warlord') && (
                                              <span className="ml-2 text-[9px] bg-amber-700/40 text-amber-300 px-1.5 py-0.5 rounded uppercase tracking-wide">
                                                Warlord
                                              </span>
                                            )}
                                          </span>
                                          {u.points != null && (
                                            <span className="text-slate-400 font-mono shrink-0">{u.points} pts</span>
                                          )}
                                        </div>

                                        {/* Model rows — one row per distinct sub-model loadout */}
                                        {hasRows && (
                                          <ul className="pl-3 mt-1 space-y-0.5">
                                            {u.modelRows.map((r, rIdx) => (
                                              <li key={rIdx} className="text-[11px] leading-relaxed">
                                                <span className="text-slate-300 font-medium">{r.count}× {r.name}</span>
                                                {r.wargear?.length > 0 && (
                                                  <span className="text-slate-400">
                                                    {' — '}{r.wargear.join(', ')}
                                                  </span>
                                                )}
                                              </li>
                                            ))}
                                          </ul>
                                        )}

                                        {/* Flat wargear fallback (when no modelRows) */}
                                        {!hasRows && hasFlatWargear && (
                                          <div className="text-slate-400 text-[11px] pl-3 mt-0.5 leading-relaxed">
                                            {u.wargear.join(' · ')}
                                          </div>
                                        )}

                                        {/* Raw block fallback when neither produced anything */}
                                        {!hasAnyParsed && u.rawBlock && (
                                          <pre className="text-slate-400 text-[11px] pl-3 mt-0.5 whitespace-pre-wrap font-mono leading-snug">
                                            {u.rawBlock.trim()}
                                          </pre>
                                        )}

                                        {u.enhancement && (
                                          <div className="text-purple-300 text-[11px] pl-3 mt-0.5">
                                            <span className="text-purple-500 font-semibold">Enhancement:</span> {u.enhancement}
                                          </div>
                                        )}

                                        {/* 11e attached characters (Leader / Support) render
                                            inside their bodyguard's block — the joined unit
                                            plays as one piece on the table. */}
                                        {u.attachedUnits?.length > 0 && (
                                          <ul className="ml-3 mt-1.5 pl-2 space-y-1.5 border-l-2 border-purple-800/50">
                                            {u.attachedUnits.map((au, aIdx) => (
                                              <li key={aIdx} className="text-[12px]">
                                                <div className="flex justify-between items-baseline gap-2">
                                                  <span className="text-slate-200 font-medium">
                                                    {au.name}
                                                    <span className="ml-2 text-[9px] bg-purple-700/40 text-purple-300 px-1.5 py-0.5 rounded uppercase tracking-wide">
                                                      {au.attachedRole || 'Attached'}
                                                    </span>
                                                  </span>
                                                  {au.points != null && (
                                                    <span className="text-slate-400 font-mono shrink-0">{au.points} pts</span>
                                                  )}
                                                </div>
                                                {au.wargear?.length > 0 && (
                                                  <div className="text-slate-400 text-[11px] pl-3 mt-0.5 leading-relaxed">
                                                    {au.wargear.join(' · ')}
                                                  </div>
                                                )}
                                                {au.enhancement && (
                                                  <div className="text-purple-300 text-[11px] pl-3 mt-0.5">
                                                    <span className="text-purple-500 font-semibold">Enhancement:</span> {au.enhancement}
                                                  </div>
                                                )}
                                              </li>
                                            ))}
                                          </ul>
                                        )}
                                      </li>
                                      );
                                    })}
                                  </ul>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-slate-500 italic text-[12px]">
                              Couldn't parse this list's structure (raw text in unusual format).
                            </div>
                          )}
                          </div>
                          <div className="mt-2 pt-2 border-t border-slate-700/50 text-slate-600 text-[10px]">
                            list_id <span className="font-mono">{ex.listId}</span>
                          </div>
                        </div>
                      ))}
                      {!selectedBuildObj.exampleLists?.length && (
                        <div className="text-slate-500 italic">No example lists available for this selectedBuildObj.</div>
                      )}
                    </div>
                  )}

                  {buildTab === 'units' && (
                    <div>
                      <div className="text-slate-400 mb-2 text-[11px]">
                        {/* The basis string comes from the pipeline, which owns the
                            population policy. Hardcoding "lists played since the last
                            points update" here made the caption lie the moment that
                            policy changed — the copy has to follow the data. */}
                        Frequency that each datasheet appears in the{' '}
                        {(selectedBuildObj.unitFrequencyNLists ?? selectedBuildObj.nLists).toLocaleString()}{' '}
                        <span className="text-white">{selectedBuildObj.name}</span>{' '}
                        {selectedBuildObj.unitFrequencyBasis || 'lists'}.
                        {selectedBuildObj.unitFrequencyWeighted && (
                          <span className="text-slate-500">
                            {' '}Recent lists count for more, so a share can differ from the
                            plain count beside it.
                          </span>
                        )}
                        {selectedBuildObj.unitFrequencyESS != null
                          && selectedBuildObj.unitFrequencyESS < 8 && (
                          <span className="text-amber-400/80">
                            {' '}Thin evidence — this build has few lists behind it, so treat
                            these shares as indicative only.
                          </span>
                        )}
                      </div>
                      <div className="overflow-x-auto -mx-5 px-5">
                        <table className="w-full min-w-[420px]">
                          <thead className="text-slate-500 text-[11px]">
                            <tr>
                              <th className="text-left pb-1">Datasheet</th>
                              <th className="text-right pb-1">% of lists</th>
                              <th className="text-right pb-1 hidden sm:table-cell">Avg squads</th>
                              <th className="text-right pb-1 hidden sm:table-cell">Avg pts</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(selectedBuildObj.unitFrequency || []).map(u => {
                              const pct = u.pct * 100;
                              let pctColor = 'text-slate-400';
                              if (pct >= 75) pctColor = 'text-emerald-400';
                              else if (pct >= 50) pctColor = 'text-green-400';
                              else if (pct >= 25) pctColor = 'text-yellow-400';
                              return (
                                <tr key={u.datasheet} className="border-t border-slate-700/50">
                                  <td className="py-1.5 text-slate-300 pr-2">{titleCaseUnit(u.datasheet)}</td>
                                  <td className={`py-1.5 text-right font-semibold whitespace-nowrap ${pctColor}`}>
                                    {pct.toFixed(0)}%
                                    {/* Denominator MUST be the one the percentage was computed
                                        against. unitFrequency is counted over a recent-lists
                                        window, so dividing by the build's full nLists printed a
                                        fraction contradicting the percentage next to it —
                                        "100% (7/17)" on 2,814 of 2,880 rendered rows. */}
                                    <span className="text-slate-500 font-normal ml-1">({u.nLists}/{selectedBuildObj.unitFrequencyNLists ?? selectedBuildObj.nLists})</span>
                                  </td>
                                  <td className="py-1.5 text-right text-slate-400 hidden sm:table-cell">{u.avgSquads}</td>
                                  <td className="py-1.5 text-right text-slate-400 hidden sm:table-cell">{u.avgPts}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {!selectedBuildObj.unitFrequency?.length && (
                        <div className="text-slate-500 italic mt-2">
                          {/* Under the old current-rules gate an empty sample meant
                              "nobody has played this since the patch". The population is
                              now every fieldable list in the build, so zero means we
                              parsed no units at all — a data gap, not a meta signal. */}
                          {selectedBuildObj.unitFrequencyNLists === 0
                            ? 'No parsed unit data for this build yet.'
                            : 'No unit data available.'}
                        </div>
                      )}

                      {/* Enhancement frequency — only render the table if the
                          parser has populated a meaningful fraction of cluster
                          lists. Below 50% the data is misleading: showing "0%"
                          for an enhancement that just hasn't been parsed yet
                          looks identical to a competitive build that genuinely
                          doesn't run that enhancement. */}
                      {(() => {
                        const parseRate = selectedBuildObj.enhancementParseRate ?? 0;
                        const PARSE_THRESHOLD = 0.5;
                        const hasEnoughData = parseRate >= PARSE_THRESHOLD;
                        const hasAnyEnh = (selectedBuildObj.enhancementFrequency?.length ?? 0) > 0;
                        if (hasEnoughData && hasAnyEnh) {
                          return (
                            <div className="mt-5">
                              <div className="text-slate-400 mb-2 text-[11px]">
                                Enhancements taken in lists assigned to <span className="text-white">{selectedBuildObj.name}</span>
                                {parseRate < 0.95 && (
                                  <span className="text-slate-500"> · based on {Math.round(parseRate * 100)}% of lists with parsed enhancement data</span>
                                )}.
                              </div>
                              <div className="overflow-x-auto -mx-5 px-5">
                                <table className="w-full min-w-[320px]">
                                  <thead className="text-slate-500 text-[11px]">
                                    <tr>
                                      <th className="text-left pb-1">Enhancement</th>
                                      <th className="text-right pb-1">% of lists</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {selectedBuildObj.enhancementFrequency.map(e => {
                                      const pct = e.pct * 100;
                                      let pctColor = 'text-slate-400';
                                      if (pct >= 75) pctColor = 'text-emerald-400';
                                      else if (pct >= 50) pctColor = 'text-green-400';
                                      else if (pct >= 25) pctColor = 'text-yellow-400';
                                      return (
                                        <tr key={e.name} className="border-t border-slate-700/50">
                                          <td className="py-1.5 text-purple-300 pr-2">{e.name}</td>
                                          <td className={`py-1.5 text-right font-semibold whitespace-nowrap ${pctColor}`}>
                                            {pct.toFixed(0)}%
                                            <span className="text-slate-500 font-normal ml-1">({e.nLists}/{selectedBuildObj.nLists})</span>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          );
                        }
                        // Pending state — be honest that this is incomplete data.
                        return (
                          <div className="mt-5 rounded-md border border-slate-700/60 bg-slate-900/40 px-3 py-2.5 text-[11px] text-slate-400">
                            <div className="font-semibold text-slate-300 mb-0.5">Enhancement data pending</div>
                            <div className="text-slate-500">
                              {parseRate > 0
                                ? `Only ${Math.round(parseRate * 100)}% of this build's lists have had their enhancements extracted so far. The frequency view stays hidden until at least ${Math.round(PARSE_THRESHOLD * 100)}% of lists are parsed — otherwise low percentages would be ambiguous between "rare in the meta" and "not yet detected."`
                                : 'No lists in this build have had their enhancements extracted yet.'}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        )}

        {/* Search by detachment — the build treatment (win rate, top units, most
            successful lists) grouped by detachment instead of NMF cluster. */}
        {factionDetachments.length > 0 && (
          <div className="mt-8">
            <div className="mb-3">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <span>Search by Detachment</span>
                <span className="text-slate-500 text-sm font-normal">{factionDetachments.length}</span>
              </h3>
              <div className="text-slate-400 text-[12px] mt-1">
                Win rate + most-successful lists for any detachment this faction runs. Skill-adjusted, same as builds.
              </div>
            </div>
            <select
              value={selectedDetachment}
              onChange={(e) => setSelectedDetachment(e.target.value)}
              className="w-full sm:w-96 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm mb-4"
            >
              <option value="">Select a detachment…</option>
              {factionDetachments.map(d => (
                <option key={d.name} value={d.name}>
                  {d.name} — {(d.winRate * 100).toFixed(0)}% WR ({d.nLists} lists)
                </option>
              ))}
            </select>

            {detachmentObj && (() => {
              const wr = detachmentObj.winRate * 100;
              let wrCl = 'text-yellow-400';
              if (wr >= 65) wrCl = 'text-emerald-400';
              else if (wr >= 55) wrCl = 'text-green-400';
              else if (wr < 45) wrCl = 'text-red-400';
              const examples = (detachmentObj.exampleListIds || [])
                .map(id => factionListPool[id]).filter(Boolean);
              return (
                <div className="rounded-lg bg-slate-800/40 border border-slate-700 p-5">
                  <div className="flex flex-wrap justify-between items-baseline gap-3 mb-4 pb-3 border-b border-slate-700">
                    <div className="text-lg font-bold text-purple-300">{detachmentObj.name}</div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className={`font-bold ${wrCl}`}>{wr.toFixed(0)}% WR</span>
                      <span className="text-slate-400">{detachmentObj.wins}W/{detachmentObj.losses}L/{detachmentObj.draws}D</span>
                      <span className="text-slate-500">{detachmentObj.nLists} lists · {detachmentObj.nGames} games</span>
                    </div>
                  </div>

                  {detachmentObj.unitFrequency?.length > 0 && (
                    <div className="mb-4">
                      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-2">Most-run units</div>
                      {/* Name the population the shares were counted over. These used to be
                          divided by a different list count than they were counted from, so
                          420 of 3,072 shares published above 100%. */}
                      <div className="text-slate-400 mb-2 text-[11px]">
                        Share of the{' '}
                        {(detachmentObj.unitFrequencyNLists ?? detachmentObj.nLists).toLocaleString()}{' '}
                        <span className="text-white">{detachmentObj.name}</span> lists that can still be
                        fielded and have played a recorded game.
                        {detachmentObj.unitFrequencyNLists != null
                          && detachmentObj.unitFrequencyNLists < 20 && (
                          <span className="text-amber-400/80">
                            {' '}Small sample — grows as more events are played.
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {detachmentObj.unitFrequency.map(u => (
                          <span key={u.datasheet} className="text-[11px] bg-slate-700/50 rounded px-2 py-0.5 text-slate-300">
                            {titleCaseUnit(u.datasheet)}{' '}
                            {/* Show the fraction, not just the percentage. A bare "100%" hides
                                whether it rests on 40 lists or 4 — and printing the fraction is
                                what made the equivalent build-view contradiction visible. */}
                            <span className="text-slate-500">
                              {(u.pct * 100).toFixed(0)}%
                              <span className="text-slate-600 ml-1">
                                ({u.nLists}/{detachmentObj.unitFrequencyNLists ?? detachmentObj.nLists})
                              </span>
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {!detachmentObj.unitFrequency?.length && (
                    <div className="mb-4 text-[11px] text-slate-500">
                      No unit breakdown — no list running this detachment can still be fielded
                      under the current points.
                    </div>
                  )}

                  <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-2">
                    Most successful lists ({examples.length})
                  </div>
                  <div className="space-y-3">
                    {examples.map(ex => <OffMetaListCard key={ex.listId} ex={ex} />)}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Off-meta winning lists — winning lists that don't belong to any shown
            build. Surfaces successful brews (and gives buildless factions real
            content). Ordered win rate → games → date; infinite-scroll, uncapped. */}
        {offMetaLists.length > 0 && (
          <div className="mt-8">
            <div className="mb-3">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <span>Off-Meta Winning Lists</span>
                <span className="text-slate-500 text-sm font-normal">{offMetaLists.length}</span>
              </h3>
              <div className="text-slate-400 text-[12px] mt-1">
                Winning lists ({builds.length === 0 ? 'this faction has no clustered build yet — ' : ''}
                don't match a dedicated build). Sorted by win rate, then games, then most recent.
              </div>
            </div>
            <div className="space-y-3">
              {offMetaLists.slice(0, offMetaVisible).map((ex) => (
                <OffMetaListCard key={ex.listId} ex={ex} />
              ))}
            </div>
            {offMetaVisible < offMetaLists.length && (
              <div ref={offMetaSentinel} className="py-4 text-center text-slate-500 text-xs">
                Loading more… ({offMetaVisible} of {offMetaLists.length})
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

export default FactionView;
