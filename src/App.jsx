import { lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { TournamentDataProvider } from './data/TournamentDataContext'
import Navigation from './components/Navigation'
import FactionView from './components/FactionView'
import ArchetypeDetail from './components/ArchetypeDetail'
import MatchupExplorer from './components/MatchupExplorer'
import Predictor from './components/Predictor'
import { SHOW_PLAYSTYLE, SHOW_MATCHUP_EXPLORER, SHOW_PREDICTOR } from './featureFlags'

// Docs is lazy-loaded so KaTeX (~350 KB) and the long-form copy don't
// land in the initial bundle for users who never visit /docs.
//
// Stale-chunk handling: when we deploy while a user's tab is open, the
// HTML they have references new chunk hashes, but the user's loaded
// SPA still references the OLD hashes. Navigating to /docs then tries
// to lazy-fetch a chunk URL that no longer exists → 404 → blank screen.
// On chunk-load failure we hard-reload once (gated by sessionStorage
// so a genuine network error can't loop). The reload picks up new HTML
// with the new chunk hashes, the user lands back on the page, all
// fixed.
const STALE_CHUNK_FLAG = 'docs_chunk_reload_attempted'
const Docs = lazy(() =>
  import('./components/Docs').catch((err) => {
    if (typeof sessionStorage !== 'undefined' && !sessionStorage.getItem(STALE_CHUNK_FLAG)) {
      sessionStorage.setItem(STALE_CHUNK_FLAG, '1')
      window.location.reload()
      return new Promise(() => {}) // never resolves; reload will fire
    }
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(STALE_CHUNK_FLAG)
    throw err
  })
)

const DocsFallback = (
  <div className="container mx-auto px-6 py-16 text-slate-400">
    Loading documentation…
  </div>
)

function App() {
  return (
    <Router basename="/40k-archetype-viewer">
      {/* Background — fixed-position layer, not background-attachment:fixed
          (which jank/breaks on iOS Safari). Sits behind everything via z-index. */}
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-10"
        style={{
          backgroundImage: `
            linear-gradient(to bottom, rgba(15, 23, 42, 0.45) 0%, rgba(15, 23, 42, 0.72) 100%),
            url('/40k-archetype-viewer/nachmund-bg.jpg')
          `,
          backgroundSize: 'cover',
          backgroundPosition: 'center top',
          backgroundRepeat: 'no-repeat',
          backgroundColor: 'rgb(15, 23, 42)',
        }}
      />
      <TournamentDataProvider>
        <div className="min-h-screen relative">
          <Navigation />
          <Routes>
            <Route path="/" element={<FactionView />} />
            {/* Early-edition mode: deeper-analysis pages are hidden and any old
                links redirect home (see src/featureFlags.js). */}
            <Route path="/archetypes" element={SHOW_PLAYSTYLE ? <ArchetypeDetail /> : <Navigate to="/" replace />} />
            <Route path="/matchups" element={SHOW_MATCHUP_EXPLORER ? <MatchupExplorer /> : <Navigate to="/" replace />} />
            <Route path="/predict" element={SHOW_PREDICTOR ? <Predictor /> : <Navigate to="/" replace />} />
            <Route path="/docs"  element={<Suspense fallback={DocsFallback}><Docs /></Suspense>} />
            {/* /about kept as a soft redirect for any old bookmarks */}
            <Route path="/about" element={<Suspense fallback={DocsFallback}><Docs /></Suspense>} />
          </Routes>
        </div>
      </TournamentDataProvider>
    </Router>
  )
}

export default App
