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

/** Lowercase, no accents, no "(2004 Remaster)" / "- Live" / "feat." tails, words only. */
function core(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[([{].*?[)\]}]/g, ' ')
    .replace(/\s-\s.*$/, ' ')
    .replace(/\b(feat|ft|featuring|with)\b.*$/, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

function overlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const set = new Set(b)
  return a.filter((w) => set.has(w)).length / Math.min(a.length, b.length)
}

/**
 * Whether a provider's hit is plausibly the song asked for. Providers' fuzzy
 * matchers sometimes answer with a different song entirely (Musixmatch once
 * matched "Dreams" by Fleetwood Mac to "NOKIA" by Drake), and wrong lyrics
 * are worse than none. Title and artist must line up, or one of them plus
 * the length; translated titles from NetEase/KuGou pass on artist + length.
 */
export function isPlausibleMatch(result: ProviderResult, query: LyricsQuery): boolean {
  const titleOk = overlap(core(query.title), core(result.trackName)) >= 0.5
  const artistOk = !query.artist || overlap(core(query.artist), core(result.artistName)) >= 0.5
  const lengthOk =
    query.duration != null && result.duration != null && Math.abs(query.duration - result.duration) <= 4
  return (titleOk && artistOk) || (titleOk && lengthOk) || (artistOk && lengthOk && Boolean(query.artist))
}
