// Synced lyrics aggregator.
//
// Two data paths run in parallel for the best of both worlds:
//
// 1. **LRCLIB direct**  — the browser hits https://lrclib.net/api straight
//    away. It's the fastest path when LRCLIB has the song, and it works
//    independently of any backend deploy state.
// 2. **Supabase `lyrics` edge function** — proxies extra providers that don't
//    ship CORS headers (NetEase Cloud Music, KuGou Music). These cover huge
//    swathes of music LRCLIB doesn't (K-pop, J-pop, indie, remixes, Mandarin
//    pop, plus a lot of Western tracks). They're the same upstream sources
//    that unofficial Spotify lyrics tools use to ship synced lyrics for
//    practically every Spotify song.
//
// The first track to yield time-synced lyrics wins; if no source had a synced
// match we settle for the best plain/instrumental result. The whole API
// surface stays the same as before, so callers don't change.

import { isSupabaseConfigured, supabase } from './supabase'

const LRCLIB_BASE = 'https://lrclib.net/api'

/** A single timestamped lyric line. `time` is seconds from the track start. */
export type LyricLine = {
  time: number
  text: string
}

export type Lyrics = {
  /** Time-synced lines (sorted by time). Empty when only plain lyrics exist. */
  synced: LyricLine[]
  /** Full plain-text lyrics, when available. */
  plain: string | null
  instrumental: boolean
  trackName: string
  artistName: string
  /** Provider that supplied the matched lyrics. */
  source: LyricsSource
}

export type LyricsSource = 'musixmatch' | 'lrclib' | 'netease' | 'kugou'

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

type AggregatedRecord = {
  source: LyricsSource
  syncedLrc: string | null
  plain: string | null
  instrumental: boolean
  trackName: string
  artistName: string
  duration: number | null
}

export type LyricsQuery = {
  title: string
  artist: string
  album?: string
  /** Track length in seconds — greatly improves match accuracy on /api/get. */
  duration?: number
}

const TIMESTAMP_RE = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g

/**
 * Parse an LRC string into sorted, de-duplicated timestamped lines.
 * Handles multiple timestamps on one line (e.g. repeated choruses) and
 * skips metadata tags like `[ar:...]` / `[length:...]`.
 */
export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = []

  for (const raw of lrc.split(/\r?\n/)) {
    TIMESTAMP_RE.lastIndex = 0
    const stamps: number[] = []
    let match: RegExpExecArray | null
    while ((match = TIMESTAMP_RE.exec(raw)) !== null) {
      const minutes = Number.parseInt(match[1]!, 10)
      const seconds = Number.parseInt(match[2]!, 10)
      const fracRaw = match[3] ?? ''
      const frac = fracRaw ? Number.parseInt(fracRaw, 10) / 10 ** fracRaw.length : 0
      if (Number.isFinite(minutes) && Number.isFinite(seconds)) {
        stamps.push(minutes * 60 + seconds + frac)
      }
    }
    if (stamps.length === 0) continue

    const text = raw.replace(TIMESTAMP_RE, '').trim()
    for (const time of stamps) {
      lines.push({ time, text })
    }
  }

  lines.sort((a, b) => a.time - b.time)
  return lines
}

function recordToAggregated(record: LrclibRecord): AggregatedRecord {
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

function aggregatedToLyrics(record: AggregatedRecord): Lyrics {
  const synced = record.syncedLrc ? parseLrc(record.syncedLrc) : []
  return {
    synced,
    plain: record.plain,
    instrumental: record.instrumental,
    trackName: record.trackName,
    artistName: record.artistName,
    source: record.source,
  }
}

/**
 * Normalise a YouTube/YT-Music video title into a plain song title.
 * Strips common decorations ("(Official Video)", "[Lyrics]", "feat. …", …)
 * that would otherwise prevent a lyrics match.
 */
export function cleanTitle(title: string): string {
  let out = title

  // Drop bracketed/parenthesised decorations that aren't part of the song name.
  out = out.replace(
    /[([][^)\]]*(official|video|audio|lyric|visualizer|visualiser|mv|m\/v|hd|hq|4k|remaster(?:ed)?|explicit|clean|color\s*coded)[^)\]]*[)\]]/gi,
    '',
  )

  // "feat./ft./featuring …" up to the next bracket or end.
  out = out.replace(/\s*[([]?\s*(?:feat\.?|ft\.?|featuring)\s+[^)\]]*[)\]]?/gi, '')

  // Trailing "Official Video"-style suffixes without brackets.
  out = out.replace(/[-–|]\s*(official\s*)?(music\s*)?(video|audio|lyrics?)\s*$/gi, '')

  return out.replace(/\s{2,}/g, ' ').trim()
}

/** Normalise an artist string ("Artist - Topic", "A, B & C" → "A"). */
export function cleanArtist(artist: string): string {
  let out = artist.replace(/\s*-\s*topic\s*$/i, '')
  // First credited artist only — improves DB matching.
  out = out.split(/\s*(?:,|&|feat\.?|ft\.?|featuring|x|×)\s+/i)[0] ?? out
  return out.replace(/\s{2,}/g, ' ').trim()
}

/**
 * Split a combined "Artist - Title" video title into parts when the artist
 * field is empty (common for plain YouTube uploads).
 */
function splitArtistTitle(title: string): { artist?: string; title: string } {
  const m = title.match(/^\s*(.+?)\s+[-–—]\s+(.+?)\s*$/)
  if (m) return { artist: m[1]!.trim(), title: m[2]!.trim() }
  return { title: title.trim() }
}

// LRCLIB's `/search` endpoint regularly takes 6–8 s under normal load, so the
// DB timeout must be generous enough to let those responses land. The previous
// 6 s limit caused every search request to be aborted just before the data
// arrived, silently producing "no lyrics found" for songs that do have lyrics.
// `/api/get` can synchronously scrape slow external sources and gets an even
// larger — but still bounded — budget.
const DB_TIMEOUT_MS = 10_000
const SCRAPE_TIMEOUT_MS = 12_000
const EDGE_TIMEOUT_MS = 14_000

async function getJson(
  url: string,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<unknown> {
  // Race the request against a local timeout so a slow/hung endpoint can't
  // block lyrics from appearing. The caller's `signal` still cancels too.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const onAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }

  try {
    // Only the `Accept` header is sent (a CORS-safelisted header) so requests
    // stay "simple" and skip the OPTIONS preflight round-trip — every saved
    // round-trip makes lyrics show up faster.
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`LRCLIB request failed (${res.status})`)
    return await res.json()
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

function asRecords(value: unknown): LrclibRecord[] {
  if (Array.isArray(value)) return value as LrclibRecord[]
  if (value && typeof value === 'object') return [value as LrclibRecord]
  return []
}

function hasContent(record: AggregatedRecord | null): record is AggregatedRecord {
  return Boolean(
    record && (record.syncedLrc || record.plain || record.instrumental),
  )
}

function scoreAggregated(record: AggregatedRecord, duration?: number): number {
  let score = 0
  if (record.syncedLrc) score += 100
  else if (record.plain) score += 20
  if (record.instrumental) score += 5
  if (duration != null && record.duration != null) {
    const diff = Math.abs(record.duration - duration)
    score += Math.max(0, 30 - diff * 3)
  }
  return score
}

type EdgeLyricsResponse = {
  lyrics?: AggregatedRecord | null
  error?: string
}

/**
 * Call the Supabase `lyrics` edge function that aggregates NetEase + KuGou
 * + (as a safety net) server-side LRCLIB. Returns `null` if Supabase isn't
 * configured, the function isn't deployed, or the call fails — callers should
 * always treat this as a best-effort enhancement on top of the direct LRCLIB
 * path.
 */
async function fetchFromEdge(
  query: LyricsQuery,
  signal?: AbortSignal,
): Promise<AggregatedRecord | null> {
  if (!isSupabaseConfigured) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), EDGE_TIMEOUT_MS)
  const onAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }

  try {
    const { data, error } = await supabase.functions.invoke<EdgeLyricsResponse>(
      'lyrics',
      {
        body: {
          title: query.title,
          artist: query.artist,
          album: query.album,
          duration: query.duration,
        },
      },
    )
    if (error) return null
    const lyrics = data?.lyrics
    if (!lyrics) return null
    if (!hasContent(lyrics)) return null
    return lyrics
  } catch {
    return null
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/**
 * Fetch the best available lyrics for a track. Direct LRCLIB lookups and the
 * Supabase aggregator (NetEase + KuGou + server-side LRCLIB) run in parallel;
 * the first source to return time-synced lyrics wins, otherwise we settle for
 * the highest-scoring plain/instrumental match.
 *
 * Speed strategy:
 * 1. All fast internal-DB lookups (`/get-cached` + two `/search` variants) fire
 *    simultaneously alongside the Supabase aggregator and resolve the moment
 *    any of them yields time-synced lyrics — the common case still resolves
 *    in a single round-trip.
 * 2. The slow `/api/get` scraper is also fired immediately in parallel, but
 *    cancelled the instant something better lands. This means the worst-case
 *    fallback is just the slowest single provider rather than the sum of all
 *    of them.
 */
export async function fetchLyrics(
  query: LyricsQuery,
  signal?: AbortSignal,
): Promise<Lyrics | null> {
  const fallback = splitArtistTitle(query.title)
  const artist = cleanArtist(query.artist || fallback.artist || '')
  const title = cleanTitle(query.artist ? query.title : fallback.title)

  if (!title) return null

  const normalised: LyricsQuery = {
    title,
    artist,
    album: query.album,
    duration: query.duration,
  }

  const checkAbort = () => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  }

  // Full "signature" params (artist + title + duration) are used for the
  // exact-match cache endpoint and enable the best disambiguation on /get.
  const hasSignature = Boolean(artist && query.duration && query.duration > 0)
  const signatureParams = hasSignature
    ? new URLSearchParams({
        artist_name: artist,
        track_name: title,
        // Empty string is a better fallback than the track title so we don't
        // accidentally poison the exact-match cache with the wrong album key.
        album_name: query.album?.trim() ?? '',
        duration: String(Math.round(query.duration!)),
      })
    : null

  // When duration is unknown we can still call /api/get with just artist +
  // title. The match is less precise but far better than silently returning
  // "no lyrics found" for a song that's clearly in the LRCLIB database.
  const scraperParams: URLSearchParams | null = signatureParams
    ? signatureParams
    : artist
      ? new URLSearchParams({ artist_name: artist, track_name: title })
      : null

  const exactParams = new URLSearchParams({ track_name: title })
  if (artist) exactParams.set('artist_name', artist)
  const looseParams = new URLSearchParams({
    q: artist ? `${title} ${artist}` : title,
  })

  // Kick the slow external scraper off immediately so it runs in parallel with
  // the fast DB lookups. A dedicated AbortController lets us cancel it the
  // moment something else finds the lyrics, so we never block on it.
  let scraperController: AbortController | null = null
  let scraperPromise: Promise<AggregatedRecord | null> | null = null
  if (scraperParams) {
    scraperController = new AbortController()
    const onParentAbort = () => scraperController!.abort()
    if (signal) {
      if (signal.aborted) scraperController.abort()
      else signal.addEventListener('abort', onParentAbort, { once: true })
    }
    scraperPromise = getJson(
      `${LRCLIB_BASE}/get?${scraperParams}`,
      scraperController.signal,
      SCRAPE_TIMEOUT_MS,
    )
      .then((data) =>
        data ? recordToAggregated(data as LrclibRecord) : null,
      )
      .catch(() => null)
      .finally(() => signal?.removeEventListener('abort', onParentAbort))
  }

  // Tier 1 — internal-DB lookups + edge aggregator, all fired together.
  const tasks: Promise<AggregatedRecord[]>[] = [
    (getJson(`${LRCLIB_BASE}/search?${exactParams}`, signal, DB_TIMEOUT_MS)
      .then((data) => asRecords(data).map(recordToAggregated))
      .catch(() => [])) as Promise<AggregatedRecord[]>,
    (getJson(`${LRCLIB_BASE}/search?${looseParams}`, signal, DB_TIMEOUT_MS)
      .then((data) => asRecords(data).map(recordToAggregated))
      .catch(() => [])) as Promise<AggregatedRecord[]>,
    fetchFromEdge(normalised, signal)
      .then((rec) => (rec ? [rec] : []))
      .catch(() => []),
  ]
  if (signatureParams) {
    tasks.unshift(
      getJson(`${LRCLIB_BASE}/get-cached?${signatureParams}`, signal, DB_TIMEOUT_MS)
        .then((data) => asRecords(data).map(recordToAggregated))
        .catch(() => []),
    )
  }

  // Return the moment any source yields time-synced lyrics.
  const synced = await firstSyncedRecord(tasks, query.duration)
  checkAbort()
  if (synced) {
    scraperController?.abort()
    return aggregatedToLyrics(synced)
  }

  // No synced match yet: settle the remaining sources and take the best
  // plain / instrumental record they found between them.
  const settled = (await Promise.all(tasks)).flat()
  checkAbort()
  const best = pickBest(settled, query.duration)
  if (best) {
    scraperController?.abort()
    return aggregatedToLyrics(best)
  }

  // Nothing yet — await the LRCLIB scraper (already in-flight, may already
  // have a result by the time we get here).
  if (scraperPromise) {
    const scraped = await scraperPromise
    checkAbort()
    if (hasContent(scraped)) return aggregatedToLyrics(scraped)
  }

  return null
}

/**
 * Resolve with the highest-scoring record that carries time-synced lyrics as
 * soon as any task produces one, or null once every task has settled without a
 * synced match. Lets a fast lookup win without waiting on slower ones.
 */
function firstSyncedRecord(
  tasks: Promise<AggregatedRecord[]>[],
  duration?: number,
): Promise<AggregatedRecord | null> {
  if (tasks.length === 0) return Promise.resolve(null)
  return new Promise((resolve) => {
    let remaining = tasks.length
    let settled = false
    const done = (value: AggregatedRecord | null) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    for (const task of tasks) {
      task
        .then((records) => {
          if (settled) return
          const synced = records.filter((r) => r.syncedLrc && hasContent(r))
          if (synced.length > 0) {
            done(
              synced.reduce((best, current) =>
                scoreAggregated(current, duration) >
                scoreAggregated(best, duration)
                  ? current
                  : best,
              ),
            )
            return
          }
          remaining -= 1
          if (remaining === 0) done(null)
        })
        .catch(() => {
          if (settled) return
          remaining -= 1
          if (remaining === 0) done(null)
        })
    }
  })
}

/** Highest-scoring record that actually carries lyrics, or null if none do. */
function pickBest(
  records: AggregatedRecord[],
  duration?: number,
): AggregatedRecord | null {
  const withContent = records.filter(hasContent)
  if (withContent.length === 0) return null
  return withContent.reduce((best, current) =>
    scoreAggregated(current, duration) > scoreAggregated(best, duration)
      ? current
      : best,
  )
}

/**
 * Index of the active lyric line for a playback position, or -1 before the
 * first line. Lines are assumed sorted ascending by time.
 */
export function activeLineIndex(lines: LyricLine[], position: number): number {
  let lo = 0
  let hi = lines.length - 1
  let result = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid]!.time <= position + 0.15) {
      result = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return result
}
