import { useTournamentData } from '../data/TournamentDataContext';
import { wrColor } from '../data/winRateColor';

// The picture that unfurls when the site is posted in a chat.
//
// It is NOT the page chart shrunk. At 1200x630 — routinely displayed at a third
// of that in a feed, on a phone — interval whiskers become sub-pixel and the
// hover text that carries the caveats does not exist. So this is a deliberately
// separate design over the same numbers: all 28 factions in two columns, values
// printed on every row, and the uncertainty stated in words because it cannot be
// drawn legibly at this size.
//
// Everything needed to read it without the site is on it: what the number means,
// how many games, over what dates, and that neighbouring factions are not
// separated. A number in a feed travels further than the page it came from.

const AXIS_LO = 0.40;
const AXIS_HI = 0.60;
const pos = (v) => ((Math.min(AXIS_HI, Math.max(AXIS_LO, v)) - AXIS_LO) / (AXIS_HI - AXIS_LO)) * 100;

export default function ShareCard() {
  const { integratedFactionRatings: ratings, dataMetadata } = useTournamentData();
  const rows = Object.entries(ratings || {})
    // Raw rate, matching the chart on the page. A shared picture travels
    // without its footnotes, so the number on it has to be the plain one.
    .map(([faction, r]) => ({
      faction,
      wr: r.rawWinRate != null ? r.rawWinRate : r.winRate,
      games: r.games || 0,
    }))
    .sort((a, b) => (b.wr ?? 0) - (a.wr ?? 0));
  const half = Math.ceil(rows.length / 2);
  const columns = [rows.slice(0, half), rows.slice(half)];

  return (
    <div
      id="og-card"
      style={{
        width: 1200, height: 630, background: '#0f172a', color: '#e2e8f0',
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        padding: '22px 36px 18px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
        position: 'fixed', top: 0, left: 0, zIndex: 50,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#f1f5f9' }}>
          Nachmund
        </div>
        <div style={{ fontSize: 20, color: '#94a3b8' }}>
          Warhammer 40,000 · 11th edition
        </div>
      </div>

      <div style={{ fontSize: 23, color: '#cbd5e1', marginTop: 4, marginBottom: 10 }}>
        Win rate by faction
        <span style={{ color: '#64748b', fontSize: 19 }}>
          {'  ·  '}{dataMetadata?.gamesCount?.toLocaleString?.()} games{'  ·  '}{dataMetadata?.dateRange}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 40, flex: 1 }}>
        {columns.map((col, ci) => (
          <div key={ci} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            {col.map((r) => {
              const c = wrColor(r.wr);
              return (
                <div key={r.faction} style={{ display: 'flex', alignItems: 'center', gap: 10, height: 28 }}>
                  <div style={{ width: 228, fontSize: 19, color: '#e2e8f0', whiteSpace: 'nowrap',
                                overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.faction}
                  </div>
                  <div style={{ position: 'relative', flex: 1, height: 12 }}>
                    <div style={{ position: 'absolute', inset: '5px 0', background: '#1e293b', borderRadius: 3 }} />
                    <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, background: '#475569' }} />
                    <div style={{ position: 'absolute', top: 0, left: `calc(${pos(r.wr)}% - 6px)`,
                                  width: 12, height: 12, borderRadius: 6, background: c.hex }} />
                  </div>
                  <div style={{ width: 62, textAlign: 'right', fontSize: 20, fontWeight: 700,
                                color: c.hex, fontVariantNumeric: 'tabular-nums' }}>
                    {(r.wr * 100).toFixed(1)}%
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                    borderTop: '1px solid #1e293b', paddingTop: 10, marginTop: 6 }}>
        <div style={{ fontSize: 17, color: '#64748b' }}>
          Margin of error runs ±1 to ±5 points. Factions next to each other are not separated by this data.
        </div>
        {/* Typeable, not just clickable: the image gets screenshotted and
            re-posted without the link attached. */}
        <div style={{ fontSize: 18, color: '#a78bfa' }}>
          jstewart0788.github.io/40k-archetype-viewer
        </div>
      </div>
    </div>
  );
}
