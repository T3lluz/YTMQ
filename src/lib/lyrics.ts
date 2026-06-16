// Synced lyrics powered by LRCLIB (https://lrclib.net) — a free, open,
// no-API-key lyrics database that returns time-stamped (LRC) lyrics so the
// UI can follow the song live.

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
}

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

function toLyrics(record: LrclibRecord): Lyrics {
  const synced = record.syncedLyrics ? parseLrc(record.syncedLyrics) : []
  return {
    synced,
    plain: record.plainLyrics?.trim() || null,
    instrumental: Boolean(record.instrumental),
    trackName: record.trackName,
    artistName: record.artistName,
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

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  // Only the `Accept` header is sent (a CORS-safelisted header) so requests
  // stay "simple" and skip the OPTIONS preflight round-trip — every saved
  // round-trip makes lyrics show up faster.
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`LRCLIB request failed (${res.status})`)
  return res.json()
}

function hasContent(record: LrclibRecord | null): record is LrclibRecord {
  return Boolean(
    record && (record.syncedLyrics || record.plainLyrics || record.instrumental),
  )
}

function scoreRecord(record: LrclibRecord, duration?: number): number {
  let score = 0
  if (record.syncedLyrics) score += 100
  else if (record.plainLyrics) score += 20
  if (record.instrumental) score += 5
  if (duration != null && record.duration != null) {
    const diff = Math.abs(record.duration - duration)
    score += Math.max(0, 30 - diff * 3)
  }
  return score
}

/**
 * Fetch the best available lyrics for a track. Tries the precise signature
 * endpoint first (fast when duration is known), then falls back to a keyword
 * search, preferring records that carry synced lyrics.
 */
export async function fetchLyrics(
  query: LyricsQuery,
  signal?: AbortSignal,
): Promise<Lyrics | null> {
  const fallback = splitArtistTitle(query.title)
  const artist = cleanArtist(query.artist || fallback.artist || '')
  const title = cleanTitle(query.artist ? query.title : fallback.title)

  if (!title) return null

  const hasSignature = Boolean(artist && query.duration && query.duration > 0)
  const signatureParams = hasSignature
    ? new URLSearchParams({
        artist_name: artist,
        track_name: title,
        album_name: query.album?.trim() || title,
        duration: String(Math.round(query.duration!)),
      })
    : null

  const searchParams = new URLSearchParams({ track_name: title })
  if (artist) searchParams.set('artist_name', artist)

  // Fire the two fast, internal-DB-only lookups in parallel so the common case
  // (lyrics already in LRCLIB's database) resolves in a single round-trip.
  // `/api/get` is intentionally avoided here because it can synchronously hit
  // slow external sources; it's used only as a last resort below.
  const cachedPromise: Promise<LrclibRecord | null> = signatureParams
    ? (getJson(`${LRCLIB_BASE}/get-cached?${signatureParams}`, signal).catch(
        () => null,
      ) as Promise<LrclibRecord | null>)
    : Promise.resolve(null)
  const searchPromise: Promise<LrclibRecord[] | null> = getJson(
    `${LRCLIB_BASE}/search?${searchParams}`,
    signal,
  ).catch(() => null) as Promise<LrclibRecord[] | null>

  // The exact-signature `get-cached` hit is the strongest possible match, so if
  // it already carries time-synced lyrics, return it immediately instead of
  // waiting on the parallel keyword search — shaving a round-trip in the common
  // case where the track is already in LRCLIB.
  const cached = await cachedPromise
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  if (cached?.syncedLyrics) return toLyrics(cached)

  const searchSettled = await searchPromise
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  const searchResults = Array.isArray(searchSettled) ? searchSettled : []

  const fast = pickBest(
    [...(cached ? [cached] : []), ...searchResults],
    query.duration,
  )
  if (fast) return toLyrics(fast)

  // Last resort: the slower signature lookup that may pull from external
  // sources, then a loose keyword search.
  if (signatureParams) {
    try {
      const ext = (await getJson(
        `${LRCLIB_BASE}/get?${signatureParams}`,
        signal,
      )) as LrclibRecord | null
      if (hasContent(ext)) return toLyrics(ext)
    } catch (err) {
      if (isAbort(err)) throw err
    }
  }

  if (artist) {
    const loose = (await getJson(
      `${LRCLIB_BASE}/search?${new URLSearchParams({ q: `${title} ${artist}` })}`,
      signal,
    )) as LrclibRecord[] | null
    const looseBest = pickBest(Array.isArray(loose) ? loose : [], query.duration)
    if (looseBest) return toLyrics(looseBest)
  }

  return null
}

/** Highest-scoring record that actually carries lyrics, or null if none do. */
function pickBest(
  records: LrclibRecord[],
  duration?: number,
): LrclibRecord | null {
  const withContent = records.filter(hasContent)
  if (withContent.length === 0) return null
  return withContent.reduce((best, current) =>
    scoreRecord(current, duration) > scoreRecord(best, duration) ? current : best,
  )
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
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
