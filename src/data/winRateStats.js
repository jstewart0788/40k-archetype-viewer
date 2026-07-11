// Wilson 90% score interval for a binomial proportion. Same form as
// pipeline/build_ui_data.py:_wilson_ci, kept client-side so the faction
// WR card can render a CI without the pipeline needing to attach lo/hi
// fields to every faction record. Draws contribute as 0.5 of a win.
//
// `eloAdjusted`: when given, shifts the CI to band the Elo-adjusted
// rate (which is the headline number on the card) instead of the raw
// rate. Wilson's half-width represents sample-size uncertainty; we
// preserve that width and recentre on the adjusted number.

const Z90 = 1.6448536269514722; // standard-normal quantile for 90% two-sided

export function wilson90(wins, losses, draws = 0) {
  const successes = (wins ?? 0) + 0.5 * (draws ?? 0);
  const n = (wins ?? 0) + (losses ?? 0) + (draws ?? 0);
  if (n <= 0) return null;
  const p = Math.max(0, Math.min(1, successes / n));
  const z2 = Z90 * Z90;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (Z90 * Math.sqrt((p * (1 - p) / n) + z2 / (4 * n * n))) / denom;
  return {
    rawP: p,
    lo: Math.max(0, center - half),
    hi: Math.min(1, center + half),
    halfWidth: half,
  };
}

// Re-band the Wilson CI around an Elo-adjusted point. Returns null when
// the CI can't be computed.
export function ciAroundAdjusted(eloAdjustedRate, wins, losses, draws = 0) {
  const w = wilson90(wins, losses, draws);
  if (!w) return null;
  const offset = eloAdjustedRate - w.rawP;
  return {
    lo: Math.max(0, w.lo + offset),
    hi: Math.min(1, w.hi + offset),
    halfWidth: w.halfWidth,
  };
}
