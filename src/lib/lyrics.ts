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
  const res = await fetch(url, {
    signal,
    headers: {
      Accept: 'application/json',
      // LRCLIB explicitly allows this header cross-origin; identifies the app.
      'Lrclib-Client': 'YTMQ (https://github.com/T3lluz/YTMQ)',
    },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`LRCLIB request failed (${res.status})`)
  return res.json()
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

  // 1) Precise signature lookup (requires album + duration to be most useful).
  if (artist && query.duration && query.duration > 0) {
    const params = new URLSearchParams({
      artist_name: artist,
      track_name: title,
      album_name: query.album?.trim() || title,
      duration: String(Math.round(query.duration)),
    })
    try {
      const hit = (await getJson(`${LRCLIB_BASE}/get?${params}`, signal)) as
        | LrclibRecord
        | null
      if (hit && (hit.syncedLyrics || hit.plainLyrics || hit.instrumental)) {
        return toLyrics(hit)
      }
    } catch (err) {
      if (isAbort(err)) throw err
      // Network/CORS hiccup — fall through to search.
    }
  }

  // 2) Keyword search; pick the best-scoring record.
  const searchParams = new URLSearchParams({ track_name: title })
  if (artist) searchParams.set('artist_name', artist)

  const results = (await getJson(
    `${LRCLIB_BASE}/search?${searchParams}`,
    signal,
  )) as LrclibRecord[] | null

  if (!Array.isArray(results) || results.length === 0) {
    // Retry with a looser, single-field query when the narrow one is empty.
    if (artist) {
      const loose = (await getJson(
        `${LRCLIB_BASE}/search?${new URLSearchParams({
          q: `${title} ${artist}`,
        })}`,
        signal,
      )) as LrclibRecord[] | null
      if (Array.isArray(loose) && loose.length > 0) {
        return toLyrics(pickBest(loose, query.duration))
      }
    }
    return null
  }

  return toLyrics(pickBest(results, query.duration))
}

function pickBest(records: LrclibRecord[], duration?: number): LrclibRecord {
  return records.reduce((best, current) =>
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
