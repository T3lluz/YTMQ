import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import {
  fetchYtmAlbumTracks,
  fetchYtmArtistDetail,
  fetchYtmArtistTracks,
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
    }
    return {
      q: body.q?.trim() ?? '',
      type: body.type ?? 'all',
      channelId: body.channelId,
      browseId: body.browseId,
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
    const { q, type, channelId, browseId } = await parseBody(req)

    if (type === 'channel_tracks') {
      if (!channelId) {
        return jsonResponse({ error: 'channelId is required' }, 400)
      }
      const results = await fetchYtmArtistTracks(channelId)
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
      results = await searchYtmArtists(q)
    } else if (type === 'song') {
      results = await searchYtmSongs(q)
    } else {
      results = await searchYtmAll(q)
    }

    return jsonResponse({ results })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search failed'
    return jsonResponse({ error: message }, 502)
  }
})
