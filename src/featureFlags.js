// Early-edition mode.
//
// While 11th edition is young and the sample is thin, the site deliberately
// focuses on raw current-meta information only:
//   • faction & build win rates
//   • emerging / rising builds (momentum)
//   • datasheet occurrence in lists (unit frequency)
//
// Deeper analysis — the playstyle taxonomy/radar, the matchup explorer, and the
// build-vs-build predictor — is hidden for now. It's too early to lean on that
// depth. As the edition matures these come back, eventually gated behind a
// sign-in (there's no backend auth yet, so for now they're simply hidden).
//
// Flip a flag to false→true to re-expose a surface.

export const SHOW_PLAYSTYLE = false;        // radar, 8-axis ratings, playstyle tags + the /archetypes guide
export const SHOW_MATCHUP_EXPLORER = false; // the /matchups explorer
export const SHOW_PREDICTOR = false;        // the /predict build-vs-build predictor
