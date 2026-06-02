import { supabase } from './supabase'

export type SearchResultItem = {
  id: string
  title: string
  channelTitle: string
  thumbnail: string
  type: 'song' | 'artist' | 'album'
  subtitle?: string
}

export type ArtistDetail = {
  id: string
  title: string
  thumbnail: string
  songs: SearchResultItem[]
  albums: SearchResultItem[]
}

type SearchResponse = {
  results?: SearchResultItem[]
  artist?: ArtistDetail
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

export async function searchYouTube(query: string): Promise<SearchResultItem[]> {
  let unified: SearchResultItem[] = []
  try {
    const data = await invokeSearch({ q: query, type: 'all' })
    unified = data.results ?? []
  } catch {
    /* old deployments may not support type=all */
  }

  if (unified.length && unified.some((item) => item.type === 'artist')) {
    return unified
  }

  const [songs, artists] = await Promise.all([
    invokeSearch({ q: query, type: 'song' }),
    invokeSearch({ q: query, type: 'artist' }),
  ])
  const seen = new Set<string>()
  const merged: SearchResultItem[] = []
  for (const item of [...(songs.results ?? []), ...(artists.results ?? [])]) {
    const key = `${item.type}:${item.id}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(item)
  }
  return merged
}

export async function fetchArtistDetail(
  browseId: string,
): Promise<ArtistDetail> {
  try {
    const data = await invokeSearch({ type: 'artist_detail', browseId })
    if (data.artist) return data.artist
  } catch {
    /* fall back to top tracks only */
  }

  const tracks = await invokeSearch({ type: 'channel_tracks', channelId: browseId })
  return {
    id: browseId,
    title: 'Artist',
    thumbnail: '',
    songs: tracks.results ?? [],
    albums: [],
  }
}

export async function fetchAlbumTracks(
  browseId: string,
): Promise<SearchResultItem[]> {
  const data = await invokeSearch({ type: 'album_tracks', browseId })
  return data.results ?? []
}
