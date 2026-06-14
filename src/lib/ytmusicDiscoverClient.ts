import type {
  ChartPlaylist,
  DiscoverFeed,
  MoodSection,
  SearchResultItem,
} from './search'

const CLIENT = {
  clientName: 'WEB_REMIX',
  clientVersion: '1.20250219.01.00',
  hl: 'en',
  gl: 'US',
} as const

type JsonObject = Record<string, unknown>

function runsText(runs: Array<{ text?: string }> | undefined): string {
  if (!runs?.length) return ''
  return runs.map((r) => r.text ?? '').join('').trim()
}

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

function pickThumb(thumbnail: unknown): string {
  if (!thumbnail || typeof thumbnail !== 'object') return ''
  const renderer = thumbnail as {
    musicThumbnailRenderer?: {
      thumbnail?: { thumbnails?: Array<{ url?: string }> }
    }
    thumbnails?: Array<{ url?: string }>
  }
  const list =
    renderer.musicThumbnailRenderer?.thumbnail?.thumbnails ??
    renderer.thumbnails ??
    []
  const best = list[list.length - 1] ?? list[0]
  return best?.url ?? ''
}

function watchVideoId(endpoint: unknown): string | null {
  if (!endpoint || typeof endpoint !== 'object') return null
  return (endpoint as { watchEndpoint?: { videoId?: string } }).watchEndpoint
    ?.videoId ?? null
}

function browseIdFrom(endpoint: unknown): string | null {
  if (!endpoint || typeof endpoint !== 'object') return null
  return (endpoint as { browseEndpoint?: { browseId?: string } }).browseEndpoint
    ?.browseId ?? null
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
    })?.singleColumnBrowseResultsRenderer?.tabs ?? []

  const sections: Array<JsonObject> = []
  for (const tab of tabs) {
    sections.push(
      ...(tab.tabRenderer?.content?.sectionListRenderer?.contents ?? []),
    )
  }
  return sections
}

function sectionLabel(section: JsonObject): string {
  const carousel = section.musicCarouselShelfRenderer as JsonObject | undefined
  if (carousel) {
    return runsText(
      (carousel.header as {
        musicCarouselShelfBasicHeaderRenderer?: {
          title?: { runs?: Array<{ text?: string }> }
        }
      })?.musicCarouselShelfBasicHeaderRenderer?.title?.runs,
    )
  }
  return ''
}

function musicVideoTypeFromPlayEndpoint(endpoint: unknown): string | null {
  return (
    endpoint as {
      watchEndpoint?: {
        watchEndpointMusicSupportedConfigs?: {
          watchEndpointMusicConfig?: { musicVideoType?: string }
        }
      }
    }
  )?.watchEndpoint?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig
    ?.musicVideoType ?? null
}

function songVideoTypeFromListItem(item: JsonObject): string | null {
  const playEndpoint = (
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
    ?.playNavigationEndpoint

  return musicVideoTypeFromPlayEndpoint(playEndpoint)
}

function songVideoTypeFromTwoRow(item: JsonObject): string | null {
  const playEndpoint = (
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
    ?.playNavigationEndpoint

  return musicVideoTypeFromPlayEndpoint(playEndpoint)
}

/** Audio tracks only — exclude official music videos, UGC, and compilations. */
function isMusicTrackItem(item: JsonObject): boolean {
  const mvType = songVideoTypeFromListItem(item) ?? songVideoTypeFromTwoRow(item)
  if (!mvType) return true
  return (
    mvType === 'MUSIC_VIDEO_TYPE_ATV' ||
    mvType === 'MUSIC_VIDEO_TYPE_PRIVATELY_OWNED_TRACK'
  )
}

function parseSongItem(item: JsonObject): SearchResultItem | null {
  if (!isMusicTrackItem(item)) return null

  const videoId = watchVideoId(item.navigationEndpoint)
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
  if (!title) return null

  return {
    id: videoId,
    title,
    channelTitle:
      songArtistLine(
        columns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs,
      ) || 'Unknown artist',
    thumbnail: pickThumb(item.thumbnail),
    type: 'song',
  }
}

function parseSongEntry(entry: JsonObject): SearchResultItem | null {
  const list = entry.musicResponsiveListItemRenderer as JsonObject | undefined
  if (list) return parseSongItem(list)

  const twoRow = entry.musicTwoRowItemRenderer as JsonObject | undefined
  if (!twoRow || !isMusicTrackItem(twoRow)) return null

  const videoId = watchVideoId(twoRow.navigationEndpoint)
  if (!videoId) return null

  const title = runsText(
    (twoRow.title as { runs?: Array<{ text?: string }> })?.runs,
  )
  if (!title) return null

  return {
    id: videoId,
    title,
    channelTitle:
      runsText((twoRow.subtitle as { runs?: Array<{ text?: string }> })?.runs) ||
      'Unknown artist',
    thumbnail: pickThumb(
      (twoRow.thumbnailRenderer as { musicThumbnailRenderer?: unknown })
        ?.musicThumbnailRenderer ?? twoRow.thumbnail,
    ),
    type: 'song',
  }
}

async function ytmBrowse(body: JsonObject): Promise<JsonObject> {
  const res = await fetch('/api/ytmusic/browse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context: { client: CLIENT }, ...body }),
  })
  if (!res.ok) {
    throw new Error(`YouTube Music browse failed (${res.status})`)
  }
  return (await res.json()) as JsonObject
}

function parseTrending(data: JsonObject, limit = 10): SearchResultItem[] {
  for (const section of browseSections(data)) {
    if (!/trending/i.test(sectionLabel(section))) continue
    const carousel = section.musicCarouselShelfRenderer as JsonObject | undefined
    if (!carousel?.contents) continue

    const songs: SearchResultItem[] = []
    const seen = new Set<string>()
    for (const entry of carousel.contents as Array<JsonObject>) {
      const parsed = parseSongEntry(entry)
      if (!parsed || seen.has(parsed.id)) continue
      seen.add(parsed.id)
      songs.push(parsed)
      if (songs.length >= limit) return songs
    }
    if (songs.length > 0) return songs
  }
  return []
}

function isSongChartTitle(title: string): boolean {
  const t = title.toLowerCase()
  if (/\bvideo\b|\bmv\b|\bshorts\b/.test(t)) return false
  return /\bsong|\btop|\bdaily|\bchart|\btrending|\b100\b/.test(t)
}

function normalizeChartTitle(title: string, country: string): string {
  if (country === 'ZZ') {
    return title
      .replace(/\bUnited States\b/i, 'Worldwide')
      .replace(/\bUS\b(?=\s*$|\s*[-–—])/i, 'Worldwide')
      .replace(/\(\s*US\s*\)/i, '(Worldwide)')
  }
  return title
}

function parseCharts(data: JsonObject, country = 'ZZ'): ChartPlaylist[] {
  const playlists: ChartPlaylist[] = []
  const seen = new Set<string>()

  for (const section of browseSections(data)) {
    const carousel = section.musicCarouselShelfRenderer as JsonObject | undefined
    if (!carousel?.contents) continue
    if (!/chart|daily|top/i.test(sectionLabel(section).toLowerCase())) {
      continue
    }
    if (/\bvideo\b|\bmv\b/.test(sectionLabel(section).toLowerCase())) {
      continue
    }

    for (const entry of carousel.contents as Array<JsonObject>) {
      const row = entry.musicTwoRowItemRenderer as JsonObject | undefined
      if (!row) continue
      const id = browseIdFrom(row.navigationEndpoint)
      if (!id?.startsWith('VL') || seen.has(id)) continue
      seen.add(id)

      const rawTitle = runsText(
        (row.title as { runs?: Array<{ text?: string }> })?.runs,
      )
      if (!rawTitle || !isSongChartTitle(rawTitle)) continue

      playlists.push({
        title: normalizeChartTitle(rawTitle, country),
        browseId: id,
        thumbnail: pickThumb(
          (row.thumbnailRenderer as { musicThumbnailRenderer?: unknown })
            ?.musicThumbnailRenderer ?? row.thumbnail,
        ),
      })
    }
  }

  return playlists
}

function parseMoods(data: JsonObject): MoodSection[] {
  const sections: MoodSection[] = []

  for (const section of browseSections(data)) {
    const grid = section.gridRenderer as JsonObject | undefined
    if (!grid?.items) continue

    const title = runsText(
      (grid.header as {
        gridHeaderRenderer?: { title?: { runs?: Array<{ text?: string }> } }
      })?.gridHeaderRenderer?.title?.runs,
    )

    const categories = (grid.items as Array<JsonObject>)
      .map((entry) => {
        const button = entry.musicNavigationButtonRenderer as
          | JsonObject
          | undefined
        if (!button) return null
        const params = (
          button.clickCommand as { browseEndpoint?: { params?: string } }
        )?.browseEndpoint?.params
        const categoryTitle = runsText(
          (button.buttonText as { runs?: Array<{ text?: string }> })?.runs,
        )
        if (!params || !categoryTitle) return null
        return { title: categoryTitle, params }
      })
      .filter((item): item is { title: string; params: string } => item != null)

    if (categories.length > 0) {
      sections.push({ title: title || 'Browse', categories })
    }
  }

  return sections
}

function parseCountries(data: JsonObject): string[] {
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

  return [
    ...new Set(
      mutations
        .map((m) => m.payload?.musicFormBooleanChoice?.opaqueToken)
        .filter((code): code is string => typeof code === 'string' && code.length === 2),
    ),
  ]
}

function playlistShelf(data: JsonObject): JsonObject | null {
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

  return (
    (
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
      ?.sectionListRenderer?.contents?.[0]?.musicPlaylistShelfRenderer as
      | JsonObject
      | undefined
  ) ?? null
}

function parsePlaylistTracks(data: JsonObject, limit = 30): SearchResultItem[] {
  const shelf = playlistShelf(data)
  if (!shelf?.contents) return []

  const songs: SearchResultItem[] = []
  const seen = new Set<string>()
  for (const entry of shelf.contents as Array<JsonObject>) {
    const item = entry.musicResponsiveListItemRenderer as JsonObject | undefined
    if (!item) continue
    const parsed = parseSongItem(item)
    if (!parsed || seen.has(parsed.id)) continue
    seen.add(parsed.id)
    songs.push(parsed)
    if (songs.length >= limit) break
  }
  return songs
}

export function isDiscoverPayload(
  data: Record<string, unknown>,
): data is DiscoverFeed {
  return (
    Array.isArray(data.trending) ||
    Array.isArray(data.charts) ||
    Array.isArray(data.moods)
  )
}

/** Fetch discover via the Vite dev proxy (import.meta.env.DEV only). */
export async function fetchDiscoverViaProxy(
  country = 'ZZ',
): Promise<DiscoverFeed> {
  const [explore, chartsData, moodsData] = await Promise.all([
    ytmBrowse({ browseId: 'FEmusic_explore' }),
    ytmBrowse({
      browseId: 'FEmusic_charts',
      formData: { selectedValues: [country] },
    }),
    ytmBrowse({ browseId: 'FEmusic_moods_and_genres' }),
  ])

  return {
    country,
    countries: parseCountries(chartsData),
    trending: parseTrending(explore, 10),
    charts: parseCharts(chartsData, country),
    moods: parseMoods(moodsData),
  }
}

export async function fetchPlaylistTracksViaProxy(
  browseId: string,
): Promise<SearchResultItem[]> {
  const data = await ytmBrowse({ browseId })
  return parsePlaylistTracks(data)
}

export async function fetchMoodTracksViaProxy(
  params: string,
): Promise<{ label: string; tracks: SearchResultItem[] }> {
  const data = await ytmBrowse({
    browseId: 'FEmusic_moods_and_genres_category',
    params,
  })

  for (const section of browseSections(data)) {
    const carousel = section.musicCarouselShelfRenderer as JsonObject | undefined
    const entries = (carousel?.contents ?? []) as Array<JsonObject>
    for (const entry of entries) {
      const row = entry.musicTwoRowItemRenderer as JsonObject | undefined
      if (!row) continue
      const browseId = browseIdFrom(row.navigationEndpoint)
      const title = runsText(
        (row.title as { runs?: Array<{ text?: string }> })?.runs,
      )
      if (!browseId || !title) continue
      const tracks = await fetchPlaylistTracksViaProxy(browseId)
      return { label: title, tracks }
    }
  }

  return { label: 'Browse', tracks: [] }
}
