import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import {
  ARTIST_TRACKS_LIMIT,
  fetchYtmAlbumTracks,
  fetchYtmArtistDetail,
  fetchYtmArtistTracks,
  fetchYtmCharts,
  fetchYtmDiscover,
  fetchYtmMoodPlaylists,
  fetchYtmPlaylistTracks,
  SEARCH_ALL_LIMIT,
  SEARCH_ARTIST_LIMIT,
  SEARCH_SONG_LIMIT,
  searchYtmAll,
  searchYtmArtists,
  searchYtmSongs,
  type YtmSearchResult,
} from './ytmusic.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

type SearchType =
  | 'song'
  | 'artist'
  | 'all'
  | 'channel_tracks'
  | 'artist_detail'
  | 'album_tracks'
  | 'discover'
  | 'charts'
  | 'playlist_tracks'
  | 'mood_playlists'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function parseRequest(req: Request): {
  q: string
  type: SearchType
  channelId?: string
  browseId?: string
} {
  const url = new URL(req.url)
  if (req.method === 'GET') {
    return {
      q: url.searchParams.get('q')?.trim() ?? '',
      type: (url.searchParams.get('type') as SearchType) ?? 'all',
      channelId: url.searchParams.get('channelId') ?? undefined,
      browseId: url.searchParams.get('browseId') ?? undefined,
    }
  }

  return {
    q: '',
    type: 'all',
  }
}

async function parseBody(req: Request): Promise<{
  q: string
  type: SearchType
  channelId?: string
  browseId?: string
  country?: string
  params?: string
  limit?: number
}> {
  if (req.method === 'GET') {
    return parseRequest(req)
  }

  try {
    const body = (await req.json()) as {
      q?: string
      type?: SearchType
      channelId?: string
      browseId?: string
      country?: string
      params?: string
      limit?: number
    }
    return {
      q: body.q?.trim() ?? '',
      type: body.type ?? 'all',
      channelId: body.channelId,
      browseId: body.browseId,
      country: body.country,
      params: body.params,
      limit:
        typeof body.limit === 'number' && body.limit > 0
          ? Math.min(body.limit, 100)
          : undefined,
    }
  } catch {
    return parseRequest(req)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { q, type, channelId, browseId, country, params, limit } =
      await parseBody(req)

    if (type === 'discover') {
      const discover = await fetchYtmDiscover(country ?? 'ZZ')
      return jsonResponse(discover)
    }

    if (type === 'charts') {
      const charts = await fetchYtmCharts(country ?? 'ZZ')
      return jsonResponse(charts)
    }

    if (type === 'playlist_tracks') {
      if (!browseId) {
        return jsonResponse({ error: 'browseId is required' }, 400)
      }
      const results = await fetchYtmPlaylistTracks(browseId)
      return jsonResponse({ results })
    }

    if (type === 'mood_playlists') {
      if (!params) {
        return jsonResponse({ error: 'params is required' }, 400)
      }
      const playlists = await fetchYtmMoodPlaylists(params)
      return jsonResponse({ playlists })
    }

    if (type === 'channel_tracks') {
      if (!channelId) {
        return jsonResponse({ error: 'channelId is required' }, 400)
      }
      const results = await fetchYtmArtistTracks(
        channelId,
        limit ?? ARTIST_TRACKS_LIMIT,
      )
      return jsonResponse({ results })
    }

    if (type === 'artist_detail') {
      const id = browseId ?? channelId
      if (!id) {
        return jsonResponse({ error: 'browseId is required' }, 400)
      }
      const artist = await fetchYtmArtistDetail(id)
      return jsonResponse({ artist })
    }

    if (type === 'album_tracks') {
      if (!browseId) {
        return jsonResponse({ error: 'browseId is required' }, 400)
      }
      const results = await fetchYtmAlbumTracks(browseId)
      return jsonResponse({ results })
    }

    if (q.length < 2) {
      return jsonResponse({ results: [] })
    }

    let results: YtmSearchResult[] = []
    if (type === 'artist') {
      results = await searchYtmArtists(q, limit ?? SEARCH_ARTIST_LIMIT)
    } else if (type === 'song') {
      results = await searchYtmSongs(q, limit ?? SEARCH_SONG_LIMIT)
    } else {
      results = await searchYtmAll(q, limit ?? SEARCH_ALL_LIMIT)
    }

    return jsonResponse({ results })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search failed'
    return jsonResponse({ error: message }, 502)
  }
})
