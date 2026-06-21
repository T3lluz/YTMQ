// Musixmatch provider — the single largest synchronized-lyrics catalog (the
// same database Spotify surfaces in-app). Musixmatch has no public free tier
// for synced lyrics, but since 2024 its desktop/mobile "macro" API can be used
// anonymously with a `usertoken` that the official web app fetches on first
// load. We fetch + cache that token here, then trade a track signature
// (title / artist / duration) for an LRC subtitle.
//
// This must run server-side: the endpoints ship no CORS headers, expect a
// browser-like User-Agent, and round-trip a session cookie. A token can also
// be supplied out-of-band via the `MUSIXMATCH_USER_TOKEN` env var to sidestep
// the bootstrap request and reduce rate-limit pressure.

import {
  fetchWithTimeout,
  safeJson,
  type LyricsQuery,
  type ProviderResult,
} from './types.ts'

const BASE = 'https://apic-desktop.musixmatch.com/ws/1.1'
const APP_ID = 'web-desktop-app-v1.0'

const HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  Accept: 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
}

// Musixmatch tokens are effectively long-lived. We cache in-module so a warm
// edge instance reuses it across requests; cold starts re-bootstrap cheaply.
type Token = { value: string; cookie: string; expires: number }
let cachedToken: Token | null = null
const TOKEN_TTL_MS = 9 * 60 * 60 * 1000 // 9h — comfortably inside their lifetime

// --- Musixmatch response shapes (only the fields we touch) ----------------

type MxmHeader = { status_code?: number; hint?: string }

type MxmTokenResponse = {
  message?: { header?: MxmHeader; body?: { user_token?: string } }
}

type MxmSubtitleLine = {
  text: string
  time: { total: number; minutes: number; seconds: number; hundredths: number }
}

type MxmMacroResponse = {
  message?: {
    header?: MxmHeader
    body?: {
      macro_calls?: {
        'matcher.track.get'?: {
          message?: {
            header?: MxmHeader
            body?: {
              track?: {
                track_name?: string
                artist_name?: string
                track_length?: number
                instrumental?: number
                has_subtitles?: number
                has_lyrics?: number
              }
            }
          }
        }
        'track.subtitles.get'?: {
          message?: {
            header?: MxmHeader
            body?: {
              subtitle_list?: Array<{
                subtitle?: { subtitle_body?: string; subtitle_length?: number }
              }>
            }
          }
        }
        'track.lyrics.get'?: {
          message?: {
            header?: MxmHeader
            body?: { lyrics?: { lyrics_body?: string; instrumental?: number } }
          }
        }
      }
    }
  }
}

/** Collect `name=value` pairs from any Set-Cookie headers on a response. */
function extractCookie(res: Response): string {
  const headersWithCookies = res.headers as Headers & {
    getSetCookie?: () => string[]
  }
  const all =
    typeof headersWithCookies.getSetCookie === 'function'
      ? headersWithCookies.getSetCookie()
      : res.headers.get('set-cookie')
        ? [res.headers.get('set-cookie') as string]
        : []
  return all
    .map((c) => c.split(';')[0]?.trim())
    .filter((c): c is string => Boolean(c))
    .join('; ')
}

async function getToken(): Promise<Token | null> {
  const envToken = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } })
    .Deno?.env.get('MUSIXMATCH_USER_TOKEN')
    ?.trim()
  if (envToken) return { value: envToken, cookie: '', expires: Infinity }

  if (cachedToken && cachedToken.expires > Date.now()) return cachedToken

  const url = `${BASE}/token.get?app_id=${APP_ID}&t=${Date.now()}`
  const res = await fetchWithTimeout(url, { headers: HEADERS, timeoutMs: 7_000 })
  if (!res.ok) return null

  const cookie = extractCookie(res)
  const data = (await safeJson(res)) as MxmTokenResponse | null
  const token = data?.message?.body?.user_token
  // Musixmatch hands out a sentinel token when rate-limited / unsupported.
  if (!token || token.startsWith('UpgradeOnly')) return null

  cachedToken = { value: token, cookie, expires: Date.now() + TOKEN_TTL_MS }
  return cachedToken
}

/** Convert Musixmatch's `mxm` subtitle JSON into a standard LRC string. */
function mxmSubtitleToLrc(body: string): string | null {
  let lines: MxmSubtitleLine[]
  try {
    lines = JSON.parse(body) as MxmSubtitleLine[]
  } catch {
    return null
  }
  if (!Array.isArray(lines) || lines.length === 0) return null

  const out: string[] = []
  for (const line of lines) {
    const t = line?.time
    if (!t) continue
    const mm = String(t.minutes).padStart(2, '0')
    const ss = String(t.seconds).padStart(2, '0')
    const hh = String(t.hundredths).padStart(2, '0')
    out.push(`[${mm}:${ss}.${hh}]${line.text ?? ''}`)
  }
  return out.length > 0 ? out.join('\n') : null
}

async function fetchMacro(
  query: LyricsQuery,
  token: Token,
): Promise<MxmMacroResponse | null> {
  const params = new URLSearchParams({
    app_id: APP_ID,
    usertoken: token.value,
    format: 'json',
    namespace: 'lyrics_richsynched',
    subtitle_format: 'mxm',
    q_track: query.title,
    q_artist: query.artist ?? '',
    t: String(Date.now()),
  })
  if (query.album) params.set('q_album', query.album)
  if (query.duration && query.duration > 0) {
    params.set('q_duration', String(Math.round(query.duration)))
    params.set('f_subtitle_length', String(Math.round(query.duration)))
  }

  const headers = { ...HEADERS }
  if (token.cookie) headers.Cookie = token.cookie

  const res = await fetchWithTimeout(`${BASE}/macro.subtitles.get?${params}`, {
    headers,
    timeoutMs: 8_000,
  })
  if (!res.ok) {
    // A stale/invalidated token surfaces as 401 — drop it so the next call
    // re-bootstraps a fresh one.
    if (res.status === 401) cachedToken = null
    return null
  }
  return (await safeJson(res)) as MxmMacroResponse | null
}

export async function searchMusixmatch(
  query: LyricsQuery,
): Promise<ProviderResult[]> {
  if (!query.title) return []

  let token: Token | null
  try {
    token = await getToken()
  } catch {
    return []
  }
  if (!token) return []

  let macro: MxmMacroResponse | null
  try {
    macro = await fetchMacro(query, token)
  } catch {
    return []
  }

  const calls = macro?.message?.body?.macro_calls
  if (!calls) return []

  const track = calls['matcher.track.get']?.message?.body?.track
  if (!track) return []

  const subtitleBody =
    calls['track.subtitles.get']?.message?.body?.subtitle_list?.[0]?.subtitle
      ?.subtitle_body
  const syncedLrc = subtitleBody ? mxmSubtitleToLrc(subtitleBody) : null

  const plainBody =
    calls['track.lyrics.get']?.message?.body?.lyrics?.lyrics_body?.trim() || null

  const instrumental = Boolean(
    track.instrumental ||
      calls['track.lyrics.get']?.message?.body?.lyrics?.instrumental,
  )

  if (!syncedLrc && !plainBody && !instrumental) return []

  return [
    {
      source: 'musixmatch',
      syncedLrc,
      plain: syncedLrc ? null : plainBody,
      instrumental,
      trackName: track.track_name ?? query.title,
      artistName: track.artist_name ?? query.artist ?? '',
      duration:
        typeof track.track_length === 'number' && track.track_length > 0
          ? track.track_length
          : null,
    },
  ]
}
