// `search` function: the YTMQ catalog over YouTube Music (catalog.ts).
//
//   { type: 'catalog', q, filter }       search; filter all|songs|artists|albums|playlists|videos
//   { type: 'suggest', q }               query completions
//   { type: 'artist_page', id }          artist page
//   { type: 'album_page', id }           album with its tracks
//   { type: 'playlist_page', id }        playlist with its tracks
//   { type: 'browse_home' }              trending, new releases, moods & genres
//   { type: 'mood', params }             playlists for a mood or genre tile
//   { type: 'radio', videoId }           related songs (smart shuffle)
//   { type: 'match', title, artist, duration }  the YouTube Music track for a song
//
// The older `all` / `song` / `artist` / `channel_tracks` types still answer
// in their old shape, for app tabs opened before a deploy.

import {
  albumPage,
  artistPage,
  browseHome,
  matchTrack,
  moodPage,
  playlistPage,
  radio,
  searchAll,
  searchFiltered,
  searchSuggestions,
  type CatalogItem,
  type CatalogTrack,
  type SearchFilter,
} from './catalog.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

type Body = {
  type?: string
  q?: string
  filter?: string
  id?: string
  channelId?: string
  browseId?: string
  params?: string
  videoId?: string
  title?: string
  artist?: string
  duration?: number
}

async function readBody(req: Request): Promise<Body> {
  if (req.method === 'GET') {
    const url = new URL(req.url)
    return Object.fromEntries(url.searchParams.entries()) as Body
  }
  try {
    return ((await req.json()) as Body) ?? {}
  } catch {
    return {}
  }
}

const FILTERS: SearchFilter[] = ['all', 'songs', 'artists', 'albums', 'playlists', 'videos']

/** The pre-catalog result shape: one flat list of songs and artists. */
function legacyItem(item: CatalogItem) {
  if (item.kind === 'track') {
    return {
      id: item.videoId,
      title: item.title,
      channelTitle: item.artists.map((a) => a.name).join(', ') || 'Unknown artist',
      thumbnail: item.thumbnail,
      type: 'song',
    }
  }
  if (item.kind === 'artist') {
    return { id: item.id, title: item.name, channelTitle: item.audience ?? item.name, thumbnail: item.thumbnail, type: 'artist' }
  }
  return null
}

async function legacy(body: Body): Promise<Response> {
  const q = (body.q ?? '').trim()
  if (body.type === 'channel_tracks') {
    const id = body.channelId ?? body.browseId
    if (!id) return jsonResponse({ error: 'channelId is required' }, 400)
    const page = await artistPage(id)
    const all = page.allTracksId ? (await playlistPage(page.allTracksId)).tracks : page.topTracks
    return jsonResponse({ results: all.map(legacyItem).filter(Boolean) })
  }
  if (q.length < 2) return jsonResponse({ results: [] })
  if (body.type === 'song') {
    return jsonResponse({ results: (await searchFiltered(q, 'songs')).map(legacyItem).filter(Boolean) })
  }
  if (body.type === 'artist') {
    return jsonResponse({ results: (await searchFiltered(q, 'artists')).map(legacyItem).filter(Boolean) })
  }
  const all = await searchAll(q)
  const items: CatalogItem[] = [...(all.top ? [all.top] : []), ...all.tracks, ...all.artists]
  const seen = new Set<string>()
  return jsonResponse({
    results: items
      .map(legacyItem)
      .filter((x): x is NonNullable<typeof x> => {
        if (!x || seen.has(`${x.type}:${x.id}`)) return false
        seen.add(`${x.type}:${x.id}`)
        return true
      }),
  })
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await readBody(req)
    const type = body.type ?? 'catalog'
    const q = (body.q ?? '').trim()

    switch (type) {
      case 'catalog': {
        const filter = FILTERS.includes(body.filter as SearchFilter) ? (body.filter as SearchFilter) : 'all'
        if (q.length < 1) return jsonResponse({ error: 'q is required' }, 400)
        if (filter === 'all') return jsonResponse({ result: await searchAll(q) })
        return jsonResponse({ items: await searchFiltered(q, filter) })
      }
      case 'suggest':
        return jsonResponse({ suggestions: q ? await searchSuggestions(q) : [] })
      case 'artist_page': {
        const id = body.id ?? body.browseId ?? body.channelId
        if (!id) return jsonResponse({ error: 'id is required' }, 400)
        return jsonResponse({ artist: await artistPage(id) })
      }
      case 'album_page':
        if (!body.id) return jsonResponse({ error: 'id is required' }, 400)
        return jsonResponse({ album: await albumPage(body.id) })
      case 'playlist_page':
        if (!body.id) return jsonResponse({ error: 'id is required' }, 400)
        return jsonResponse({ playlist: await playlistPage(body.id) })
      case 'browse_home':
      case 'discover':
        return jsonResponse({ home: await browseHome() })
      case 'mood':
      case 'mood_playlists':
        if (!body.params) return jsonResponse({ error: 'params is required' }, 400)
        return jsonResponse({ mood: await moodPage(body.params) })
      case 'radio':
        if (!body.videoId) return jsonResponse({ error: 'videoId is required' }, 400)
        return jsonResponse({ tracks: await radio(body.videoId) })
      case 'match': {
        if (!body.title) return jsonResponse({ error: 'title is required' }, 400)
        const track: CatalogTrack | null = await matchTrack(
          body.title,
          body.artist ?? '',
          typeof body.duration === 'number' ? body.duration : undefined,
        )
        return jsonResponse({ track })
      }
      case 'all':
      case 'song':
      case 'artist':
      case 'channel_tracks':
        return await legacy(body)
      default:
        return jsonResponse({ error: `Unknown type ${type}` }, 400)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search failed'
    return jsonResponse({ error: message }, 502)
  }
}
