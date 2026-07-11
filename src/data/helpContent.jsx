// Source of truth for in-card `i` info popovers. Each entry is a focused
// excerpt — full mathematical detail lives in /docs, the popover carries
// only the gist that helps a first-time reader interpret the card. Keep
// each entry under ~3 short paragraphs.

const HELP_CONTENT = {
  winrate: {
    title: 'Win rate',
    docsAnchor: 'winrate',
    body: (
      <>
        <p>
          Adjusts raw W/L for opponent skill (so a strong pilot's wins don't inflate a weak build's record), weights recent games heavier (45-day half-life), and pulls thinly-sampled cells toward a prior so a 5–0 record doesn't read as confident as a 50–25 one.
        </p>
      </>
    ),
  },
  playstyles: {
    title: 'Playstyle ratings',
    docsAnchor: 'playstyles',
    body: (
      <>
        <p>
          Eight axes summarising <em>how</em> a list plays — data-derived from 42K tournament lists, not hand-picked. The 0–10 scale is a quantile rank across factions: a 9 means "this faction leans into this style more than nearly any other," not "this faction is good."
        </p>
        <p className="mt-2">
          Composition signal, not winning signal. For "what's actually winning," use the build cards.
        </p>
      </>
    ),
  },
  builds: {
    title: 'Common builds',
    docsAnchor: 'winrate',
    body: (
      <>
        <p>
          Each build is a recurring pattern of unit choices for this faction, found by clustering tournament lists. Cards are sorted by current adoption.
        </p>
        <p className="mt-2">
          Arrow icons track adoption momentum vs the prior 60 days. <strong className="text-amber-300">Amber arrows</strong> flag a mismatch between adoption and winning: <em>refuge</em> (rising adoption with sub-50% WR — players fleeing a worse build) or <em>sticky</em> (falling adoption while still winning — anticipated nerf or new counter).
        </p>
      </>
    ),
  },
  matchup: {
    title: 'Matchup grid',
    docsAnchor: 'matchup',
    body: (
      <>
        <p>
          Cells show this build's win rate vs each opponent playstyle. Cells fade by sample size; matchups with under 5 direct games are hidden entirely.
        </p>
        <p className="mt-2">
          Dashed-border cells were pulled toward the faction-average matchup because direct sample is thin — read those as "best guess given limited data."
        </p>
      </>
    ),
  },
  predictor: {
    title: 'How the verdict is calculated',
    docsAnchor: 'matchup',
    body: (
      <>
        <p>
          Headline win rate is Elo-adjusted, time-weighted, and pulled toward a build-vs-playstyle prior when direct sample is thin. The 90% interval shows the credible range.
        </p>
        <p className="mt-2">
          The <strong>list-feature model</strong> is a separate LightGBM ensemble that predicts the matchup from each build's unit composition (datasheet counts, weapon classes, durability, mobility, detachment shifts) without seeing the head-to-head record. <em>Agreement: high</em> means both signals point the same way — trust the verdict more. <em>Low</em> means they disagree, usually because the historical cell saw something the unit composition alone doesn't predict.
        </p>
        <p className="mt-2 text-slate-400">
          Pilot skill, deployment, and dice variance dominate any single match — the prediction is the list-level average, not a per-game guarantee.
        </p>
      </>
    ),
  },
};

export default HELP_CONTENT;
