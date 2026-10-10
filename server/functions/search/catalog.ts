// The YTMQ catalog: search and browse YouTube Music the way Spotify's search
// reads. Every song carries all of its artists (with ids), its album, length
// and explicit flag; search answers with a top result plus songs, artists,
// albums, playlists and videos; artists, albums and playlists have pages.
//
// YouTube Music's own ranking is good at relevance but happily puts a 6K-play
// karaoke cover above the original. Songs are re-ranked here on relevance,
// how much of the query they cover, and popularity (plays), the way Spotify
// leans on popularity.

import {
  browseTarget,
  dig,
  groupText,
  hasExplicitBadge,
  parseCount,
  parseDuration,
  resizeArt,
  runGroups,
  runsOf,
  textOf,
  thumbnailOf,
  watchTarget,
  ytmusicRequest,
  type JsonObject,
  type Run,
} from './innertube.ts'

// --- Types (mirrored in src/lib/catalog.ts) ----------------------------------

export type ArtistRef = { id: string | null; name: string }
export type AlbumRef = { id: string | null; name: string }

export type CatalogTrack = {
  kind: 'track'
  videoId: string
  title: string
  artists: ArtistRef[]
  album: AlbumRef | null
  /** Seconds. */
  duration: number | null
  explicit: boolean
  thumbnail: string
  /** "1.9B plays" / "880M views", as YouTube Music words it. */
  plays: string | null
  /** A music video or upload rather than the audio track. */
  video: boolean
}

export type CatalogArtist = {
  kind: 'artist'
  id: string
  name: string
  thumbnail: string
  /** "79.9M monthly audience" or "7.19M subscribers". */
  audience: string | null
}

export type CatalogAlbum = {
  kind: 'album'
  id: string
  title: string
  artists: ArtistRef[]
  year: string | null
  /** Album, Single, EP, … */
  albumType: string
  explicit: boolean
  thumbnail: string
}

export type CatalogPlaylist = {
  kind: 'playlist'
  id: string
  title: string
  owner: string | null
  /** "35 songs" or "463 views". */
  meta: string | null
  thumbnail: string
}

export type CatalogItem = CatalogTrack | CatalogArtist | CatalogAlbum | CatalogPlaylist

export type SearchFilter = 'all' | 'songs' | 'artists' | 'albums' | 'playlists' | 'videos'

export type SearchAllResult = {
  top: CatalogItem | null
  tracks: CatalogTrack[]
  artists: CatalogArtist[]
  albums: CatalogAlbum[]
  playlists: CatalogPlaylist[]
  videos: CatalogTrack[]
}

export type ArtistPage = {
  id: string
  name: string
  /** Wide header image. */
  banner: string
  /** Square image for avatars. */
  avatar: string
  audience: string | null
  subscribers: string | null
  description: string | null
  topTracks: CatalogTrack[]
  /** The "all songs" playlist behind Top songs → Show all. */
  allTracksId: string | null
  albums: CatalogAlbum[]
  singles: CatalogAlbum[]
  videos: CatalogTrack[]
  featuredOn: CatalogPlaylist[]
  related: CatalogArtist[]
}

export type AlbumPage = {
  id: string
  title: string
  albumType: string
  year: string | null
  artists: ArtistRef[]
  thumbnail: string
  explicit: boolean
  /** "13 songs • 1 hour, 14 minutes". */
  summary: string | null
  description: string | null
  tracks: CatalogTrack[]
  otherVersions: CatalogAlbum[]
}

export type PlaylistPage = {
  id: string
  title: string
  owner: string | null
  thumbnail: string
  summary: string | null
  description: string | null
  tracks: CatalogTrack[]
}

// --- Search filter params (the same ones music.youtube.com sends) ------------

const PARAMS: Record<Exclude<SearchFilter, 'all'>, string> = {
  songs: 'EgWKAQIIAWoMEA4QChADEAQQCRAF',
  videos: 'EgWKAQIQAWoMEA4QChADEAQQCRAF',
  albums: 'EgWKAQIYAWoMEA4QChADEAQQCRAF',
  artists: 'EgWKAQIgAWoMEA4QChADEAQQCRAF',
  // Featured playlists: YouTube Music's own, the closest thing to Spotify's.
  playlists: 'EgeKAQQoADgBagwQDhAKEAMQBBAJEAU=',
}

// --- Cache ---------------------------------------------------------------------

const CACHE_TTL_MS = 10 * 60_000
const CACHE_MAX = 400
const cache = new Map<string, { at: number; value: Promise<unknown> }>()

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as Promise<T>
  const value = load()
  cache.set(key, { at: Date.now(), value })
  // A failed lookup is not worth remembering.
  value.catch(() => cache.delete(key))
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!)
  return value
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms)
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}

// --- Row parsers ---------------------------------------------------------------

const KIND_LABELS = /^(song|video|single|ep|album|episode|artist|playlist|profile|podcast|station|audiobook)$/i

function flexColumn(renderer: JsonObject, index: number): Run[] {
  return runsOf(
    dig(renderer, `flexColumns.${index}.musicResponsiveListItemFlexColumnRenderer.text`),
  )
}

function fixedColumnText(renderer: JsonObject, index: number): string {
  return textOf(
    dig(renderer, `fixedColumns.${index}.musicResponsiveListItemFixedColumnRenderer.text`),
  )
}

/** Artist runs in a group: linked ones carry ids; plain text is split on , & and x. */
function artistsFrom(group: Run[]): ArtistRef[] {
  const linked: ArtistRef[] = []
  let plain = ''
  for (const run of group) {
    const target = browseTarget(run.navigationEndpoint)
    if (
      target &&
      (target.pageType === 'MUSIC_PAGE_TYPE_ARTIST' ||
        target.pageType === 'MUSIC_PAGE_TYPE_USER_CHANNEL')
    ) {
      linked.push({ id: target.browseId, name: (run.text ?? '').trim() })
    } else {
      plain += run.text ?? ''
    }
  }
  const leftovers = plain
    .split(/\s*(?:,|&|\bx\b|\band\b)\s*/i)
    .map((s) => s.trim())
    .filter((s) => s && !KIND_LABELS.test(s))
  if (linked.length === 0) return leftovers.map((name) => ({ id: null, name }))
  // Mixed: "Daft Punk & Somebody-without-a-page".
  for (const name of leftovers) {
    if (!linked.some((a) => a.name.toLowerCase() === name.toLowerCase())) {
      linked.push({ id: null, name })
    }
  }
  return linked.filter((a) => a.name)
}

function rowVideoTarget(renderer: JsonObject) {
  return (
    watchTarget(
      dig(
        renderer,
        'overlay.musicItemThumbnailOverlayRenderer.content.musicPlayButtonRenderer.playNavigationEndpoint',
      ),
    ) ??
    watchTarget(renderer.navigationEndpoint) ??
    watchTarget(dig(flexColumn(renderer, 0), '0.navigationEndpoint'))
  )
}

function isAudioTrackType(type: string | null): boolean {
  return (
    !type ||
    type === 'MUSIC_VIDEO_TYPE_ATV' ||
    type === 'MUSIC_VIDEO_TYPE_PRIVATELY_OWNED_TRACK'
  )
}

/**
 * A song or video row (musicResponsiveListItemRenderer). `fallback` fills in
 * what album and artist pages leave out of their rows.
 */
function parseTrackRow(
  renderer: JsonObject,
  fallback: { artists?: ArtistRef[]; album?: AlbumRef | null; thumbnail?: string } = {},
): CatalogTrack | null {
  const videoId =
    dig<string>(renderer, 'playlistItemData.videoId') ?? rowVideoTarget(renderer)?.videoId
  if (!videoId) return null
  const title = groupText(flexColumn(renderer, 0))
  if (!title) return null

  const musicVideoType = rowVideoTarget(renderer)?.musicVideoType ?? null
  let kindLabel = ''
  let artists: ArtistRef[] = []
  let album: AlbumRef | null = null
  let duration: number | null = null
  let plays: string | null = null

  // Columns after the title: artists • album • length (search), or artists |
  // plays | album (artist pages), or plays in a column of its own.
  for (let col = 1; col < 4; col += 1) {
    const runs = flexColumn(renderer, col)
    if (runs.length === 0) continue
    for (const group of runGroups(runs)) {
      const text = groupText(group)
      if (!text) continue
      if (KIND_LABELS.test(text) && !kindLabel) {
        kindLabel = text.toLowerCase()
        continue
      }
      const albumRun = group.find(
        (r) => browseTarget(r.navigationEndpoint)?.pageType === 'MUSIC_PAGE_TYPE_ALBUM',
      )
      if (albumRun) {
        album = { id: browseTarget(albumRun.navigationEndpoint)!.browseId, name: text }
        continue
      }
      const asDuration = parseDuration(text)
      if (asDuration != null) {
        duration = asDuration
        continue
      }
      if (/\b(plays|views|play|view)$/i.test(text)) {
        plays = text
        continue
      }
      if (/^\d{4}$/.test(text)) continue
      if (artists.length === 0) artists = artistsFrom(group)
    }
  }
  if (duration == null) duration = parseDuration(fixedColumnText(renderer, 0))

  if (artists.length === 0 && fallback.artists) artists = fallback.artists
  if (!album && fallback.album) album = fallback.album
  const thumbnail = thumbnailOf(renderer.thumbnail, 544) || fallback.thumbnail || ''

  if (kindLabel === 'episode') return null
  const video = kindLabel === 'video' || !isAudioTrackType(musicVideoType)
  return {
    kind: 'track',
    videoId,
    title,
    artists,
    album,
    duration,
    explicit: hasExplicitBadge(renderer),
    thumbnail,
    plays,
    video,
  }
}

function parseArtistRow(renderer: JsonObject): CatalogArtist | null {
  const target = browseTarget(renderer.navigationEndpoint)
  if (!target || target.pageType !== 'MUSIC_PAGE_TYPE_ARTIST') return null
  const name = groupText(flexColumn(renderer, 0))
  if (!name) return null
  const sub = runGroups(flexColumn(renderer, 1))
    .map(groupText)
    .filter((t) => t && !KIND_LABELS.test(t))
  return {
    kind: 'artist',
    id: target.browseId,
    name,
    thumbnail: thumbnailOf(renderer.thumbnail, 544),
    audience: sub[0] ?? null,
  }
}

function parseAlbumRow(renderer: JsonObject): CatalogAlbum | null {
  const target = browseTarget(renderer.navigationEndpoint)
  if (!target || target.pageType !== 'MUSIC_PAGE_TYPE_ALBUM') return null
  const title = groupText(flexColumn(renderer, 0))
  if (!title) return null
  let albumType = 'Album'
  let year: string | null = null
  let artists: ArtistRef[] = []
  for (const group of runGroups(flexColumn(renderer, 1))) {
    const text = groupText(group)
    if (KIND_LABELS.test(text)) albumType = text
    else if (/^\d{4}$/.test(text)) year = text
    else if (artists.length === 0) artists = artistsFrom(group)
  }
  return {
    kind: 'album',
    id: target.browseId,
    title,
    artists,
    year,
    albumType,
    explicit: hasExplicitBadge(renderer),
    thumbnail: thumbnailOf(renderer.thumbnail, 544),
  }
}

function parsePlaylistRow(renderer: JsonObject): CatalogPlaylist | null {
  const target = browseTarget(renderer.navigationEndpoint)
  if (!target || target.pageType !== 'MUSIC_PAGE_TYPE_PLAYLIST') return null
  const title = groupText(flexColumn(renderer, 0))
  if (!title) return null
  const groups = runGroups(flexColumn(renderer, 1))
    .map(groupText)
    .filter((t) => t && !KIND_LABELS.test(t))
  return {
    kind: 'playlist',
    id: target.browseId,
    title,
    owner: groups[0] ?? null,
    meta: groups[1] ?? null,
    thumbnail: thumbnailOf(renderer.thumbnail, 544),
  }
}

/** Anything in a list row, by what it links to. */
function parseListItem(renderer: JsonObject): CatalogItem | null {
  const target = browseTarget(renderer.navigationEndpoint)
  if (target?.pageType === 'MUSIC_PAGE_TYPE_ARTIST') return parseArtistRow(renderer)
  if (target?.pageType === 'MUSIC_PAGE_TYPE_ALBUM') return parseAlbumRow(renderer)
  if (target?.pageType === 'MUSIC_PAGE_TYPE_PLAYLIST') return parsePlaylistRow(renderer)
  if (target) return null
  return parseTrackRow(renderer)
}

/** Carousel cards (musicTwoRowItemRenderer) on artist and browse pages. */
function parseTwoRow(renderer: JsonObject): CatalogItem | null {
  const title = textOf(renderer.title)
  if (!title) return null
  const target = browseTarget(renderer.navigationEndpoint)
  const subtitleRuns = runsOf(renderer.subtitle)
  const groups = runGroups(subtitleRuns)
  const thumbnail = thumbnailOf(renderer.thumbnailRenderer, 544)

  if (target?.pageType === 'MUSIC_PAGE_TYPE_ALBUM') {
    let albumType = 'Album'
    let year: string | null = null
    let artists: ArtistRef[] = []
    for (const group of groups) {
      const text = groupText(group)
      if (KIND_LABELS.test(text)) albumType = text
      else if (/^\d{4}$/.test(text)) year = text
      else if (artists.length === 0) artists = artistsFrom(group)
    }
    return {
      kind: 'album',
      id: target.browseId,
      title,
      artists,
      year,
      albumType,
      explicit: hasExplicitBadge(renderer),
      thumbnail,
    }
  }
  if (target?.pageType === 'MUSIC_PAGE_TYPE_ARTIST') {
    return {
      kind: 'artist',
      id: target.browseId,
      name: title,
      thumbnail,
      audience: groups.map(groupText).find((t) => t && !KIND_LABELS.test(t)) ?? null,
    }
  }
  if (target?.pageType === 'MUSIC_PAGE_TYPE_PLAYLIST') {
    const parts = groups.map(groupText).filter((t) => t && !KIND_LABELS.test(t))
    return { kind: 'playlist', id: target.browseId, title, owner: parts[0] ?? null, meta: parts[1] ?? null, thumbnail }
  }
  const watch = watchTarget(renderer.navigationEndpoint)
  if (watch) {
    let artists: ArtistRef[] = []
    let plays: string | null = null
    for (const group of groups) {
      const text = groupText(group)
      if (KIND_LABELS.test(text)) continue
      if (/\b(plays|views)$/i.test(text)) plays = text
      else if (artists.length === 0) artists = artistsFrom(group)
    }
    return {
      kind: 'track',
      videoId: watch.videoId,
      title,
      artists,
      album: null,
      duration: null,
      explicit: hasExplicitBadge(renderer),
      thumbnail,
      plays,
      video: !isAudioTrackType(watch.musicVideoType),
    }
  }
  return null
}

// --- Search ----------------------------------------------------------------

function searchSections(data: JsonObject): JsonObject[] {
  const tabs = dig<Array<JsonObject>>(data, 'contents.tabbedSearchResultsRenderer.tabs') ?? []
  const out: JsonObject[] = []
  for (const tab of tabs) {
    out.push(...(dig<JsonObject[]>(tab, 'tabRenderer.content.sectionListRenderer.contents') ?? []))
  }
  return out
}

/** Every list row of a search page, in order, whichever layout it came in. */
function searchRows(data: JsonObject): JsonObject[] {
  const rows: JsonObject[] = []
  for (const section of searchSections(data)) {
    for (const key of ['itemSectionRenderer', 'musicShelfRenderer']) {
      const contents = dig<JsonObject[]>(section, `${key}.contents`) ?? []
      for (const entry of contents) {
        const row = entry.musicResponsiveListItemRenderer as JsonObject | undefined
        if (row) rows.push(row)
      }
    }
  }
  const more = dig<JsonObject[]>(data, 'continuationContents.musicShelfContinuation.contents') ?? []
  for (const entry of more) {
    const row = entry.musicResponsiveListItemRenderer as JsonObject | undefined
    if (row) rows.push(row)
  }
  return rows
}

function continuationToken(data: JsonObject): string | null {
  for (const section of searchSections(data)) {
    const token = dig<string>(section, 'musicShelfRenderer.continuations.0.nextContinuationData.continuation')
    if (token) return token
  }
  return (
    dig<string>(data, 'continuationContents.musicShelfContinuation.continuations.0.nextContinuationData.continuation') ??
    null
  )
}

type CardResult = { header: CatalogItem | null; headerIsVideo: boolean; tracks: CatalogTrack[] }

/** The "Top result" card: YouTube Music's own best guess, and its songs. */
function parseTopCard(data: JsonObject): CardResult | null {
  for (const section of searchSections(data)) {
    const card = section.musicCardShelfRenderer as JsonObject | undefined
    if (!card) continue
    const title = textOf(card.title)
    const subtitleGroups = runGroups(runsOf(card.subtitle))
    const kind = groupText(subtitleGroups[0] ?? []).toLowerCase()
    const nav = dig(runsOf(card.title)[0], 'navigationEndpoint') ?? card.onTap
    const thumbnail = thumbnailOf(card.thumbnail, 544)
    let header: CatalogItem | null = null
    let headerIsVideo = false

    const target = browseTarget(nav)
    const watch = watchTarget(nav)
    const rest = subtitleGroups.slice(1)
    if (kind === 'artist' && target) {
      header = {
        kind: 'artist',
        id: target.browseId,
        name: title,
        thumbnail,
        audience: rest.map(groupText)[0] ?? null,
      }
    } else if ((kind === 'album' || kind === 'single' || kind === 'ep') && target) {
      header = {
        kind: 'album',
        id: target.browseId,
        title,
        artists: rest[0] ? artistsFrom(rest[0]) : [],
        year: rest.map(groupText).find((t) => /^\d{4}$/.test(t)) ?? null,
        albumType: groupText(subtitleGroups[0] ?? []) || 'Album',
        explicit: hasExplicitBadge(card),
        thumbnail,
      }
    } else if (kind === 'playlist' && target) {
      header = {
        kind: 'playlist',
        id: target.browseId,
        title,
        owner: rest[0] ? groupText(rest[0]) : null,
        meta: rest[1] ? groupText(rest[1]) : null,
        thumbnail,
      }
    } else if ((kind === 'song' || kind === 'video') && watch) {
      headerIsVideo = kind === 'video' || !isAudioTrackType(watch.musicVideoType)
      let duration: number | null = null
      let plays: string | null = null
      let artists: ArtistRef[] = []
      let album: AlbumRef | null = null
      for (const group of rest) {
        const text = groupText(group)
        const d = parseDuration(text)
        if (d != null) duration = d
        else if (/\b(plays|views)$/i.test(text)) plays = text
        else if (group.some((r) => browseTarget(r.navigationEndpoint)?.pageType === 'MUSIC_PAGE_TYPE_ALBUM')) {
          album = { id: browseTarget(group[0]!.navigationEndpoint)?.browseId ?? null, name: text }
        } else if (artists.length === 0) artists = artistsFrom(group)
      }
      header = {
        kind: 'track',
        videoId: watch.videoId,
        title,
        artists,
        album,
        duration,
        explicit: hasExplicitBadge(card),
        thumbnail,
        plays,
        video: headerIsVideo,
      }
    }

    const tracks: CatalogTrack[] = []
    for (const entry of (card.contents as JsonObject[] | undefined) ?? []) {
      const row = entry.musicResponsiveListItemRenderer as JsonObject | undefined
      if (!row) continue
      // Songs inside an artist's card leave the artist out; it is the card.
      const track = parseTrackRow(row, header?.kind === 'artist' ? { artists: [{ id: header.id, name: header.name }] } : {})
      if (track) tracks.push(track)
    }
    return { header, headerIsVideo, tracks }
  }
  return null
}

async function runSearch(query: string, filter: Exclude<SearchFilter, 'all'> | null, pages = 1) {
  const body: JsonObject = { query }
  if (filter) body.params = PARAMS[filter]
  const first = await ytmusicRequest('search', body)
  const datas = [first]
  let token = continuationToken(first)
  for (let page = 1; page < pages && token; page += 1) {
    const next = await ytmusicRequest('search', {}, { ctoken: token, continuation: token, type: 'next' })
    datas.push(next)
    token = continuationToken(next)
  }
  return datas
}

// --- Ranking -----------------------------------------------------------------

export function normalize(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** A title without "(feat. …)", "[Remastered]", "- Radio Edit". */
export function coreTitle(text: string): string {
  return normalize(
    text
      .replace(/\s*[([].*?[)\]]/g, ' ')
      .replace(/\s+-\s+.*$/, ' ')
      .replace(/\b(feat|ft|featuring)\b.*$/i, ' '),
  )
}

function coverage(query: string, haystack: string): number {
  const q = normalize(query).split(' ').filter(Boolean)
  if (q.length === 0) return 0
  const words = new Set(normalize(haystack).split(' '))
  const hay = normalize(haystack)
  let hit = 0
  for (const word of q) {
    if (words.has(word)) hit += 1
    else if (word.length >= 3 && hay.includes(word)) hit += 0.6
  }
  return hit / q.length
}

const VERSION_WORDS = /\b(karaoke|covers?|tributes?|instrumental|made popular|in the style of|originally performed|8d|nightcore|sped up|slowed|reverb|lullaby|piano version|8 bit)\b/i
const VARIANT_WORDS = /\b(remix|live|acoustic|demo|edit|mix|version|remaster(ed)?)\b/i

function trackText(track: CatalogTrack) {
  return `${track.title} ${track.artists.map((a) => a.name).join(' ')} ${track.album?.name ?? ''}`
}

/** The same song from two lists: the card row knows the plays, the songs
 * list knows the album and every artist. Keep the most of each. */
function mergeTracks(a: CatalogTrack, b: CatalogTrack): CatalogTrack {
  return {
    ...a,
    artists: b.artists.length > a.artists.length ? b.artists : a.artists,
    album: a.album ?? b.album,
    duration: a.duration ?? b.duration,
    explicit: a.explicit || b.explicit,
    thumbnail: a.thumbnail || b.thumbnail,
    plays: a.plays ?? b.plays,
    video: a.video && b.video,
  }
}

function rankTracks(
  query: string,
  lists: CatalogTrack[][],
  artistBoost: Set<string>,
  pinned: Set<string> = new Set(),
): CatalogTrack[] {
  const best = new Map<string, { track: CatalogTrack; rank: number }>()
  for (const list of lists) {
    list.forEach((track, index) => {
      const prev = best.get(track.videoId)
      best.set(track.videoId, {
        track: prev ? mergeTracks(prev.track, track) : track,
        rank: prev ? Math.min(prev.rank, index) : index,
      })
    })
  }
  const q = normalize(query)
  const qCore = coreTitle(query)
  const scored = [...best.values()].map(({ track, rank }) => {
    let score = 100 - Math.min(rank, 30) * 3.5
    score += coverage(query, trackText(track)) * 45
    const plays = parseCount(track.plays)
    if (plays > 0) score += Math.log10(plays) * 5
    const core = coreTitle(track.title)
    if (core && core === qCore) score += 22
    else if (core && qCore && (q.startsWith(core) || q.endsWith(core))) score += 12
    if (track.artists.some((a) => artistBoost.has(normalize(a.name)))) score += 18
    if (VERSION_WORDS.test(`${track.title} ${track.album?.name ?? ''}`) && !VERSION_WORDS.test(query)) score -= 35
    if (VARIANT_WORDS.test(track.title) && !VARIANT_WORDS.test(query)) score -= 6
    if (track.video) score -= 15
    if (pinned.has(track.videoId)) score += 40
    return { track, score }
  })
  scored.sort((a, b) => b.score - a.score)
  // One copy per song: YouTube Music lists the explicit and clean versions,
  // and an artist's card repeats a song the songs list has too.
  const kept: CatalogTrack[] = []
  for (const { track } of scored) {
    const twin = kept.find(
      (k) =>
        normalize(k.title) === normalize(track.title) &&
        normalize(k.artists[0]?.name ?? '') === normalize(track.artists[0]?.name ?? '') &&
        (k.duration == null || track.duration == null || Math.abs(k.duration - track.duration) <= 3),
    )
    if (!twin) kept.push(track)
    else if (!twin.explicit && track.explicit) kept[kept.indexOf(twin)] = { ...mergeTracks(track, twin), explicit: true }
  }
  return kept
}

function dedupe<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const k = key(item)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** The song a video top result stands for, if search has it. */
function songForVideo(video: CatalogTrack, tracks: CatalogTrack[]): CatalogTrack | null {
  const core = coreTitle(video.title)
  const names = new Set(video.artists.map((a) => normalize(a.name)))
  return (
    tracks.find(
      (t) =>
        !t.video &&
        (coreTitle(t.title) === core || core.includes(coreTitle(t.title))) &&
        (names.size === 0 || t.artists.some((a) => names.has(normalize(a.name)))),
    ) ?? null
  )
}

function chooseTop(
  query: string,
  card: CardResult | null,
  mixed: CatalogItem[],
  tracks: CatalogTrack[],
  artists: CatalogArtist[],
): CatalogItem | null {
  const q = normalize(query)
  // An artist whose name is the query and who is well known: Spotify puts
  // them on top even when YouTube Music's card picked a video.
  const namedArtist = artists.find(
    (a) => normalize(a.name) === q && parseCount(a.audience) >= 100_000,
  )

  const header = card?.header ?? null
  if (header?.kind === 'artist') {
    const full = artists.find((a) => a.id === header.id) ?? header
    // "travis": the card says Travis, Spotify says Travis Scott. A far bigger
    // artist whose name starts with the query wins.
    const bigger = artists.find(
      (a) =>
        a.id !== full.id &&
        (normalize(a.name) + ' ').startsWith(q + ' ') &&
        parseCount(a.audience) > Math.max(1, parseCount(full.audience)) * 5,
    )
    if (bigger) return bigger
    return { ...full, thumbnail: full.thumbnail || header.thumbnail }
  }
  if (header?.kind === 'track') {
    if (namedArtist) return namedArtist
    if (!header.video) return tracks.find((t) => t.videoId === header.videoId) ?? header
    return songForVideo(header, tracks) ?? tracks[0] ?? header
  }
  if (header) return namedArtist ?? header

  if (namedArtist) return namedArtist
  const firstMixed = mixed.find((item) => item.kind !== 'track' || !item.video)
  if (firstMixed?.kind === 'track') return tracks.find((t) => t.videoId === firstMixed.videoId) ?? firstMixed
  return firstMixed ?? tracks[0] ?? artists[0] ?? null
}

export function searchAll(query: string): Promise<SearchAllResult> {
  return cached(`all:${normalize(query)}`, async () => {
    const [mixedPages, songPages, artistPages, albumPages, playlistPages] = await Promise.all([
      runSearch(query, null),
      runSearch(query, 'songs'),
      runSearch(query, 'artists'),
      runSearch(query, 'albums'),
      runSearch(query, 'playlists').catch(() => []),
    ])
    const mixedData = mixedPages[0]!
    const card = parseTopCard(mixedData)
    const mixed = searchRows(mixedData)
      .map(parseListItem)
      .filter((x): x is CatalogItem => x !== null)

    const filterTracks = songPages.flatMap(searchRows).map((r) => parseTrackRow(r)).filter((t): t is CatalogTrack => t !== null)
    const mixedTracks = mixed.filter((x): x is CatalogTrack => x.kind === 'track' && !x.video)

    const artists = dedupe(
      [
        ...artistPages.flatMap(searchRows).map(parseArtistRow),
        ...mixed.filter((x): x is CatalogArtist => x.kind === 'artist'),
      ].filter((a): a is CatalogArtist => a !== null),
      (a) => a.id,
    )

    const boost = new Set<string>()
    const q = normalize(query)
    for (const a of artists.slice(0, 4)) {
      const name = normalize(a.name)
      if (name && (name === q || q.startsWith(name + ' ') || q.endsWith(' ' + name))) boost.add(name)
    }

    // Decide the top result first: when it is an artist, the songs are that
    // artist's popular songs, like Spotify's.
    const roughTracks = rankTracks(query, [card?.tracks ?? [], mixedTracks, filterTracks], boost)
    let top = chooseTop(query, card, mixed, roughTracks, artists)
    let artistTop: CatalogTrack[] = []
    let artistAlbums: CatalogAlbum[] = []
    if (top?.kind === 'artist') {
      boost.add(normalize(top.name))
      const page = await withTimeout(artistPage(top.id), 4000).catch(() => null)
      artistTop = page?.topTracks ?? []
      artistAlbums = page ? [...page.albums, ...page.singles] : []
    }
    const pinned = new Set(artistTop.map((t) => t.videoId))
    const tracks = rankTracks(
      query,
      [artistTop, top?.kind === 'artist' && card?.header?.kind === 'artist' && card.header.id === top.id ? card.tracks : [], mixedTracks, filterTracks],
      boost,
      pinned,
    ).filter((t) => !t.video)

    const albums = dedupe(
      [
        ...artistAlbums,
        ...mixed.filter((x): x is CatalogAlbum => x.kind === 'album'),
        ...albumPages.flatMap(searchRows).map(parseAlbumRow),
      ].filter((a): a is CatalogAlbum => a !== null),
      (a) => a.id,
    )
    // Albums by a matching artist and exact titles first, full albums ahead
    // of singles; the same release listed twice shows once.
    albums.sort((a, b) => albumScore(query, b, boost) - albumScore(query, a, boost))
    const uniqueAlbums = dedupe(albums, (a) => `${normalize(a.title)}|${a.albumType}|${a.year ?? ''}`)

    const playlists = dedupe(
      [
        ...playlistPages.flatMap(searchRows).map(parsePlaylistRow),
        ...mixed.filter((x): x is CatalogPlaylist => x.kind === 'playlist'),
      ].filter((p): p is CatalogPlaylist => p !== null),
      (p) => p.id,
    )

    const videos = dedupe(
      [
        ...(card?.header?.kind === 'track' && card.header.video ? [card.header] : []),
        ...mixed.filter((x): x is CatalogTrack => x.kind === 'track' && x.video),
      ],
      (v) => v.videoId,
    )

    if (top?.kind === 'track') {
      const t = top
      const rich = tracks.find((x) => x.videoId === t.videoId)
      if (rich) top = rich
    }
    // The albums the best songs are on come first, as on Spotify ("get lucky"
    // shows Random Access Memories before five albums titled Get Lucky).
    const leadAlbumIds = [top?.kind === 'track' ? top.album?.id : null, ...tracks.slice(0, 3).map((t) => t.album?.id)]
      .filter((id): id is string => Boolean(id))
    for (const id of [...leadAlbumIds].reverse()) {
      const at = uniqueAlbums.findIndex((a) => a.id === id)
      if (at > 0) uniqueAlbums.unshift(...uniqueAlbums.splice(at, 1))
    }
    return {
      top,
      tracks: tracks.slice(0, 30),
      artists: artists.slice(0, 20),
      albums: uniqueAlbums.slice(0, 20),
      playlists: playlists.slice(0, 20),
      videos: videos.slice(0, 20),
    }
  })
}

function albumScore(query: string, album: CatalogAlbum, boost: Set<string>): number {
  let score = coverage(query, `${album.title} ${album.artists.map((a) => a.name).join(' ')}`) * 20
  if (coreTitle(album.title) === coreTitle(query)) score += 15
  if (album.artists.some((a) => boost.has(normalize(a.name)))) score += 25
  if (VERSION_WORDS.test(album.title) && !VERSION_WORDS.test(query)) score -= 25
  if (album.albumType === 'Album') score += 8
  return score
}

export function searchFiltered(query: string, filter: Exclude<SearchFilter, 'all'>): Promise<CatalogItem[]> {
  return cached(`${filter}:${normalize(query)}`, async () => {
    const pages = await runSearch(query, filter, filter === 'songs' || filter === 'videos' ? 2 : 1)
    const rows = pages.flatMap(searchRows)
    if (filter === 'songs') {
      const tracks = rows.map((r) => parseTrackRow(r)).filter((t): t is CatalogTrack => t !== null)
      const boost = new Set<string>()
      return rankTracks(query, [tracks], boost)
    }
    if (filter === 'videos') {
      return rows
        .map((r) => parseTrackRow(r))
        .filter((t): t is CatalogTrack => t !== null)
        .map((t) => ({ ...t, video: true }))
    }
    const parsed: Array<CatalogArtist | CatalogAlbum | CatalogPlaylist | null> = rows.map((row) =>
      filter === 'artists' ? parseArtistRow(row) : filter === 'albums' ? parseAlbumRow(row) : parsePlaylistRow(row),
    )
    return dedupe(
      parsed.filter((x): x is CatalogArtist | CatalogAlbum | CatalogPlaylist => x !== null),
      (x) => x.id,
    )
  })
}

export function searchSuggestions(input: string): Promise<string[]> {
  return cached(`suggest:${normalize(input)}`, async () => {
    const data = await ytmusicRequest('music/get_search_suggestions', { input })
    const out: string[] = []
    for (const section of (data.contents as JsonObject[] | undefined) ?? []) {
      for (const item of dig<JsonObject[]>(section, 'searchSuggestionsSectionRenderer.contents') ?? []) {
        const text = textOf(dig(item, 'searchSuggestionRenderer.suggestion'))
        if (text) out.push(text)
      }
    }
    return out.slice(0, 8)
  })
}

// --- Pages -------------------------------------------------------------------

function sectionListContents(data: JsonObject): JsonObject[] {
  return (
    dig<JsonObject[]>(data, 'contents.singleColumnBrowseResultsRenderer.tabs.0.tabRenderer.content.sectionListRenderer.contents') ??
    dig<JsonObject[]>(data, 'contents.twoColumnBrowseResultsRenderer.tabs.0.tabRenderer.content.sectionListRenderer.contents') ??
    dig<JsonObject[]>(data, 'contents.sectionListRenderer.contents') ??
    []
  )
}

function carouselTitle(section: JsonObject): string {
  return textOf(dig(section, 'musicCarouselShelfRenderer.header.musicCarouselShelfBasicHeaderRenderer.title'))
}

function carouselItems(section: JsonObject): CatalogItem[] {
  const out: CatalogItem[] = []
  for (const entry of dig<JsonObject[]>(section, 'musicCarouselShelfRenderer.contents') ?? []) {
    const two = entry.musicTwoRowItemRenderer as JsonObject | undefined
    const list = entry.musicResponsiveListItemRenderer as JsonObject | undefined
    const parsed = two ? parseTwoRow(two) : list ? parseListItem(list) : null
    if (parsed) out.push(parsed)
  }
  return out
}

export function artistPage(id: string): Promise<ArtistPage> {
  return cached(`artist:${id}`, async () => {
    const data = await ytmusicRequest('browse', { browseId: id })
    const header =
      (dig<JsonObject>(data, 'header.musicImmersiveHeaderRenderer') ??
        dig<JsonObject>(data, 'header.musicVisualHeaderRenderer') ??
        {}) as JsonObject
    const name = textOf(header.title) || 'Artist'
    const thumbs =
      dig<Array<{ url?: string }>>(header, 'thumbnail.musicThumbnailRenderer.thumbnail.thumbnails') ?? []
    const banner = thumbs[thumbs.length - 1]?.url ?? ''
    const foreground =
      dig<Array<{ url?: string }>>(header, 'foregroundThumbnail.musicThumbnailRenderer.thumbnail.thumbnails') ?? []
    const self: ArtistRef = { id, name }

    const page: ArtistPage = {
      id,
      name,
      banner,
      avatar: resizeArt(foreground[foreground.length - 1]?.url ?? '', 544),
      audience: textOf(header.monthlyListenerCount) || null,
      subscribers:
        textOf(dig(header, 'subscriptionButton.subscribeButtonRenderer.subscriberCountText')) || null,
      description: textOf(header.description) || null,
      topTracks: [],
      allTracksId: null,
      albums: [],
      singles: [],
      videos: [],
      featuredOn: [],
      related: [],
    }

    for (const section of sectionListContents(data)) {
      const shelf = section.musicShelfRenderer as JsonObject | undefined
      if (shelf) {
        for (const entry of (shelf.contents as JsonObject[] | undefined) ?? []) {
          const row = entry.musicResponsiveListItemRenderer as JsonObject | undefined
          const track = row ? parseTrackRow(row, { artists: [self] }) : null
          if (track) page.topTracks.push(track)
        }
        const bottom = browseTarget(shelf.bottomEndpoint)
        if (bottom?.pageType === 'MUSIC_PAGE_TYPE_PLAYLIST') page.allTracksId = bottom.browseId
        continue
      }
      const title = carouselTitle(section).toLowerCase()
      if (!title) continue
      const items = carouselItems(section)
      if (/^albums/.test(title)) page.albums = items.filter((x): x is CatalogAlbum => x.kind === 'album')
      else if (/single|ep/.test(title)) page.singles = items.filter((x): x is CatalogAlbum => x.kind === 'album')
      else if (/^videos/.test(title)) page.videos = items.filter((x): x is CatalogTrack => x.kind === 'track')
      else if (/featured on/.test(title)) page.featuredOn = items.filter((x): x is CatalogPlaylist => x.kind === 'playlist')
      else if (/fans might|similar|related/.test(title)) page.related = items.filter((x): x is CatalogArtist => x.kind === 'artist')
    }
    // Album cards on an artist page leave the artist out.
    for (const album of [...page.albums, ...page.singles]) {
      if (album.artists.length === 0) album.artists = [self]
    }
    return page
  })
}

export function albumPage(id: string): Promise<AlbumPage> {
  return cached(`album:${id}`, async () => {
    const data = await ytmusicRequest('browse', { browseId: id })
    const header = (dig<JsonObject>(
      data,
      'contents.twoColumnBrowseResultsRenderer.tabs.0.tabRenderer.content.sectionListRenderer.contents.0.musicResponsiveHeaderRenderer',
    ) ?? {}) as JsonObject
    const subtitle = runGroups(runsOf(header.subtitle)).map(groupText)
    const artists = artistsFrom(runsOf(header.straplineTextOne))
    const thumbnail = thumbnailOf(header.thumbnail, 720)
    const album: AlbumRef = { id, name: textOf(header.title) }

    const tracks: CatalogTrack[] = []
    const otherVersions: CatalogAlbum[] = []
    const secondary =
      dig<JsonObject[]>(data, 'contents.twoColumnBrowseResultsRenderer.secondaryContents.sectionListRenderer.contents') ?? []
    for (const section of secondary) {
      const shelf = section.musicShelfRenderer as JsonObject | undefined
      if (shelf) {
        for (const entry of (shelf.contents as JsonObject[] | undefined) ?? []) {
          const row = entry.musicResponsiveListItemRenderer as JsonObject | undefined
          const track = row ? parseTrackRow(row, { artists, album, thumbnail: resizeArt(thumbnail, 226) }) : null
          if (track) tracks.push({ ...track, album })
        }
        continue
      }
      if (/other versions/i.test(carouselTitle(section))) {
        otherVersions.push(...carouselItems(section).filter((x): x is CatalogAlbum => x.kind === 'album'))
      }
    }

    return {
      id,
      title: album.name || 'Album',
      albumType: subtitle[0] || 'Album',
      year: subtitle.find((t) => /^\d{4}$/.test(t)) ?? null,
      artists,
      thumbnail,
      explicit: hasExplicitBadge(header),
      summary: textOf(header.secondSubtitle) || null,
      description: textOf(dig(header, 'description.musicDescriptionShelfRenderer.description')) || null,
      tracks,
      otherVersions,
    }
  })
}

const PLAYLIST_MAX_TRACKS = 150

export function playlistPage(rawId: string): Promise<PlaylistPage> {
  const id = rawId.startsWith('VL') ? rawId : `VL${rawId}`
  return cached(`playlist:${id}`, async () => {
    let data = await ytmusicRequest('browse', { browseId: id })
    const header = (dig<JsonObject>(
      data,
      'contents.twoColumnBrowseResultsRenderer.tabs.0.tabRenderer.content.sectionListRenderer.contents.0.musicResponsiveHeaderRenderer',
    ) ??
      dig<JsonObject>(data, 'header.musicDetailHeaderRenderer') ??
      {}) as JsonObject
    const tracks: CatalogTrack[] = []
    const shelfPath = 'contents.twoColumnBrowseResultsRenderer.secondaryContents.sectionListRenderer.contents.0.musicPlaylistShelfRenderer'

    const collect = (shelf: JsonObject | undefined) => {
      for (const entry of (shelf?.contents as JsonObject[] | undefined) ?? []) {
        const row = entry.musicResponsiveListItemRenderer as JsonObject | undefined
        const track = row ? parseTrackRow(row) : null
        if (track) tracks.push(track)
      }
    }
    const nextToken = (shelf: JsonObject | undefined) =>
      dig<string>(shelf, 'continuations.0.nextContinuationData.continuation') ??
      ((shelf?.contents as JsonObject[] | undefined) ?? [])
        .map((e) => dig<string>(e, 'continuationItemRenderer.continuationEndpoint.continuationCommand.token'))
        .find(Boolean) ??
      null

    let shelf = dig<JsonObject>(data, shelfPath)
    collect(shelf)
    let token = nextToken(shelf)
    let pages = 0
    while (token && tracks.length < PLAYLIST_MAX_TRACKS && pages < 4) {
      data = await ytmusicRequest('browse', { continuation: token })
      shelf =
        dig<JsonObject>(data, 'continuationContents.musicPlaylistShelfContinuation') ??
        ({ contents: dig<JsonObject[]>(data, 'onResponseReceivedActions.0.appendContinuationItemsAction.continuationItems') ?? [] } as JsonObject)
      collect(shelf)
      token = nextToken(shelf)
      pages += 1
    }

    const strap = runsOf(header.straplineTextOne)
    return {
      id,
      title: textOf(header.title) || 'Playlist',
      owner: groupText(strap) || runGroups(runsOf(header.subtitle)).map(groupText)[1] || null,
      thumbnail: thumbnailOf(header.thumbnail, 720),
      summary: textOf(header.secondSubtitle) || null,
      description: textOf(dig(header, 'description.musicDescriptionShelfRenderer.description')) || null,
      tracks: dedupe(tracks, (t) => t.videoId).slice(0, PLAYLIST_MAX_TRACKS),
    }
  })
}

// --- Radio and matching ----------------------------------------------------------

/** Songs YouTube Music would play after this one (its radio), for smart shuffle. */
export function radio(videoId: string): Promise<CatalogTrack[]> {
  return cached(`radio:${videoId}`, async () => {
    const data = await ytmusicRequest('next', {
      videoId,
      playlistId: `RDAMVM${videoId}`,
      isAudioOnly: true,
    })
    const panel =
      dig<JsonObject[]>(
        data,
        'contents.singleColumnMusicWatchNextResultsRenderer.tabbedRenderer.watchNextTabbedResultsRenderer.tabs.0.tabRenderer.content.musicQueueRenderer.content.playlistPanelRenderer.contents',
      ) ?? []
    const out: CatalogTrack[] = []
    for (const entry of panel) {
      const v = (entry.playlistPanelVideoRenderer ??
        dig(entry, 'playlistPanelVideoWrapperRenderer.primaryRenderer.playlistPanelVideoRenderer')) as
        | JsonObject
        | undefined
      if (!v?.videoId) continue
      const groups = runGroups(runsOf(v.longBylineText))
      let album: AlbumRef | null = null
      const albumGroup = groups.find((g) =>
        g.some((r) => browseTarget(r.navigationEndpoint)?.pageType === 'MUSIC_PAGE_TYPE_ALBUM'),
      )
      if (albumGroup) album = { id: browseTarget(albumGroup[0]!.navigationEndpoint)?.browseId ?? null, name: groupText(albumGroup) }
      out.push({
        kind: 'track',
        videoId: String(v.videoId),
        title: textOf(v.title),
        artists: groups[0] ? artistsFrom(groups[0]) : [],
        album,
        duration: parseDuration(textOf(v.lengthText)),
        explicit: hasExplicitBadge(v),
        thumbnail: thumbnailOf(v.thumbnail, 544),
        plays: null,
        video: false,
      })
    }
    return out.filter((t) => t.videoId !== videoId && t.title)
  })
}

/**
 * The YouTube Music track for a title and artist (a Spotify song in the
 * history, say). Conservative: title and an artist must line up, and the
 * length too when both sides know it.
 */
export async function matchTrack(title: string, artist: string, duration?: number): Promise<CatalogTrack | null> {
  const query = `${artist.split(/,|&/)[0] ?? ''} ${title}`.trim()
  const results = (await searchFiltered(query, 'songs')) as CatalogTrack[]
  const wantTitle = coreTitle(title)
  const wantArtists = artist
    .split(/\s*(?:,|&|\bx\b|feat\.?|ft\.?)\s*/i)
    .map(normalize)
    .filter(Boolean)
  for (const track of results.slice(0, 10)) {
    const titleOk = coreTitle(track.title) === wantTitle
    const artistOk =
      wantArtists.length === 0 ||
      track.artists.some((a) => wantArtists.some((w) => normalize(a.name) === w || normalize(a.name).includes(w)))
    const lengthOk = !duration || !track.duration || Math.abs(track.duration - duration) <= 4
    if (titleOk && artistOk && lengthOk) return track
  }
  return null
}

// --- Browse (what search shows before you type) ------------------------------------

export type MoodTile = { title: string; params: string; color: string }
export type BrowseHome = {
  trending: CatalogTrack[]
  newReleases: CatalogAlbum[]
  moods: { title: string; tiles: MoodTile[] }[]
}
export type MoodPage = { title: string; sections: { title: string; playlists: CatalogPlaylist[] }[] }

/** Innertube colours are ARGB integers. */
function argbHex(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return '#3a3a3a'
  return `#${(n & 0xffffff).toString(16).padStart(6, '0')}`
}

function gridTiles(section: JsonObject): MoodTile[] {
  const items =
    dig<JsonObject[]>(section, 'gridRenderer.items') ??
    dig<JsonObject[]>(section, 'musicCarouselShelfRenderer.contents') ??
    []
  const tiles: MoodTile[] = []
  for (const entry of items) {
    const button = entry.musicNavigationButtonRenderer as JsonObject | undefined
    if (!button) continue
    const params = dig<string>(button, 'clickCommand.browseEndpoint.params')
    const title = textOf(button.buttonText)
    if (params && title) tiles.push({ title, params, color: argbHex(dig(button, 'solid.leftStripeColor')) })
  }
  return tiles
}

export function browseHome(): Promise<BrowseHome> {
  return cached('browse:home', async () => {
    const [explore, moods] = await Promise.all([
      ytmusicRequest('browse', { browseId: 'FEmusic_explore' }),
      ytmusicRequest('browse', { browseId: 'FEmusic_moods_and_genres' }),
    ])
    const home: BrowseHome = { trending: [], newReleases: [], moods: [] }
    for (const section of sectionListContents(explore)) {
      const title = carouselTitle(section).toLowerCase()
      if (/trending/.test(title)) {
        // Trending is mostly music videos; they are real songs and play fine.
        home.trending = carouselItems(section).filter((x): x is CatalogTrack => x.kind === 'track')
      } else if (/new albums|new releases/.test(title)) {
        home.newReleases = carouselItems(section).filter((x): x is CatalogAlbum => x.kind === 'album')
      }
    }
    for (const section of sectionListContents(moods)) {
      const title = textOf(dig(section, 'gridRenderer.header.gridHeaderRenderer.title'))
      const tiles = gridTiles(section)
      if (tiles.length) home.moods.push({ title: title || 'Browse', tiles })
    }
    return home
  })
}

export function moodPage(params: string): Promise<MoodPage> {
  return cached(`mood:${params}`, async () => {
    const data = await ytmusicRequest('browse', {
      browseId: 'FEmusic_moods_and_genres_category',
      params,
    })
    const title = textOf(dig(data, 'header.musicHeaderRenderer.title'))
    const sections: MoodPage['sections'] = []
    for (const section of sectionListContents(data)) {
      const items =
        section.gridRenderer != null
          ? ((dig<JsonObject[]>(section, 'gridRenderer.items') ?? [])
              .map((e) => (e.musicTwoRowItemRenderer ? parseTwoRow(e.musicTwoRowItemRenderer as JsonObject) : null))
              .filter((x): x is CatalogItem => x !== null))
          : carouselItems(section)
      const playlists = items.filter((x): x is CatalogPlaylist => x.kind === 'playlist')
      if (playlists.length === 0) continue
      sections.push({
        title:
          carouselTitle(section) ||
          textOf(dig(section, 'gridRenderer.header.gridHeaderRenderer.title')) ||
          'Playlists',
        playlists,
      })
    }
    return { title: title || 'Playlists', sections }
  })
}
