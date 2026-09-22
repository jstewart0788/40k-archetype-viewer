import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Tooltip } from 'recharts';
import { wrColor } from '../data/winRateColor';
import Sparkline from './Sparkline';

// Every faction's win rate, at a glance, above everything else on the page.
//
// FORM: a dot on a shared axis with an interval whisker, not a bar. Faction win
// rates span roughly 42%–55%, so a zero-based bar chart is 28 near-identical
// blocks, and a bar chart cut off at 40% is the classic truncated-baseline lie —
// it makes a 3-point gap look like a landslide. A dot encodes position only, and
// the whisker carries the part that matters most here: EVERY NEIGHBOURING PAIR
// OVERLAPS at 95%. The rows are ordered but deliberately not numbered, because a
// rank badge would assert a precision the data does not have.
//
// The reference line is 50%, not zero: a coin flip is the meaningful baseline for
// a win rate, and it is drawn and labelled so the axis start is never a trick.

const AXIS_LO = 0.40;
const AXIS_HI = 0.60;

// The header and the rows are laid out by the SAME template, declared once.
// They were two separate flex rows with hand-matched widths, which drifted the
// moment any cell changed: the headers sat over the wrong columns.
const GRID = 'grid grid-cols-[minmax(0,9.5rem)_1fr_3.25rem_3.5rem_2.75rem_3.25rem_3.75rem_1.75rem] items-center gap-2';

const pct = (v, dp = 1) => (v == null ? '—' : `${(v * 100).toFixed(dp)}%`);
const posPct = (v) => `${(((Math.min(AXIS_HI, Math.max(AXIS_LO, v)) - AXIS_LO) / (AXIS_HI - AXIS_LO)) * 100).toFixed(2)}%`;

/** One faction or detachment row: name, interval, dot, numbers. */
function Row({ label, wr, ciLo, ciHi, games, sub, dim, onClick, children }) {
  const c = wrColor(wr);
  return (
    <div
      className={`${GRID} py-1 ${onClick ? 'cursor-pointer hover:bg-slate-700/30 rounded' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      <div className={`truncate text-[12px] ${dim ? 'text-slate-400 pl-3' : 'text-slate-200 font-medium'}`} title={label}>
        {children}{label}
      </div>

      {/* The plot. The whisker is the 95% interval; the dot is the estimate. */}
      <div className="relative h-4 hidden sm:block" title={`${pct(wr)} (${pct(ciLo)}–${pct(ciHi)}) · ${games?.toLocaleString?.() ?? games} games`}>
        <div className="absolute inset-x-0 top-1/2 h-px bg-slate-700/60" />
        <div className="absolute top-0 bottom-0 w-px bg-slate-500/70" style={{ left: posPct(0.5) }} />
        {ciLo != null && ciHi != null && (
          <div
            className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full"
            style={{ left: posPct(ciLo), width: `calc(${posPct(ciHi)} - ${posPct(ciLo)})`, backgroundColor: c.hex, opacity: 0.3 }}
          />
        )}
        {wr != null && (
          <div
            className="absolute top-1/2 w-2.5 h-2.5 -translate-y-1/2 -translate-x-1/2 rounded-full ring-2 ring-slate-800"
            style={{ left: posPct(wr), backgroundColor: c.hex }}
          />
        )}
      </div>

      <span className={`tabular-nums text-[12px] font-semibold text-right ${c.text}`}>{pct(wr)}</span>
      {sub}
    </div>
  );
}

/** ▲ / ▼ / — for the 28-day vs prior-56-day test. */
function MoveChip({ move }) {
  if (!move || !move.tested) {
    return <span className="text-[10px] text-slate-600 text-right" title="Not enough games in one of the two windows to test for movement.">—</span>;
  }
  const up = move.direction === 'up';
  const down = move.direction === 'down';
  const tone = up ? 'text-emerald-400' : down ? 'text-rose-400' : 'text-slate-500';
  const title = up || down
    ? `Last 28 days vs the 56 before: ${move.delta > 0 ? '+' : ''}${(move.delta * 100).toFixed(1)} points (z=${move.z}). About 1 in 28 of these arrows is expected to be a false alarm.`
    : `No movement this test can resolve (z=${move.z}).`;
  return (
    <span className={`text-[10px] tabular-nums text-right ${tone}`} title={title}>
      {up ? '▲' : down ? '▼' : '·'} {move.delta != null ? `${move.delta > 0 ? '+' : ''}${(move.delta * 100).toFixed(1)}` : ''}
    </span>
  );
}

/** A snapshot window: the number, or an honest blank when the sample is too thin. */
function Snapshot({ w, label }) {
  if (!w) return <span className="text-slate-600 text-[11px] tabular-nums" title={`${label}: no games`}>—</span>;
  if (w.belowFloor) {
    return (
      <span className="text-slate-600 text-[11px] tabular-nums"
            title={`${label}: only ${w.n} games — the margin of error would be wider than the gap between the best and worst faction, so no figure is shown.`}>
        —
      </span>
    );
  }
  const c = wrColor(w.winRate);
  return (
    <span className={`text-[11px] tabular-nums ${c.text}`}
          title={`${label}: ${pct(w.winRate)} (${pct(w.ciLo)}–${pct(w.ciHi)}) from ${w.n} games`}>
      {pct(w.winRate, 0)}
    </span>
  );
}

export default function FactionOverview({ factionRatings, factionTrends, detachmentViews, dataMetadata, onSelectFaction }) {
  const [expanded, setExpanded] = useState(null);
  const trends = useMemo(() => factionTrends?.factions || {}, [factionTrends]);
  const meta = factionTrends?.meta;

  const rows = useMemo(() => {
    return Object.entries(factionRatings || {})
      .map(([faction, r]) => {
        const t = trends[faction] || {};
        const games = r.games || 0;
        // Interval from the record: the same Wilson width the build cards use,
        // recentred on the skill-adjusted rate.
        // RAW win rate: games won, draws as a half. The site's headline
        // elsewhere is skill-adjusted, but this chart answers "what happened",
        // and the adjustment quietly rewrites a faction's record by who
        // happened to be piloting it.
        const wins = (r.winRateWins || 0) + 0.5 * (r.winRateDraws || 0);
        const n = games || 1;
        const wr = r.rawWinRate != null ? r.rawWinRate : wins / n;
        const p = wins / n;
        const z = 1.96;
        const denom = 1 + (z * z) / n;
        const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
        return {
          faction, wr, games,
          ciLo: Math.max(0, wr - half), ciHi: Math.min(1, wr + half),
          lastWeek: t.lastWeek, sinceDataslate: t.sinceDataslate, move: t.move,
          series: (t.wr || []).map((v, i) => ({ winRate: v, n: (t.n || [])[i] })),
        };
      })
      .sort((a, b) => (b.wr ?? 0) - (a.wr ?? 0));
  }, [factionRatings, trends]);

  // All factions on one time chart, as the owner asked. Readability comes from
  // emphasis rather than from leaving series out: every faction is drawn, the
  // hovered or expanded one is brought forward, and the rest recede to context.
  const timeData = useMemo(() => {
    if (!meta?.buckets?.length) return [];
    return meta.buckets.map((bucket, i) => {
      const point = { bucket: bucket.slice(5) };
      rows.forEach((r) => { point[r.faction] = r.series[i]?.winRate ?? null; });
      return point;
    });
  }, [meta, rows]);

  const [hovered, setHovered] = useState(null);
  const focus = expanded || hovered;

  if (!rows.length) return null;

  return (
    <div className="max-w-5xl mx-auto bg-slate-800/60 backdrop-blur rounded-lg border border-slate-700 p-5 mb-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <h2 className="text-xl font-semibold text-white">Every faction, right now</h2>
        <span className="text-[11px] text-slate-400">
          {dataMetadata?.gamesCount?.toLocaleString?.()} games · {dataMetadata?.dateRange}
        </span>
      </div>
      <p className="text-[12px] text-slate-400 mb-1 leading-relaxed">
        Each dot is a faction&rsquo;s win rate. The bar through it is how precisely {' '}
        {dataMetadata?.gamesCount?.toLocaleString?.() || 'these'} games can pin that number down —
        where two bars overlap, the data cannot say which faction is better.
      </p>
      <p className="text-[11px] text-slate-500 mb-4 leading-relaxed">
        Games won, counting a draw as half a win. Not adjusted for who was playing.
      </p>

      <div className={`${GRID} text-[10px] uppercase tracking-wide text-slate-500 pb-1 border-b border-slate-700/70`}>
        <div>Faction</div>
        <div className="hidden sm:flex justify-between"><span>{pct(AXIS_LO, 0)}</span><span>50%</span><span>{pct(AXIS_HI, 0)}</span></div>
        <div className="text-right" title="Every 11th edition game in the data — the site holds no games from before the edition launched.">11th ed</div>
        <div className="text-right">By week</div>
        <div className="text-right" title="Win rate over the last 7 days of games. One weekend is a small sample, so expect it to jump around.">Last 7d</div>
        <div className="text-right" title={meta?.dataslateFrom
              ? `Win rate since the points update on ${meta.dataslateFrom}. It is a date range, not a claim about what the update did.`
              : 'Since the last points update'}>
          {meta?.dataslateFrom ? `Since ${new Date(meta.dataslateFrom + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : 'Since update'}
        </div>
        <div className="text-right" title="The last 28 days compared with the 56 days before them.">28d vs prev</div>
        <div />
      </div>

      <div className="divide-y divide-slate-700/40">
        {rows.map((r) => {
          const isOpen = expanded === r.faction;
          const dets = (detachmentViews?.[r.faction] || []).slice().sort((a, b) => (b.nGames || 0) - (a.nGames || 0));
          const detCount = dets.length;
          return (
            <div key={r.faction} className="group"
                 onMouseEnter={() => setHovered(r.faction)}
                 onMouseLeave={() => setHovered(null)}>
              <Row
                label={r.faction}
                wr={r.wr} ciLo={r.ciLo} ciHi={r.ciHi} games={r.games}
                onClick={() => setExpanded(isOpen ? null : r.faction)}
                sub={
                  <>
                    <span className="flex justify-end"><Sparkline data={r.series} accent={wrColor(r.wr).hex} width={52} height={14} /></span>
                    <span className="text-right"><Snapshot w={r.lastWeek} label="Last 7 days" /></span>
                    <span className="text-right"><Snapshot w={r.sinceDataslate} label={`Since ${meta?.dataslateFrom || 'the last points update'}`} /></span>
                    <MoveChip move={r.move} />
                    {/* One big chevron that turns to point down when the row is
                        open. The count-in-a-box version read as data rather
                        than as a control. */}
                    <span
                      className={`justify-self-end text-[15px] leading-none transition-transform duration-150 ${
                        isOpen ? 'rotate-90 text-purple-300' : 'text-slate-500 group-hover:text-purple-300'
                      }`}
                      title={`${detCount} detachment${detCount === 1 ? '' : 's'} — click to ${isOpen ? 'hide' : 'show'} them`}
                    >
                      ›
                    </span>
                  </>
                }
              />

              {isOpen && (
                <div className="pb-3 pt-1">
                  {dets.length > 0 ? (
                    <>
                      <div className="text-[10px] text-slate-500 mb-1 pl-3">
                        Detachments · a list fields up to three, so these count appearances and add up to more than the faction&rsquo;s games
                      </div>
                      {dets.map((d) => {
                        const n = d.nGames || 0;
                        const p = ((d.wins || 0) + 0.5 * (d.draws || 0)) / (n || 1);
                        const z = 1.96, denom = 1 + (z * z) / (n || 1);
                        const half = n ? (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom : null;
                        const dwr = d.rawWinRate != null ? d.rawWinRate : p;
                        return (
                          <Row key={d.name} dim label={d.name} wr={dwr}
                               ciLo={half != null ? Math.max(0, dwr - half) : null}
                               ciHi={half != null ? Math.min(1, dwr + half) : null}
                               games={n}
                               sub={<span className="text-[10px] text-slate-500 tabular-nums w-24 text-right">{n.toLocaleString()} games</span>} />
                        );
                      })}
                    </>
                  ) : (
                    <div className="text-[11px] text-slate-500 pl-3">No detachment breakdown for this faction yet.</div>
                  )}
                  <button
                    type="button"
                    className="mt-2 ml-3 text-[11px] text-purple-300 hover:text-purple-200 underline decoration-dotted underline-offset-2"
                    onClick={() => onSelectFaction?.(r.faction)}
                  >
                    Full breakdown for {r.faction} →
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
        <strong className="text-slate-400">Last 7d</strong> is the most recent weekend of games —
        a small sample, shown as a snapshot rather than a trend, and left blank when there are too
        few games to mean anything.{' '}
        {meta?.dataslateFrom && (
          <>
            <strong className="text-slate-400">
              Since {new Date(meta.dataslateFrom + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}
            </strong>{' '}
            covers every game since the last points update.{' '}
          </>
        )}
        <strong className="text-slate-400">28d vs prev</strong> compares the last four weeks with the
        eight before them; an arrow appears only when the change is larger than the sample can
        explain on its own, and roughly one arrow in 28 will still be a false alarm.
      </p>

      {timeData.length > 1 && (
        <div className="mt-5 pt-4 border-t border-slate-700/70">
          <div className="flex items-baseline justify-between mb-1">
            <h3 className="text-sm font-semibold text-slate-200">Week by week</h3>
            <span className="text-[10px] text-slate-500">
              {focus ? focus : 'hover a faction above to bring its line forward'}
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mb-2">
            One point per week. Weekly samples are small, so most of the wiggle is sampling rather than the meta moving —
            the arrows above use a longer window for that reason.
          </p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                <XAxis dataKey="bucket" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={{ stroke: '#334155' }} tickLine={false} />
                {/* A wider band than the summary rows above: a single week's
                    win rate swings far more than a faction's season figure.
                    30–70% matches the row sparklines so the two read the same
                    way, and it is fixed rather than fitted: letting the axis
                    follow the data would rescale every line around whichever
                    thin week was most extreme that refresh. Outliers clip. */}
                <YAxis domain={[0.30, 0.70]} allowDataOverflow
                       ticks={[0.30, 0.40, 0.50, 0.60, 0.70]}
                       tickFormatter={(v) => `${Math.round(v * 100)}%`}
                       tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} width={52} />
                <ReferenceLine y={0.5} stroke="#64748b" strokeDasharray="3 3" />
                {/* Only the faction in focus. The default tooltip lists every
                    series, which here is 28 rows — a panel tall enough to cover
                    the faction picker underneath the chart. */}
                <Tooltip
                  cursor={{ stroke: '#475569', strokeWidth: 1 }}
                  wrapperStyle={{ pointerEvents: 'none', zIndex: 30 }}
                  content={({ active, payload, label }) => {
                    if (!active || !focus) return null;
                    const hit = (payload || []).find((p) => p.dataKey === focus);
                    if (!hit || hit.value == null) return null;
                    return (
                      <div style={{ background: '#0f172a', border: '1px solid #334155',
                                    borderRadius: 6, fontSize: 11, padding: '4px 8px', color: '#e2e8f0' }}>
                        <span style={{ color: '#94a3b8' }}>{label} · </span>
                        {focus} <strong>{(hit.value * 100).toFixed(1)}%</strong>
                      </div>
                    );
                  }}
                />
                {rows.map((r) => {
                  const isFocus = focus === r.faction;
                  return (
                    <Line key={r.faction} type="monotone" dataKey={r.faction}
                          stroke={isFocus ? wrColor(r.wr).hex : '#475569'}
                          strokeWidth={isFocus ? 2.5 : 1}
                          strokeOpacity={focus ? (isFocus ? 1 : 0.18) : 0.45}
                          dot={false} isAnimationActive={false} connectNulls />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
