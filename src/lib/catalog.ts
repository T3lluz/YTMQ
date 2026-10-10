// The YTMQ catalog on the client: search, artist / album / playlist pages and
// browse, from the server's `search` function (server/functions/search).
// Types mirror server/functions/search/catalog.ts.

import { ytmq } from './api'
import type { AddTrackInput, QueueInsertMode } from './queue'

export type ArtistRef = { id: string | null; name: string }
export type AlbumRef = { id: string | null; name: string }

export type CatalogTrack = {
  kind: 'track'
  videoId: string
  title: string
  artists: ArtistRef[]
  album: AlbumRef | null
  duration: number | null
  explicit: boolean
  thumbnail: string
  plays: string | null
  video: boolean
}

export type CatalogArtist = {
  kind: 'artist'
  id: string
  name: string
  thumbnail: string
  audience: string | null
}

export type CatalogAlbum = {
  kind: 'album'
  id: string
  title: string
  artists: ArtistRef[]
  year: string | null
  albumType: string
  explicit: boolean
  thumbnail: string
}

export type CatalogPlaylist = {
  kind: 'playlist'
  id: string
  title: string
  owner: string | null
  meta: string | null
  thumbnail: string
}

export type CatalogItem = CatalogTrack | CatalogArtist | CatalogAlbum | CatalogPlaylist

export type SearchFilter = 'all' | 'songs' | 'artists' | 'albums' | 'playlists' | 'videos'

export type SearchAllResult = {
  top: CatalogItem | null
  tracks: CatalogTrack[]
  artists: CatalogArtist[]
  albums: CatalogAlbum[]
  playlists: CatalogPlaylist[]
  videos: CatalogTrack[]
}

export type ArtistPage = {
  id: string
  name: string
  banner: string
  avatar: string
  audience: string | null
  subscribers: string | null
  description: string | null
  topTracks: CatalogTrack[]
  allTracksId: string | null
  albums: CatalogAlbum[]
  singles: CatalogAlbum[]
  videos: CatalogTrack[]
  featuredOn: CatalogPlaylist[]
  related: CatalogArtist[]
}

export type AlbumPage = {
  id: string
  title: string
  albumType: string
  year: string | null
  artists: ArtistRef[]
  thumbnail: string
  explicit: boolean
  summary: string | null
  description: string | null
  tracks: CatalogTrack[]
  otherVersions: CatalogAlbum[]
}

export type PlaylistPage = {
  id: string
  title: string
  owner: string | null
  thumbnail: string
  summary: string | null
  description: string | null
  tracks: CatalogTrack[]
}

export type MoodTile = { title: string; params: string; color: string }
export type BrowseHome = {
  trending: CatalogTrack[]
  newReleases: CatalogAlbum[]
  moods: { title: string; tiles: MoodTile[] }[]
}
export type MoodPage = { title: string; sections: { title: string; playlists: CatalogPlaylist[] }[] }

// --- Requests (cached for the session; the server caches too) ----------------

const cache = new Map<string, Promise<unknown>>()

function call<T>(key: string, body: Record<string, unknown>, pick: (data: Record<string, unknown>) => T): Promise<T> {
  const hit = cache.get(key)
  if (hit) return hit as Promise<T>
  const request = ytmq.invoke<Record<string, unknown>>('search', body).then((data) => {
    if (data && typeof data.error === 'string') throw new Error(data.error)
    return pick(data ?? {})
  })
  cache.set(key, request)
  request.catch(() => cache.delete(key))
  if (cache.size > 200) cache.delete(cache.keys().next().value!)
  return request
}

const norm = (q: string) => q.trim().toLowerCase().replace(/\s+/g, ' ')

export function searchAll(q: string) {
  return call(`all:${norm(q)}`, { type: 'catalog', q, filter: 'all' }, (d) => d.result as SearchAllResult)
}

export function searchFiltered(q: string, filter: Exclude<SearchFilter, 'all'>) {
  return call(`${filter}:${norm(q)}`, { type: 'catalog', q, filter }, (d) => (d.items as CatalogItem[]) ?? [])
}

export function fetchArtistPage(id: string) {
  return call(`artist:${id}`, { type: 'artist_page', id }, (d) => d.artist as ArtistPage)
}

export function fetchAlbumPage(id: string) {
  return call(`album:${id}`, { type: 'album_page', id }, (d) => d.album as AlbumPage)
}

export function fetchPlaylistPage(id: string) {
  return call(`playlist:${id}`, { type: 'playlist_page', id }, (d) => d.playlist as PlaylistPage)
}

export function fetchBrowseHome() {
  return call('browse:home', { type: 'browse_home' }, (d) => d.home as BrowseHome)
}

export function fetchMood(params: string) {
  return call(`mood:${params}`, { type: 'mood', params }, (d) => d.mood as MoodPage)
}

/** The YouTube Music track for a song known by title and artist (a Spotify song, say). */
export function matchTrack(title: string, artist: string, duration?: number) {
  return call(
    `match:${norm(title)}|${norm(artist)}`,
    { type: 'match', title, artist, duration },
    (d) => (d.track as CatalogTrack | null) ?? null,
  )
}

/** Warm the cache, e.g. on hover, so a tap opens the page at once. */
export function prefetch(item: CatalogItem) {
  if (item.kind === 'artist') void fetchArtistPage(item.id).catch(() => {})
  if (item.kind === 'album') void fetchAlbumPage(item.id).catch(() => {})
  if (item.kind === 'playlist') void fetchPlaylistPage(item.id).catch(() => {})
}

// --- Formatting -------------------------------------------------------------

export function artistNames(artists: ArtistRef[]): string {
  return artists.map((a) => a.name).join(', ')
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return ''
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

/** The line under a catalog item's name ("Album · Daft Punk"). */
export function itemSubtitle(item: CatalogItem): string {
  switch (item.kind) {
    case 'track':
      return `${item.video ? 'Video' : 'Song'} · ${artistNames(item.artists)}`
    case 'artist':
      return 'Artist'
    case 'album':
      return [item.year, item.albumType === 'Album' ? artistNames(item.artists) : item.albumType]
        .filter(Boolean)
        .join(' · ')
    case 'playlist':
      return [item.owner, item.meta].filter(Boolean).join(' · ') || 'Playlist'
  }
}

/** A sharp copy of YouTube Music art at `px` (lh3/yt3 serve any size). */
export function artAt(url: string, px: number): string {
  if (!url) return ''
  if (/googleusercontent\.com|ggpht\.com/.test(url)) {
    if (/=w\d+-h\d+/.test(url)) return url.replace(/=w\d+-h\d+/, `=w${px}-h${px}`)
    if (/=s\d+/.test(url)) return url.replace(/=s\d+/, `=s${px}`)
  }
  return url
}

/** What the queue stores for a catalog song. */
export function trackToQueueInput(track: CatalogTrack, nickname: string, mode: QueueInsertMode): AddTrackInput {
  return {
    video_id: track.videoId,
    title: track.title,
    channel_title: artistNames(track.artists) || 'Unknown artist',
    thumbnail_url: artAt(track.thumbnail, 226),
    added_by: nickname,
    insert_mode: mode,
    meta: {
      duration: track.duration ?? undefined,
      album: track.album?.name,
      artists: track.artists,
      explicit: track.explicit || undefined,
    },
  }
}
