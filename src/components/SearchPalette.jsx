import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { factions } from '../data/archetypeData';
import { useTournamentData } from '../data/TournamentDataContext';

// Display-only: drop the "(Astartes)" parenthetical from "Space Marines
// (Astartes)". Same convention as FactionView.
const displayFactionName = (name) =>
  typeof name === 'string' ? name.replace(/\s*\(Astartes\)\s*$/i, '') : name;

// Normalize for fuzzy contains-matching: lowercase, strip diacritics +
// non-alphanumeric, collapse whitespace. So "tau monta" matches "Tau —
// Mont'ka" and "world eaters bld" matches "World Eaters Berzerker Drop".
const normalize = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Simple subsequence-or-contains scorer. Words in the query (after
// normalize) all need to appear in the candidate; result rank is by
// length-of-match (shorter target wins on tie) and whether it's a
// prefix match. Good enough for ~30 factions × ~5 builds each.
function scoreMatch(query, target) {
  const q = normalize(query);
  if (!q) return null;
  const t = normalize(target);
  if (!t) return null;
  const queryWords = q.split(' ').filter(Boolean);
  if (queryWords.some((w) => !t.includes(w))) return null;
  // Lower score = better. Prefix-match boost.
  const startsWithFirst = t.startsWith(queryWords[0]);
  return t.length - (startsWithFirst ? 100 : 0);
}

const MAX_RESULTS = 12;

const SearchPalette = ({ onClose }) => {
  const navigate = useNavigate();
  const { factionBuilds } = useTournamentData();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);

  // Build the search corpus once per data load. Each entry has the
  // navigation target baked in so result selection is just a router
  // call.
  const corpus = useMemo(() => {
    const entries = [];
    for (const f of factions) {
      entries.push({
        kind: 'faction',
        label: displayFactionName(f),
        sublabel: 'Faction',
        target: { faction: f, build: null },
        searchKey: displayFactionName(f),
      });
      const builds = factionBuilds?.[f] || [];
      for (const b of builds) {
        entries.push({
          kind: 'build',
          label: b.name,
          sublabel: displayFactionName(f),
          target: { faction: f, build: b.id },
          // Match against both the build name and "faction · build"
          // so a query like "tau monta" still finds "Tau — Mont'ka"
          // even though the user is typing the faction first.
          searchKey: `${displayFactionName(f)} ${b.name}`,
        });
      }
    }
    return entries;
  }, [factionBuilds]);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const scored = [];
    for (const e of corpus) {
      const s = scoreMatch(query, e.searchKey);
      if (s != null) scored.push({ entry: e, score: s });
    }
    scored.sort((a, b) => a.score - b.score);
    return scored.slice(0, MAX_RESULTS).map((x) => x.entry);
  }, [query, corpus]);

  // Reset active highlight when results change
  useEffect(() => { setActiveIndex(0); }, [query]);

  // Autofocus + ESC closes
  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const select = (entry) => {
    if (!entry) return;
    const { faction, build } = entry.target;
    const params = new URLSearchParams();
    if (faction) params.set('faction', faction);
    if (build != null) params.set('build', String(build));
    // Faction landing route is "/" — query params hydrate selection.
    navigate(`/?${params.toString()}`);
    onClose();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      select(results[activeIndex]);
    }
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[14vh] px-4"
      onClick={onClose}
    >
      <div
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
        aria-hidden="true"
      />
      <div
        className="relative w-full max-w-xl bg-slate-900 border border-purple-500/40 rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800">
          <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 110-16 8 8 0 010 16z"/>
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search factions or builds…"
            className="flex-1 bg-transparent text-slate-100 placeholder:text-slate-500 outline-none text-sm"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-700 text-[10px] text-slate-400">esc</kbd>
        </div>
        {query.trim() && results.length === 0 && (
          <div className="px-4 py-6 text-sm text-slate-500 text-center">
            No matches.
          </div>
        )}
        {results.length > 0 && (
          <ul className="max-h-[55vh] overflow-y-auto py-1">
            {results.map((r, i) => (
              <li key={`${r.kind}-${r.target.faction}-${r.target.build ?? ''}`}>
                <button
                  type="button"
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => select(r)}
                  className={`w-full text-left px-4 py-2 flex items-center justify-between gap-3 transition-colors ${
                    i === activeIndex ? 'bg-purple-900/40' : 'hover:bg-slate-800/60'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-white truncate">{r.label}</span>
                    <span className="block text-[11px] text-slate-400 truncate">{r.sublabel}</span>
                  </span>
                  <span className={`text-[10px] uppercase tracking-wide shrink-0 ${
                    r.kind === 'faction' ? 'text-purple-300' : 'text-emerald-300'
                  }`}>
                    {r.kind}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {!query.trim() && (
          <div className="px-4 py-3 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Type to search · ↑↓ to navigate · ↵ to open</span>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default SearchPalette;
