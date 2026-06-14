import { Route, Routes, useLocation } from 'react-router-dom'
import { Home } from './pages/Home'
import { Host } from './pages/Host'
import { Join } from './pages/Join'
import { Room } from './pages/Room'

function App() {
  const location = useLocation()

  return (
    <div key={location.pathname} className="ytmq-page">
      <Routes location={location}>
        <Route path="/" element={<Home />} />
        <Route path="/join" element={<Join />} />
        <Route path="/room/:roomId" element={<Room />} />
        <Route path="/host/:roomId" element={<Host />} />
      </Routes>
    </div>
  )
}

export default App
