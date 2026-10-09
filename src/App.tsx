import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Home } from './pages/Home'
import { Host } from './pages/Host'
import { Join } from './pages/Join'
import { Room } from './pages/Room'

// The docs are their own chunk; guests in a room never download them.
const Docs = lazy(() => import('./pages/docs/Docs'))

/** /setup was the install page before the docs existed; old links and the extension use it. */
function SetupRedirect() {
  const { search, hash } = useLocation()
  return <Navigate to={`/docs/install${search}${hash}`} replace />
}

function App() {
  const location = useLocation()
  // Docs pages swap inside one layout; everything else animates in as a page.
  const pageKey = location.pathname.startsWith('/docs') ? '/docs' : location.pathname

  return (
    <div key={pageKey} className="ytmq-page">
      <Suspense fallback={<div className="min-h-dvh" />}>
        <Routes location={location}>
          <Route path="/" element={<Home />} />
          <Route path="/join" element={<Join />} />
          <Route path="/room/:roomId" element={<Room />} />
          <Route path="/host/:roomId" element={<Host />} />
          <Route path="/setup" element={<SetupRedirect />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/docs/:slug" element={<Docs />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </div>
  )
}

export default App
