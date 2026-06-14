import { supabase } from './supabase'
import {
  fetchDiscoverViaProxy,
  fetchMoodTracksViaProxy,
  fetchPlaylistTracksViaProxy,
  isDiscoverPayload,
} from './ytmusicDiscoverClient'

export type SearchResultItem = {
  id: string
  title: string
  channelTitle: string
  thumbnail: string
  type: 'song' | 'artist'
  subtitle?: string
}

export type SearchFilter = 'song' | 'artist'

export type ChartPlaylist = {
  title: string
  browseId: string
  thumbnail: string
}

export type MoodCategory = {
  title: string
  params: string
}

export type MoodSection = {
  title: string
  categories: MoodCategory[]
}

export type DiscoverFeed = {
  country: string
  countries: string[]
  trending: SearchResultItem[]
  charts: ChartPlaylist[]
  moods: MoodSection[]
}

export type ArtistDetail = {
  id: string
  title: string
  thumbnail: string
  songs: SearchResultItem[]
}

type SearchResponse = {
  results?: SearchResultItem[]
  artist?: ArtistDetail & { albums?: SearchResultItem[] }
  error?: string
}

async function invokeSearch(
  body: Record<string, unknown>,
): Promise<SearchResponse> {
  const { data, error } = await supabase.functions.invoke<SearchResponse>(
    'search',
    { body },
  )
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data ?? {}
}

function songsOnly(items: SearchResultItem[]): SearchResultItem[] {
  return items.filter((item) => item.type === 'song')
}

function songChartsOnly(charts: ChartPlaylist[]): ChartPlaylist[] {
  return charts.filter((chart) => {
    const t = chart.title.toLowerCase()
    return !/\bvideo\b|\bmv\b|\bshorts\b/.test(t)
  })
}

export async function searchByFilter(
  query: string,
  filter: SearchFilter,
): Promise<SearchResultItem[]> {
  const data = await invokeSearch({ q: query, type: filter })
  const results = data.results ?? []
  return filter === 'song' ? songsOnly(results) : results
}

export async function fetchArtistDetail(
  browseId: string,
): Promise<ArtistDetail> {
  try {
    const data = await invokeSearch({ type: 'artist_detail', browseId })
    if (data.artist) {
      return {
        id: data.artist.id,
        title: data.artist.title,
        thumbnail: data.artist.thumbnail,
        songs: songsOnly(data.artist.songs),
      }
    }
  } catch {
    /* fall back to top tracks only */
  }

  const tracks = await invokeSearch({ type: 'channel_tracks', channelId: browseId })
  return {
    id: browseId,
    title: 'Artist',
    thumbnail: '',
    songs: songsOnly(tracks.results ?? []),
  }
}

/** Best-effort ISO region from browser locale (e.g. en-US → US). */
export function guessCountryCode(): string {
  const locale = navigator.language || 'en-US'
  const region = locale.split('-')[1]
  if (region && /^[A-Za-z]{2}$/.test(region)) {
    return region.toUpperCase()
  }
  return 'ZZ'
}

export function countryLabel(code: string): string {
  if (code === 'ZZ') return 'Global'
  try {
    const label = new Intl.DisplayNames(['en'], { type: 'region' }).of(code)
    return label ?? code
  } catch {
    return code
  }
}

export async function fetchDiscover(
  country = 'ZZ',
): Promise<DiscoverFeed> {
  try {
    const data = await invokeSearch({ type: 'discover', country })
    if (isDiscoverPayload(data as Record<string, unknown>)) {
      const feed = data as DiscoverFeed
      return {
        country: feed.country ?? country,
        countries: feed.countries ?? [],
        trending: songsOnly(feed.trending ?? []),
        charts: songChartsOnly(feed.charts ?? []),
        moods: feed.moods ?? [],
      }
    }
  } catch {
    /* fall through to dev proxy */
  }

  if (import.meta.env.DEV) {
    return fetchDiscoverViaProxy(country)
  }

  throw new Error(
    'Charts and moods need an updated search edge function. Redeploy with: supabase functions deploy search',
  )
}

export async function fetchPlaylistTracks(
  browseId: string,
): Promise<SearchResultItem[]> {
  try {
    const data = await invokeSearch({ type: 'playlist_tracks', browseId })
    const tracks = songsOnly(data.results ?? [])
    if (tracks.length > 0) return tracks
  } catch {
    /* fall through */
  }

  if (import.meta.env.DEV) {
    return fetchPlaylistTracksViaProxy(browseId)
  }

  return []
}

export async function fetchMoodCategoryTracks(
  params: string,
): Promise<{ label: string; tracks: SearchResultItem[] }> {
  try {
    const moodData = await invokeSearch({ type: 'mood_playlists', params })
    const playlists = (moodData as { playlists?: ChartPlaylist[] }).playlists ?? []
    const first = playlists[0]
    if (first) {
      const tracks = await fetchPlaylistTracks(first.browseId)
      if (tracks.length > 0) {
        return { label: first.title, tracks }
      }
    }
  } catch {
    /* fall through */
  }

  if (import.meta.env.DEV) {
    return fetchMoodTracksViaProxy(params)
  }

  return { label: 'Browse', tracks: [] }
}
