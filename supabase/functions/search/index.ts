import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const YOUTUBE_API = 'https://www.googleapis.com/youtube/v3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

type SearchType = 'song' | 'artist' | 'channel_tracks'

type SearchResult = {
  id: string
  title: string
  channelTitle: string
  thumbnail: string
  type: 'song' | 'artist'
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function pickThumbnail(thumbnails: Record<string, { url?: string }> | undefined) {
  return (
    thumbnails?.medium?.url ??
    thumbnails?.default?.url ??
    ''
  )
}

async function youtubeGet(
  path: string,
  params: Record<string, string>,
  apiKey: string,
) {
  const url = new URL(`${YOUTUBE_API}${path}`)
  url.searchParams.set('key', apiKey)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }

  const res = await fetch(url)
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`YouTube API ${res.status}: ${detail.slice(0, 200)}`)
  }
  return res.json()
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

async function searchSongs(q: string, apiKey: string): Promise<SearchResult[]> {
  const data = await youtubeGet(
    '/search',
    {
      part: 'snippet',
      type: 'video',
      q,
      maxResults: '15',
      videoCategoryId: '10',
    },
    apiKey,
  )

  return (data.items ?? []).map(
    (item: {
      id: { videoId?: string }
      snippet: {
        title: string
        channelTitle: string
        thumbnails?: Record<string, { url?: string }>
      }
    }) => ({
      id: item.id.videoId ?? '',
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      thumbnail: pickThumbnail(item.snippet.thumbnails),
      type: 'song' as const,
    }),
  ).filter((row: SearchResult) => row.id.length > 0)
}

async function searchArtists(q: string, apiKey: string): Promise<SearchResult[]> {
  const data = await youtubeGet(
    '/search',
    {
      part: 'snippet',
      type: 'channel',
      q,
      maxResults: '10',
    },
    apiKey,
  )

  return (data.items ?? []).map(
    (item: {
      id: { channelId?: string }
      snippet: {
        title: string
        channelTitle: string
        thumbnails?: Record<string, { url?: string }>
      }
    }) => ({
      id: item.id.channelId ?? '',
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      thumbnail: pickThumbnail(item.snippet.thumbnails),
      type: 'artist' as const,
    }),
  ).filter((row: SearchResult) => row.id.length > 0)
}

async function searchChannelTracks(
  channelId: string,
  apiKey: string,
): Promise<SearchResult[]> {
  const data = await youtubeGet(
    '/search',
    {
      part: 'snippet',
      type: 'video',
      channelId,
      order: 'viewCount',
      maxResults: '12',
    },
    apiKey,
  )

  return (data.items ?? []).map(
    (item: {
      id: { videoId?: string }
      snippet: {
        title: string
        channelTitle: string
        thumbnails?: Record<string, { url?: string }>
      }
    }) => ({
      id: item.id.videoId ?? '',
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      thumbnail: pickThumbnail(item.snippet.thumbnails),
      type: 'song' as const,
    }),
  ).filter((row: SearchResult) => row.id.length > 0)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const apiKey = Deno.env.get('YOUTUBE_API_KEY')
  if (!apiKey) {
    return jsonResponse({ error: 'Search is not configured (missing API key)' }, 503)
  }

  try {
    const { q, type, channelId } = await parseBody(req)

    if (type === 'channel_tracks') {
      if (!channelId) {
        return jsonResponse({ error: 'channelId is required' }, 400)
      }
      const results = await searchChannelTracks(channelId, apiKey)
      return jsonResponse({ results })
    }

    if (q.length < 2) {
      return jsonResponse({ results: [] })
    }

    const results =
      type === 'artist'
        ? await searchArtists(q, apiKey)
        : await searchSongs(q, apiKey)

    return jsonResponse({ results })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search failed'
    return jsonResponse({ error: message }, 502)
  }
})
