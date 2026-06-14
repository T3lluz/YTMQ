import { useEffect, useState } from 'react'
import {
  fetchArtistDetail,
  searchByFilter,
  type ArtistDetail,
  type SearchFilter,
  type SearchResultItem,
} from '../lib/search'
import {
  defaultThumbnail,
  type AddTrackInput,
  type QueueInsertMode,
} from '../lib/queue'

type SearchTabProps = {
  nickname: string
  onAdd: (track: AddTrackInput, mode: QueueInsertMode) => Promise<void>
  onAdded?: (title: string, mode: QueueInsertMode) => void
}

function PlayNextIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
    >
      <path d="M3.5 4.75A.75.75 0 0 1 4.62 4.1l8.5 5.25a.75.75 0 0 1 0 1.3l-8.5 5.25a.75.75 0 0 1-1.12-.65V4.75Z" />
      <path d="M15.5 4.75a.75.75 0 0 1 1.5 0v10.5a.75.75 0 0 1-1.5 0V4.75Z" />
    </svg>
  )
}

function AddToQueueIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 6h10" />
      <path d="M3 10h7" />
      <path d="M3 14h7" />
      <path d="M14.5 11v6" />
      <path d="M11.5 14h6" />
    </svg>
  )
}

type View =
  | { kind: 'search' }
  | { kind: 'artist'; artist: SearchResultItem; detail: ArtistDetail | null }

function FilterPills({
  value,
  onChange,
}: {
  value: SearchFilter
  onChange: (filter: SearchFilter) => void
}) {
  const options: { id: SearchFilter; label: string }[] = [
    { id: 'song', label: 'Songs' },
    { id: 'artist', label: 'Artists' },
  ]

  return (
    <div
      className="flex rounded-xl border border-zinc-800 bg-zinc-950/80 p-1"
      role="tablist"
      aria-label="Search filter"
    >
      {options.map((option) => {
        const active = value === option.id
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.id)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

type Pending = { id: string; mode: QueueInsertMode } | null

export function SearchTab({ nickname, onAdd, onAdded }: SearchTabProps) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<SearchFilter>('song')
  const [results, setResults] = useState<SearchResultItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [view, setView] = useState<View>({ kind: 'search' })
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults([])
      setError(null)
      return
    }

    let cancelled = false
    const timer = window.setTimeout(() => {
      setLoading(true)
      setError(null)
      void searchByFilter(trimmed, filter)
        .then((items) => {
          if (!cancelled) setResults(items)
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setResults([])
            setError(
              err instanceof Error ? err.message : 'Search failed',
            )
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 300)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query, filter])

  const artistBrowseId = view.kind === 'artist' ? view.artist.id : null

  useEffect(() => {
    if (!artistBrowseId) return

    let cancelled = false
    setDetailLoading(true)
    setError(null)
    void fetchArtistDetail(artistBrowseId)
      .then((detail) => {
        if (!cancelled) {
          setView((current) =>
            current.kind === 'artist' && current.artist.id === artistBrowseId
              ? { kind: 'artist', artist: current.artist, detail }
              : current,
          )
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Could not load artist',
          )
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [artistBrowseId])

  async function handleAdd(item: SearchResultItem, mode: QueueInsertMode) {
    if (item.type !== 'song') return
    setPending({ id: item.id, mode })
    setError(null)
    try {
      await onAdd(
        {
          video_id: item.id,
          title: item.title,
          channel_title: item.channelTitle,
          thumbnail_url: item.thumbnail || defaultThumbnail(item.id),
          added_by: nickname,
          insert_mode: mode,
        },
        mode,
      )
      onAdded?.(item.title, mode)
    } catch {
      // hook surfaces queue errors
    } finally {
      setPending(null)
    }
  }

  function openArtist(artist: SearchResultItem) {
    setView({ kind: 'artist', artist, detail: null })
    setQuery('')
    setResults([])
  }

  function renderSongRow(item: SearchResultItem, rank?: number) {
    const thumb = item.thumbnail || defaultThumbnail(item.id)
    const isPending = pending?.id === item.id
    const pendingMode = isPending ? pending?.mode : null
    const anyBusy = pending !== null

    return (
      <li
        key={item.id}
        className="flex items-center gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/60 px-3 py-2.5"
      >
        {rank != null && (
          <span className="w-6 shrink-0 text-center text-sm tabular-nums text-zinc-500">
            {rank}
          </span>
        )}
        <img
          src={thumb}
          alt=""
          className="h-12 w-12 shrink-0 rounded-lg object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{item.title}</p>
          <p className="truncate text-sm text-zinc-400">
            {item.subtitle || item.channelTitle}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            disabled={anyBusy}
            onClick={() => void handleAdd(item, 'play_next')}
            aria-label="Play next"
            title="Play next"
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-2.5 text-xs font-medium text-white active:bg-violet-700 disabled:opacity-60"
          >
            {pendingMode === 'play_next' ? (
              <span aria-hidden="true">…</span>
            ) : (
              <PlayNextIcon />
            )}
            <span className="hidden sm:inline">Next</span>
          </button>
          <button
            type="button"
            disabled={anyBusy}
            onClick={() => void handleAdd(item, 'queue')}
            aria-label="Add to queue"
            title="Add to queue"
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-violet-500/70 px-2.5 text-xs font-medium text-violet-200 active:bg-violet-500/10 disabled:opacity-60"
          >
            {pendingMode === 'queue' ? (
              <span aria-hidden="true">…</span>
            ) : (
              <AddToQueueIcon />
            )}
            <span className="hidden sm:inline">Queue</span>
          </button>
        </div>
      </li>
    )
  }

  function renderArtistRow(item: SearchResultItem) {
    const thumb = item.thumbnail || defaultThumbnail(item.id)

    return (
      <li key={item.id}>
        <button
          type="button"
          onClick={() => openArtist(item)}
          className="flex w-full items-center gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/60 px-3 py-2.5 text-left active:bg-zinc-900"
        >
          <img
            src={thumb}
            alt=""
            className="h-12 w-12 shrink-0 rounded-full object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{item.title}</p>
            <p className="truncate text-sm text-zinc-400">Artist</p>
          </div>
          <span className="shrink-0 text-sm text-violet-400">View →</span>
        </button>
      </li>
    )
  }

  if (view.kind === 'artist') {
    const detail = view.detail
    const artistTitle = detail?.title ?? view.artist.title
    const artistThumb =
      detail?.thumbnail || view.artist.thumbnail || defaultThumbnail(view.artist.id)
    const songs = detail?.songs ?? []

    return (
      <section className="flex flex-1 flex-col gap-4">
        <button
          type="button"
          onClick={() => setView({ kind: 'search' })}
          className="self-start text-sm text-violet-400 underline"
        >
          ← Back to search
        </button>

        <div className="flex items-center gap-4 rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-4">
          <img
            src={artistThumb}
            alt=""
            className="h-20 w-20 shrink-0 rounded-full object-cover ring-2 ring-zinc-700"
          />
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold">{artistTitle}</h2>
            <p className="text-sm text-zinc-400">
              {detailLoading
                ? 'Loading songs…'
                : `${songs.length} song${songs.length === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        {detailLoading || !detail ? (
          <p className="py-8 text-center text-zinc-500">Loading songs…</p>
        ) : songs.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">
            No songs found for this artist
          </p>
        ) : (
          <div className="space-y-2 pb-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Popular songs
            </h3>
            <ul className="flex flex-col gap-1.5">
              {songs.map((song, index) => renderSongRow(song, index + 1))}
            </ul>
          </div>
        )}
      </section>
    )
  }

  return (
    <section className="flex flex-1 flex-col gap-3">
      <h2 className="text-lg font-semibold">Search</h2>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={
          filter === 'song' ? 'Search songs…' : 'Search artists…'
        }
        autoComplete="off"
        className="min-h-12 rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-base outline-none focus:border-violet-500"
      />

      <FilterPills value={filter} onChange={setFilter} />

      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      {query.trim().length < 2 ? (
        <p className="py-8 text-center text-sm text-zinc-500">
          Type at least 2 characters to search YouTube Music
        </p>
      ) : loading ? (
        <p className="py-8 text-center text-zinc-500">Searching…</p>
      ) : results.length === 0 ? (
        <p className="py-8 text-center text-zinc-500">No results</p>
      ) : (
        <ul className="flex flex-col gap-2 pb-4">
          {filter === 'song'
            ? results.map((item) => renderSongRow(item))
            : results.map((item) => renderArtistRow(item))}
        </ul>
      )}
    </section>
  )
}
