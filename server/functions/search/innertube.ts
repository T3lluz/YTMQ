// YouTube Music's own web API (Innertube), as the music.youtube.com page
// calls it. Public web client key, no account.

const YTMUSIC_API_KEY = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30'
const YTMUSIC_ORIGIN = 'https://music.youtube.com'
const YTMUSIC_API = `${YTMUSIC_ORIGIN}/youtubei/v1`

const CLIENT = {
  clientName: 'WEB_REMIX',
  clientVersion: '1.20250219.01.00',
  hl: 'en',
  gl: 'US',
} as const

export type JsonObject = Record<string, unknown>

export async function ytmusicRequest(
  endpoint: string,
  body: JsonObject,
  query: Record<string, string> = {},
): Promise<JsonObject> {
  const url = new URL(`${YTMUSIC_API}/${endpoint}`)
  url.searchParams.set('key', YTMUSIC_API_KEY)
  url.searchParams.set('prettyPrint', 'false')
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12_000)
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Origin: YTMUSIC_ORIGIN,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      },
      body: JSON.stringify({ context: { client: CLIENT }, ...body }),
    })
    if (!res.ok) {
      const detail = await res.text()
      throw new Error(`YouTube Music API ${res.status}: ${detail.slice(0, 200)}`)
    }
    return (await res.json()) as JsonObject
  } finally {
    clearTimeout(timer)
  }
}

// --- Small readers for Innertube's renderer soup ------------------------------

export type Run = {
  text?: string
  navigationEndpoint?: unknown
}

/** Walk a dotted path through nested objects and arrays ("a.b.0.c"). */
export function dig<T = unknown>(node: unknown, path: string): T | undefined {
  let cur: unknown = node
  for (const key of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur as T | undefined
}

export function runsOf(field: unknown): Run[] {
  const runs = dig<Run[]>(field, 'runs')
  return Array.isArray(runs) ? runs : []
}

export function textOf(field: unknown): string {
  const simple = dig<string>(field, 'simpleText')
  if (typeof simple === 'string') return simple.trim()
  return runsOf(field)
    .map((r) => r.text ?? '')
    .join('')
    .trim()
}

/** Runs split on YouTube Music's " • " separators. */
export function runGroups(runs: Run[]): Run[][] {
  const groups: Run[][] = [[]]
  for (const run of runs) {
    if (run.text === ' • ' || run.text === ' · ') groups.push([])
    else groups[groups.length - 1]!.push(run)
  }
  return groups.filter((g) => g.length > 0)
}

export function groupText(group: Run[]): string {
  return group
    .map((r) => r.text ?? '')
    .join('')
    .trim()
}

export type BrowseTarget = { browseId: string; params?: string; pageType: string | null }

export function browseTarget(endpoint: unknown): BrowseTarget | null {
  const browse = dig<{
    browseId?: string
    params?: string
    browseEndpointContextSupportedConfigs?: {
      browseEndpointContextMusicConfig?: { pageType?: string }
    }
  }>(endpoint, 'browseEndpoint')
  if (!browse?.browseId) return null
  return {
    browseId: browse.browseId,
    params: browse.params,
    pageType:
      browse.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType ??
      null,
  }
}

export function watchTarget(endpoint: unknown): { videoId: string; musicVideoType: string | null } | null {
  const watch = dig<{
    videoId?: string
    watchEndpointMusicSupportedConfigs?: {
      watchEndpointMusicConfig?: { musicVideoType?: string }
    }
  }>(endpoint, 'watchEndpoint')
  if (!watch?.videoId) return null
  return {
    videoId: watch.videoId,
    musicVideoType:
      watch.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType ?? null,
  }
}

/**
 * The biggest thumbnail in a renderer, at `size` px when the image host
 * lets us ask for a size (lh3/yt3 art does; i.ytimg video frames do not).
 */
export function thumbnailOf(node: unknown, size = 544): string {
  const list =
    dig<Array<{ url?: string; width?: number }>>(node, 'musicThumbnailRenderer.thumbnail.thumbnails') ??
    dig<Array<{ url?: string; width?: number }>>(node, 'thumbnail.thumbnails') ??
    dig<Array<{ url?: string; width?: number }>>(node, 'thumbnails') ??
    dig<Array<{ url?: string; width?: number }>>(node, 'croppedSquareThumbnailRenderer.thumbnail.thumbnails') ??
    []
  const best = list[list.length - 1]?.url ?? ''
  return resizeArt(best, size)
}

export function resizeArt(url: string, size: number): string {
  if (!url) return ''
  if (/googleusercontent\.com|ggpht\.com/.test(url)) {
    if (/=w\d+-h\d+/.test(url)) return url.replace(/=w\d+-h\d+/, `=w${size}-h${size}`)
    if (/=s\d+/.test(url)) return url.replace(/=s\d+/, `=s${size}`)
  }
  return url
}

export function hasExplicitBadge(renderer: JsonObject): boolean {
  const badges = (renderer.badges ?? renderer.subtitleBadges ?? renderer.subtitleBadge) as unknown
  const list = Array.isArray(badges) ? badges : badges ? [badges] : []
  return list.some(
    (b) => dig<string>(b, 'musicInlineBadgeRenderer.icon.iconType') === 'MUSIC_EXPLICIT_BADGE',
  )
}

export function parseDuration(text: string): number | null {
  const m = text.trim().match(/^(\d+):(\d{2})(?::(\d{2}))?$/)
  if (!m) return null
  return m[3] != null ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : Number(m[1]) * 60 + Number(m[2])
}

/** "1.9B plays" or "79.9M monthly audience" → 1.9e9 / 7.99e7. */
export function parseCount(text: string | null | undefined): number {
  if (!text) return 0
  const m = text.replace(/,/g, '').match(/([\d.]+)\s*([KMB])?/i)
  if (!m) return 0
  const value = Number.parseFloat(m[1]!)
  if (!Number.isFinite(value)) return 0
  const unit = (m[2] ?? '').toUpperCase()
  return value * (unit === 'B' ? 1e9 : unit === 'M' ? 1e6 : unit === 'K' ? 1e3 : 1)
}
