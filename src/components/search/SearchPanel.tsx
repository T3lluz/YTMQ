import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { SearchFilter } from '../../lib/catalog'
import {
  getSearchState,
  rememberSearch,
  setSearchState,
  useSearchState,
  type SearchView,
} from '../../lib/searchStore'
import type { QueueAdder } from '../../hooks/useQueueAdder'
import { Chip, ChipRow } from '../ui/Chip'
import { ChevronLeftIcon, CloseIcon, LockIcon, SearchIcon } from '../ui/icons'
import { PanelHeader } from '../room/Panel'
import { SearchBrowse } from './Browse'
import { SearchNavContext, type SearchNav } from './context'
import { ArtistView, CollectionView, MoodView } from './Pages'
import { SearchResults } from './Results'

const FILTERS: { id: SearchFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'songs', label: 'Songs' },
  { id: 'artists', label: 'Artists' },
  { id: 'albums', label: 'Albums' },
  { id: 'playlists', label: 'Playlists' },
  { id: 'videos', label: 'Videos' },
]

const DEBOUNCE_MS = 220

function viewKey(view: SearchView) {
  return view.kind === 'mood' ? `mood:${view.params}` : `${view.kind}:${view.id}`
}

/**
 * The Search tab: a field, Spotify's filter chips, and pages (artist, album,
 * playlist, mood) that stack on top of the results. Each page is a history
 * entry, so the phone's back gesture steps back through them.
 */
export function SearchPanel({ nickname, adder }: { nickname: string; adder: QueueAdder }) {
  const { query, filter, stack } = useSearchState()
  const [draft, setDraft] = useState(query)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const scrollMemory = useRef(new Map<number, number>())
  const navigate = useNavigate()
  const location = useLocation()
  const depth = (location.state as { searchDepth?: number } | null)?.searchDepth ?? 0

  // Typing searches as you go; a new search closes any open page.
  useEffect(() => {
    const trimmed = draft.trim()
    if (trimmed === query) return
    const timer = window.setTimeout(
      () => setSearchState({ query: trimmed, stack: [] }),
      trimmed ? DEBOUNCE_MS : 0,
    )
    return () => window.clearTimeout(timer)
  }, [draft, query])

  // Back (button or gesture) pops pages down to the history entry's depth.
  useEffect(() => {
    if (stack.length > depth) setSearchState({ stack: stack.slice(0, depth) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depth])

  // The desktop panel scrolls on its own; on a phone the page does.
  const scroller = useCallback(() => {
    const el = rootRef.current?.closest('.ytmq-panel-scroll') as HTMLElement | null
    return el && el.scrollHeight > el.clientHeight + 1 ? el : null
  }, [])
  const scrollTop = useCallback(() => scroller()?.scrollTop ?? window.scrollY, [scroller])
  const scrollTo = useCallback(
    (top: number) => {
      const el = scroller()
      if (el) el.scrollTo({ top })
      else window.scrollTo({ top })
    },
    [scroller],
  )

  // A page opens at its top; going back returns to where you were.
  const top = stack[stack.length - 1]
  const topKey = top ? viewKey(top) : `results:${query}:${filter}`
  useEffect(() => {
    scrollTo(scrollMemory.current.get(stack.length) ?? 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topKey])

  const open = useCallback(
    (view: SearchView) => {
      const current = getSearchState()
      scrollMemory.current.set(current.stack.length, scrollTop())
      scrollMemory.current.delete(current.stack.length + 1)
      setSearchState({ stack: [...current.stack, view] })
      navigate(location.pathname + location.search, {
        state: { ...((location.state as object | null) ?? {}), searchDepth: current.stack.length + 1 },
      })
    },
    [navigate, location.pathname, location.search, location.state, scrollTop],
  )

  const back = useCallback(() => {
    const current = getSearchState()
    if (depth > 0 && depth >= current.stack.length) navigate(-1)
    else setSearchState({ stack: current.stack.slice(0, -1) })
  }, [depth, navigate])

  const nav = useMemo<SearchNav>(() => ({ nickname, adder, open, back }), [nickname, adder, open, back])

  const showChips = query.length > 0 && stack.length === 0

  return (
    <SearchNavContext.Provider value={nav}>
      <div ref={rootRef} className="flex min-h-full flex-col">
        <PanelHeader className="flex-col !items-stretch gap-3 py-0">
          <div className="flex w-full items-center gap-2">
            {stack.length > 0 && (
              <button
                type="button"
                onClick={back}
                aria-label="Back"
                className="ytmq-press ytmq-anim-pop inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-white hover:bg-white/[0.14]"
              >
                <ChevronLeftIcon className="h-6 w-6" />
              </button>
            )}
            <form
              role="search"
              onSubmit={(e) => {
                e.preventDefault()
                const q = draft.trim()
                if (q) {
                  rememberSearch({ kind: 'query', q })
                  setSearchState({ query: q, stack: [] })
                }
                inputRef.current?.blur()
              }}
              className={`ytmq-search-field relative flex h-12 min-w-0 flex-1 items-center rounded-full transition-[background-color,box-shadow] md:max-w-[36rem] ${
                focused ? 'is-focused' : ''
              }`}
            >
              <SearchIcon className="pointer-events-none absolute left-4 h-5 w-5 text-neutral-400" />
              <input
                ref={inputRef}
                type="search"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => {
                  setFocused(false)
                  const q = draft.trim()
                  if (q.length > 1) rememberSearch({ kind: 'query', q })
                }}
                placeholder="Songs, artists, albums"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="search"
                aria-label="Search YouTube Music"
                className="h-full w-full min-w-0 bg-transparent pl-12 pr-11 text-[15px] font-medium text-white outline-none placeholder:font-normal placeholder:text-neutral-500"
              />
              {draft && (
                <button
                  type="button"
                  onClick={() => {
                    setDraft('')
                    setSearchState({ query: '', stack: [], filter: 'all' })
                    inputRef.current?.focus()
                  }}
                  aria-label="Clear search"
                  className="absolute right-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 hover:bg-white/[0.08] hover:text-white"
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              )}
            </form>
          </div>
          {showChips && (
            <ChipRow label="Search filter">
              {FILTERS.map((f) => (
                <Chip key={f.id} selected={filter === f.id} onClick={() => setSearchState({ filter: f.id })}>
                  {f.label}
                </Chip>
              ))}
            </ChipRow>
          )}
        </PanelHeader>

        {!adder.canAdd && (
          <p className="ytmq-anim-fade mb-5 flex items-center gap-2.5 rounded-2xl bg-white/[0.05] px-4 py-3 text-sm text-neutral-300">
            <LockIcon className="h-4 w-4 shrink-0 text-neutral-400" />
            The host turned off adding songs for now. You can still look around.
          </p>
        )}

        <div key={topKey} className="ytmq-anim-fade flex-1 pb-4">
          {top ? (
            top.kind === 'artist' ? (
              <ArtistView view={top} />
            ) : top.kind === 'mood' ? (
              <MoodView view={top} />
            ) : (
              <CollectionView view={top} />
            )
          ) : query ? (
            <SearchResults query={query} filter={filter} />
          ) : (
            <SearchBrowse />
          )}
        </div>
      </div>
    </SearchNavContext.Provider>
  )
}
