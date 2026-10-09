// KuGou Music provider — another large LRC catalog used by several open-source
// "Spotify lyrics" projects. KuGou's lookup is a two-step process: first the
// song hash is resolved via its mobile search endpoint, then a separate KRC
// service trades the hash for a (lyric id, access key) pair that finally
// downloads the LRC.

import {
  fetchWithTimeout,
  safeJson,
  type LyricsQuery,
  type ProviderResult,
} from './types.ts'

const SEARCH_URL = 'https://mobilecdn.kugou.com/api/v3/search/song'
const KRC_SEARCH_URL = 'https://krcs.kugou.com/search'
const KRC_DOWNLOAD_URL = 'https://lyrics.kugou.com/download'

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
} as const

type KugouSong = {
  hash: string
  songname: string
  singername: string
  /** Track length in seconds. */
  duration: number
  album_name?: string
}

type KugouSearchResponse = {
  status: number
  data?: { info?: KugouSong[] }
}

type KrcCandidate = {
  id: number
  accesskey: string
  score: number
  duration: number
  /** Two-letter language code (e.g. "1" Chinese, "0" original). */
  language?: string
}

type KrcSearchResponse = {
  status: number
  candidates?: KrcCandidate[]
}

type KrcDownloadResponse = {
  status: number
  content?: string
  fmt?: string
}

function fold(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u30ff]+/g, ' ')
    .trim()
}

function matchScore(song: KugouSong, query: LyricsQuery): number {
  const folded = fold(`${song.songname} ${song.singername}`)
  const queryTitle = fold(query.title)
  const queryArtist = fold(query.artist)

  let score = 0
  if (queryTitle && folded.includes(queryTitle)) score += 40
  if (queryArtist && folded.includes(queryArtist)) score += 40

  if (queryTitle) {
    const titleTokens = queryTitle.split(' ').filter((t) => t.length > 1)
    const overlap = titleTokens.filter((t) => folded.includes(t)).length
    if (titleTokens.length > 0) {
      score += Math.round((overlap / titleTokens.length) * 25)
    }
  }

  if (query.duration != null && song.duration > 0) {
    const diff = Math.abs(song.duration - query.duration)
    score += Math.max(0, 25 - diff * 2)
  }

  return score
}

async function kugouSearch(query: LyricsQuery): Promise<KugouSong[]> {
  const q = [query.title, query.artist].filter(Boolean).join(' ').trim()
  if (!q) return []
  const params = new URLSearchParams({
    keyword: q,
    page: '1',
    pagesize: '10',
    showtype: '1',
  })
  const res = await fetchWithTimeout(`${SEARCH_URL}?${params}`, {
    headers: HEADERS,
    timeoutMs: 7_000,
  })
  if (!res.ok) return []
  const data = (await safeJson(res)) as KugouSearchResponse | null
  const songs = data?.data?.info ?? []
  return Array.isArray(songs) ? songs : []
}

async function findLyricToken(
  song: KugouSong,
  query: LyricsQuery,
): Promise<KrcCandidate | null> {
  const durationMs =
    (query.duration && query.duration > 0
      ? query.duration
      : song.duration) * 1000

  const params = new URLSearchParams({
    ver: '1',
    man: 'yes',
    client: 'mobi',
    keyword: `${song.singername} - ${song.songname}`,
    duration: String(durationMs),
    hash: song.hash,
  })

  const res = await fetchWithTimeout(`${KRC_SEARCH_URL}?${params}`, {
    headers: HEADERS,
    timeoutMs: 6_000,
  })
  if (!res.ok) return null
  const data = (await safeJson(res)) as KrcSearchResponse | null
  const candidates = data?.candidates ?? []
  if (candidates.length === 0) return null
  return candidates.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0] ?? null
}

async function downloadLyric(candidate: KrcCandidate): Promise<string | null> {
  const params = new URLSearchParams({
    ver: '1',
    client: 'pc',
    fmt: 'lrc',
    charset: 'utf8',
    id: String(candidate.id),
    accesskey: candidate.accesskey,
  })
  const res = await fetchWithTimeout(`${KRC_DOWNLOAD_URL}?${params}`, {
    headers: HEADERS,
    timeoutMs: 6_000,
  })
  if (!res.ok) return null
  const data = (await safeJson(res)) as KrcDownloadResponse | null
  if (!data?.content) return null
  try {
    // KuGou returns lyrics base64-encoded.
    const decoded = atob(data.content)
    // atob produces a binary string; reinterpret it as UTF-8.
    const bytes = new Uint8Array(decoded.length)
    for (let i = 0; i < decoded.length; i += 1) bytes[i] = decoded.charCodeAt(i)
    return new TextDecoder('utf-8').decode(bytes)
  } catch {
    return null
  }
}

function lrcToPlain(lrc: string): string {
  return lrc
    .split(/\r?\n/)
    .map((line) => line.replace(/\[[^\]]*\]/g, '').trim())
    .filter((line) => line.length > 0)
    .join('\n')
}

function toResult(song: KugouSong, lrc: string): ProviderResult {
  const hasTimestamps = /\[\d{1,2}:\d{1,2}/.test(lrc)
  return {
    source: 'kugou',
    syncedLrc: hasTimestamps ? lrc : null,
    plain: hasTimestamps ? lrcToPlain(lrc) : lrc.trim() || null,
    instrumental: false,
    trackName: song.songname,
    artistName: song.singername,
    duration: song.duration > 0 ? song.duration : null,
  }
}

export async function searchKugou(
  query: LyricsQuery,
): Promise<ProviderResult[]> {
  let songs: KugouSong[]
  try {
    songs = await kugouSearch(query)
  } catch {
    return []
  }
  if (songs.length === 0) return []

  const ranked = songs
    .map((song) => ({ song, score: matchScore(song, query) }))
    .filter((entry) => entry.score > 20)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)

  if (ranked.length === 0) return []

  const results = await Promise.all(
    ranked.map(async ({ song }) => {
      try {
        const token = await findLyricToken(song, query)
        if (!token) return null
        const lrc = await downloadLyric(token)
        if (!lrc) return null
        return toResult(song, lrc)
      } catch {
        return null
      }
    }),
  )

  return results.filter((r): r is ProviderResult => r !== null)
}
