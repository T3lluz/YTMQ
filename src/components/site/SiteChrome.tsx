import { Link, NavLink } from 'react-router-dom'
import { YtmqWordmark } from '../YtmqLogo'
import { buttonClass } from '../ui/buttonStyles'

/** Top bar shared by the landing page and the docs. */
export function SiteHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-neutral-950/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link to="/" className="ytmq-press -ml-1 rounded-lg px-1" aria-label="YTMQ home">
          <YtmqWordmark />
        </Link>
        {children}
        <nav className="ml-auto flex items-center gap-1 text-sm font-medium">
          <NavLink
            to="/docs"
            className={({ isActive }) =>
              `inline-flex h-8 items-center rounded-full px-3.5 text-[13px] font-semibold transition-colors ${
                isActive ? 'bg-white/[0.08] text-white' : 'text-neutral-400 hover:text-white'
              }`
            }
          >
            Docs
          </NavLink>
          <Link to="/docs/install" className={buttonClass('outline', 'sm', 'hidden sm:inline-flex')}>
            Get the extension
          </Link>
        </nav>
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t border-white/[0.06]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-neutral-500 sm:flex-row sm:items-center sm:px-6">
        <span className="font-semibold text-neutral-300">YTMQ</span>
        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          <Link to="/" className="hover:text-neutral-200">Home</Link>
          <Link to="/docs" className="hover:text-neutral-200">Docs</Link>
          <Link to="/docs/install" className="hover:text-neutral-200">Install</Link>
          <Link to="/docs/api" className="hover:text-neutral-200">API</Link>
          <Link to="/docs/troubleshooting" className="hover:text-neutral-200">Help</Link>
        </nav>
        <span className="sm:ml-auto">Runs on t3lluz.com. No accounts, no analytics.</span>
      </div>
    </footer>
  )
}
