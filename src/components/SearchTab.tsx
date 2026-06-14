import { useEffect, useState } from 'react'
import {
  searchByFilter,
  type SearchFilter,
  type SearchResultItem,
} from '../lib/search'
import { RecentlyPlayed } from './RecentlyPlayed'
import { TrackRow } from './TrackRow'
import { useQueueAdder } from '../hooks/useQueueAdder'
import {
  defaultThumbnail,
  type AddTrackInput,
  type QueueInsertMode,
} from '../lib/queue'

type SearchTabProps = {
  roomId: string
  nickname: string
  canAdd?: boolean
  onAdd: (track: AddTrackInput, mode: QueueInsertMode) => Promise<void>
  onAdded?: (title: string, mode: QueueInsertMode) => void
}

const FILTERS: { id: SearchFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'song', label: 'Songs' },
  { id: 'artist', label: 'Artists' },
]

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

function SearchSkeleton() {
  return (
    <ul className="flex flex-col gap-1.5 pt-1">
      {Array.from({ length: 6 }).map((_, index) => (
        <li
          key={index}
          className="ytmq-anim-fade flex items-center gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/50 px-3 py-2.5"
          style={{ animationDelay: `${index * 60}ms` }}
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

export function SearchTab({
  roomId,
  nickname,
  canAdd = true,
  onAdd,
  onAdded,
}: SearchTabProps) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<SearchFilter>('all')
  const [results, setResults] = useState<SearchResultItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { pending, add } = useQueueAdder(nickname, onAdd, onAdded)

  const trimmed = query.trim()

  useEffect(() => {
    let cancelled = false

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
        void searchByFilter(trimmed, filter)
          .then((items) => {
            if (!cancelled) setResults(items)
          })
          .catch((err: unknown) => {
            if (!cancelled) {
              setResults([])
              setError(err instanceof Error ? err.message : 'Search failed')
            }
          })
          .finally(() => {
            if (!cancelled) setLoading(false)
          })
      },
      trimmed.length < 2 ? 0 : 300,
    )

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [trimmed, filter])

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

  // Tapping an artist filters the view to that artist's songs (no detail page).
  function filterByArtist(artist: SearchResultItem) {
    setQuery(artist.title)
    setFilter('song')
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
          <img
            src={item.thumbnail || defaultThumbnail(item.id)}
            alt=""
            loading="lazy"
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
    if (loading) {
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

    if (filter === 'artist') {
      return (
        <ul className="flex flex-col gap-2 pb-4">
          {artists.map((item) => renderArtistRow(item))}
        </ul>
      )
    }

    if (filter === 'song') {
      return (
        <ul className="flex flex-col gap-1.5 pb-4">
          {songs.map((item, index) => renderSong(item, index + 1))}
        </ul>
      )
    }

    // filter === 'all' — Spotify-style: top result, songs, then artists.
    const top = results[0]
    const restSongs =
      top.type === 'song' ? songs.filter((s) => s.id !== top.id) : songs

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
                <img
                  src={top.thumbnail || defaultThumbnail(top.id)}
                  alt=""
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
            <ul className="flex flex-col gap-1.5">
              {restSongs.map((item) => renderSong(item))}
            </ul>
          </section>
        )}

        {artists.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Artists
            </h3>
            <ul className="flex flex-col gap-2">
              {artists.map((item) => renderArtistRow(item))}
            </ul>
          </section>
        )}
      </div>
    )
  }

  return (
    <section className="flex flex-1 flex-col gap-3">
      <h2 className="text-lg font-semibold">Search</h2>

      {!canAdd && (
        <p className="ytmq-anim-fade flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
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

      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Songs, artists…"
          autoComplete="off"
          enterKeyHint="search"
          className="min-h-12 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 pr-10 text-base outline-none transition-colors focus:border-violet-500"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="ytmq-anim-fade absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-zinc-500 transition-colors hover:text-zinc-200"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        )}
      </div>

      {trimmed.length >= 2 && <FilterPills value={filter} onChange={setFilter} />}

      {trimmed.length < 2 ? (
        <RecentlyPlayed
          roomId={roomId}
          nickname={nickname}
          canAdd={canAdd}
          onAdd={onAdd}
          onAdded={onAdded}
        />
      ) : (
        renderResults()
      )}
    </section>
  )
}
