// LRCLIB provider — the existing client-side source, mirrored on the server
// so requests from regions that can't reach lrclib.net directly still get a
// result via Supabase's edge runtime.

import {
  fetchWithTimeout,
  safeJson,
  type LyricsQuery,
  type ProviderResult,
} from './types.ts'

const BASE = 'https://lrclib.net/api'

type LrclibRecord = {
  id: number
  trackName: string
  artistName: string
  albumName: string | null
  duration: number | null
  instrumental: boolean
  plainLyrics: string | null
  syncedLyrics: string | null
}

async function lrclibRequest(path: string): Promise<unknown> {
  const res = await fetchWithTimeout(`${BASE}${path}`, {
    headers: { Accept: 'application/json' },
    timeoutMs: 10_000,
  })
  if (res.status === 404) return null
  if (!res.ok) return null
  return safeJson(res)
}

function asRecords(value: unknown): LrclibRecord[] {
  if (Array.isArray(value)) return value as LrclibRecord[]
  if (value && typeof value === 'object') return [value as LrclibRecord]
  return []
}

function toResult(record: LrclibRecord): ProviderResult {
  return {
    source: 'lrclib',
    syncedLrc: record.syncedLyrics?.trim() || null,
    plain: record.plainLyrics?.trim() || null,
    instrumental: Boolean(record.instrumental),
    trackName: record.trackName,
    artistName: record.artistName,
    duration: record.duration ?? null,
  }
}

export async function searchLrclib(
  query: LyricsQuery,
): Promise<ProviderResult[]> {
  const tasks: Promise<LrclibRecord[]>[] = []

  if (query.artist && query.duration && query.duration > 0) {
    const sig = new URLSearchParams({
      artist_name: query.artist,
      track_name: query.title,
      album_name: query.album?.trim() ?? '',
      duration: String(Math.round(query.duration)),
    })
    tasks.push(
      lrclibRequest(`/get-cached?${sig}`)
        .then(asRecords)
        .catch(() => []),
    )
    tasks.push(
      lrclibRequest(`/get?${sig}`)
        .then((v) => (v ? [v as LrclibRecord] : []))
        .catch(() => []),
    )
  }

  const exact = new URLSearchParams({ track_name: query.title })
  if (query.artist) exact.set('artist_name', query.artist)
  tasks.push(
    lrclibRequest(`/search?${exact}`)
      .then(asRecords)
      .catch(() => []),
  )

  const loose = new URLSearchParams({
    q: query.artist ? `${query.title} ${query.artist}` : query.title,
  })
  tasks.push(
    lrclibRequest(`/search?${loose}`)
      .then(asRecords)
      .catch(() => []),
  )

  const all = (await Promise.all(tasks)).flat()
  return all.map(toResult)
}
