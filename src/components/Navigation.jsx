import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTournamentData } from '../data/TournamentDataContext';
import SearchPalette from './SearchPalette';
import { SHOW_PLAYSTYLE, SHOW_MATCHUP_EXPLORER, SHOW_PREDICTOR } from '../featureFlags';

// Early-edition mode hides the deeper-analysis pages (see src/featureFlags.js).
const ROUTES = [
  { path: '/',           label: 'Factions' },
  { path: '/archetypes', label: 'Playstyle Guide', show: SHOW_PLAYSTYLE },
  { path: '/matchups',   label: 'Matchups',        show: SHOW_MATCHUP_EXPLORER },
  { path: '/predict',    label: 'Predictor',       show: SHOW_PREDICTOR },
  { path: '/docs',       label: 'Docs' },
].filter((r) => r.show !== false);

const Navigation = () => {
  const { dataMetadata } = useTournamentData();
  const location = useLocation();
  const isActive = (path) => location.pathname === path;
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Global keyboard shortcut: `/` or Cmd/Ctrl+K opens the search palette.
  // Skip when the user is already typing in a form input — we don't want
  // `/` to hijack list-paste or filter boxes once those exist.
  useEffect(() => {
    const handler = (e) => {
      if (paletteOpen) return;
      const target = e.target;
      const tag = target?.tagName;
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable;
      if (inField) return;
      if (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [paletteOpen]);

  const showStats = dataMetadata.source !== 'manual';
  const games = dataMetadata.gamesCount?.toLocaleString();
  const dateRange = dataMetadata.dateRange;

  return (
    <nav className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-b border-purple-500/30 sticky top-0 z-50 shadow-lg shadow-purple-900/20">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between gap-3 h-16">
          {/* Wordmark — SVG mark hidden on phones to give the tab strip more room */}
          <Link
            to="/"
            className="flex items-center gap-2 hover:opacity-80 transition-opacity shrink-0"
            aria-label="Nachmund — home"
          >
            <svg className="hidden sm:inline w-6 h-6 text-purple-500 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M10 2a8 8 0 100 16 8 8 0 000-16zM8 10a2 2 0 114 0 2 2 0 01-4 0z"/>
            </svg>
            <span
              className="font-display tracking-[0.18em] uppercase text-base sm:text-xl text-slate-100"
              style={{ textShadow: '0 0 12px rgba(168, 85, 247, 0.35)' }}
            >
              Nachmund
            </span>
          </Link>

          {/* Tabs — relative wrapper so we can layer a right-edge fade as a
              "more →" affordance when the strip overflows. */}
          <div className="relative flex-1 min-w-0">
            <div
              className="flex items-center gap-1 overflow-x-auto justify-start md:justify-center scrollbar-thin"
              style={{ scrollbarWidth: 'none' }}
            >
              {ROUTES.map(({ path, label }) => (
                <Link
                  key={path}
                  to={path}
                  className={`px-3 py-2.5 min-h-[44px] inline-flex items-center rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                    isActive(path)
                      ? 'text-white bg-slate-700/70'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700/40'
                  }`}
                >
                  {label}
                </Link>
              ))}
            </div>
            {/* Right-edge fade — hints at horizontal-scroll content. md+ only,
                because at desktop widths the strip is centered with no overflow. */}
            <div
              aria-hidden="true"
              className="md:hidden pointer-events-none absolute top-0 right-0 bottom-0 w-8"
              style={{
                backgroundImage:
                  'linear-gradient(to right, rgba(15, 23, 42, 0) 0%, rgb(30, 41, 59) 100%)',
              }}
            />
          </div>

          {/* Search trigger — visible affordance for the keyboard shortcut.
              The search palette is portaled, so this button just toggles state. */}
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label="Search factions and builds"
            className="shrink-0 inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-slate-700/70 bg-slate-800/40 text-slate-400 hover:text-white hover:border-slate-600 transition-colors text-xs"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 110-16 8 8 0 010 16z"/>
            </svg>
            <span className="hidden md:inline">Search</span>
            <kbd className="hidden md:inline-flex items-center gap-1 px-1 rounded text-[10px] border border-slate-700 text-slate-500">/</kbd>
          </button>

          {/* Data metadata indicator (right side, desktop only) */}
          {showStats && (
            <Link
              to="/docs"
              className="hidden lg:flex items-center text-xs text-slate-400 hover:text-slate-200 transition-colors shrink-0"
              title="Data sourced from competitive tournament games. Click for methodology."
            >
              <span className="text-slate-300 font-medium">{games}</span>
              <span className="mx-1.5 text-slate-600">·</span>
              <span>{dateRange}</span>
            </Link>
          )}
        </div>
      </div>
      {paletteOpen && <SearchPalette onClose={() => setPaletteOpen(false)} />}
    </nav>
  );
};

export default Navigation;
