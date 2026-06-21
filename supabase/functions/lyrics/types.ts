// Internal shared types and helpers used by every lyrics provider so the
// aggregator can rank results from different sources side by side.

export type ProviderName = 'musixmatch' | 'lrclib' | 'netease' | 'kugou'

/** Normalised lyrics result returned by every provider. */
export type ProviderResult = {
  source: ProviderName
  /** Raw LRC text (with timestamps), when the provider has time-synced lyrics. */
  syncedLrc: string | null
  /** Full plain-text lyrics, when available (and no synced lyrics). */
  plain: string | null
  instrumental: boolean
  trackName: string
  artistName: string
  /** Track duration reported by the provider, in seconds. */
  duration: number | null
}

export type LyricsQuery = {
  title: string
  artist: string
  album?: string
  /** Track length in seconds — used to disambiguate providers' search hits. */
  duration?: number
}

/** Generic fetch helper with timeout + optional custom headers. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 8_000, ...rest } = init
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...rest, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** Convenience: parse JSON, returning null on any failure. */
export async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

/**
 * Score a provider result for ranking. Higher = better.
 * Synced lyrics always beat plain; closer duration matches add a bonus.
 */
export function scoreResult(
  result: ProviderResult,
  query: LyricsQuery,
): number {
  let score = 0
  if (result.syncedLrc) score += 100
  else if (result.plain) score += 20
  if (result.instrumental) score += 5

  if (query.duration != null && result.duration != null) {
    const diff = Math.abs(result.duration - query.duration)
    score += Math.max(0, 30 - diff * 3)
  }

  return score
}

export function hasContent(result: ProviderResult | null): result is ProviderResult {
  return Boolean(
    result && (result.syncedLrc || result.plain || result.instrumental),
  )
}
