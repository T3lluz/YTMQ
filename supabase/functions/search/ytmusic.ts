/** YouTube Music Innertube (public web client key). */
const YTMUSIC_API_KEY = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30'
const YTMUSIC_ORIGIN = 'https://music.youtube.com'
const YTMUSIC_API = `${YTMUSIC_ORIGIN}/youtubei/v1`

const CLIENT = {
  clientName: 'WEB_REMIX',
  clientVersion: '1.20250219.01.00',
  hl: 'en',
  gl: 'US',
} as const

/** Innertube search filter params (songs / artists). */
const FILTER_SONGS = 'EgWKAQIIAWoMEA4QChADEAQQCRAF'
const FILTER_ARTISTS = 'EgWKAQIgAWoMEA4QChADEAQQCRAF'

export type YtmSearchResult = {
  id: string
  title: string
  channelTitle: string
  thumbnail: string
  type: 'song' | 'artist'
}

type JsonObject = Record<string, unknown>

async function ytmusicRequest(
  endpoint: string,
  body: JsonObject,
): Promise<JsonObject> {
  const url = new URL(`${YTMUSIC_API}/${endpoint}`)
  url.searchParams.set('key', YTMUSIC_API_KEY)
  url.searchParams.set('prettyPrint', 'false')

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: YTMUSIC_ORIGIN,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    },
    body: JSON.stringify({
      context: { client: CLIENT },
      ...body,
    }),
  })

  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`YouTube Music API ${res.status}: ${detail.slice(0, 200)}`)
  }

  return (await res.json()) as JsonObject
}

function runsText(runs: Array<{ text?: string }> | undefined): string {
  if (!runs?.length) return ''
  return runs.map((r) => r.text ?? '').join('').trim()
}

/** Artist line from a song row (stops before album / duration). */
function songArtistLine(
  runs: Array<{ text?: string }> | undefined,
): string {
  if (!runs?.length) return ''
  const parts: string[] = []
  for (const run of runs) {
    if (run.text === ' • ') break
    parts.push(run.text ?? '')
  }
  return parts.join('').trim()
}

function pickMusicThumbnail(thumbnail: unknown): string {
  if (!thumbnail || typeof thumbnail !== 'object') return ''
  const renderer = thumbnail as {
    musicThumbnailRenderer?: {
      thumbnail?: { thumbnails?: Array<{ url?: string }> }
    }
    thumbnails?: Array<{ url?: string }>
  }
  const thumbs =
    renderer.musicThumbnailRenderer?.thumbnail?.thumbnails ??
    renderer.thumbnails
  const list = thumbs ?? []
  const best = list[list.length - 1] ?? list[0]
  return best?.url ?? ''
}

function watchVideoId(endpoint: unknown): string | null {
  if (!endpoint || typeof endpoint !== 'object') return null
  const watch = (endpoint as { watchEndpoint?: { videoId?: string } })
    .watchEndpoint
  return watch?.videoId ?? null
}

function browseId(endpoint: unknown): string | null {
  if (!endpoint || typeof endpoint !== 'object') return null
  const browse = (endpoint as { browseEndpoint?: { browseId?: string } })
    .browseEndpoint
  return browse?.browseId ?? null
}

function parseSongItem(item: JsonObject): YtmSearchResult | null {
  const videoId =
    watchVideoId(item.navigationEndpoint) ??
    watchVideoId(
      (
        item.overlay as {
          musicItemThumbnailOverlayRenderer?: {
            content?: {
              musicPlayButtonRenderer?: {
                playNavigationEndpoint?: unknown
              }
            }
          }
        }
      )?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer
        ?.playNavigationEndpoint,
    )

  if (!videoId) return null

  const columns = item.flexColumns as
    | Array<{
        musicResponsiveListItemFlexColumnRenderer?: {
          text?: { runs?: Array<{ text?: string }> }
        }
      }>
    | undefined

  const title = runsText(
    columns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs,
  )
  const channelTitle = songArtistLine(
    columns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs,
  )

  if (!title) return null

  return {
    id: videoId,
    title,
    channelTitle: channelTitle || 'Unknown artist',
    thumbnail: pickMusicThumbnail(item.thumbnail),
    type: 'song',
  }
}

function parseArtistItem(item: JsonObject): YtmSearchResult | null {
  const id = browseId(item.navigationEndpoint)
  if (!id) return null

  const columns = item.flexColumns as
    | Array<{
        musicResponsiveListItemFlexColumnRenderer?: {
          text?: { runs?: Array<{ text?: string }> }
        }
      }>
    | undefined

  const title = runsText(
    columns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs,
  )
  const channelTitle = runsText(
    columns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs,
  )

  if (!title) return null

  return {
    id,
    title,
    channelTitle: channelTitle || title,
    thumbnail: pickMusicThumbnail(item.thumbnail),
    type: 'artist',
  }
}

function collectFromShelf(
  shelf: JsonObject,
  kind: 'song' | 'artist',
  out: YtmSearchResult[],
  seen: Set<string>,
) {
  const contents = shelf.contents as Array<JsonObject> | undefined
  if (!contents) return

  for (const entry of contents) {
    const item = entry.musicResponsiveListItemRenderer as JsonObject | undefined
    if (!item) continue

    const parsed =
      kind === 'song' ? parseSongItem(item) : parseArtistItem(item)
    if (!parsed || seen.has(parsed.id)) continue
    seen.add(parsed.id)
    out.push(parsed)
  }
}

function collectSearchResults(
  data: JsonObject,
  kind: 'song' | 'artist',
  limit: number,
): YtmSearchResult[] {
  const results: YtmSearchResult[] = []
  const seen = new Set<string>()

  const tabs = (
    data.contents as {
      tabbedSearchResultsRenderer?: {
        tabs?: Array<{
          tabRenderer?: {
            content?: {
              sectionListRenderer?: { contents?: Array<JsonObject> }
            }
          }
        }>
      }
    }
  )?.tabbedSearchResultsRenderer?.tabs

  for (const tab of tabs ?? []) {
    const sections =
      tab.tabRenderer?.content?.sectionListRenderer?.contents ?? []
    for (const section of sections) {
      const shelf = section.musicShelfRenderer as JsonObject | undefined
      if (shelf) collectFromShelf(shelf, kind, results, seen)

      const card = section.musicCardShelfRenderer as JsonObject | undefined
      if (card && kind === 'song') {
        const cardContents = card.contents as Array<JsonObject> | undefined
        for (const entry of cardContents ?? []) {
          const item = entry.musicResponsiveListItemRenderer as
            | JsonObject
            | undefined
          if (!item) continue
          const parsed = parseSongItem(item)
          if (!parsed || seen.has(parsed.id)) continue
          seen.add(parsed.id)
          results.unshift(parsed)
        }
      }

      if (results.length >= limit) return results.slice(0, limit)
    }
  }

  return results.slice(0, limit)
}

function collectArtistTopSongs(
  data: JsonObject,
  limit: number,
): YtmSearchResult[] {
  const results: YtmSearchResult[] = []
  const seen = new Set<string>()

  const tabs = (
    data.contents as {
      singleColumnBrowseResultsRenderer?: {
        tabs?: Array<{
          tabRenderer?: {
            content?: {
              sectionListRenderer?: { contents?: Array<JsonObject> }
            }
          }
        }>
      }
    }
  )?.singleColumnBrowseResultsRenderer?.tabs

  for (const tab of tabs ?? []) {
    const sections =
      tab.tabRenderer?.content?.sectionListRenderer?.contents ?? []
    for (const section of sections) {
      const shelf = section.musicShelfRenderer as JsonObject | undefined
      if (!shelf?.contents) continue

      const title = runsText(
        (shelf.title as { runs?: Array<{ text?: string }> })?.runs,
      ).toLowerCase()
      if (!title.includes('song')) continue

      collectFromShelf(shelf, 'song', results, seen)
      if (results.length >= limit) return results.slice(0, limit)
    }
  }

  return results.slice(0, limit)
}

export async function searchYtmSongs(
  query: string,
  limit = 15,
): Promise<YtmSearchResult[]> {
  const data = await ytmusicRequest('search', {
    query,
    params: FILTER_SONGS,
  })
  return collectSearchResults(data, 'song', limit)
}

export async function searchYtmArtists(
  query: string,
  limit = 10,
): Promise<YtmSearchResult[]> {
  const data = await ytmusicRequest('search', {
    query,
    params: FILTER_ARTISTS,
  })
  return collectSearchResults(data, 'artist', limit)
}

export async function fetchYtmArtistTracks(
  browseId: string,
  limit = 12,
): Promise<YtmSearchResult[]> {
  const data = await ytmusicRequest('browse', { browseId })
  return collectArtistTopSongs(data, limit)
}
