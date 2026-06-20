// `lyrics` edge function — aggregates multiple lyrics providers behind a
// single endpoint so the client gets the broadest possible catalog with one
// network round-trip. The browser-side `fetchLyrics` still hits LRCLIB
// directly for the fastest happy-path; this function adds NetEase + KuGou
// coverage (the upstream sources used by unofficial Spotify lyrics tools)
// for everything LRCLIB doesn't have.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import { searchLrclib } from './lrclib.ts'
import { searchKugou } from './kugou.ts'
import { searchNetease } from './netease.ts'
import {
  hasContent,
  scoreResult,
  type LyricsQuery,
  type ProviderName,
  type ProviderResult,
} from './types.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

type Body = {
  title?: string
  artist?: string
  album?: string
  duration?: number | string
  /** Optional comma-separated subset of providers to consult. */
  sources?: string
}

type SerializedLyrics = {
  source: ProviderName
  /** Raw LRC string with timestamps when synced lyrics are available. */
  syncedLrc: string | null
  plain: string | null
  instrumental: boolean
  trackName: string
  artistName: string
  duration: number | null
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function parseDuration(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value
  }
  if (typeof value === 'string') {
    const n = Number.parseFloat(value)
    if (Number.isFinite(n) && n > 0) return n
  }
  return undefined
}

async function readInput(req: Request): Promise<{
  query: LyricsQuery
  sources: Set<ProviderName>
}> {
  const url = new URL(req.url)
  const fromQuery: Body = {
    title: url.searchParams.get('title') ?? undefined,
    artist: url.searchParams.get('artist') ?? undefined,
    album: url.searchParams.get('album') ?? undefined,
    duration: url.searchParams.get('duration') ?? undefined,
    sources: url.searchParams.get('sources') ?? undefined,
  }

  let body: Body = {}
  if (req.method === 'POST') {
    try {
      body = ((await req.json()) as Body) ?? {}
    } catch {
      body = {}
    }
  }

  const merged: Body = { ...fromQuery, ...body }
  const title = (merged.title ?? '').trim()
  const artist = (merged.artist ?? '').trim()
  const album = merged.album?.trim() || undefined
  const duration = parseDuration(merged.duration)

  const requested = (merged.sources ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean) as ProviderName[]
  const allowed: ProviderName[] = ['lrclib', 'netease', 'kugou']
  const sources = new Set<ProviderName>(
    requested.length > 0
      ? requested.filter((s): s is ProviderName => allowed.includes(s))
      : allowed,
  )

  return {
    query: { title, artist, album, duration },
    sources,
  }
}

function serialize(result: ProviderResult): SerializedLyrics {
  return {
    source: result.source,
    syncedLrc: result.syncedLrc,
    plain: result.plain,
    instrumental: result.instrumental,
    trackName: result.trackName,
    artistName: result.artistName,
    duration: result.duration,
  }
}

/**
 * Race the configured providers and return as soon as any of them yields
 * time-synced lyrics. Plain-only and instrumental results are kept around so
 * we can still return *something* if no provider had a synced match.
 */
async function aggregate(
  query: LyricsQuery,
  sources: Set<ProviderName>,
): Promise<ProviderResult | null> {
  const tasks: Promise<ProviderResult[]>[] = []
  if (sources.has('lrclib')) tasks.push(searchLrclib(query).catch(() => []))
  if (sources.has('netease')) tasks.push(searchNetease(query).catch(() => []))
  if (sources.has('kugou')) tasks.push(searchKugou(query).catch(() => []))

  if (tasks.length === 0) return null

  const pooled: ProviderResult[] = []

  // Resolve as soon as the first synced result lands; otherwise wait for all
  // tasks so we can fall back to the best plain match.
  const syncedWinner = await new Promise<ProviderResult | null>((resolve) => {
    let remaining = tasks.length
    let settled = false
    const finish = (value: ProviderResult | null) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    for (const task of tasks) {
      task
        .then((results) => {
          if (settled) return
          for (const r of results) {
            if (hasContent(r)) pooled.push(r)
          }
          const synced = results.filter(
            (r) => r.syncedLrc && hasContent(r),
          )
          if (synced.length > 0) {
            finish(bestOf(synced, query))
            return
          }
          remaining -= 1
          if (remaining === 0) finish(null)
        })
        .catch(() => {
          if (settled) return
          remaining -= 1
          if (remaining === 0) finish(null)
        })
    }
  })

  if (syncedWinner) return syncedWinner
  if (pooled.length === 0) return null
  return bestOf(pooled, query)
}

function bestOf(
  results: ProviderResult[],
  query: LyricsQuery,
): ProviderResult {
  return results.reduce((best, current) =>
    scoreResult(current, query) > scoreResult(best, query) ? current : best,
  )
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { query, sources } = await readInput(req)
    if (!query.title) {
      return jsonResponse({ lyrics: null, error: 'title is required' }, 400)
    }

    const best = await aggregate(query, sources)
    return jsonResponse({ lyrics: best ? serialize(best) : null })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'lyrics lookup failed'
    return jsonResponse({ lyrics: null, error: message }, 502)
  }
})
