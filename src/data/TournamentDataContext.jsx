import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { mergeFactionRatings, getDataMetadata } from './dataIntegration';

// Tournament data is loaded once at app start via fetch() rather than
// embedded in the JS bundle. The 11 MB JSON would otherwise dominate
// initial bundle size; loading it asynchronously lets index.html paint
// before the dataset arrives and keeps the JS bundle small enough that
// HTTP caching is meaningful.

const TournamentDataContext = createContext(null);

const DATA_URL = `${import.meta.env.BASE_URL || '/'}tournamentData.json`;

export function TournamentDataProvider({ children }) {
  const [raw, setRaw] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(DATA_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} fetching ${DATA_URL}`);
        return r.json();
      })
      .then((d) => { if (!cancelled) setRaw(d); })
      .catch((e) => { if (!cancelled) setError(e); });
    return () => { cancelled = true; };
  }, []);

  const value = useMemo(() => {
    if (!raw) return null;
    return {
      raw,
      factionRatings:        raw.factionRatings || {},
      factionBuilds:         raw.factionBuilds || {},
      unassignedWinningLists: raw.unassignedWinningLists || {},
      detachmentViews:       raw.detachmentViews || {},
      detachmentListPool:    raw.detachmentListPool || {},
      archetypeMatchups:     raw.archetypeMatchups || {},
      buildMatchups:         raw.buildMatchups || {},
      buildVsBuildMatchups:  raw.buildVsBuildMatchups || {},
      // LightGBM second-opinion matrix — null when the pipeline ran
      // without the trained model. Predictor checks for null and
      // falls back to EB-cell-only.
      lgbmBvbMatrix:         raw.lgbmBvbMatrix || null,
      integratedFactionRatings: mergeFactionRatings(raw),
      dataMetadata:          getDataMetadata(raw),
    };
  }, [raw]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-300">
        <div className="max-w-md p-6 bg-slate-800 rounded-lg border border-rose-500/40">
          <div className="text-rose-400 font-semibold mb-2">Failed to load tournament data</div>
          <div className="text-sm text-slate-400">{String(error?.message || error)}</div>
          <div className="text-xs text-slate-500 mt-3">Try refreshing. If the problem persists, the dataset URL may be misconfigured.</div>
        </div>
      </div>
    );
  }

  if (!value) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        <div className="text-sm">Loading tournament data…</div>
      </div>
    );
  }

  return (
    <TournamentDataContext.Provider value={value}>
      {children}
    </TournamentDataContext.Provider>
  );
}

export function useTournamentData() {
  const ctx = useContext(TournamentDataContext);
  if (!ctx) {
    throw new Error('useTournamentData must be used inside <TournamentDataProvider>');
  }
  return ctx;
}
