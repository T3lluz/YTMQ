import { useEffect, useRef, useState } from 'react'
import {
  searchArtistTracks,
  searchByFilter,
  type SearchFilter,
  type SearchResultItem,
} from '../lib/search'
import { TrackRow } from './TrackRow'
import { useQueueAdder } from '../hooks/useQueueAdder'
import {
  defaultArtistThumbnail,
  defaultThumbnail,
  type AddTrackInput,
  type QueueInsertMode,
} from '../lib/queue'

type SearchTabProps = {
  nickname: string
  canAdd?: boolean
  /** Desktop: fill the available height with a pinned header + scrolling results. */
  fillHeight?: boolean
  onAdd: (track: AddTrackInput, mode: QueueInsertMode) => Promise<void>
  onAdded?: (title: string, mode: QueueInsertMode) => void
}

const FILTERS: { id: SearchFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'song', label: 'Songs' },
  { id: 'artist', label: 'Artists' },
]

const SEARCH_DEBOUNCE_MS = 180

function FilterPills({
  value,
  onChange,
}: {
  value: SearchFilter
  onChange: (filter: SearchFilter) => void
}) {
  return (
    <div className="flex gap-2" role="tablist" aria-label="Search filter">
      {FILTERS.map((option) => {
        const active = value === option.id
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.id)}
            className={`ytmq-press rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              active
                ? 'bg-violet-600 text-white shadow-sm shadow-violet-900/40'
                : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function SearchSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <ul className="flex flex-col gap-1.5 pt-1">
      {Array.from({ length: rows }).map((_, index) => (
        <li
          key={index}
          className="ytmq-anim-fade flex items-center gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/50 px-3 py-2.5"
          style={{ animationDelay: `${index * 40}ms` }}
        >
          <div className="ytmq-skeleton h-12 w-12 shrink-0 rounded-lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="ytmq-skeleton h-3.5 w-2/3 rounded-full" />
            <div className="ytmq-skeleton h-3 w-2/5 rounded-full" />
          </div>
        </li>
      ))}
    </ul>
  )
}

function ArtistAvatar({
  item,
  className,
}: {
  item: SearchResultItem
  className: string
}) {
  const fallback = defaultArtistThumbnail(item.title)
  const [src, setSrc] = useState(item.thumbnail || fallback)

  useEffect(() => {
    setSrc(item.thumbnail || fallback)
  }, [item.thumbnail, item.title, fallback])

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className={className}
      onError={() => setSrc(fallback)}
    />
  )
}

export function SearchTab({
  nickname,
  canAdd = true,
  fillHeight = false,
  onAdd,
  onAdded,
}: SearchTabProps) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<SearchFilter>('all')
  const [results, setResults] = useState<SearchResultItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)
  const [artistBrowseId, setArtistBrowseId] = useState<string | null>(null)
  const [selectedArtist, setSelectedArtist] = useState<SearchResultItem | null>(
    null,
  )
  const inputRef = useRef<HTMLInputElement>(null)
  const requestGen = useRef(0)
  const { pending, add } = useQueueAdder(nickname, onAdd, onAdded)

  const trimmed = query.trim()

  // The bar lives in the centre of the screen at rest and glides to the top
  // (making room for results) once the user engages with it.
  const active = focused || query.length > 0

  useEffect(() => {
    let cancelled = false
    const gen = ++requestGen.current

    const timer = window.setTimeout(
      () => {
        if (trimmed.length < 2) {
          setResults([])
          setError(null)
          setLoading(false)
          return
        }

        setLoading(true)
        setError(null)

        const run =
          artistBrowseId && filter === 'song'
            ? searchArtistTracks(artistBrowseId)
            : searchByFilter(trimmed, filter)

        void run
          .then((items) => {
            if (cancelled || requestGen.current !== gen) return
            setResults(items)
          })
          .catch((err: unknown) => {
            if (cancelled || requestGen.current !== gen) return
            setResults([])
            setError(err instanceof Error ? err.message : 'Search failed')
          })
          .finally(() => {
            if (!cancelled && requestGen.current === gen) setLoading(false)
          })
      },
      trimmed.length < 2 ? 0 : SEARCH_DEBOUNCE_MS,
    )

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [trimmed, filter, artistBrowseId])

  function addSong(item: SearchResultItem, mode: QueueInsertMode) {
    void add(
      {
        videoId: item.id,
        title: item.title,
        channelTitle: item.channelTitle,
        thumbnail: item.thumbnail,
      },
      mode,
    )
  }

  function filterByArtist(artist: SearchResultItem) {
    setSelectedArtist(artist)
    setArtistBrowseId(artist.id)
    setQuery(artist.title)
    setFilter('song')
  }

  function handleQueryChange(value: string) {
    setQuery(value)
    setArtistBrowseId(null)
    setSelectedArtist(null)
  }

  function handleFilterChange(next: SearchFilter) {
    setFilter(next)
    if (next !== 'song') {
      setArtistBrowseId(null)
      setSelectedArtist(null)
    }
  }

  const songs = results.filter((item) => item.type === 'song')
  const artists = results.filter((item) => item.type === 'artist')

  function renderSong(item: SearchResultItem, rank?: number) {
    return (
      <TrackRow
        key={item.id}
        thumbnail={item.thumbnail || defaultThumbnail(item.id)}
        title={item.title}
        subtitle={item.subtitle || item.channelTitle}
        rank={rank}
        pendingMode={pending?.id === item.id ? pending.mode : null}
        disabled={pending !== null || !canAdd}
        onPlayNext={() => addSong(item, 'play_next')}
        onQueue={() => addSong(item, 'queue')}
      />
    )
  }

  function renderArtistRow(item: SearchResultItem) {
    return (
      <li key={item.id} className="ytmq-anim-row">
        <button
          type="button"
          onClick={() => filterByArtist(item)}
          className="ytmq-press flex w-full items-center gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/60 px-3 py-2.5 text-left transition-colors hover:border-zinc-700"
        >
          <ArtistAvatar
            item={item}
            className="h-12 w-12 shrink-0 rounded-full object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{item.title}</p>
            <p className="truncate text-sm text-zinc-400">Artist</p>
          </div>
          <span className="shrink-0 text-sm font-medium text-violet-400">
            Songs →
          </span>
        </button>
      </li>
    )
  }

  function renderResults() {
    const showSkeleton = loading && results.length === 0

    if (showSkeleton) {
      return <SearchSkeleton />
    }
    if (error) {
      return (
        <p className="ytmq-anim-fade py-8 text-center text-sm text-red-400" role="alert">
          {error}
        </p>
      )
    }
    if (results.length === 0) {
      return (
        <p className="ytmq-anim-fade py-8 text-center text-zinc-500">
          No results for “{trimmed}”
        </p>
      )
    }

    const resultsBody =
      filter === 'artist' ? (
        <ul className="grid grid-cols-1 gap-2 pb-4 xl:grid-cols-2">
          {artists.map((item) => renderArtistRow(item))}
        </ul>
      ) : filter === 'song' ? (
        <div className="flex flex-col gap-4 pb-4">
          {selectedArtist && artistBrowseId && (
            <div className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
              <ArtistAvatar
                item={selectedArtist}
                className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-violet-500/30"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-semibold">{selectedArtist.title}</p>
                <p className="text-sm text-zinc-400">
                  {songs.length} song{songs.length === 1 ? '' : 's'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setArtistBrowseId(null)
                  setSelectedArtist(null)
                }}
                className="shrink-0 text-xs text-zinc-500 underline"
              >
                Back to search
              </button>
            </div>
          )}
          <ul className="grid grid-cols-1 gap-1.5 xl:grid-cols-2">
            {songs.map((item, index) => renderSong(item, index + 1))}
          </ul>
        </div>
      ) : (
        (() => {
          const top = results[0]
          const restSongs =
            top.type === 'song' ? songs.filter((s) => s.id !== top.id) : songs
          const restArtists =
            top.type === 'artist'
              ? artists.filter((a) => a.id !== top.id)
              : artists

          return (
            <div className="ytmq-anim-fade-up flex flex-col gap-6 pb-4">
              {top && (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                    Top result
                  </h3>
                  {top.type === 'song' ? (
                    <div className="ytmq-anim-pop flex items-center gap-4 rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-4 transition-colors hover:border-zinc-700">
                      <img
                        src={top.thumbnail || defaultThumbnail(top.id)}
                        alt=""
                        className="h-20 w-20 shrink-0 rounded-xl object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-lg font-semibold">{top.title}</p>
                        <p className="truncate text-sm text-zinc-400">
                          {top.subtitle || top.channelTitle}
                        </p>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            disabled={pending !== null || !canAdd}
                            onClick={() => addSong(top, 'play_next')}
                            className="ytmq-press inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-60"
                          >
                            {pending?.id === top.id && pending.mode === 'play_next' && (
                              <span className="ytmq-spinner h-3.5 w-3.5" aria-hidden />
                            )}
                            {pending?.id === top.id && pending.mode === 'play_next'
                              ? 'Adding…'
                              : 'Play next'}
                          </button>
                          <button
                            type="button"
                            disabled={pending !== null || !canAdd}
                            onClick={() => addSong(top, 'queue')}
                            className="ytmq-press inline-flex items-center gap-1.5 rounded-full border border-violet-500/70 px-4 py-1.5 text-sm font-medium text-violet-200 hover:bg-violet-500/10 disabled:opacity-60"
                          >
                            {pending?.id === top.id && pending.mode === 'queue' && (
                              <span className="ytmq-spinner h-3.5 w-3.5" aria-hidden />
                            )}
                            {pending?.id === top.id && pending.mode === 'queue'
                              ? 'Adding…'
                              : 'Queue'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => filterByArtist(top)}
                      className="ytmq-press ytmq-anim-pop flex w-full items-center gap-4 rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-4 text-left transition-colors hover:border-zinc-700"
                    >
                      <ArtistAvatar
                        item={top}
                        className="h-20 w-20 shrink-0 rounded-full object-cover ring-2 ring-zinc-700"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-lg font-semibold">{top.title}</p>
                        <p className="text-sm text-zinc-400">Artist</p>
                        <span className="mt-2 inline-block rounded-full bg-violet-600 px-4 py-1.5 text-sm font-medium text-white">
                          Show songs
                        </span>
                      </div>
                    </button>
                  )}
                </section>
              )}

              {restSongs.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                    Songs
                  </h3>
                  <ul className="grid grid-cols-1 gap-1.5 xl:grid-cols-2">
                    {restSongs.map((item) => renderSong(item))}
                  </ul>
                </section>
              )}

              {restArtists.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                    Artists
                  </h3>
                  <ul className="grid grid-cols-1 gap-2 xl:grid-cols-2">
                    {restArtists.map((item) => renderArtistRow(item))}
                  </ul>
                </section>
              )}
            </div>
          )
        })()
      )

    return (
      <div
        className={`transition-opacity duration-200 ${
          loading && results.length > 0 ? 'opacity-80' : 'opacity-100'
        }`}
      >
        {resultsBody}
      </div>
    )
  }

  function clearSearch() {
    setQuery('')
    setArtistBrowseId(null)
    setSelectedArtist(null)
    inputRef.current?.focus()
  }

  return (
    <section
      className={`flex flex-col ${
        fillHeight ? 'h-full min-h-0' : 'min-h-[62vh] flex-1'
      }`}
    >
      {!canAdd && (
        <p className="ytmq-anim-fade mb-3 flex shrink-0 items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0" aria-hidden>
            <path
              fillRule="evenodd"
              d="M10 1.5A3.5 3.5 0 0 0 6.5 5v2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-.5V5A3.5 3.5 0 0 0 10 1.5Zm2 5.5V5a2 2 0 1 0-4 0v2h4Z"
              clipRule="evenodd"
            />
          </svg>
          The host has paused adding songs right now.
        </p>
      )}

      <div className={`flex flex-col ${fillHeight ? 'min-h-0 flex-1' : ''}`}>
        <div
          className="shrink-0 transition-[padding-top] duration-[480ms] [transition-timing-function:var(--ease-out-soft)]"
          style={{ paddingTop: active ? 0 : 'clamp(1.5rem, 24vh, 13rem)' }}
        >
          <div
            className={`grid overflow-hidden text-center transition-all duration-[420ms] [transition-timing-function:var(--ease-out-soft)] ${
              active
                ? 'mb-0 max-h-0 -translate-y-2 opacity-0'
                : 'mb-7 max-h-40 translate-y-0 opacity-100'
            }`}
          >
            <h2 className="font-lyrics text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
              Search songs
            </h2>
            <p className="mt-2.5 text-sm text-zinc-400">
              Find any song or artist to add to the queue
            </p>
          </div>

          <div
            className={`relative mx-auto w-full transition-[max-width] duration-[480ms] [transition-timing-function:var(--ease-out-soft)] ${
              active ? 'max-w-xl' : 'max-w-2xl'
            }`}
          >
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden
              className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500"
            >
              <path
                fillRule="evenodd"
                d="M9 3.5a5.5 5.5 0 1 0 3.4 9.83l3.64 3.63a.75.75 0 1 0 1.06-1.06l-3.63-3.64A5.5 5.5 0 0 0 9 3.5ZM5 9a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z"
                clipRule="evenodd"
              />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Songs, artists…"
              autoComplete="off"
              enterKeyHint="search"
              className="min-h-14 w-full rounded-full border border-zinc-700 bg-zinc-900 pl-12 pr-11 text-base shadow-lg shadow-black/20 outline-none transition-colors focus:border-violet-500"
            />
            {loading && (
              <span
                className="pointer-events-none absolute right-11 top-1/2 -translate-y-1/2"
                aria-hidden
              >
                <span className="ytmq-spinner h-4 w-4 text-violet-400" />
              </span>
            )}
            {query && (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Clear search"
                className="ytmq-anim-fade absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-zinc-500 transition-colors hover:text-zinc-200"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            )}
          </div>

          {trimmed.length >= 2 && (
            <div className="ytmq-anim-fade mt-3 flex items-center justify-between gap-3">
              <FilterPills value={filter} onChange={handleFilterChange} />
              {loading && (
                <span className="shrink-0 text-xs text-zinc-500">Searching…</span>
              )}
            </div>
          )}
        </div>

        {trimmed.length >= 2 && (
          <div
            className={`mt-3 ${
              fillHeight ? 'min-h-0 flex-1 overflow-y-auto pb-28 pr-1' : ''
            }`}
          >
            {renderResults()}
          </div>
        )}
      </div>
    </section>
  )
}
