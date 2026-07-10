import { supabase } from './supabase'

export type SearchResultItem = {
  id: string
  title: string
  channelTitle: string
  thumbnail: string
  type: 'song' | 'artist'
  subtitle?: string
}

export type SearchFilter = 'all' | 'song' | 'artist'

type SearchResponse = {
  results?: SearchResultItem[]
  error?: string
}

const SEARCH_LIMITS: Record<SearchFilter, number> = {
  all: 60,
  song: 40,
  artist: 30,
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

/**
 * Search YouTube Music. `all` returns a Spotify-style mix of songs and
 * artists; `song`/`artist` narrow to a single type.
 */
export async function searchByFilter(
  query: string,
  filter: SearchFilter,
): Promise<SearchResultItem[]> {
  const type = filter === 'all' ? 'all' : filter
  const data = await invokeSearch({
    q: query,
    type,
    limit: SEARCH_LIMITS[filter],
  })
  const results = data.results ?? []
  if (filter === 'song') {
    return results.filter((item) => item.type === 'song')
  }
  if (filter === 'artist') {
    return results.filter((item) => item.type === 'artist')
  }
  return results
}

/** Load an artist's catalog (top songs) instead of a text search. */
export async function searchArtistTracks(
  browseId: string,
): Promise<SearchResultItem[]> {
  const data = await invokeSearch({
    type: 'channel_tracks',
    channelId: browseId,
    limit: 80,
  })
  return (data.results ?? []).filter((item) => item.type === 'song')
}
