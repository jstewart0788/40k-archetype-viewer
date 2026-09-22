// Tiny SVG sparkline. Recharts is overkill for a 6-pixel-tall trend
// indicator on a card; this renders directly to SVG path elements.
//
// Props:
//   data:   [{ winRate: 0..1, n: int }, ...] — null/missing winRate
//           causes a gap (point not drawn but neighbors don't
//           connect across it).
//   width:  pixel width of the SVG box (default 64)
//   height: pixel height (default 18)
//   accent: stroke colour for the line (default emerald-400)
//
// Behaviour:
//   - Y axis is fixed at [0, 1] so a 50% line always sits at the
//     vertical midpoint, anchoring "is this build above or below
//     coin-flip?" at a glance.
//   - A faint 50% reference line is drawn behind the data path.
//   - Single-month inputs render as a single dot.

const Sparkline = ({ data, width = 64, height = 18, accent = '#34d399' }) => {
  if (!Array.isArray(data) || data.length === 0) return null;

  const validPoints = data
    .map((d, i) => ({ i, wr: d?.winRate, n: d?.n }))
    .filter((p) => typeof p.wr === 'number' && Number.isFinite(p.wr));

  if (validPoints.length === 0) return null;

  const lastN = data.length;
  const padX = 1;
  const padY = 1;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const xFor = (i) =>
    lastN === 1 ? width / 2 : padX + (i / (lastN - 1)) * innerW;
  // Scaled 30–70%, not 0–100%. A win rate that moves from 48% to 54% is a
  // large move in this game and was three pixels of a full-height axis, so
  // every sparkline on the site drew the same flat line. Values outside the
  // band clamp to the edge rather than rescaling it: a single freak week would
  // otherwise squash every other point back into a line.
  const Y_LO = 0.30;
  const Y_HI = 0.70;
  const yFor = (wr) => {
    const c = Math.min(Y_HI, Math.max(Y_LO, wr));
    return padY + (1 - (c - Y_LO) / (Y_HI - Y_LO)) * innerH;
  };

  const points = validPoints.map((p) => ({
    x: xFor(p.i),
    y: yFor(p.wr),
  }));

  // Build a path that breaks across gaps (where winRate was null).
  const segments = [];
  let segStart = 0;
  for (let k = 1; k < validPoints.length; k++) {
    if (validPoints[k].i - validPoints[k - 1].i > 1) {
      segments.push(points.slice(segStart, k));
      segStart = k;
    }
  }
  segments.push(points.slice(segStart));

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Win rate trend, scaled 30% to 70%"
      style={{ overflow: 'visible' }}
    >
      {/* 50% reference line */}
      <line
        x1={padX}
        x2={width - padX}
        y1={yFor(0.5)}
        y2={yFor(0.5)}
        stroke="#475569"
        strokeWidth="0.5"
        strokeDasharray="1.5 1.5"
      />
      {segments.map((seg, idx) =>
        seg.length === 1 ? (
          <circle key={idx} cx={seg[0].x} cy={seg[0].y} r="1.4" fill={accent} />
        ) : (
          <path
            key={idx}
            d={`M ${seg.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' L ')}`}
            stroke={accent}
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            fill="none"
          />
        )
      )}
      {/* Final-point dot — anchors the eye on "where is this now" */}
      {points.length > 0 && (
        <circle
          cx={points[points.length - 1].x}
          cy={points[points.length - 1].y}
          r="1.6"
          fill={accent}
        />
      )}
    </svg>
  );
};

export default Sparkline;
