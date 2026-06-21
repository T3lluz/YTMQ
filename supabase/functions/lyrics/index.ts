// `lyrics` edge function — aggregates multiple lyrics providers behind a
// single endpoint so the client gets the broadest possible catalog with one
// network round-trip. Musixmatch is the primary source (largest synced
// catalog), with LRCLIB / NetEase / KuGou as fallbacks for anything it can't
// fully sync. The browser-side `fetchLyrics` still hits LRCLIB directly in
// parallel for the fastest happy-path.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import { searchLrclib } from './lrclib.ts'
import { searchKugou } from './kugou.ts'
import { searchNetease } from './netease.ts'
import { searchMusixmatch } from './musixmatch.ts'
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
  const allowed: ProviderName[] = ['musixmatch', 'lrclib', 'netease', 'kugou']
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
 * Resolve lyrics with a Musixmatch-first strategy:
 *
 *   1. **Musixmatch** is the primary source — it has the largest synced-lyrics
 *      catalog. If it returns time-synced lyrics we use them immediately.
 *   2. Otherwise we fall back to the other providers (LRCLIB / NetEase /
 *      KuGou) and take the first one that yields synced lyrics. This is
 *      important because Musixmatch sometimes only exposes *plain* lyrics for
 *      a track that another provider has fully synced.
 *   3. If nobody has synced lyrics, we return the best plain / instrumental
 *      result gathered across every provider.
 *
 * Every provider is kicked off concurrently, so the fallback tier is already
 * in flight while we wait on the primary — there's no added latency in the
 * common case.
 */
async function aggregate(
  query: LyricsQuery,
  sources: Set<ProviderName>,
): Promise<ProviderResult | null> {
  const pooled: ProviderResult[] = []
  const collect = (results: ProviderResult[]) => {
    for (const r of results) if (hasContent(r)) pooled.push(r)
  }

  const mxmTask = sources.has('musixmatch')
    ? searchMusixmatch(query).catch(() => [])
    : null
  const fallbackTasks: Promise<ProviderResult[]>[] = []
  if (sources.has('lrclib')) fallbackTasks.push(searchLrclib(query).catch(() => []))
  if (sources.has('netease')) fallbackTasks.push(searchNetease(query).catch(() => []))
  if (sources.has('kugou')) fallbackTasks.push(searchKugou(query).catch(() => []))

  // Tier 1 — Musixmatch (primary). Use its synced lyrics straight away.
  if (mxmTask) {
    const results = await mxmTask
    collect(results)
    const synced = results.filter((r) => r.syncedLrc && hasContent(r))
    if (synced.length > 0) return bestOf(synced, query)
  }

  // Tier 2 — fall back to the other providers; first synced match wins.
  const syncedWinner = await firstSyncedRecord(fallbackTasks, query, collect)
  if (syncedWinner) return syncedWinner

  // Tier 3 — no synced lyrics anywhere; best plain / instrumental result.
  if (pooled.length === 0) return null
  return bestOf(pooled, query)
}

/**
 * Resolve with the best synced result as soon as any task produces one, or
 * null once every task settles without a synced match. Every task's results
 * are funnelled into {@link collect} so the caller can still fall back to the
 * best plain match.
 */
function firstSyncedRecord(
  tasks: Promise<ProviderResult[]>[],
  query: LyricsQuery,
  collect: (results: ProviderResult[]) => void,
): Promise<ProviderResult | null> {
  if (tasks.length === 0) return Promise.resolve(null)
  return new Promise((resolve) => {
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
          collect(results)
          if (settled) return
          const synced = results.filter((r) => r.syncedLrc && hasContent(r))
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
    // Lightweight observability: log the exact query + outcome so failed
    // lookups can be diagnosed from `supabase functions logs lyrics`.
    console.log(
      JSON.stringify({
        title: query.title,
        artist: query.artist,
        album: query.album ?? null,
        duration: query.duration ?? null,
        result: best
          ? {
              source: best.source,
              synced: Boolean(best.syncedLrc),
              plain: Boolean(best.plain),
              instrumental: best.instrumental,
            }
          : null,
      }),
    )
    return jsonResponse({ lyrics: best ? serialize(best) : null })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'lyrics lookup failed'
    return jsonResponse({ lyrics: null, error: message }, 502)
  }
})
