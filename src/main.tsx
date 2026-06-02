import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ConfigGuard } from './components/ConfigGuard.tsx'
import './index.css'
import App from './App.tsx'

const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigGuard>
      <BrowserRouter basename={basename}>
        <App />
      </BrowserRouter>
    </ConfigGuard>
  </StrictMode>,
)
