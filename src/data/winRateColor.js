// Single source of truth for win-rate colour buckets across all views.
// Five buckets, anchored at five-percentage-point intervals around 50%:
//
//   ≥ 55 %   emerald  — clearly favoured
//   ≥ 52 %   green    — slight edge
//   ≥ 48 %   yellow   — coinflip / within noise
//   ≥ 45 %   orange   — slight underdog
//   < 45 %   red      — clearly underdog
//
// `wr` is expected as a fraction in [0, 1]. Returns Tailwind classes for
// foreground text colour, matching background tint, and a single hex code
// (handy for inline `style` overrides).

export function wrColor(wr) {
  if (wr == null || Number.isNaN(wr)) {
    return { text: 'text-slate-400', bg: 'bg-slate-800/40 border-slate-700', hex: '#94a3b8' };
  }
  if (wr >= 0.55) return { text: 'text-emerald-400', bg: 'bg-emerald-900/30 border-emerald-600', hex: '#34d399' };
  if (wr >= 0.52) return { text: 'text-green-400',   bg: 'bg-green-900/30 border-green-600',     hex: '#4ade80' };
  if (wr >= 0.48) return { text: 'text-yellow-400',  bg: 'bg-yellow-900/30 border-yellow-600',   hex: '#facc15' };
  if (wr >= 0.45) return { text: 'text-orange-400',  bg: 'bg-orange-900/30 border-orange-600',   hex: '#fb923c' };
  return                 { text: 'text-red-400',     bg: 'bg-red-900/30 border-red-600',         hex: '#f87171' };
}
