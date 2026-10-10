// `lyrics` function: synced lyrics for a song, the way the t3lluz dashboard's
// phone player finds them (phone_hub.py), which proved the more consistent:
//
//   - LRCLIB (lrclib.net, open and keyless) for line-synced lyrics: an exact
//     lookup on artist, title, album and length, then the same cleaned up,
//     then searches, always preferring synced lyrics and a length within 8 s.
//   - NetEase Cloud Music for word-by-word timing ("YRC"), the source open
//     Apple Music style players use. Only when title, artist and length
//     (within 3 s) all agree: word timing from another edit of a song is
//     worse than none.
//
// Both run at once; word timing wins when NetEase has it. Answers are cached
// on disk (DATA_DIR/lyrics-cache.json), misses for a day.
//
// Response: { lyrics: { source, lines: [[ms, text, words?]], words, plain,
// instrumental, trackName, artistName, duration, syncedLrc } | null }
// where words are [[startMs, text, endMs], …]. `syncedLrc` is the old
// shape, kept for app tabs opened before a deploy.

import { join } from 'node:path'

const LRCLIB = 'https://lrclib.net/api'
const NETEASE = 'https://music.163.com/api'
const UA = 'YTMQ (https://t3lluz.com/ytmq)'
const NE_HEADERS = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64)', Referer: 'https://music.163.com/' }

const CACHE_FILE = join(Deno.env.get('DATA_DIR') ?? './data', 'lyrics-cache.json')
const CACHE_KEEP = 2000
const MISS_RETRY_MS = 24 * 3600_000

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

type Word = [number, string, number]
type Line = [number, string] | [number, string, Word[]]

export type LyricsAnswer = {
  found: boolean
  at: number
  source: 'LRCLIB' | 'NetEase' | null
  words: boolean
  lines: Line[]
  plain: string
  instrumental: boolean
  trackName: string
  artistName: string
  duration: number | null
}

// --- Cleaning ------------------------------------------------------------------

const JUNK =
  /\s*[([](?:official\s*(?:music\s*)?(?:video|audio|lyrics?\s*video|visualizer)|lyrics?|lyric video|audio|hd|hq|4k|mv|m\/v|visualizer|explicit|clean)[^)\]]*[)\]]/gi
const REMASTER = /\s+-\s+(?:\d{4}\s+)?(?:remaster(?:ed)?|mono|stereo|single|radio edit|live)\b.*$/i
const FEAT = /\s*[([]?\s*(?:feat\.?|ft\.?|featuring|with)\s+[^)\]]*[)\]]?/gi

function cleanTitle(t: string): string {
  return (t || '')
    .replace(JUNK, '')
    .replace(REMASTER, '')
    .replace(FEAT, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-–|]+|[\s\-–|]+$/g, '')
}

function cleanArtist(a: string): string {
  let out = (a || '').split(/\s+[•·]\s+/)[0] ?? ''
  out = out.replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/, '').trim()
  return (out.split(/\s*(?:,|&|\bx\b|\bfeat\.?|\bft\.?|;|\/)\s*/i)[0] ?? '').trim()
}

/** A title for comparing: no brackets, no feat., no punctuation. */
function bare(t: string): string {
  return (t || '')
    .replace(/\s*[([].*?[)\]]/g, '')
    .replace(REMASTER, '')
    .replace(/\s+-\s+.*$/, '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

// --- LRC / YRC parsing ---------------------------------------------------------

function lrcMs(mm: string, ss: string, frac: string | undefined): number {
  return (Number(mm) * 60 + Number(ss)) * 1000 + (frac ? Number(frac.padEnd(3, '0').slice(0, 3)) : 0)
}

/** [[ms, line], …]; enhanced LRC lines also carry their words. Blank lines stay: they are instrumental gaps. */
export function parseLrc(text: string): Line[] {
  const out: Line[] = []
  const offsetMatch = (text || '').match(/\[offset:\s*([+-]?\d+)\s*\]/i)
  const offset = offsetMatch ? Number(offsetMatch[1]) : 0
  const stampRe = /\[(\d+):(\d{1,2})(?:[.:](\d{1,3}))?\]/g
  const wordRe = /<(\d+):(\d{1,2})(?:[.:](\d{1,3}))?>/
  for (const raw of (text || '').split(/\r?\n/)) {
    const stamps = [...raw.matchAll(stampRe)]
    if (stamps.length === 0) continue
    let body = raw.replace(stampRe, '')
    let words: Word[] | null = null
    if (wordRe.test(body)) {
      words = []
      const parts = body.split(/<(\d+):(\d{1,2})(?:[.:](\d{1,3}))?>/)
      for (let i = 1; i < parts.length - 3; i += 4) {
        const w = parts[i + 3] ?? ''
        if (w.trim()) {
          const start = Math.max(0, lrcMs(parts[i]!, parts[i + 1]!, parts[i + 2]) - offset)
          words.push([start, w, 0])
        }
      }
      for (let i = 0; i < words.length; i += 1) words[i]![2] = words[i + 1]?.[0] ?? words[i]![0] + 1500
      body = body.replace(new RegExp(wordRe.source, 'g'), '')
    }
    const line = body.replace(/\s+/g, ' ').trim()
    for (const m of stamps) {
      const ms = Math.max(0, lrcMs(m[1]!, m[2]!, m[3]) - offset)
      out.push(words && words.length ? [ms, line, words] : [ms, line])
    }
  }
  out.sort((a, b) => a[0] - b[0])
  return out
}

const CREDIT = /^\s*[^\s:：]{1,12}\s*[:：]/
const CJK = /[぀-ヿ㐀-鿿]/
const isCredit = (text: string) => CREDIT.test(text || '') && CJK.test(text || '')

/** NetEase YRC: `[lineStart,lineDur](wordStart,wordDur,0)word…`. Credit lines are dropped. */
export function parseYrc(text: string): Line[] {
  const out: Line[] = []
  for (const raw of (text || '').split(/\r?\n/)) {
    const m = raw.trim().match(/^\[(\d+),(\d+)\](.*)$/)
    if (!m) continue
    const parts = m[3]!.split(/\((\d+),(\d+),-?\d+\)/)
    const words: Word[] = []
    for (let i = 1; i + 2 < parts.length; i += 3) {
      const w = parts[i + 2] ?? ''
      if (w === '') continue
      const start = Number(parts[i])
      words.push([start, w, start + Number(parts[i + 1])])
    }
    const line = words.map((w) => w[1]).join('').trim()
    if (!line || isCredit(line)) continue
    out.push([Number(m[1]), line, words])
  }
  out.sort((a, b) => a[0] - b[0])
  return out
}

function toLrc(lines: Line[]): string {
  return lines
    .map(([ms, text]) => {
      const total = Math.max(0, ms)
      const mm = Math.floor(total / 60000)
      const ss = Math.floor((total % 60000) / 1000)
      const cs = Math.floor((total % 1000) / 10)
      return `[${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(cs).padStart(2, '0')}]${text}`
    })
    .join('\n')
}

// --- HTTP ----------------------------------------------------------------------

async function getJson(url: string, headers: Record<string, string>, timeoutMs = 8000): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: controller.signal })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

// --- LRCLIB --------------------------------------------------------------------

type LrclibRow = {
  id?: number
  trackName?: string
  name?: string
  artistName?: string
  albumName?: string
  duration?: number
  instrumental?: boolean
  plainLyrics?: string | null
  syncedLyrics?: string | null
}

const hasLyrics = (r: LrclibRow | null | undefined): r is LrclibRow =>
  Boolean(r && (r.syncedLyrics || r.plainLyrics || r.instrumental))

/** The best search hit: synced lyrics first, then the closest length. */
function pick(rows: unknown, durS: number): LrclibRow | null {
  let best: LrclibRow | null = null
  let bestScore: [number, number, number] | null = null
  for (const r of Array.isArray(rows) ? (rows as LrclibRow[]) : []) {
    if (!r || typeof r !== 'object') continue
    const rd = r.duration ?? 0
    const off = durS && rd ? Math.abs(rd - durS) : 0
    if (durS && rd && off > 8) continue
    const score: [number, number, number] = [r.syncedLyrics ? 0 : 1, r.plainLyrics || r.instrumental ? 0 : 1, off]
    if (
      !bestScore ||
      score[0] < bestScore[0] ||
      (score[0] === bestScore[0] && (score[1] < bestScore[1] || (score[1] === bestScore[1] && score[2] < bestScore[2])))
    ) {
      best = r
      bestScore = score
    }
  }
  return best
}

async function lrclibLookup(artist: string, title: string, album: string, durS: number): Promise<LrclibRow | null> {
  const qs = (p: Record<string, string | number>) =>
    new URLSearchParams(Object.entries(p).map(([k, v]) => [k, String(v)])).toString()
  const headers = { 'User-Agent': UA }
  const tries: string[] = []
  if (artist && title) {
    const p: Record<string, string | number> = { artist_name: artist, track_name: title }
    if (album) p.album_name = album
    if (durS) p.duration = Math.round(durS)
    tries.push(`${LRCLIB}/get?${qs(p)}`)
    const ca = cleanArtist(artist)
    const ct = cleanTitle(title)
    if (ca !== artist || ct !== title) {
      const p2: Record<string, string | number> = { artist_name: ca, track_name: ct }
      if (durS) p2.duration = Math.round(durS)
      tries.push(`${LRCLIB}/get?${qs(p2)}`)
    }
  }
  for (const url of tries) {
    const hit = (await getJson(url, headers).catch(() => null)) as LrclibRow | null
    if (hasLyrics(hit) && (hit.syncedLyrics || !durS)) return hit
  }
  const ct = cleanTitle(title)
  const ca = cleanArtist(artist)
  // A video title often reads "Artist - Song"; the channel is not the artist.
  if (ct.includes(' - ') && (!ca || !ct.toLowerCase().split(' - ')[1]!.includes(ca.toLowerCase()))) {
    const [left, right] = [ct.slice(0, ct.indexOf(' - ')), ct.slice(ct.indexOf(' - ') + 3)]
    const hit = pick(
      await getJson(`${LRCLIB}/search?${qs({ track_name: cleanTitle(right), artist_name: cleanArtist(left) })}`, headers),
      durS,
    )
    if (hit) return hit
  }
  if (ca) {
    const hit = pick(await getJson(`${LRCLIB}/search?${qs({ track_name: ct, artist_name: ca })}`, headers), durS)
    if (hit) return hit
  }
  return pick(await getJson(`${LRCLIB}/search?${qs({ q: `${ca} ${ct}`.trim() })}`, headers), durS)
}

// --- NetEase -------------------------------------------------------------------

type NeSong = { id: number; name?: string; artists?: { name?: string }[]; duration?: number }

async function neteaseLookup(
  artist: string,
  title: string,
  durS: number,
): Promise<{ id: number; words: Line[] | null; lines: Line[] | null } | null> {
  if (!title || !durS) return null
  const q = new URLSearchParams({ s: `${cleanArtist(artist)} ${cleanTitle(title)}`, type: '1', limit: '12' })
  const data = (await getJson(`${NETEASE}/search/get?${q}`, NE_HEADERS)) as { result?: { songs?: NeSong[] } } | null
  const songs = data?.result?.songs ?? []
  const want = bare(title)
  const arts = new Set(
    (artist || '')
      .split(/\s*(?:,|&|\bx\b|feat\.?|ft\.?|;|\/)\s*/i)
      .filter((a) => a.trim())
      .map(bare),
  )
  let best: [number, NeSong] | null = null
  for (const song of songs) {
    if (bare(song.name ?? '') !== want) continue
    const names = new Set((song.artists ?? []).map((a) => bare(a.name ?? '')))
    if (arts.size > 0) {
      const overlap = [...arts].some((a) => names.has(a) || [...names].some((n) => a && n && (a.includes(n) || n.includes(a))))
      if (!overlap) continue
    }
    const off = Math.abs((song.duration ?? 0) / 1000 - durS)
    if (off > 3) continue
    if (!best || off < best[0]) best = [off, song]
  }
  if (!best) return null
  const sid = best[1].id
  const lyr = (await getJson(
    `${NETEASE}/song/lyric/v1?id=${sid}&lv=1&kv=1&tv=-1&yv=1&ytv=1&rv=1&cp=false`,
    NE_HEADERS,
  )) as { yrc?: { lyric?: string }; lrc?: { lyric?: string } } | null
  const words = parseYrc(lyr?.yrc?.lyric ?? '')
  const lines = parseLrc(lyr?.lrc?.lyric ?? '').filter((l) => !isCredit(l[1]))
  return { id: sid, words: words.length >= 3 ? words : null, lines: lines.length >= 3 ? lines : null }
}

// --- Cache -----------------------------------------------------------------------

let cacheMap: Map<string, LyricsAnswer> | null = null
let saveTimer: ReturnType<typeof setTimeout> | undefined
const busy = new Map<string, Promise<LyricsAnswer>>()

async function loadCache(): Promise<Map<string, LyricsAnswer>> {
  if (cacheMap) return cacheMap
  try {
    const raw = JSON.parse(await Deno.readTextFile(CACHE_FILE)) as Record<string, LyricsAnswer>
    cacheMap = new Map(Object.entries(raw))
  } catch {
    cacheMap = new Map()
  }
  return cacheMap
}

function scheduleSave() {
  if (saveTimer !== undefined) return
  saveTimer = setTimeout(async () => {
    saveTimer = undefined
    const map = await loadCache()
    while (map.size > CACHE_KEEP) map.delete(map.keys().next().value!)
    try {
      const tmp = `${CACHE_FILE}.tmp`
      await Deno.writeTextFile(tmp, JSON.stringify(Object.fromEntries(map)))
      await Deno.rename(tmp, CACHE_FILE)
    } catch (err) {
      console.warn('[lyrics] cache save failed', err)
    }
  }, 2000)
}

function cacheKey(artist: string, title: string, durS: number) {
  return `v3|${cleanArtist(artist).toLowerCase()}|${cleanTitle(title).toLowerCase()}|${Math.round(durS / 2)}`
}

// --- Lookup ----------------------------------------------------------------------

async function lookup(artist: string, title: string, album: string, durS: number): Promise<LyricsAnswer> {
  const [lr, ne] = await Promise.all([
    lrclibLookup(artist, title, album, durS).catch((err) => {
      console.warn('[lyrics] LRCLIB', err instanceof Error ? err.message : err)
      return undefined
    }),
    neteaseLookup(artist, title, durS).catch(() => null),
  ])
  const out: LyricsAnswer = {
    found: Boolean(lr),
    at: Date.now(),
    source: lr ? 'LRCLIB' : null,
    words: false,
    lines: [],
    plain: '',
    instrumental: false,
    trackName: title,
    artistName: artist,
    duration: durS || null,
  }
  if (lr) {
    out.lines = parseLrc(lr.syncedLyrics ?? '')
    out.plain = lr.plainLyrics ?? ''
    out.instrumental = Boolean(lr.instrumental)
    out.trackName = lr.trackName ?? lr.name ?? title
    out.artistName = lr.artistName ?? artist
    out.duration = lr.duration ?? out.duration
  }
  if (ne?.words) {
    // Word by word wins: the same song, timed to the syllable.
    out.found = true
    out.source = 'NetEase'
    out.words = true
    out.lines = ne.words
    out.instrumental = false
    if (!out.plain) out.plain = ne.words.map((l) => l[1]).join('\n')
  } else if (ne?.lines && out.lines.length === 0) {
    out.found = true
    out.source = 'NetEase'
    out.lines = ne.lines
  }
  // LRCLIB unreachable and nothing else: an error, not a miss to remember.
  if (lr === undefined && !out.found) throw new Error('Lyrics service unreachable')
  return out
}

export async function findLyrics(artist: string, title: string, album: string, durS: number): Promise<LyricsAnswer> {
  const key = cacheKey(artist, title, durS)
  const cache = await loadCache()
  const hit = cache.get(key)
  if (hit && (hit.found || Date.now() - hit.at < MISS_RETRY_MS)) return hit
  const running = busy.get(key)
  if (running) return running
  const task = lookup(artist, title, album, durS)
    .then((answer) => {
      cache.delete(key)
      cache.set(key, answer)
      scheduleSave()
      return answer
    })
    .finally(() => busy.delete(key))
  busy.set(key, task)
  return task
}

// --- Handler ---------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const url = new URL(req.url)
  let body: Record<string, unknown> = Object.fromEntries(url.searchParams.entries())
  if (req.method === 'POST') {
    try {
      body = { ...body, ...((await req.json()) as Record<string, unknown>) }
    } catch {
      /* query only */
    }
  }
  const title = String(body.title ?? '').trim()
  // YouTube Music bylines read "Artist • Album • Year"; only the artist helps.
  const artist = String(body.artist ?? '').split(/\s[•·]\s/)[0]!.trim()
  const album = String(body.album ?? '').trim()
  const duration = Number(body.duration)
  const durS = Number.isFinite(duration) && duration > 0 ? duration : 0
  if (!title) return jsonResponse({ lyrics: null, error: 'title is required' }, 400)

  try {
    const answer = await findLyrics(artist, title, album, durS)
    console.log(
      JSON.stringify({ lyrics: title, artist, duration: durS || null, found: answer.found, source: answer.source, words: answer.words }),
    )
    if (!answer.found || !(answer.lines.length || answer.plain || answer.instrumental)) {
      return jsonResponse({ lyrics: null })
    }
    return jsonResponse({
      lyrics: {
        source: answer.source === 'NetEase' ? 'netease' : 'lrclib',
        lines: answer.lines,
        words: answer.words,
        plain: answer.plain || null,
        instrumental: answer.instrumental,
        trackName: answer.trackName,
        artistName: answer.artistName,
        duration: answer.duration,
        syncedLrc: answer.lines.length ? toLrc(answer.lines) : null,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'lyrics lookup failed'
    return jsonResponse({ lyrics: null, error: message }, 502)
  }
}
