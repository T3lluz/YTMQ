import { Route, Routes } from 'react-router-dom'
import { Home } from './pages/Home'
import { Host } from './pages/Host'
import { Join } from './pages/Join'
import { Room } from './pages/Room'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/join" element={<Join />} />
      <Route path="/room/:roomId" element={<Room />} />
      <Route path="/host/:roomId" element={<Host />} />
    </Routes>
  )
}

export default App
