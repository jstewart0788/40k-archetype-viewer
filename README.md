# Nachmund

Interactive meta-analysis tool for Warhammer 40,000 (11th edition) army lists. Built on real tournament data — surfaces the builds each faction is actually winning with, what they field, and how often they win.

## Features

### Faction view (`/`)
- All 28 playable factions, including the six Space Marine chapters tracked separately
- Common Builds: clusters of lists that field the same army, each with its win rate and
  95% interval, the units it runs and how often, its detachments, and example lists
- Each build names what separates it from the build it most resembles, so two similar
  cards can be told apart without opening them
- Unit frequency, enhancements and detachment mix per build

### Docs (`/docs`)
- How a build is derived, what the win rate does and does not account for, and the
  limits of the sample

### Early-edition mode
The playstyle radar, the matchup explorer and the build-vs-build predictor are built
but hidden while the edition is young and the sample is thin — see `src/featureFlags.js`.
They come back when the data supports them.

## Tech stack

- **React 19** + Vite + Tailwind CSS 4 for the UI
- **React Router** for routing
- **Recharts** for visualizations
- **PostgreSQL** + **dbt** + **Python** for the upstream pipeline (private)
- **LightGBM** for matchup prediction (built, currently hidden)
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
│   │   ├── Predictor.jsx         # Build-vs-build predictor (hidden)
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
