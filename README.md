# Nachmund

Interactive meta-analysis tool for Warhammer 40,000 (10th edition) army lists. Built on real tournament data — visualizes per-faction archetype strengths, surfaces named list builds (NMF clusters), and predicts matchup outcomes.

## Features

### Faction view (`/`)
- Faction selector with all 22 playable factions
- Radar chart of archetype strengths across an 8-axis playstyle taxonomy
- Common Builds: NMF-derived list clusters with example lists, win rates, unit frequency
- Color-coded ratings:
  - 🟢 8–10: Core Strength
  - 🟡 5–7: Viable Hybrid
  - 🔴 0–4: Weak Fit

### Archetype guide (`/archetypes`)
- Definitions, strengths, and weaknesses for each playstyle archetype
- Live matchup data per archetype with tactical notes
- Top factions per archetype

### Matchup explorer (`/matchups`)
- Drill down by faction × build to see matchup data vs each opponent playstyle
- Empirical-Bayes shrinkage for thin matchup cells

### Predictor (`/predict`)
- Pick two faction builds, get win probability and VP margin
- Backed by a LightGBM matchup model trained on real games
- Recent matchups saved to `localStorage`

## Tech stack

- **React 19** + Vite + Tailwind CSS 4 for the UI
- **React Router** for routing
- **Recharts** for visualizations
- **PostgreSQL** + **dbt** + **Python** for the upstream pipeline (private)
- **LightGBM** for matchup prediction
- **scikit-learn** NMF for cluster extraction
- **gh-pages** for deployment

## Getting started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
npm install
npm run dev
```

Open `http://localhost:5173/40k-archetype-viewer/`.

## Available scripts

- `npm run dev` — start the development server
- `npm run build` — build the production bundle
- `npm run preview` — preview the production build locally
- `npm run deploy` — deploy to GitHub Pages
- `npm run lint` — run ESLint

## Data pipeline (private)

The data pipeline that ingests tournament results, runs the rating model, and builds the cluster taxonomy is kept locally and not published. The frontend reads from a static JSON snapshot at `src/data/tournamentData.json`.

## Project structure

```
40k-archetype-viewer/
├── src/
│   ├── components/
│   │   ├── FactionView.jsx       # Faction view + radar + Common Builds
│   │   ├── ArchetypeDetail.jsx   # Archetype guide
│   │   ├── MatchupExplorer.jsx   # Build × opponent matchup explorer
│   │   ├── Predictor.jsx         # Build-vs-build predictor
│   │   └── Navigation.jsx        # Top-level navigation
│   ├── data/
│   │   ├── archetypeData.js      # Archetype definitions + manual fallback
│   │   ├── dataIntegration.js    # Merges tournament data with manual ratings
│   │   └── tournamentData.json   # Snapshot from the upstream pipeline
│   ├── App.jsx                   # Routing
│   ├── main.jsx                  # Entry point
│   └── index.css                 # Global styles
├── public/
│   └── .nojekyll                 # GitHub Pages config
├── index.html
├── vite.config.js
├── tailwind.config.js
└── package.json
```

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for GitHub Pages instructions.

```bash
npm run deploy
```

## License

Open source under the MIT License. Warhammer 40,000 is a trademark of Games Workshop.
