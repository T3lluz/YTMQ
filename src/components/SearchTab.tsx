import { useEffect, useState } from 'react'
import {
  fetchAlbumTracks,
  fetchArtistDetail,
  searchYouTube,
  type ArtistDetail,
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
  | { kind: 'album'; album: SearchResultItem; artist: SearchResultItem }

function typeLabel(type: SearchResultItem['type']) {
  if (type === 'artist') return 'Artist'
  if (type === 'album') return 'Album'
  return 'Song'
}

export function SearchTab({ nickname, onAdd, onAdded }: SearchTabProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResultItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [view, setView] = useState<View>({ kind: 'search' })
  const [detailLoading, setDetailLoading] = useState(false)
  const [albumTracks, setAlbumTracks] = useState<SearchResultItem[]>([])

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
      void searchYouTube(trimmed)
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
  }, [query])

  const artistBrowseId = view.kind === 'artist' ? view.artist.id : null
  const albumBrowseId = view.kind === 'album' ? view.album.id : null

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

  useEffect(() => {
    if (!albumBrowseId) return

    let cancelled = false
    setDetailLoading(true)
    setError(null)
    void fetchAlbumTracks(albumBrowseId)
      .then((tracks) => {
        if (!cancelled) setAlbumTracks(tracks)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setAlbumTracks([])
          setError(
            err instanceof Error ? err.message : 'Could not load album',
          )
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [albumBrowseId])

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

  function openAlbum(album: SearchResultItem, artist: SearchResultItem) {
    setView({ kind: 'album', album, artist })
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
          <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            {typeLabel(item.type)}
          </p>
          <p className="line-clamp-2 font-medium">{item.title}</p>
          <p className="truncate text-sm text-zinc-400">
            {item.subtitle || item.channelTitle}
          </p>
        </div>
        {item.type === 'artist' ? (
          <button
            type="button"
            onClick={() => openArtist(item)}
            className="min-h-10 shrink-0 self-center rounded-lg border border-zinc-700 px-3 text-sm font-medium active:bg-zinc-800"
          >
            Open
          </button>
        ) : item.type === 'album' ? (
          <button
            type="button"
            onClick={() =>
              openAlbum(item, {
                id: item.channelTitle,
                title: item.channelTitle,
                channelTitle: item.channelTitle,
                thumbnail: '',
                type: 'artist',
              })
            }
            className="min-h-10 shrink-0 self-center rounded-lg border border-zinc-700 px-3 text-sm font-medium active:bg-zinc-800"
          >
            Open
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

  if (view.kind === 'album') {
    return (
      <section className="flex flex-1 flex-col gap-3">
        <button
          type="button"
          onClick={() =>
            setView({ kind: 'artist', artist: view.artist, detail: null })
          }
          className="self-start text-sm text-violet-400 underline"
        >
          ← Back to artist
        </button>
        <h2 className="text-lg font-semibold">{view.album.title}</h2>
        <p className="text-sm text-zinc-400">{view.artist.title}</p>

        {error && (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        {detailLoading ? (
          <p className="py-8 text-center text-zinc-500">Loading album…</p>
        ) : albumTracks.length === 0 ? (
          <p className="py-8 text-center text-zinc-500">No tracks found</p>
        ) : (
          <ul className="flex flex-col gap-2 pb-4">
            {albumTracks.map(renderResultRow)}
          </ul>
        )}
      </section>
    )
  }

  if (view.kind === 'artist') {
    const detail = view.detail
    const artistTitle = detail?.title ?? view.artist.title
    const artistThumb =
      detail?.thumbnail || view.artist.thumbnail || defaultThumbnail(view.artist.id)

    return (
      <section className="flex flex-1 flex-col gap-3">
        <button
          type="button"
          onClick={() => setView({ kind: 'search' })}
          className="self-start text-sm text-violet-400 underline"
        >
          ← Back to search
        </button>

        <div className="flex items-center gap-3">
          <img
            src={artistThumb}
            alt=""
            className="h-16 w-16 shrink-0 rounded-full object-cover"
          />
          <div>
            <h2 className="text-lg font-semibold">{artistTitle}</h2>
            <p className="text-sm text-zinc-400">Artist</p>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        {detailLoading || !detail ? (
          <p className="py-8 text-center text-zinc-500">Loading artist…</p>
        ) : (
          <>
            {detail.albums.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-zinc-300">Albums</h3>
                <ul className="flex flex-col gap-2">
                  {detail.albums.map((album) => (
                    <li key={album.id}>
                      <button
                        type="button"
                        onClick={() => openAlbum(album, view.artist)}
                        className="flex w-full gap-3 rounded-xl border border-zinc-800 bg-zinc-900/80 p-3 text-left active:bg-zinc-900"
                      >
                        <img
                          src={album.thumbnail || defaultThumbnail(album.id)}
                          alt=""
                          className="h-14 w-14 shrink-0 rounded-lg object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{album.title}</p>
                          <p className="truncate text-sm text-zinc-400">
                            {album.subtitle || album.channelTitle}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-zinc-300">Songs</h3>
              {detail.songs.length === 0 ? (
                <p className="py-4 text-center text-sm text-zinc-500">
                  No songs found
                </p>
              ) : (
                <ul className="flex flex-col gap-2 pb-4">
                  {detail.songs.map(renderResultRow)}
                </ul>
              )}
            </div>
          </>
        )}
      </section>
    )
  }

  const songs = results.filter((item) => item.type === 'song')
  const artists = results.filter((item) => item.type === 'artist')

  return (
    <section className="flex flex-1 flex-col gap-3">
      <h2 className="text-lg font-semibold">Search</h2>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search songs and artists…"
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
          Type at least 2 characters to search YouTube Music
        </p>
      ) : loading ? (
        <p className="py-8 text-center text-zinc-500">Searching…</p>
      ) : results.length === 0 ? (
        <p className="py-8 text-center text-zinc-500">No results</p>
      ) : (
        <div className="flex flex-col gap-4 pb-4">
          {songs.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-zinc-300">Top songs</h3>
              <ul className="flex flex-col gap-2">
                {songs.map(renderResultRow)}
              </ul>
            </div>
          )}
          {artists.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-zinc-300">Artists</h3>
              <ul className="flex flex-col gap-2">
                {artists.map(renderResultRow)}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
