import { supabase } from './supabase'

export type SearchResultItem = {
  id: string
  title: string
  channelTitle: string
  thumbnail: string
  type: 'song' | 'artist'
  subtitle?: string
}

export type SearchFilter = 'song' | 'artist'

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
