import { supabase } from './supabase'

export type SearchResultItem = {
  id: string
  title: string
  channelTitle: string
  thumbnail: string
  type: 'song' | 'artist'
}

type SearchResponse = {
  results?: SearchResultItem[]
  error?: string
}

export async function searchYouTube(
  query: string,
  type: 'song' | 'artist',
): Promise<SearchResultItem[]> {
  const { data, error } = await supabase.functions.invoke<SearchResponse>(
    'search',
    { body: { q: query, type } },
  )

  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data?.results ?? []
}

export async function fetchArtistTracks(
  channelId: string,
): Promise<SearchResultItem[]> {
  const { data, error } = await supabase.functions.invoke<SearchResponse>(
    'search',
    { body: { type: 'channel_tracks', channelId } },
  )

  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data?.results ?? []
}
