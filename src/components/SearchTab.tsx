import { useEffect, useState } from 'react'
import {
  fetchArtistTracks,
  searchYouTube,
  type SearchResultItem,
} from '../lib/search'
import { defaultThumbnail, type AddTrackInput } from '../lib/queue'

type SearchTabProps = {
  nickname: string
  onAdd: (track: AddTrackInput) => Promise<void>
  onAdded?: (title: string) => void
}

type SearchMode = 'song' | 'artist'

export function SearchTab({ nickname, onAdd, onAdded }: SearchTabProps) {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<SearchMode>('song')
  const [results, setResults] = useState<SearchResultItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [selectedArtist, setSelectedArtist] = useState<SearchResultItem | null>(
    null,
  )
  const [artistTracks, setArtistTracks] = useState<SearchResultItem[]>([])
  const [artistLoading, setArtistLoading] = useState(false)

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
      void searchYouTube(trimmed, mode)
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
    }, 350)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query, mode])

  useEffect(() => {
    if (!selectedArtist) {
      setArtistTracks([])
      return
    }

    let cancelled = false
    setArtistLoading(true)
    setError(null)
    void fetchArtistTracks(selectedArtist.id)
      .then((tracks) => {
        if (!cancelled) setArtistTracks(tracks)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setArtistTracks([])
          setError(
            err instanceof Error ? err.message : 'Could not load artist tracks',
          )
        }
      })
      .finally(() => {
        if (!cancelled) setArtistLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedArtist])

  async function handleAdd(item: SearchResultItem) {
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
    setSelectedArtist(artist)
    setQuery('')
    setResults([])
  }

  function renderResultRow(item: SearchResultItem) {
    const thumb = item.thumbnail || defaultThumbnail(item.id)
    const isAdding = addingId === item.id

    return (
      <li
        key={`${item.type}-${item.id}`}
        className="flex gap-3 rounded-xl border border-zinc-800 bg-zinc-900/80 p-3"
      >
        <img
          src={thumb}
          alt=""
          className="h-14 w-14 shrink-0 rounded-lg object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-medium">{item.title}</p>
          <p className="truncate text-sm text-zinc-400">{item.channelTitle}</p>
        </div>
        {item.type === 'artist' ? (
          <button
            type="button"
            onClick={() => openArtist(item)}
            className="min-h-10 shrink-0 self-center rounded-lg border border-zinc-700 px-3 text-sm font-medium active:bg-zinc-800"
          >
            Tracks
          </button>
        ) : (
          <button
            type="button"
            disabled={isAdding}
            onClick={() => void handleAdd(item)}
            className="min-h-10 shrink-0 self-center rounded-lg bg-violet-600 px-3 text-sm font-medium text-white active:bg-violet-700 disabled:opacity-60"
          >
            {isAdding ? '…' : 'Add'}
          </button>
        )}
      </li>
    )
  }

  if (selectedArtist) {
    return (
      <section className="flex flex-1 flex-col gap-3">
        <button
          type="button"
          onClick={() => setSelectedArtist(null)}
          className="self-start text-sm text-violet-400 underline"
        >
          ← Back to search
        </button>
        <h2 className="text-lg font-semibold">{selectedArtist.title}</h2>
        <p className="text-sm text-zinc-400">Popular tracks from this channel</p>

        {error && (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        {artistLoading ? (
          <p className="py-8 text-center text-zinc-500">Loading tracks…</p>
        ) : artistTracks.length === 0 ? (
          <p className="py-8 text-center text-zinc-500">No tracks found</p>
        ) : (
          <ul className="flex flex-col gap-2">{artistTracks.map(renderResultRow)}</ul>
        )}
      </section>
    )
  }

  return (
    <section className="flex flex-1 flex-col gap-3">
      <h2 className="text-lg font-semibold">Search</h2>

      <div className="flex gap-2">
        {(['song', 'artist'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={`min-h-10 flex-1 rounded-lg text-sm font-medium ${
              mode === value
                ? 'bg-violet-600 text-white'
                : 'border border-zinc-700 text-zinc-300'
            }`}
          >
            {value === 'song' ? 'Songs' : 'Artists'}
          </button>
        ))}
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={mode === 'song' ? 'Search songs…' : 'Search artists…'}
        autoComplete="off"
        className="min-h-12 rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-base outline-none focus:border-violet-500"
      />

      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      {query.trim().length < 2 ? (
        <p className="py-8 text-center text-sm text-zinc-500">
          Type at least 2 characters to search YouTube Music catalog
        </p>
      ) : loading ? (
        <p className="py-8 text-center text-zinc-500">Searching…</p>
      ) : results.length === 0 ? (
        <p className="py-8 text-center text-zinc-500">No results</p>
      ) : (
        <ul className="flex flex-col gap-2 pb-4">{results.map(renderResultRow)}</ul>
      )}
    </section>
  )
}
