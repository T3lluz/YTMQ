/**
 * Map a YouTube Music queue row (title + artist) onto a Spotify track.
 *
 * Matching is deliberately conservative — a wrong song in the host's Spotify
 * queue is worse than skipping a row and letting the host remove it.
 */

export type SpotifyTrackCandidate = {
  id: string
  uri: string
  name: string
  artist: string
  albumArt: string
  durationMs: number
}

const NOISE_TITLE =
  /\b(official\s+(music\s+)?video|official\s+audio|lyric\s+video|lyrics?|audio|visualizer|audio\s+only|hd|hq|4k|remaster(ed)?|explicit|topic)\b/gi
const FEAT_IN_TITLE = /\s*[([{]\s*(feat\.?|ft\.?|featuring)\b[^)\]}]*[)\]}]/gi
const TOPIC_SUFFIX = /\s*-\s*topic$/i
const VEVO_SUFFIX = /\s*vevo$/i

export function cleanMusicTitle(title: string): string {
  return normalize(
    title
      .replace(FEAT_IN_TITLE, ' ')
      .replace(NOISE_TITLE, ' ')
      .replace(/[([{][^)\]}]{0,40}[)\]}]/g, ' '),
  )
}

export function cleanArtistName(artist: string): string {
  return normalize(artist.replace(TOPIC_SUFFIX, '').replace(VEVO_SUFFIX, ''))
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(value: string): string[] {
  return value.split(' ').filter((part) => part.length > 1)
}

function tokenOverlap(a: string, b: string): number {
  const left = new Set(tokens(a))
  const right = new Set(tokens(b))
  if (left.size === 0 || right.size === 0) return 0
  let hit = 0
  for (const token of left) {
    if (right.has(token)) hit += 1
  }
  return hit / Math.max(left.size, right.size)
}

/**
 * Ordered Spotify search strings. The first is field-qualified; the second is
 * a looser fallback for titles YouTube Music styles oddly.
 */
export function buildSpotifySearchQueries(
  title: string,
  artist: string,
): string[] {
  const cleanedTitle = cleanMusicTitle(title)
  const cleanedArtist = cleanArtistName(artist)
  const queries: string[] = []

  if (cleanedTitle && cleanedArtist) {
    queries.push(`track:${cleanedTitle} artist:${cleanedArtist}`)
  }
  if (cleanedTitle || cleanedArtist) {
    queries.push([cleanedTitle, cleanedArtist].filter(Boolean).join(' '))
  }
  return queries
}

/** 0–100. Title carries more weight than artist. */
export function scoreSpotifyCandidate(
  title: string,
  artist: string,
  candidate: Pick<SpotifyTrackCandidate, 'name' | 'artist'>,
): number {
  const qTitle = cleanMusicTitle(title)
  const qArtist = cleanArtistName(artist)
  const cTitle = cleanMusicTitle(candidate.name)
  const cArtist = cleanArtistName(candidate.artist)

  let score = 0
  if (qTitle && cTitle) {
    if (qTitle === cTitle) score += 55
    else if (cTitle.includes(qTitle) || qTitle.includes(cTitle)) score += 38
    else score += Math.round(tokenOverlap(qTitle, cTitle) * 34)
  }
  if (qArtist && cArtist) {
    if (qArtist === cArtist) score += 40
    else if (cArtist.includes(qArtist) || qArtist.includes(cArtist)) score += 24
    else score += Math.round(tokenOverlap(qArtist, cArtist) * 20)
  }
  return score
}

export const SPOTIFY_MATCH_THRESHOLD = 48

export function pickSpotifyMatch(
  title: string,
  artist: string,
  candidates: SpotifyTrackCandidate[],
  threshold = SPOTIFY_MATCH_THRESHOLD,
): SpotifyTrackCandidate | null {
  let best: SpotifyTrackCandidate | null = null
  let bestScore = -1
  for (const candidate of candidates) {
    const score = scoreSpotifyCandidate(title, artist, candidate)
    if (score > bestScore) {
      best = candidate
      bestScore = score
    }
  }
  if (!best || bestScore < threshold) return null
  return best
}

/** First playable (matched, not failed) row in queue order. */
export function pickNextPlayable<T extends { id: string }>(
  items: T[],
  matched: Map<string, SpotifyTrackCandidate>,
  failed: Set<string>,
): { item: T; match: SpotifyTrackCandidate } | null {
  for (const item of items) {
    if (failed.has(item.id)) continue
    const match = matched.get(item.id)
    if (!match) continue
    return { item, match }
  }
  return null
}
