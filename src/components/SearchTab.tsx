import { useEffect, useState } from 'react'
import {
  fetchArtistDetail,
  searchByFilter,
  type ArtistDetail,
  type SearchFilter,
  type SearchResultItem,
} from '../lib/search'
import { defaultThumbnail, type AddTrackInput } from '../lib/queue'

type SearchTabProps = {
  nickname: string
  onAdd: (track: AddTrackInput) => Promise<void>
  onAdded?: (title: string) => void
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

export function SearchTab({ nickname, onAdd, onAdded }: SearchTabProps) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<SearchFilter>('song')
  const [results, setResults] = useState<SearchResultItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addingId, setAddingId] = useState<string | null>(null)
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

  async function handleAdd(item: SearchResultItem) {
    if (item.type !== 'song') return
    setAddingId(item.id)
    setError(null)
    try {
      await onAdd({
        video_id: item.id,
        title: item.title,
        channel_title: item.channelTitle,
        thumbnail_url: item.thumbnail || defaultThumbnail(item.id),
        added_by: nickname,
      })
      onAdded?.(item.title)
    } catch {
      // hook surfaces queue errors
    } finally {
      setAddingId(null)
    }
  }

  function openArtist(artist: SearchResultItem) {
    setView({ kind: 'artist', artist, detail: null })
    setQuery('')
    setResults([])
  }

  function renderSongRow(item: SearchResultItem, rank?: number) {
    const thumb = item.thumbnail || defaultThumbnail(item.id)
    const isAdding = addingId === item.id

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
        <button
          type="button"
          disabled={isAdding}
          onClick={() => void handleAdd(item)}
          className="min-h-9 shrink-0 rounded-lg bg-violet-600 px-3.5 text-sm font-medium text-white active:bg-violet-700 disabled:opacity-60"
        >
          {isAdding ? '…' : 'Add'}
        </button>
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
