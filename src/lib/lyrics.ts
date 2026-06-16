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

// Internal-DB lookups (`/search`, `/get-cached`) are quick, so cap them tight.
// `/api/get` can synchronously scrape slow external sources, so it gets a
// larger — but still bounded — budget to keep a single track from stalling the
// UI the way an uncapped request used to (~20s).
const DB_TIMEOUT_MS = 6000
const SCRAPE_TIMEOUT_MS = 8000

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
 * Fetch the best available lyrics for a track.
 *
 * Speed strategy: every fast internal-DB lookup (`/get-cached` + two `/search`
 * variants) is fired at once and we return the instant any of them yields
 * time-synced lyrics — so the common case (track already in LRCLIB) resolves in
 * a single round-trip. Only when the DB has nothing at all do we fall back to
 * the slow `/api/get` scraper, and that request is now time-boxed so it can no
 * longer stall the UI for ~20s.
 */
export async function fetchLyrics(
  query: LyricsQuery,
  signal?: AbortSignal,
): Promise<Lyrics | null> {
  const fallback = splitArtistTitle(query.title)
  const artist = cleanArtist(query.artist || fallback.artist || '')
  const title = cleanTitle(query.artist ? query.title : fallback.title)

  if (!title) return null

  const checkAbort = () => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  }

  const hasSignature = Boolean(artist && query.duration && query.duration > 0)
  const signatureParams = hasSignature
    ? new URLSearchParams({
        artist_name: artist,
        track_name: title,
        album_name: query.album?.trim() || title,
        duration: String(Math.round(query.duration!)),
      })
    : null

  const exactParams = new URLSearchParams({ track_name: title })
  if (artist) exactParams.set('artist_name', artist)
  const looseParams = new URLSearchParams({
    q: artist ? `${title} ${artist}` : title,
  })

  // Tier 1 — internal-DB lookups, all fired together. None of these trigger
  // LRCLIB's slow external scrape, so they come back quickly.
  const dbTasks: Promise<LrclibRecord[]>[] = [
    (getJson(`${LRCLIB_BASE}/search?${exactParams}`, signal, DB_TIMEOUT_MS)
      .then(asRecords)
      .catch(() => [])) as Promise<LrclibRecord[]>,
    (getJson(`${LRCLIB_BASE}/search?${looseParams}`, signal, DB_TIMEOUT_MS)
      .then(asRecords)
      .catch(() => [])) as Promise<LrclibRecord[]>,
  ]
  if (signatureParams) {
    dbTasks.unshift(
      getJson(`${LRCLIB_BASE}/get-cached?${signatureParams}`, signal, DB_TIMEOUT_MS)
        .then(asRecords)
        .catch(() => []),
    )
  }

  // Return the moment any DB lookup yields time-synced lyrics — the best UX and
  // typically a single round-trip.
  const synced = await firstSyncedRecord(dbTasks, query.duration)
  checkAbort()
  if (synced) return toLyrics(synced)

  // No synced match: settle the remaining DB lookups and take the best plain /
  // instrumental record they found.
  const dbBest = pickBest((await Promise.all(dbTasks)).flat(), query.duration)
  checkAbort()
  if (dbBest) return toLyrics(dbBest)

  // Nothing in the DB at all — fall back to the scraper, but time-boxed so a
  // slow external source can no longer hang the UI.
  if (signatureParams) {
    const scraped = (await getJson(
      `${LRCLIB_BASE}/get?${signatureParams}`,
      signal,
      SCRAPE_TIMEOUT_MS,
    ).catch(() => null)) as LrclibRecord | null
    checkAbort()
    if (hasContent(scraped)) return toLyrics(scraped)
  }

  return null
}

/**
 * Resolve with the highest-scoring record that carries time-synced lyrics as
 * soon as any task produces one, or null once every task has settled without a
 * synced match. Lets a fast lookup win without waiting on slower ones.
 */
function firstSyncedRecord(
  tasks: Promise<LrclibRecord[]>[],
  duration?: number,
): Promise<LrclibRecord | null> {
  if (tasks.length === 0) return Promise.resolve(null)
  return new Promise((resolve) => {
    let remaining = tasks.length
    let settled = false
    const done = (value: LrclibRecord | null) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    for (const task of tasks) {
      task
        .then((records) => {
          if (settled) return
          const synced = records.filter((r) => r.syncedLyrics && hasContent(r))
          if (synced.length > 0) {
            done(
              synced.reduce((best, current) =>
                scoreRecord(current, duration) > scoreRecord(best, duration)
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
  records: LrclibRecord[],
  duration?: number,
): LrclibRecord | null {
  const withContent = records.filter(hasContent)
  if (withContent.length === 0) return null
  return withContent.reduce((best, current) =>
    scoreRecord(current, duration) > scoreRecord(best, duration) ? current : best,
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
