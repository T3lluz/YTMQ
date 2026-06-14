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
  const data = await invokeSearch({ q: query, type })
  const results = data.results ?? []
  if (filter === 'song') {
    return results.filter((item) => item.type === 'song')
  }
  if (filter === 'artist') {
    return results.filter((item) => item.type === 'artist')
  }
  return results
}
