import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { SiteFooter, SiteHeader } from '../../components/site/SiteChrome'
import { DOC_GROUPS, DOC_PAGES, docPath, type DocPage } from './nav'

type TocItem = { id: string; text: string }

function useToc(key: string) {
  const [items, setItems] = useState<TocItem[]>([])
  const [active, setActive] = useState('')

  useEffect(() => {
    const article = document.querySelector('article')
    if (!article) return
    const spy = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: '-80px 0px -65% 0px' },
    )
    // Pages load lazily, so the headings can arrive after this runs: scan
    // again whenever the article's content changes.
    let frame = 0
    const scan = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const heads = Array.from(article.querySelectorAll<HTMLElement>('[data-toc]'))
        spy.disconnect()
        heads.forEach((h) => spy.observe(h))
        setItems(heads.map((h) => ({ id: h.id, text: h.firstChild?.textContent ?? h.textContent ?? '' })))
      })
    }
    scan()
    const watch = new MutationObserver(scan)
    watch.observe(article, { childList: true, subtree: true })
    return () => {
      cancelAnimationFrame(frame)
      watch.disconnect()
      spy.disconnect()
    }
  }, [key])

  return { items, active }
}

function BackHome({ className = '' }: { className?: string }) {
  return (
    <Link
      to="/"
      className={`ytmq-press inline-flex items-center gap-1.5 rounded-full text-sm font-semibold text-neutral-400 transition-colors hover:text-white ${className}`}
    >
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
        <path d="M16 10H4" />
        <path d="m9 5-5 5 5 5" />
      </svg>
      Back to the homepage
    </Link>
  )
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Docs" className="space-y-7">
      {DOC_GROUPS.map((group) => (
        <div key={group.title}>
          <p className="px-3 text-xs font-bold uppercase tracking-[0.14em] text-neutral-500">{group.title}</p>
          <ul className="mt-2 space-y-0.5">
            {group.pages.map((page) => (
              <li key={page.slug}>
                <NavLink
                  to={docPath(page.slug)}
                  end
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `relative block rounded-lg px-3 py-1.5 text-[15px] transition-colors ${
                      isActive
                        ? 'bg-white/[0.07] font-semibold text-white before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-accent-500'
                        : 'text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-100'
                    }`
                  }
                >
                  {page.title}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function PrevNext({ page }: { page: DocPage }) {
  const i = DOC_PAGES.findIndex((p) => p.slug === page.slug)
  const prev = DOC_PAGES[i - 1]
  const next = DOC_PAGES[i + 1]
  return (
    <nav className="mt-16 grid gap-3 border-t border-white/[0.06] pt-8 sm:grid-cols-2" aria-label="More docs">
      {prev ? (
        <Link to={docPath(prev.slug)} className="group rounded-2xl border border-white/[0.07] p-4 transition-colors hover:border-white/20">
          <span className="text-xs font-semibold text-neutral-500">Previous</span>
          <span className="mt-0.5 block font-bold text-white">{prev.title}</span>
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link to={docPath(next.slug)} className="group rounded-2xl border border-white/[0.07] p-4 text-right transition-colors hover:border-white/20">
          <span className="text-xs font-semibold text-neutral-500">Next</span>
          <span className="mt-0.5 block font-bold text-white">{next.title}</span>
        </Link>
      )}
    </nav>
  )
}

export function DocsLayout({ page, children }: { page: DocPage; children: ReactNode }) {
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const { items, active } = useToc(page.slug)
  const group = DOC_GROUPS.find((g) => g.pages.includes(page))
  const first = useRef(true)

  // New page: start at the top, or at the heading the link points to.
  useLayoutEffect(() => {
    const hash = decodeURIComponent(location.hash.slice(1))
    if (hash) {
      requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ block: 'start' }))
    } else if (!first.current) {
      window.scrollTo({ top: 0 })
    }
    first.current = false
  }, [location.pathname, location.hash])

  useEffect(() => {
    document.title = `${page.title} · YTMQ docs`
    return () => {
      document.title = 'YTMQ · one queue for the whole room'
    }
  }, [page.title])

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader>
        <span className="hidden text-sm font-semibold text-neutral-500 sm:inline">/ Docs</span>
      </SiteHeader>

      {/* Phone: the nav folds into a bar under the header. */}
      <div className="sticky top-14 z-30 border-b border-white/[0.06] bg-neutral-950/95 backdrop-blur-md lg:hidden">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm sm:px-6"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4 text-neutral-400" aria-hidden>
            <path d="M3 6h14M3 10h14M3 14h9" />
          </svg>
          <span className="text-neutral-500">{group?.title}</span>
          <span className="text-neutral-600">/</span>
          <span className="font-semibold text-white">{page.title}</span>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`ml-auto h-4 w-4 text-neutral-400 transition-transform ${menuOpen ? 'rotate-180' : ''}`} aria-hidden>
            <path d="m5 8 5 5 5-5" />
          </svg>
        </button>
        {menuOpen && (
          <div className="ytmq-anim-fade max-h-[70dvh] overflow-y-auto border-t border-white/[0.06] px-2 pb-6 pt-4">
            <BackHome className="mb-5 px-3" />
            <SideNav onNavigate={() => setMenuOpen(false)} />
          </div>
        )}
      </div>

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-10 px-4 sm:px-6">
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 overflow-y-auto py-8 pr-2 lg:block">
          <BackHome className="mb-7 px-3" />
          <SideNav />
        </aside>

        <main className="min-w-0 flex-1 py-10 lg:py-12">
          <article key={page.slug} className="ytmq-anim-fade-up mx-auto max-w-3xl">
            <p className="text-sm font-semibold text-accent-400">{group?.title}</p>
            <h1 className="mt-2 text-4xl font-extrabold tracking-[-0.035em] text-white sm:text-5xl">{page.title}</h1>
            {children}
            <PrevNext page={page} />
          </article>
        </main>

        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-52 shrink-0 overflow-y-auto py-12 xl:block">
          {items.length > 1 && (
            <>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-neutral-500">On this page</p>
              <ul className="mt-3 space-y-1 border-l border-white/[0.08]">
                {items.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className={`-ml-px block border-l py-1 pl-3 text-sm transition-colors ${
                        active === item.id
                          ? 'border-accent-500 font-semibold text-white'
                          : 'border-transparent text-neutral-500 hover:text-neutral-200'
                      }`}
                    >
                      {item.text}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>
      </div>

      <SiteFooter />
    </div>
  )
}
