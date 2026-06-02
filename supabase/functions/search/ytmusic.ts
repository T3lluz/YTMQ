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
  type: 'song' | 'artist' | 'album'
  subtitle?: string
}

export type YtmArtistDetail = {
  id: string
  title: string
  thumbnail: string
  songs: YtmSearchResult[]
  albums: YtmSearchResult[]
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

function parseSongTwoRow(item: JsonObject): YtmSearchResult | null {
  const videoId =
    watchVideoId(item.navigationEndpoint) ??
    watchVideoId(
      (
        item.thumbnailOverlay as {
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

  const title = runsText((item.title as { runs?: Array<{ text?: string }> })?.runs)
  const subtitle = runsText(
    (item.subtitle as { runs?: Array<{ text?: string }> })?.runs,
  )

  if (!title) return null

  return {
    id: videoId,
    title,
    channelTitle: subtitle || 'Unknown artist',
    thumbnail: pickMusicThumbnail(
      (item.thumbnailRenderer as { musicThumbnailRenderer?: unknown })
        ?.musicThumbnailRenderer ?? item.thumbnail,
    ),
    type: 'song',
  }
}

function parseSongEntry(entry: JsonObject): YtmSearchResult | null {
  const list = entry.musicResponsiveListItemRenderer as JsonObject | undefined
  if (list) return parseSongItem(list)

  const twoRow = entry.musicTwoRowItemRenderer as JsonObject | undefined
  if (twoRow) return parseSongTwoRow(twoRow)

  return null
}
function parseAlbumItem(item: JsonObject): YtmSearchResult | null {
  const id = browseId(item.navigationEndpoint)
  if (!id) return null

  const title = runsText((item.title as { runs?: Array<{ text?: string }> })?.runs)
  const subtitle = runsText(
    (item.subtitle as { runs?: Array<{ text?: string }> })?.runs,
  )

  if (!title) return null

  return {
    id,
    title,
    channelTitle: subtitle || 'Album',
    subtitle,
    thumbnail: pickMusicThumbnail(
      (item.thumbnailRenderer as { musicThumbnailRenderer?: unknown })
        ?.musicThumbnailRenderer ?? item.thumbnail,
    ),
    type: 'album',
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

function collectMixedSearchResults(
  data: JsonObject,
  limit: number,
): YtmSearchResult[] {
  const songs: YtmSearchResult[] = []
  const artists: YtmSearchResult[] = []
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
      const card = section.musicCardShelfRenderer as JsonObject | undefined
      if (card) {
        for (const entry of (card.contents as Array<JsonObject> | undefined) ??
          []) {
          const item = entry.musicResponsiveListItemRenderer as
            | JsonObject
            | undefined
          if (!item) continue
          const parsed = parseSongItem(item) ?? parseArtistItem(item)
          if (!parsed || seen.has(`${parsed.type}:${parsed.id}`)) continue
          seen.add(`${parsed.type}:${parsed.id}`)
          if (parsed.type === 'song') songs.unshift(parsed)
          else artists.unshift(parsed)
        }
      }

      const shelf = section.musicShelfRenderer as JsonObject | undefined
      if (shelf) {
        for (const entry of (shelf.contents as Array<JsonObject> | undefined) ??
          []) {
          const item = entry.musicResponsiveListItemRenderer as
            | JsonObject
            | undefined
          if (!item) continue
          const parsed = parseSongItem(item) ?? parseArtistItem(item)
          if (!parsed || seen.has(`${parsed.type}:${parsed.id}`)) continue
          seen.add(`${parsed.type}:${parsed.id}`)
          if (parsed.type === 'song') songs.push(parsed)
          else artists.push(parsed)
        }
      }
    }
  }

  return [...songs, ...artists].slice(0, limit)
}

function browseSections(data: JsonObject): Array<JsonObject> {
  const tabs =
    (data.contents as {
      singleColumnBrowseResultsRenderer?: {
        tabs?: Array<{
          tabRenderer?: {
            content?: {
              sectionListRenderer?: { contents?: Array<JsonObject> }
            }
          }
        }>
      }
    })?.singleColumnBrowseResultsRenderer?.tabs ??
    (data.contents as {
      sectionListRenderer?: { contents?: Array<JsonObject> }
    })?.sectionListRenderer?.contents?.map((section) => ({
      tabRenderer: { content: { sectionListRenderer: { contents: [section] } } },
    }))

  const sections: Array<JsonObject> = []
  for (const tab of tabs ?? []) {
    sections.push(
      ...(tab.tabRenderer?.content?.sectionListRenderer?.contents ?? []),
    )
  }
  return sections
}

function sectionLabel(section: JsonObject): string {
  const shelf = section.musicShelfRenderer as JsonObject | undefined
  if (shelf?.title) {
    return runsText(
      (shelf.title as { runs?: Array<{ text?: string }> })?.runs,
    )
  }

  const carousel = section.musicCarouselShelfRenderer as JsonObject | undefined
  if (carousel) {
    return runsText(
      (carousel.header as {
        musicCarouselShelfBasicHeaderRenderer?: {
          title?: { runs?: Array<{ text?: string }> }
        }
      })?.musicCarouselShelfBasicHeaderRenderer?.title?.runs ??
        (carousel.title as { runs?: Array<{ text?: string }> })?.runs,
    )
  }

  return ''
}

function isNonSongSection(title: string): boolean {
  const t = title.toLowerCase()
  return /album|single|video|podcast|compilation|\bep\b|live performance|interview|shorts|about|related|fans might|similar|featured|playlist|mix|stories|releases you|upcoming|latest release/.test(
    t,
  )
}

function songSectionPriority(title: string): number {
  const t = title.toLowerCase()
  if (/top songs|popular|hits|best known|most popular|trending/.test(t)) return 0
  if (/songs|tracks/.test(t)) return 1
  return 2
}

function collectSongsFromSection(
  section: JsonObject,
  out: YtmSearchResult[],
  seen: Set<string>,
) {
  const shelf = section.musicShelfRenderer as JsonObject | undefined
  if (shelf?.contents) {
    for (const entry of shelf.contents as Array<JsonObject>) {
      const parsed = parseSongEntry(entry)
      if (!parsed || seen.has(parsed.id)) continue
      seen.add(parsed.id)
      out.push(parsed)
    }
  }

  const carousel = section.musicCarouselShelfRenderer as JsonObject | undefined
  if (carousel?.contents) {
    for (const entry of carousel.contents as Array<JsonObject>) {
      const parsed = parseSongEntry(entry)
      if (!parsed || seen.has(parsed.id)) continue
      seen.add(parsed.id)
      out.push(parsed)
    }
  }
}

function collectArtistSongs(data: JsonObject, limit: number): YtmSearchResult[] {
  const results: YtmSearchResult[] = []
  const seen = new Set<string>()
  const sections = browseSections(data)

  const ranked = sections
    .map((section) => ({ section, title: sectionLabel(section) }))
    .filter(({ title }) => !isNonSongSection(title))
    .sort((a, b) => songSectionPriority(a.title) - songSectionPriority(b.title))

  for (const { section } of ranked) {
    collectSongsFromSection(section, results, seen)
    if (results.length >= limit) return results.slice(0, limit)
  }

  for (const section of sections) {
    collectSongsFromSection(section, results, seen)
    if (results.length >= limit) return results.slice(0, limit)
  }

  return results.slice(0, limit)
}

function collectArtistTopSongs(
  data: JsonObject,
  limit: number,
): YtmSearchResult[] {
  return collectArtistSongs(data, limit)
}

function collectArtistDetail(data: JsonObject, limit: number): YtmArtistDetail {
  const header = (
    data.header as {
      musicImmersiveHeaderRenderer?: {
        title?: { runs?: Array<{ text?: string }> }
        thumbnail?: unknown
      }
      musicVisualHeaderRenderer?: {
        title?: { runs?: Array<{ text?: string }> }
        thumbnail?: unknown
      }
    }
  )?.musicImmersiveHeaderRenderer ??
    (data.header as { musicVisualHeaderRenderer?: unknown })
      ?.musicVisualHeaderRenderer

  const title = runsText(
    (header as { title?: { runs?: Array<{ text?: string }> } })?.title?.runs,
  )
  const thumbnail = pickMusicThumbnail(
    (header as { thumbnail?: unknown })?.thumbnail,
  )

  return {
    id: '',
    title: title || 'Artist',
    thumbnail,
    songs: collectArtistSongs(data, limit),
    albums: [],
  }
}

function collectAlbumTracks(data: JsonObject, limit: number): YtmSearchResult[] {
  const results: YtmSearchResult[] = []
  const seen = new Set<string>()

  for (const section of browseSections(data)) {
    const shelf = section.musicShelfRenderer as JsonObject | undefined
    if (shelf) collectFromShelf(shelf, 'song', results, seen)
    if (results.length >= limit) break
  }

  return results.slice(0, limit)
}

export async function searchYtmSongs(
  query: string,
  limit = 20,
): Promise<YtmSearchResult[]> {
  const data = await ytmusicRequest('search', {
    query,
    params: FILTER_SONGS,
  })
  return collectSearchResults(data, 'song', limit)
}

export async function searchYtmArtists(
  query: string,
  limit = 15,
): Promise<YtmSearchResult[]> {
  const data = await ytmusicRequest('search', {
    query,
    params: FILTER_ARTISTS,
  })
  return collectSearchResults(data, 'artist', limit)
}

export async function searchYtmAll(
  query: string,
  limit = 25,
): Promise<YtmSearchResult[]> {
  const [mixedData, songData] = await Promise.all([
    ytmusicRequest('search', { query }),
    ytmusicRequest('search', { query, params: FILTER_SONGS }),
  ])

  const mixed = collectMixedSearchResults(mixedData, limit)
  const topSongs = collectSearchResults(songData, 'song', 8)
  const seen = new Set(mixed.map((item) => `${item.type}:${item.id}`))
  const merged = [...topSongs.filter((item) => {
    const key = `${item.type}:${item.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }), ...mixed]

  return merged.slice(0, limit)
}

export async function fetchYtmArtistTracks(
  browseId: string,
  limit = 80,
): Promise<YtmSearchResult[]> {
  const data = await ytmusicRequest('browse', { browseId })
  return collectArtistSongs(data, limit)
}

export async function fetchYtmArtistDetail(
  browseId: string,
  limit = 80,
): Promise<YtmArtistDetail> {
  const data = await ytmusicRequest('browse', { browseId })
  const detail = collectArtistDetail(data, limit)
  return { ...detail, id: browseId, title: detail.title || 'Artist' }
}

export async function fetchYtmAlbumTracks(
  browseId: string,
  limit = 50,
): Promise<YtmSearchResult[]> {
  const data = await ytmusicRequest('browse', { browseId })
  return collectAlbumTracks(data, limit)
}
