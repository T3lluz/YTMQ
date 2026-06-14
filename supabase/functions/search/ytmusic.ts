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

function songVideoType(item: JsonObject): string | null {
  const playEndpoint = (
    item.overlay as {
      musicItemThumbnailOverlayRenderer?: {
        content?: {
          musicPlayButtonRenderer?: {
            playNavigationEndpoint?: {
              watchEndpoint?: {
                watchEndpointMusicSupportedConfigs?: {
                  watchEndpointMusicConfig?: { musicVideoType?: string }
                }
              }
            }
          }
        }
      }
    }
  )?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer
    ?.playNavigationEndpoint

  return (
    playEndpoint as {
      watchEndpoint?: {
        watchEndpointMusicSupportedConfigs?: {
          watchEndpointMusicConfig?: { musicVideoType?: string }
        }
      }
    }
  )?.watchEndpoint?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig
    ?.musicVideoType ?? null
}

function isMusicTrackItem(item: JsonObject): boolean {
  const mvType = songVideoType(item)
  return mvType !== 'MUSIC_VIDEO_TYPE_UGC'
}

function parseSongItem(item: JsonObject): YtmSearchResult | null {
  if (!isMusicTrackItem(item)) return null

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

  return results.slice(0, limit)
}

function findArtistTopSongsEndpoint(
  data: JsonObject,
): { browseId: string; params?: string } | null {
  for (const section of browseSections(data)) {
    const shelf = section.musicShelfRenderer as JsonObject | undefined
    const endpoint = (
      shelf?.bottomEndpoint as {
        browseEndpoint?: {
          browseId?: string
          params?: string
          browseEndpointContextSupportedConfigs?: {
            browseEndpointContextMusicConfig?: { pageType?: string }
          }
        }
      }
    )?.browseEndpoint
    if (!endpoint?.browseId) continue

    const title = runsText(
      (shelf?.title as { runs?: Array<{ text?: string }> })?.runs,
    ).toLowerCase()
    const isPlaylist =
      endpoint.browseEndpointContextSupportedConfigs
        ?.browseEndpointContextMusicConfig?.pageType ===
      'MUSIC_PAGE_TYPE_PLAYLIST'

    if (isPlaylist && /top songs|popular|songs|hits/.test(title)) {
      return { browseId: endpoint.browseId, params: endpoint.params }
    }
  }

  for (const section of browseSections(data)) {
    const endpoint = (
      (section.musicShelfRenderer as JsonObject | undefined)?.bottomEndpoint as {
        browseEndpoint?: {
          browseId?: string
          params?: string
          browseEndpointContextSupportedConfigs?: {
            browseEndpointContextMusicConfig?: { pageType?: string }
          }
        }
      }
    )?.browseEndpoint
    if (
      endpoint?.browseId &&
      endpoint.browseEndpointContextSupportedConfigs
        ?.browseEndpointContextMusicConfig?.pageType === 'MUSIC_PAGE_TYPE_PLAYLIST'
    ) {
      return { browseId: endpoint.browseId, params: endpoint.params }
    }
  }

  return null
}

function playlistShelfFromData(data: JsonObject): JsonObject | null {
  const twoColumn = (
    data.contents as {
      twoColumnBrowseResultsRenderer?: {
        secondaryContents?: {
          sectionListRenderer?: { contents?: Array<JsonObject> }
        }
      }
    }
  )?.twoColumnBrowseResultsRenderer?.secondaryContents?.sectionListRenderer
    ?.contents?.[0]?.musicPlaylistShelfRenderer

  if (twoColumn) return twoColumn as JsonObject

  const primary = (
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
  )?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content
    ?.sectionListRenderer?.contents?.[0]?.musicPlaylistShelfRenderer

  return (
    (primary as JsonObject | undefined) ??
    (data.continuationContents as { musicPlaylistShelfContinuation?: JsonObject })
      ?.musicPlaylistShelfContinuation ??
    null
  )
}

function extractPlaylistContinuation(data: JsonObject): string | null {
  const shelf = playlistShelfFromData(data)
  if (!shelf) return null

  const fromContinuations = (
    shelf.continuations as Array<{
      nextContinuationData?: { continuation?: string }
    }> | undefined
  )?.[0]?.nextContinuationData?.continuation
  if (fromContinuations) return fromContinuations

  for (const entry of (shelf.contents as Array<JsonObject> | undefined) ?? []) {
    const token = (
      entry.continuationItemRenderer as {
        continuationEndpoint?: {
          continuationCommand?: { token?: string }
        }
      }
    )?.continuationEndpoint?.continuationCommand?.token
    if (token) return token
  }

  return null
}

function collectPlaylistShelfSongs(
  data: JsonObject,
  out: YtmSearchResult[],
  seen: Set<string>,
) {
  const shelf = playlistShelfFromData(data)
  if (!shelf?.contents) return

  for (const entry of shelf.contents as Array<JsonObject>) {
    const item = entry.musicResponsiveListItemRenderer as JsonObject | undefined
    if (!item) continue
    const parsed = parseSongItem(item)
    if (!parsed || seen.has(parsed.id)) continue
    seen.add(parsed.id)
    out.push(parsed)
  }
}

const MAX_ARTIST_SONG_PAGES = 50

async function fetchPaginatedPlaylistSongs(
  browseId: string,
  params?: string,
): Promise<YtmSearchResult[]> {
  const results: YtmSearchResult[] = []
  const seen = new Set<string>()

  let data = await ytmusicRequest(
    'browse',
    params ? { browseId, params } : { browseId },
  )
  collectPlaylistShelfSongs(data, results, seen)

  let continuation = extractPlaylistContinuation(data)
  let pages = 1
  while (continuation && pages < MAX_ARTIST_SONG_PAGES) {
    data = await ytmusicRequest('browse', { continuation })
    collectPlaylistShelfSongs(data, results, seen)
    continuation = extractPlaylistContinuation(data)
    pages++
  }

  return results
}

async function fetchAllArtistSongs(
  browseId: string,
  artistData?: JsonObject,
): Promise<YtmSearchResult[]> {
  const data = artistData ?? (await ytmusicRequest('browse', { browseId }))
  const playlist = findArtistTopSongsEndpoint(data)

  if (playlist) {
    const songs = await fetchPaginatedPlaylistSongs(
      playlist.browseId,
      playlist.params,
    )
    if (songs.length > 0) return songs
  }

  return collectArtistSongs(data, 500)
}

function collectArtistTopSongs(
  data: JsonObject,
  limit: number,
): YtmSearchResult[] {
  return collectArtistSongs(data, limit)
}

function collectArtistDetail(
  data: JsonObject,
  songs: YtmSearchResult[],
): YtmArtistDetail {
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
    songs,
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

export type YtmChartPlaylist = {
  title: string
  browseId: string
  thumbnail: string
}

export type YtmMoodCategory = {
  title: string
  params: string
}

export type YtmMoodSection = {
  title: string
  categories: YtmMoodCategory[]
}

export type YtmDiscover = {
  country: string
  countries: string[]
  trending: YtmSearchResult[]
  charts: YtmChartPlaylist[]
  moods: YtmMoodSection[]
}

function parseChartCountryOptions(data: JsonObject): string[] {
  const mutations =
    (
      data.frameworkUpdates as {
        entityBatchUpdate?: {
          mutations?: Array<{
            payload?: {
              musicFormBooleanChoice?: { opaqueToken?: string }
            }
          }>
        }
      }
    )?.entityBatchUpdate?.mutations ?? []

  const options = mutations
    .map((m) => m.payload?.musicFormBooleanChoice?.opaqueToken)
    .filter((code): code is string => typeof code === 'string' && code.length === 2)

  return [...new Set(options)]
}

function parseChartPlaylists(data: JsonObject): YtmChartPlaylist[] {
  const playlists: YtmChartPlaylist[] = []
  const seen = new Set<string>()

  for (const section of browseSections(data)) {
    const carousel = section.musicCarouselShelfRenderer as JsonObject | undefined
    if (!carousel?.contents) continue

    const label = sectionLabel(section).toLowerCase()
    if (!/chart|video|daily|top|trending/.test(label)) continue

    for (const entry of carousel.contents as Array<JsonObject>) {
      const row = entry.musicTwoRowItemRenderer as JsonObject | undefined
      if (!row) continue

      const playlistBrowseId = browseIdFromNav(row.navigationEndpoint)
      if (!playlistBrowseId?.startsWith('VL') || seen.has(playlistBrowseId)) continue
      seen.add(playlistBrowseId)

      const title = runsText(
        (row.title as { runs?: Array<{ text?: string }> })?.runs,
      )
      if (!title) continue

      playlists.push({
        title,
        browseId: playlistBrowseId,
        thumbnail: pickMusicThumbnail(
          (row.thumbnailRenderer as { musicThumbnailRenderer?: unknown })
            ?.musicThumbnailRenderer ?? row.thumbnail,
        ),
      })
    }
  }

  return playlists
}

function browseIdFromNav(endpoint: unknown): string | null {
  return (
    browseId(endpoint) ??
    (
      endpoint as {
        browseEndpoint?: { browseId?: string }
      }
    )?.browseEndpoint?.browseId ??
    null
  )
}

function collectCarouselSongs(
  section: JsonObject,
  limit: number,
): YtmSearchResult[] {
  const carousel = section.musicCarouselShelfRenderer as JsonObject | undefined
  if (!carousel?.contents) return []

  const results: YtmSearchResult[] = []
  const seen = new Set<string>()

  for (const entry of carousel.contents as Array<JsonObject>) {
    const parsed = parseSongEntry(entry)
    if (!parsed || parsed.type !== 'song' || seen.has(parsed.id)) continue
    seen.add(parsed.id)
    results.push(parsed)
    if (results.length >= limit) break
  }

  return results
}

function parseMoodCategories(data: JsonObject): YtmMoodSection[] {
  const sections: YtmMoodSection[] = []

  for (const section of browseSections(data)) {
    const grid = section.gridRenderer as JsonObject | undefined
    if (!grid?.items) continue

    const title = runsText(
      (grid.header as {
        gridHeaderRenderer?: { title?: { runs?: Array<{ text?: string }> } }
      })?.gridHeaderRenderer?.title?.runs,
    )

    const categories: YtmMoodCategory[] = []
    for (const entry of grid.items as Array<JsonObject>) {
      const button = entry.musicNavigationButtonRenderer as JsonObject | undefined
      if (!button) continue

      const params = (
        button.clickCommand as {
          browseEndpoint?: { params?: string }
        }
      )?.browseEndpoint?.params

      const categoryTitle = runsText(
        (button.buttonText as { runs?: Array<{ text?: string }> })?.runs,
      )

      if (!params || !categoryTitle) continue
      categories.push({ title: categoryTitle, params })
    }

    if (categories.length > 0) {
      sections.push({ title: title || 'Browse', categories })
    }
  }

  return sections
}

function parseMoodPlaylists(data: JsonObject): YtmChartPlaylist[] {
  const playlists: YtmChartPlaylist[] = []
  const seen = new Set<string>()

  for (const section of browseSections(data)) {
    const carousel = section.musicCarouselShelfRenderer as JsonObject | undefined
    const grid = section.gridRenderer as JsonObject | undefined
    const entries = (carousel?.contents ?? grid?.items ?? []) as Array<JsonObject>

    for (const entry of entries) {
      const row = entry.musicTwoRowItemRenderer as JsonObject | undefined
      if (!row) continue

      const playlistBrowseId = browseIdFromNav(row.navigationEndpoint)
      if (!playlistBrowseId || seen.has(playlistBrowseId)) continue
      seen.add(playlistBrowseId)

      const title = runsText(
        (row.title as { runs?: Array<{ text?: string }> })?.runs,
      )
      if (!title) continue

      playlists.push({
        title,
        browseId: playlistBrowseId,
        thumbnail: pickMusicThumbnail(
          (row.thumbnailRenderer as { musicThumbnailRenderer?: unknown })
            ?.musicThumbnailRenderer ?? row.thumbnail,
        ),
      })
    }
  }

  return playlists
}

export async function fetchYtmExploreTrending(
  limit = 12,
): Promise<YtmSearchResult[]> {
  const data = await ytmusicRequest('browse', { browseId: 'FEmusic_explore' })

  for (const section of browseSections(data)) {
    const label = sectionLabel(section).toLowerCase()
    if (!/trending/.test(label)) continue
    const songs = collectCarouselSongs(section, limit)
    if (songs.length > 0) return songs
  }

  return []
}

export async function fetchYtmCharts(
  country = 'ZZ',
): Promise<{ country: string; countries: string[]; playlists: YtmChartPlaylist[] }> {
  const data = await ytmusicRequest('browse', {
    browseId: 'FEmusic_charts',
    formData: { selectedValues: [country] },
  })

  return {
    country,
    countries: parseChartCountryOptions(data),
    playlists: parseChartPlaylists(data),
  }
}

export async function fetchYtmMoodCategories(): Promise<YtmMoodSection[]> {
  const data = await ytmusicRequest('browse', {
    browseId: 'FEmusic_moods_and_genres',
  })
  return parseMoodCategories(data)
}

export async function fetchYtmMoodPlaylists(
  params: string,
): Promise<YtmChartPlaylist[]> {
  const data = await ytmusicRequest('browse', {
    browseId: 'FEmusic_moods_and_genres_category',
    params,
  })
  return parseMoodPlaylists(data)
}

export async function fetchYtmPlaylistTracks(
  browseId: string,
  limit = 30,
): Promise<YtmSearchResult[]> {
  const songs = await fetchPaginatedPlaylistSongs(browseId)
  return songs.slice(0, limit)
}

export async function fetchYtmDiscover(country = 'ZZ'): Promise<YtmDiscover> {
  const [trending, charts, moods] = await Promise.all([
    fetchYtmExploreTrending(10),
    fetchYtmCharts(country),
    fetchYtmMoodCategories(),
  ])

  return {
    country: charts.country,
    countries: charts.countries,
    trending,
    charts: charts.playlists,
    moods,
  }
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
): Promise<YtmSearchResult[]> {
  return fetchAllArtistSongs(browseId)
}

export async function fetchYtmArtistDetail(
  browseId: string,
): Promise<YtmArtistDetail> {
  const artistData = await ytmusicRequest('browse', { browseId })
  const songs = await fetchAllArtistSongs(browseId, artistData)
  const detail = collectArtistDetail(artistData, songs)
  return { ...detail, id: browseId, title: detail.title || 'Artist' }
}

export async function fetchYtmAlbumTracks(
  browseId: string,
  limit = 50,
): Promise<YtmSearchResult[]> {
  const data = await ytmusicRequest('browse', { browseId })
  return collectAlbumTracks(data, limit)
}
