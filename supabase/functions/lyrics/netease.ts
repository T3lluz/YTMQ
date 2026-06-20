// NetEase Cloud Music provider — a massive synced-LRC catalog that covers
// Western, K-pop, J-pop and Mandarin tracks. This is the same upstream that
// open-source "Spotify lyrics" projects (syrics, spotify-lyrics-api, spicetify)
// rely on for high-quality time-synced lyrics.
//
// NetEase doesn't ship CORS headers, so it has to be proxied through the edge
// function. Requests must include a `Referer` of music.163.com and a normal
// browser User-Agent or the search endpoint silently returns empty.

import {
  fetchWithTimeout,
  safeJson,
  type LyricsQuery,
  type ProviderResult,
} from './types.ts'

const SEARCH_URL = 'https://music.163.com/api/search/get/web'
const LYRIC_URL = 'https://music.163.com/api/song/lyric'

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  Referer: 'https://music.163.com/',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
} as const

type NeteaseArtist = { id: number; name: string }
type NeteaseAlbum = { id: number; name: string }
type NeteaseSong = {
  id: number
  name: string
  artists: NeteaseArtist[]
  album: NeteaseAlbum | null
  /** Duration in milliseconds. */
  duration: number
}
type NeteaseSearchResponse = {
  result?: { songs?: NeteaseSong[] }
  code?: number
}
type NeteaseLyricResponse = {
  lrc?: { lyric?: string }
  klyric?: { lyric?: string }
  tlyric?: { lyric?: string }
  nolyric?: boolean
  uncollected?: boolean
}

/** Cheap fold — strip diacritics, lowercase, collapse whitespace. */
function fold(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u30ff]+/g, ' ')
    .trim()
}

function durationSeconds(song: NeteaseSong): number | null {
  return song.duration ? Math.round(song.duration / 1000) : null
}

/**
 * Rank a NetEase search hit by how closely it matches the query. Producers,
 * remixes and the wrong language often share titles, so we filter aggressively
 * before requesting lyrics.
 */
function matchScore(song: NeteaseSong, query: LyricsQuery): number {
  const folded = fold(`${song.name} ${song.artists.map((a) => a.name).join(' ')}`)
  const queryTitle = fold(query.title)
  const queryArtist = fold(query.artist)

  let score = 0
  if (queryTitle && folded.includes(queryTitle)) score += 40
  if (queryArtist && folded.includes(queryArtist)) score += 40

  // Partial title token coverage — handles "Title (Remix)" vs "Title".
  if (queryTitle) {
    const titleTokens = queryTitle.split(' ').filter((t) => t.length > 1)
    const overlap = titleTokens.filter((t) => folded.includes(t)).length
    if (titleTokens.length > 0) {
      score += Math.round((overlap / titleTokens.length) * 25)
    }
  }

  if (query.duration != null) {
    const d = durationSeconds(song)
    if (d != null) {
      const diff = Math.abs(d - query.duration)
      score += Math.max(0, 25 - diff * 2)
    }
  }

  return score
}

async function neteaseSearch(query: LyricsQuery): Promise<NeteaseSong[]> {
  const q = [query.title, query.artist].filter(Boolean).join(' ').trim()
  if (!q) return []

  const body = new URLSearchParams({
    s: q,
    type: '1',
    offset: '0',
    limit: '10',
  })

  const res = await fetchWithTimeout(SEARCH_URL, {
    method: 'POST',
    headers: {
      ...HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
    timeoutMs: 7_000,
  })
  if (!res.ok) return []
  const data = (await safeJson(res)) as NeteaseSearchResponse | null
  const songs = data?.result?.songs ?? []
  return Array.isArray(songs) ? songs : []
}

async function neteaseLyric(songId: number): Promise<NeteaseLyricResponse | null> {
  const params = new URLSearchParams({
    id: String(songId),
    lv: '-1',
    kv: '-1',
    tv: '-1',
    os: 'pc',
  })
  const res = await fetchWithTimeout(`${LYRIC_URL}?${params}`, {
    headers: HEADERS,
    timeoutMs: 7_000,
  })
  if (!res.ok) return null
  return (await safeJson(res)) as NeteaseLyricResponse | null
}

/**
 * Convert a NetEase LRC to a plain-text fallback by stripping every timestamp
 * tag. Used when the provider has lyrics but the requesting client only wants
 * to display the plain version.
 */
function lrcToPlain(lrc: string): string {
  return lrc
    .split(/\r?\n/)
    .map((line) => line.replace(/\[[^\]]*\]/g, '').trim())
    .filter((line) => line.length > 0)
    .join('\n')
}

function toResult(song: NeteaseSong, lyric: NeteaseLyricResponse): ProviderResult {
  const lrc = lyric.lrc?.lyric?.trim() || null
  // Treat songs with only metadata-style timestamps (no real lines) as having
  // no synced lyrics so the aggregator can prefer a real synced source.
  const hasTimestamps = lrc ? /\[\d{1,2}:\d{1,2}/.test(lrc) : false
  const synced = hasTimestamps ? lrc : null
  const plain = lrc && !hasTimestamps ? lrc : lrc ? lrcToPlain(lrc) : null

  return {
    source: 'netease',
    syncedLrc: synced,
    plain,
    instrumental: Boolean(lyric.nolyric),
    trackName: song.name,
    artistName: song.artists.map((a) => a.name).join(', '),
    duration: durationSeconds(song),
  }
}

/**
 * Find the best NetEase lyrics for a track. The search returns multiple
 * candidates; we score them locally, then request lyrics for the top match
 * (and the runner-up if the top has no synced content) so we don't fire
 * lyric requests for every result.
 */
export async function searchNetease(
  query: LyricsQuery,
): Promise<ProviderResult[]> {
  let songs: NeteaseSong[]
  try {
    songs = await neteaseSearch(query)
  } catch {
    return []
  }
  if (songs.length === 0) return []

  const ranked = songs
    .map((song) => ({ song, score: matchScore(song, query) }))
    .filter((entry) => entry.score > 20)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)

  if (ranked.length === 0) return []

  const results = await Promise.all(
    ranked.map(async ({ song }) => {
      try {
        const lyric = await neteaseLyric(song.id)
        if (!lyric) return null
        return toResult(song, lyric)
      } catch {
        return null
      }
    }),
  )

  return results.filter((r): r is ProviderResult => r !== null)
}
