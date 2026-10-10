// Synced lyrics, from the server's `lyrics` function (server/functions/lyrics):
// LRCLIB for line timing and NetEase Cloud Music for word-by-word timing,
// matched strictly on title, artist and length. One source of truth, cached
// on the server, so every phone in a lobby sees the same lyrics.

import { ytmq } from './api'

/** A word in a word-timed line, in seconds from the track start. */
export type LyricWord = {
  start: number
  end: number
  /** The word with the spacing the source gave it ("Go ", "ahead "). */
  text: string
}

/** A single timestamped lyric line. `time` is seconds from the track start. */
export type LyricLine = {
  time: number
  text: string
  /** Present when the song is timed word by word. */
  words?: LyricWord[]
}

export type LyricsSource = 'lrclib' | 'netease'

export type Lyrics = {
  /** Time-synced lines (sorted by time). Empty when only plain lyrics exist. */
  synced: LyricLine[]
  /** Full plain-text lyrics, when available. */
  plain: string | null
  instrumental: boolean
  trackName: string
  artistName: string
  source: LyricsSource
  /** True when the lines carry word timing. */
  wordSynced: boolean
}

export type LyricsQuery = {
  title: string
  artist: string
  album?: string
  /** Track length in seconds; the server needs it for word timing. */
  duration?: number
}

type ServerLine = [number, string] | [number, string, [number, string, number][]]

type ServerLyrics = {
  source: LyricsSource
  lines?: ServerLine[]
  words?: boolean
  plain: string | null
  instrumental: boolean
  trackName: string
  artistName: string
}

const TIMEOUT_MS = 20_000

/**
 * Normalise a YouTube/YT-Music video title into a plain song title.
 * Strips common decorations ("(Official Video)", "[Lyrics]") that would
 * otherwise prevent a lyrics match.
 */
export function cleanTitle(title: string): string {
  return title
    .replace(
      /[([][^)\]]*(official|video|audio|lyric|visualizer|visualiser|mv|m\/v|hd|hq|4k|color\s*coded)[^)\]]*[)\]]/gi,
      '',
    )
    .replace(/[-–|]\s*(official\s*)?(music\s*)?(video|audio|lyrics?)\s*$/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function toLines(lines: ServerLine[]): LyricLine[] {
  return lines.map(([ms, text, words]) => ({
    time: ms / 1000,
    text,
    words: words?.length
      ? words.map(([start, word, end]) => ({ start: start / 1000, end: end / 1000, text: word }))
      : undefined,
  }))
}

/** The best lyrics the server can find, or null when there are none. */
export async function fetchLyrics(query: LyricsQuery, signal?: AbortSignal): Promise<Lyrics | null> {
  const title = cleanTitle(query.title)
  if (!title) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const onAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }
  try {
    const data = await ytmq.invoke<{ lyrics?: ServerLyrics | null; error?: string }>(
      'lyrics',
      { title, artist: query.artist, album: query.album, duration: query.duration },
      controller.signal,
    )
    if (data?.error) throw new Error(data.error)
    const found = data?.lyrics
    if (!found) return null
    const synced = toLines(found.lines ?? [])
    if (synced.length === 0 && !found.plain && !found.instrumental) return null
    return {
      synced,
      plain: found.plain,
      instrumental: found.instrumental,
      trackName: found.trackName,
      artistName: found.artistName,
      source: found.source,
      wordSynced: Boolean(found.words) && synced.some((l) => l.words),
    }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
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
