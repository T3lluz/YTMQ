import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import {
  fetchYtmArtistTracks,
  searchYtmArtists,
  searchYtmSongs,
  type YtmSearchResult,
} from './ytmusic.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

type SearchType = 'song' | 'artist' | 'channel_tracks'

type SearchResult = YtmSearchResult

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
} {
  const url = new URL(req.url)
  if (req.method === 'GET') {
    return {
      q: url.searchParams.get('q')?.trim() ?? '',
      type: (url.searchParams.get('type') as SearchType) ?? 'song',
      channelId: url.searchParams.get('channelId') ?? undefined,
    }
  }

  return {
    q: '',
    type: 'song',
  }
}

async function parseBody(req: Request): Promise<{
  q: string
  type: SearchType
  channelId?: string
}> {
  if (req.method === 'GET') {
    return parseRequest(req)
  }

  try {
    const body = (await req.json()) as {
      q?: string
      type?: SearchType
      channelId?: string
    }
    return {
      q: body.q?.trim() ?? '',
      type: body.type ?? 'song',
      channelId: body.channelId,
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
    const { q, type, channelId } = await parseBody(req)

    if (type === 'channel_tracks') {
      if (!channelId) {
        return jsonResponse({ error: 'channelId is required' }, 400)
      }
      const results = await fetchYtmArtistTracks(channelId)
      return jsonResponse({ results })
    }

    if (q.length < 2) {
      return jsonResponse({ results: [] })
    }

    const results: SearchResult[] =
      type === 'artist'
        ? await searchYtmArtists(q)
        : await searchYtmSongs(q)

    return jsonResponse({ results })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search failed'
    return jsonResponse({ error: message }, 502)
  }
})
