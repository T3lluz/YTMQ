/**
 * Runs on https://music.youtube.com — bundled (no external script imports).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  hideNextSongToast,
  tickNextSongToast,
  type NextSongInfo,
} from './nextSongToast'
import { createYtmPanel, defaultYtmqSiteBase } from './ytmPanel'
import {
  createPlayedQueueCleanup,
  type SharedQueueRow,
} from './playedQueueCleanup'
import { parsePlaybackTimeLabel } from '../lib/playback'

type BridgeParams = {
  roomId: string
  sb: string
  key: string
  since: string
}

type InsertMode = 'play_next' | 'queue'

type QueueRow = {
  id: string
  video_id: string
  title: string
  created_at: string
  insert_mode?: InsertMode
}

type PlaybackState = 'playing' | 'paused' | 'unknown'

type NowPlayingPayload = {
  videoId: string
  title: string
  artist: string
  updatedAt: number
  currentTime: number
  duration?: number
  state: PlaybackState
  volume?: number
  nextUp?: {
    videoId: string
    title: string
    artist: string
    thumbnailUrl: string
  }
}

type PlaybackAction =
  | 'next'
  | 'prev'
  | 'play'
  | 'pause'
  | 'toggle'
  | 'seek'
  | 'volume'

type QueueStoreState = {
  queue: {
    queueContextParams: string
    items: unknown[]
    nextQueueItemId: number
    selectedItemIndex?: number
  }
}

/** Zustand store on #queue (queue.store.store at runtime). */
type InnerQueueStore = {
  getState: () => QueueStoreState
}

type QueueStore = {
  store: {
    store: InnerQueueStore
  }
}

type QueueElement = HTMLElement & {
  dispatch: (action: { type: string; payload?: unknown }) => void
  queue?: QueueStore & {
    getItems?: () => unknown[]
  }
}

type YtmApp = HTMLElement & {
  networkManager?: {
    fetch: <TResponse, TBody>(path: string, body: TBody) => Promise<TResponse>
  }
}

type PlayerBar = HTMLElement & {
  playerApi?: {
    getVideoData?: () => { video_id?: string }
    getCurrentTime?: () => number
    getDuration?: () => number
    getPlayerState?: () => number
    nextVideo?: () => void
    previousVideo?: () => void
    playVideo?: () => void
    pauseVideo?: () => void
    seekTo?: (seconds: number, allowSeekAhead?: boolean) => void
    getVolume?: () => number
    setVolume?: (volume: number) => void
    isMuted?: () => boolean
    mute?: () => void
    unMute?: () => void
  }
}

type GetQueueResponse = {
  queueDatas?: { content?: unknown }[]
}

const PLAY_NEXT = 'INSERT_AFTER_CURRENT_VIDEO' as const
const ADD_TO_QUEUE = 'INSERT_AT_END' as const

type QueueInsertPosition = typeof PLAY_NEXT | typeof ADD_TO_QUEUE

function insertPositionFor(mode: InsertMode | undefined): QueueInsertPosition {
  return mode === 'queue' ? ADD_TO_QUEUE : PLAY_NEXT
}

function normalizeMode(mode: InsertMode | undefined): InsertMode {
  return mode === 'queue' ? 'queue' : 'play_next'
}

function modeLabel(mode: InsertMode): string {
  return mode === 'queue' ? 'Added to queue' : 'Play next'
}

let queueApiReady = false

function log(msg: string, ...rest: unknown[]) {
  console.log('[YTMQ]', msg, ...rest)
}

const SESSION_KEY = 'ytmq_session'
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

function readStoredSession(): BridgeParams | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const stored = JSON.parse(raw) as BridgeParams & { at?: number }
    if (!stored.roomId || !stored.sb || !stored.key) return null
    if (stored.at && Date.now() - stored.at >= SESSION_MAX_AGE_MS) return null
    return {
      roomId: stored.roomId,
      sb: stored.sb,
      key: stored.key,
      since: stored.since || new Date().toISOString(),
    }
  } catch {
    return null
  }
}

function readParams(): BridgeParams | null {
  const inline = window.__YTMQ_BRIDGE_PARAMS__
  const current = document.currentScript
  const scriptUrl =
    current instanceof HTMLScriptElement ? (current.src ?? '') : ''
  const fromQuery = new URLSearchParams(
    scriptUrl.includes('?') ? scriptUrl.split('?')[1]! : window.location.search,
  )

  const roomId = inline?.roomId ?? fromQuery.get('roomId')
  const sb = inline?.sb ?? fromQuery.get('sb')
  const key = inline?.key ?? fromQuery.get('key')
  const since =
    inline?.since ?? fromQuery.get('since') ?? new Date().toISOString()

  if (roomId && sb && key) return { roomId, sb, key, since }
  return readStoredSession()
}

function isInPlaybackSession(createdAt: string, playbackSince: string): boolean {
  return new Date(createdAt).getTime() >= new Date(playbackSince).getTime()
}

function getQueueElement(): QueueElement | null {
  return document.querySelector('#queue')
}

function getYtmApp(): YtmApp | null {
  return document.querySelector('ytmusic-app')
}

function getInnerStore(): InnerQueueStore | null {
  const outer = getQueueElement()?.queue?.store as
    | { store?: InnerQueueStore; getState?: () => QueueStoreState }
    | undefined
  if (!outer) return null
  if (outer.store?.getState) return outer.store
  if (typeof outer.getState === 'function') return outer as InnerQueueStore
  return null
}

function countDomQueueItems(): number {
  return document.querySelectorAll('ytmusic-player-queue-item').length
}

function saveSession(params: BridgeParams) {
  try {
    localStorage.setItem(
      'ytmq_session',
      JSON.stringify({ ...params, at: Date.now() }),
    )
  } catch {
    /* private mode */
  }
}

function notifyHostConnected(roomId: string) {
  const params = readParams()
  if (params) saveSession(params)

  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: 'ytmq:connected', roomId }, '*')
    }
  } catch {
    /* cross-origin */
  }
}

async function waitForQueueApi(maxMs = 8000): Promise<boolean> {
  if (queueApiReady) return true
  if (maxMs <= 0) {
    queueApiReady = Boolean(getInnerStore() && getYtmApp()?.networkManager)
    return queueApiReady
  }

  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    if (getInnerStore() && getYtmApp()?.networkManager) {
      queueApiReady = true
      return true
    }
    await new Promise((r) => window.setTimeout(r, 100))
  }

  queueApiReady = Boolean(getInnerStore() && getYtmApp()?.networkManager)
  return queueApiReady
}

function queueItemRenderer(item: unknown): Record<string, unknown> | null {
  if (!item || typeof item !== 'object') return null
  const obj = item as Record<string, unknown>
  const direct = obj.playlistPanelVideoRenderer
  if (direct && typeof direct === 'object') {
    return direct as Record<string, unknown>
  }
  const wrapper = obj.playlistPanelVideoWrapperRenderer as
    | Record<string, unknown>
    | undefined
  const primary = wrapper?.primaryRenderer as Record<string, unknown> | undefined
  const nested = primary?.playlistPanelVideoRenderer
  if (nested && typeof nested === 'object') {
    return nested as Record<string, unknown>
  }
  return null
}

function parseVideoIdFromQueueItem(item: unknown): string | null {
  const renderer = queueItemRenderer(item)
  const fromRenderer = renderer?.videoId
  if (typeof fromRenderer === 'string' && fromRenderer.length > 0) {
    return fromRenderer
  }

  try {
    const match = JSON.stringify(item).match(/"videoId":"([a-zA-Z0-9_-]{11})"/)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

function getSelectedIndexFromItems(items: unknown[]): number {
  const idx = items.findIndex((item) => queueItemRenderer(item)?.selected === true)
  if (idx >= 0) return idx

  const innerStore = getInnerStore()
  const selected = innerStore?.getState().queue.selectedItemIndex
  if (typeof selected === 'number' && selected >= 0 && selected < items.length) {
    return selected
  }

  return 0
}

function playNextInsertIndex(items: unknown[]): number {
  const selectedIdx = getSelectedIndexFromItems(items)
  const nextIndex = selectedIdx + 1
  return nextIndex || items.length
}

function insertIndexFor(mode: InsertMode, items: unknown[]): number {
  return mode === 'queue' ? items.length : playNextInsertIndex(items)
}

function isVideoAtPlayNext(items: unknown[], videoId: string): boolean {
  const targetIndex = playNextInsertIndex(items)
  if (targetIndex >= items.length) return false
  return parseVideoIdFromQueueItem(items[targetIndex]) === videoId
}

function isVideoAtEnd(items: unknown[], videoId: string): boolean {
  if (items.length === 0) return false
  return parseVideoIdFromQueueItem(items[items.length - 1]) === videoId
}

async function waitForInsertedPosition(
  innerStore: InnerQueueStore | null,
  videoId: string,
  mode: InsertMode,
  beforeCount: number,
): Promise<boolean> {
  const deadline = Date.now() + 1500
  while (Date.now() < deadline) {
    if (innerStore) {
      const items = innerStore.getState().queue.items
      if (mode === 'queue') {
        if (items.length > beforeCount && isVideoAtEnd(items, videoId)) {
          return true
        }
      } else if (isVideoAtPlayNext(items, videoId)) {
        return true
      }
    }
    if (countDomQueueItems() > 0) {
      const domItems = document.querySelectorAll('ytmusic-player-queue-item')
      if (mode === 'queue') {
        const last = domItems[domItems.length - 1]
        if (last?.textContent?.includes(videoId)) return true
      } else {
        const selectedIdx = getSelectedIndexFromItems(
          innerStore?.getState().queue.items ?? [],
        )
        const target = domItems[selectedIdx + 1]
        if (target?.textContent?.includes(videoId)) return true
      }
    }
    await new Promise((r) => window.setTimeout(r, 50))
  }
  return false
}

function getPlayerBar(): PlayerBar | null {
  return document.querySelector('ytmusic-player-bar') as PlayerBar | null
}

/** YT iframe API state codes: 1=playing, 2=paused, 3=buffering, 0=ended, 5=cued, -1=unstarted */
function readPlaybackState(bar: PlayerBar | null): PlaybackState {
  const code = bar?.playerApi?.getPlayerState?.()
  if (code === 1 || code === 3) return 'playing'
  if (code === 0 || code === 2 || code === 5) return 'paused'

  const playPauseBtn = document.querySelector(
    'ytmusic-player-bar #play-pause-button',
  ) as HTMLElement | null
  const label = playPauseBtn?.getAttribute('aria-label')?.toLowerCase() ?? ''
  if (label.includes('pause')) return 'playing'
  if (label.includes('play')) return 'paused'
  return 'unknown'
}

function readNowPlaying(): NowPlayingPayload | null {
  const bar = getPlayerBar()
  const title =
    bar?.querySelector('.title')?.textContent?.trim() ??
    bar?.querySelector('[title]')?.textContent?.trim() ??
    ''
  const artist =
    bar?.querySelector('.byline')?.textContent?.trim() ??
    bar?.querySelector('.subtitle')?.textContent?.trim() ??
    ''

  let videoId = new URLSearchParams(location.search).get('v') ?? ''
  if (!videoId) {
    videoId = bar?.playerApi?.getVideoData?.()?.video_id ?? ''
  }

  if (!videoId && !title) return null

  const times = getPlayerTimes()
  const currentTime = times?.current ?? readPlayerCurrentTime(bar)
  const duration = times?.duration ?? readPlayerDuration(bar) ?? undefined
  const volume = readVolume(bar)

  return {
    videoId,
    title: title || 'Unknown track',
    artist,
    updatedAt: Date.now(),
    currentTime,
    ...(duration != null ? { duration } : {}),
    state: readPlaybackState(bar),
    ...(volume != null ? { volume } : {}),
  }
}

function clickPlayerBarButton(matchers: string[]): boolean {
  for (const m of matchers) {
    const btn = document.querySelector(
      `ytmusic-player-bar ${m}`,
    ) as HTMLElement | null
    if (btn) {
      btn.click()
      return true
    }
  }
  return false
}

function doNext(): boolean {
  const bar = getPlayerBar()
  try {
    bar?.playerApi?.nextVideo?.()
    if (bar?.playerApi?.nextVideo) return true
  } catch {
    /* fall through */
  }
  return clickPlayerBarButton([
    '.next-button',
    'tp-yt-paper-icon-button.next-button',
    'button[aria-label*="Next" i]',
    'tp-yt-paper-icon-button[aria-label*="Next" i]',
  ])
}

function doPrev(): boolean {
  const bar = getPlayerBar()
  const t = bar?.playerApi?.getCurrentTime?.() ?? 0

  if (t >= 3 && bar?.playerApi?.seekTo) {
    try {
      bar.playerApi.seekTo(0, true)
      return true
    } catch {
      /* fall through to native prev */
    }
  }

  try {
    bar?.playerApi?.previousVideo?.()
    if (bar?.playerApi?.previousVideo) return true
  } catch {
    /* fall through */
  }
  return clickPlayerBarButton([
    '.previous-button',
    'tp-yt-paper-icon-button.previous-button',
    'button[aria-label*="Previous" i]',
    'tp-yt-paper-icon-button[aria-label*="Previous" i]',
  ])
}

function doPlay(): boolean {
  const bar = getPlayerBar()
  try {
    bar?.playerApi?.playVideo?.()
    if (bar?.playerApi?.playVideo) return true
  } catch {
    /* fall through */
  }
  if (readPlaybackState(bar) === 'playing') return true
  return clickPlayerBarButton([
    '#play-pause-button[aria-label*="Play" i]',
    'button[aria-label*="Play" i]',
  ])
}

function doPause(): boolean {
  const bar = getPlayerBar()
  try {
    bar?.playerApi?.pauseVideo?.()
    if (bar?.playerApi?.pauseVideo) return true
  } catch {
    /* fall through */
  }
  if (readPlaybackState(bar) === 'paused') return true
  return clickPlayerBarButton([
    '#play-pause-button[aria-label*="Pause" i]',
    'button[aria-label*="Pause" i]',
  ])
}

function doToggle(): boolean {
  const bar = getPlayerBar()
  const state = readPlaybackState(bar)
  if (state === 'playing') return doPause()
  return doPlay()
}

function doSeek(seconds: number): boolean {
  if (!Number.isFinite(seconds) || seconds < 0) return false
  const bar = getPlayerBar()
  try {
    if (bar?.playerApi?.seekTo) {
      bar.playerApi.seekTo(seconds, true)
      return true
    }
  } catch {
    /* fall through to the raw <video> element */
  }

  const video = document.querySelector('video') as HTMLVideoElement | null
  if (video && Number.isFinite(video.duration) && video.duration > 0) {
    try {
      video.currentTime = Math.min(seconds, video.duration)
      return true
    } catch {
      /* ignore */
    }
  }
  return false
}

function doSetVolume(level: number): boolean {
  if (!Number.isFinite(level)) return false
  const clamped = Math.min(100, Math.max(0, Math.round(level)))
  const bar = getPlayerBar()
  try {
    if (bar?.playerApi?.setVolume) {
      // Setting a non-zero level should also lift an existing mute so the
      // change is actually audible.
      if (clamped > 0 && bar.playerApi.isMuted?.()) bar.playerApi.unMute?.()
      bar.playerApi.setVolume(clamped)
      return true
    }
  } catch {
    /* fall through to the raw <video> element */
  }

  const video = document.querySelector('video') as HTMLVideoElement | null
  if (video) {
    try {
      video.muted = clamped === 0
      video.volume = clamped / 100
      return true
    } catch {
      /* ignore */
    }
  }
  return false
}

/** Current host volume as 0–100, reporting 0 while the player is muted. */
function readVolume(bar: PlayerBar | null): number | undefined {
  try {
    const v = bar?.playerApi?.getVolume?.()
    if (typeof v === 'number' && Number.isFinite(v)) {
      if (bar?.playerApi?.isMuted?.()) return 0
      return Math.min(100, Math.max(0, Math.round(v)))
    }
  } catch {
    /* fall through to the raw <video> element */
  }

  const video = document.querySelector('video') as HTMLVideoElement | null
  if (video && Number.isFinite(video.volume)) {
    return video.muted ? 0 : Math.min(100, Math.max(0, Math.round(video.volume * 100)))
  }
  return undefined
}

function runPlaybackAction(
  action: PlaybackAction,
  position?: number,
  volume?: number,
): boolean {
  switch (action) {
    case 'next':
      return doNext()
    case 'prev':
      return doPrev()
    case 'play':
      return doPlay()
    case 'pause':
      return doPause()
    case 'toggle':
      return doToggle()
    case 'seek':
      return typeof position === 'number' ? doSeek(position) : false
    case 'volume':
      return typeof volume === 'number' ? doSetVolume(volume) : false
    default:
      return false
  }
}

function readPlayerTimeInfo(): { current: number; duration: number } | null {
  const el =
    (document.querySelector(
      'ytmusic-player-bar .time-info',
    ) as HTMLElement | null) ??
    (document.querySelector('.time-info.ytmusic-player-bar') as HTMLElement | null)
  const text = el?.innerText?.trim() ?? ''
  if (!text.includes('/')) return null

  const [positionLabel, durationLabel] = text.split('/').map((part) => part.trim())
  const current = parsePlaybackTimeLabel(positionLabel ?? '')
  const duration = parsePlaybackTimeLabel(durationLabel ?? '')
  if (current == null || duration == null || duration <= 0) return null
  return { current, duration }
}

function readPlayerCurrentTime(bar: PlayerBar | null): number {
  const apiTime = bar?.playerApi?.getCurrentTime?.()
  if (typeof apiTime === 'number' && Number.isFinite(apiTime) && apiTime >= 0) {
    return apiTime
  }

  const domTimes = readPlayerTimeInfo()
  if (domTimes) return domTimes.current

  const video = document.querySelector('video') as HTMLVideoElement | null
  if (
    video &&
    Number.isFinite(video.currentTime) &&
    video.currentTime >= 0
  ) {
    return video.currentTime
  }

  return 0
}

function readPlayerDuration(bar: PlayerBar | null): number | null {
  const domTimes = readPlayerTimeInfo()
  if (domTimes && domTimes.duration > 0) return domTimes.duration

  const apiDuration = bar?.playerApi?.getDuration?.()
  if (
    typeof apiDuration === 'number' &&
    Number.isFinite(apiDuration) &&
    apiDuration > 0
  ) {
    return apiDuration
  }

  const video = document.querySelector('video') as HTMLVideoElement | null
  if (
    video &&
    Number.isFinite(video.duration) &&
    video.duration > 0 &&
    Number.isFinite(video.currentTime) &&
    video.duration >= video.currentTime
  ) {
    return video.duration
  }

  return null
}

function getPlayerTimes(): { current: number; duration: number } | null {
  const bar = getPlayerBar()
  const duration = readPlayerDuration(bar)
  if (duration == null) return null

  const current = readPlayerCurrentTime(bar)
  return { current, duration }
}

function readRendererText(field: unknown): string {
  if (!field || typeof field !== 'object') return ''
  const obj = field as Record<string, unknown>
  if (typeof obj.simpleText === 'string') return obj.simpleText
  const runs = obj.runs as { text?: string }[] | undefined
  if (Array.isArray(runs)) {
    return runs.map((r) => (typeof r?.text === 'string' ? r.text : '')).join('')
  }
  return ''
}

function readRendererThumbnail(renderer: Record<string, unknown>): string {
  const thumb = renderer.thumbnail as
    | { thumbnails?: { url?: string; width?: number }[] }
    | undefined
  const thumbs = thumb?.thumbnails ?? []
  if (thumbs.length === 0) return ''
  let best: { url?: string; width?: number } = thumbs[0]!
  for (const t of thumbs) {
    if ((t?.width ?? 0) > (best.width ?? 0)) best = t
  }
  return typeof best?.url === 'string' ? best.url : ''
}

function getNextSongInfo(): NextSongInfo | null {
  const innerStore = getInnerStore()
  if (!innerStore) return null
  const items = innerStore.getState().queue.items ?? []
  if (items.length === 0) return null
  const selectedIdx = getSelectedIndexFromItems(items)
  const next = items[selectedIdx + 1]
  if (!next) return null
  const renderer = queueItemRenderer(next)
  if (!renderer) return null
  const videoId = typeof renderer.videoId === 'string' ? renderer.videoId : ''
  const title = readRendererText(renderer.title)
  const artist =
    readRendererText(renderer.longBylineText) ||
    readRendererText(renderer.shortBylineText)
  const thumbnailUrl = readRendererThumbnail(renderer)
  if (!videoId && !title) return null
  return {
    videoId,
    title: title || 'Up next',
    artist,
    thumbnailUrl,
  }
}

function readCurrentVideoIdFromYtm(): string {
  return (
    new URLSearchParams(location.search).get('v') ??
    (document.querySelector('ytmusic-player-bar') as PlayerBar | null)
      ?.playerApi?.getVideoData?.()?.video_id ??
    ''
  )
}

function checkNextSongToast(): void {
  tickNextSongToast({
    readTimes: getPlayerTimes,
    readCurrentVideoId: readCurrentVideoIdFromYtm,
    readNextSong: getNextSongInfo,
  })
}

/** Opens the queue panel so #queue store initializes on a fresh session. */
function nudgeQueueUi(): void {
  const selectors = [
    'ytmusic-player-bar button[aria-label*="Queue"]',
    'ytmusic-player-bar button[aria-label*="queue"]',
    'tp-yt-paper-icon-button[aria-label*="Queue"]',
    'tp-yt-paper-icon-button[aria-label*="queue"]',
  ]
  for (const selector of selectors) {
    const btn = document.querySelector(selector) as HTMLElement | null
    if (btn) {
      btn.click()
      return
    }
  }
}

async function addVideoViaStoreApi(
  videoId: string,
  mode: InsertMode,
): Promise<boolean> {
  const queueEl = getQueueElement()
  const app = getYtmApp()
  const innerStore = getInnerStore()

  if (!innerStore || !app?.networkManager || !queueEl) return false

  const state = innerStore.getState().queue
  if (!state.queueContextParams) {
    log('Queue context not ready — open the queue panel or play a track first')
    return false
  }

  const position = insertPositionFor(mode)
  const beforeCount = state.items.length

  try {
    const response = await app.networkManager.fetch<
      GetQueueResponse,
      {
        queueContextParams: string
        videoIds: string[]
        queueInsertPosition: QueueInsertPosition
      }
    >('/music/get_queue', {
      queueContextParams: state.queueContextParams,
      queueInsertPosition: position,
      videoIds: [videoId],
    })

    const items = (response.queueDatas ?? [])
      .map((row) => row?.content)
      .filter(Boolean)

    if (items.length === 0) {
      log('Track not in YouTube Music catalog:', videoId)
      return false
    }

    const freshState = innerStore.getState().queue
    const index = insertIndexFor(mode, freshState.items)

    if (typeof queueEl.dispatch !== 'function') {
      throw new Error('Queue dispatch not available')
    }

    queueEl.dispatch({
      type: 'ADD_ITEMS',
      payload: {
        nextQueueItemId: freshState.nextQueueItemId,
        index,
        items,
        shuffleEnabled: false,
        shouldAssignIds: true,
      },
    })

    return waitForInsertedPosition(innerStore, videoId, mode, beforeCount)
  } catch (err) {
    log('Queue store add failed', err)
    return false
  }
}

async function dispatchQueueAddLegacy(
  videoId: string,
  mode: InsertMode,
): Promise<boolean> {
  const playerBar = document.querySelector('ytmusic-player-bar')
  if (!playerBar) return false

  const innerStore = getInnerStore()
  const beforeCount = getQueueStoreItems().length

  const queueTarget = {
    videoId,
    onEmptyQueue: { autoFillType: 'AUTO_FILL_TYPE_WATCH' as const },
  }

  const endpoint = {
    queueAddEndpoint: {
      queueTarget,
      queueInsertPosition: insertPositionFor(mode),
    },
  }

  const detail = {
    actionName: 'yt-service-request',
    args: [playerBar, endpoint],
    optionalAction: false,
    returnValue: [] as unknown[],
  }

  for (const target of [
    getYtmApp(),
    playerBar,
    document.querySelector('ytmusic-player'),
  ]) {
    if (!target) continue
    target.dispatchEvent(
      new CustomEvent('yt-action', {
        bubbles: true,
        cancelable: false,
        composed: true,
        detail,
      }),
    )
  }

  return waitForInsertedPosition(innerStore, videoId, mode, beforeCount)
}

async function addVideoToYtm(
  videoId: string,
  mode: InsertMode,
): Promise<boolean> {
  if (!location.hostname.includes('music.youtube.com')) {
    log('Open music.youtube.com — queue actions only work there.')
    return false
  }

  if (!(await waitForQueueApi(queueApiReady ? 0 : 4000))) {
    nudgeQueueUi()
    await new Promise((r) => window.setTimeout(r, 300))
    if (!(await waitForQueueApi(3000))) return false
  }

  if (await addVideoViaStoreApi(videoId, mode)) return true

  return dispatchQueueAddLegacy(videoId, mode)
}

async function addVideoToYtmWithRetry(
  videoId: string,
  mode: InsertMode,
  attempts = 2,
): Promise<boolean> {
  for (let i = 0; i < attempts; i += 1) {
    if (await addVideoToYtm(videoId, mode)) return true
    if (i + 1 < attempts) {
      await new Promise((r) => window.setTimeout(r, 200 * (i + 1)))
    }
  }
  return false
}

function extractRemoveFromQueueEndpoint(
  item: unknown,
): { videoId: string; itemId: string } | null {
  const renderer = queueItemRenderer(item)
  if (!renderer?.menu || typeof renderer.menu !== 'object') return null

  const menuItems =
    ((renderer.menu as { menuRenderer?: { items?: unknown[] } }).menuRenderer
      ?.items as unknown[] | undefined) ?? []

  for (const menuItem of menuItems) {
    if (!menuItem || typeof menuItem !== 'object') continue
    const entry = menuItem as Record<string, unknown>
    const candidates = [
      (entry.menuServiceItemRenderer as { serviceEndpoint?: unknown })
        ?.serviceEndpoint,
      (entry.menuNavigationItemRenderer as { navigationEndpoint?: unknown })
        ?.navigationEndpoint,
      (entry.menuServiceItemRenderer as { navigationEndpoint?: unknown })
        ?.navigationEndpoint,
    ]

    for (const endpoint of candidates) {
      if (!endpoint || typeof endpoint !== 'object') continue
      const remove = (
        endpoint as {
          removeFromQueueEndpoint?: { videoId?: string; itemId?: string }
        }
      ).removeFromQueueEndpoint
      if (remove?.videoId && remove?.itemId) {
        return { videoId: remove.videoId, itemId: remove.itemId }
      }
    }
  }

  const playlistSetVideoId = renderer.playlistSetVideoId
  const videoId = renderer.videoId
  if (
    typeof playlistSetVideoId === 'string' &&
    typeof videoId === 'string' &&
    playlistSetVideoId &&
    videoId
  ) {
    return { videoId, itemId: playlistSetVideoId }
  }

  return null
}

function getQueueStoreItems(): unknown[] {
  const queueEl = getQueueElement()
  if (typeof queueEl?.queue?.getItems === 'function') {
    return queueEl.queue.getItems()
  }
  return getInnerStore()?.getState().queue.items ?? []
}

function isCurrentlyPlayingIndex(items: unknown[], index: number): boolean {
  const renderer = queueItemRenderer(items[index])
  if (renderer?.selected === true) return true
  return index === getSelectedIndexFromItems(items)
}

type RemoveTarget = {
  index: number
  videoId: string
  itemId?: string
}

function collectRemoveTargets(videoId: string): RemoveTarget[] {
  const items = getQueueStoreItems()
  const targets: RemoveTarget[] = []

  items.forEach((item, index) => {
    if (parseVideoIdFromQueueItem(item) !== videoId) return
    if (isCurrentlyPlayingIndex(items, index)) return

    const endpoint = extractRemoveFromQueueEndpoint(item)
    targets.push({
      index,
      videoId,
      itemId: endpoint?.itemId,
    })
  })

  return targets.sort((a, b) => b.index - a.index)
}

async function waitForQueueItemRemoved(
  videoId: string,
  beforeCount: number,
): Promise<boolean> {
  const deadline = Date.now() + 2000
  while (Date.now() < deadline) {
    const items = getQueueStoreItems()
    if (items.length < beforeCount) return true
    if (!items.some((item) => parseVideoIdFromQueueItem(item) === videoId)) {
      return true
    }
    await new Promise((r) => window.setTimeout(r, 50))
  }
  return false
}

async function removeViaStoreIndex(index: number, videoId: string): Promise<boolean> {
  const queueEl = getQueueElement()
  const innerStore = getInnerStore()
  if (!queueEl?.dispatch || !innerStore) return false

  const beforeCount = getQueueStoreItems().length
  queueEl.dispatch({ type: 'REMOVE_ITEM', payload: index })
  return waitForQueueItemRemoved(videoId, beforeCount)
}

async function dispatchQueueRemoveLegacy(
  videoId: string,
  queueItemId: string,
): Promise<boolean> {
  const playerBar = document.querySelector('ytmusic-player-bar')
  if (!playerBar) return false

  const beforeCount = getQueueStoreItems().length
  const endpoint = {
    removeFromQueueEndpoint: {
      videoId,
      itemId: queueItemId,
      commands: [],
    },
  }

  const detail = {
    actionName: 'yt-service-request',
    args: [playerBar, endpoint],
    optionalAction: false,
    returnValue: [] as unknown[],
  }

  for (const target of [
    getYtmApp(),
    playerBar,
    document.querySelector('ytmusic-player'),
    getQueueElement(),
  ]) {
    if (!target) continue
    target.dispatchEvent(
      new CustomEvent('yt-action', {
        bubbles: true,
        cancelable: false,
        composed: true,
        detail,
      }),
    )
  }

  return waitForQueueItemRemoved(videoId, beforeCount)
}

async function removeViaDomClick(videoId: string): Promise<boolean> {
  nudgeQueueUi()
  await new Promise((r) => window.setTimeout(r, 250))

  const beforeCount = getQueueStoreItems().length
  const selectors = [
    'ytmusic-player-queue-item',
    '#playlist-items ytmusic-player-queue-item',
  ]

  for (const selector of selectors) {
    const domItems = document.querySelectorAll(selector)
    for (const el of domItems) {
      const html = el.innerHTML
      if (!html.includes(videoId)) continue

      const removeBtn = el.querySelector(
        [
          'button[aria-label*="Remove" i]',
          'yt-icon-button[aria-label*="Remove" i]',
          'tp-yt-paper-icon-button[aria-label*="Remove" i]',
          'button[aria-label*="Delete" i]',
        ].join(','),
      ) as HTMLElement | null

      if (removeBtn) {
        removeBtn.click()
        if (await waitForQueueItemRemoved(videoId, beforeCount)) return true
      }
    }
  }

  return false
}

async function removeVideoFromQueue(videoId: string): Promise<boolean> {
  if (!(await waitForQueueApi(queueApiReady ? 0 : 4000))) {
    log('Queue API not ready for remove', videoId)
    return false
  }

  const targets = collectRemoveTargets(videoId)
  log('Remove targets for', videoId, targets.length)

  for (const target of targets) {
    if (await removeViaStoreIndex(target.index, videoId)) {
      log('Removed via REMOVE_ITEM at index', target.index)
      return true
    }
  }

  for (const target of targets) {
    if (target.itemId && (await dispatchQueueRemoveLegacy(videoId, target.itemId))) {
      log('Removed via removeFromQueueEndpoint', target.itemId)
      return true
    }
  }

  if (await removeViaDomClick(videoId)) {
    log('Removed via queue panel click', videoId)
    return true
  }

  if (targets.length === 0) {
    const stillInQueue = getQueueStoreItems().some(
      (item) => parseVideoIdFromQueueItem(item) === videoId,
    )
    return !stillInQueue
  }

  return false
}

async function removeVideoFromQueueWithRetry(
  videoId: string,
  attempts = 3,
): Promise<boolean> {
  for (let i = 0; i < attempts; i += 1) {
    if (await removeVideoFromQueue(videoId)) return true
    if (i + 1 < attempts) {
      await new Promise((r) => window.setTimeout(r, 300 * (i + 1)))
    }
  }
  return false
}

function showToast(message: string) {
  document.getElementById('ytmq-bridge-toast')?.remove()

  const el = document.createElement('div')
  el.id = 'ytmq-bridge-toast'
  el.textContent = message
  el.style.cssText = [
    'position:fixed',
    'bottom:88px',
    'left:50%',
    'transform:translateX(-50%)',
    'z-index:99999',
    'background:#18181b',
    'color:#fafafa',
    'padding:10px 16px',
    'border-radius:10px',
    'font:14px/1.4 system-ui,sans-serif',
    'box-shadow:0 4px 24px rgba(0,0,0,.45)',
    'border:1px solid #3f3f46',
    'max-width:90vw',
    'text-align:center',
  ].join(';')
  document.body.appendChild(el)
  window.setTimeout(() => el.remove(), 3500)
}

async function runBridge() {
  const params = readParams()
  if (!params) {
    console.error(
      '[YTMQ] Missing roomId, sb, or key. Connect from the YTMQ host page.',
    )
    return
  }

  const { roomId, sb, key, since: playbackSince } = params

  if (!location.hostname.includes('music.youtube.com')) {
    console.error('[YTMQ] Open music.youtube.com and run this script there.')
    return
  }

  const existing = window.__YTMQ_BRIDGE__ as
    | { roomId?: string; since?: string; stop?: () => void }
    | undefined
  if (existing?.roomId) {
    const sameRoom =
      existing.roomId === roomId &&
      (existing.since || '') === (playbackSince || '')
    if (sameRoom) {
      log('Bridge already running for room', existing.roomId)
      return
    }
    try {
      if (typeof existing.stop === 'function') existing.stop()
    } catch {
      /* old bridge already broken */
    }
    delete window.__YTMQ_BRIDGE__
  }

  const syncedIds = new Set<string>()
  const skipYtmRemoveIds = new Set<string>()
  const rowVideoById = new Map<string, string>()
  const pendingRemoveVideoIds = new Set<string>()
  const pendingRows: QueueRow[] = []
  const supabase: SupabaseClient = createClient(sb, key)

  function trackRowVideo(row: QueueRow) {
    if (row.id && row.video_id) {
      rowVideoById.set(row.id, row.video_id)
    }
  }

  function shouldSkipYtmRemove(row: QueueRow): boolean {
    if (row.id && skipYtmRemoveIds.has(row.id)) {
      skipYtmRemoveIds.delete(row.id)
      return true
    }
    return false
  }

  function handleQueueRemove(row: QueueRow, source: string) {
    const videoId = row.video_id || rowVideoById.get(row.id) || ''
    if (!videoId) {
      log('Remove ignored — missing video_id', source, row.id)
      return
    }
    if (shouldSkipYtmRemove({ ...row, video_id: videoId })) {
      log('Skip YT Music remove (now playing cleanup)', videoId)
      return
    }
    if (pendingRemoveVideoIds.has(videoId)) {
      log('Remove already in progress', videoId, source)
      return
    }
    pendingRemoveVideoIds.add(videoId)
    void dequeueFromYtm({ ...row, video_id: videoId }).finally(() => {
      window.setTimeout(() => pendingRemoveVideoIds.delete(videoId), 3000)
    })
  }

  async function processPending() {
    while (pendingRows.length > 0) {
      const row = pendingRows[pendingRows.length - 1]!
      if (syncedIds.has(row.id)) {
        pendingRows.pop()
        continue
      }
      const mode = normalizeMode(row.insert_mode)
      const ok = await addVideoToYtmWithRetry(row.video_id, mode, 2)
      if (!ok) return
      syncedIds.add(row.id)
      trackRowVideo(row)
      pendingRows.pop()
      showToast(`${modeLabel(mode)}: ${row.title || 'track'}`)
      log(`${modeLabel(mode)} (retry)`, row.video_id, row.title)
    }
  }

  async function enqueueToYtm(row: QueueRow) {
    if (syncedIds.has(row.id)) return
    trackRowVideo(row)
    const mode = normalizeMode(row.insert_mode)
    const ok = await addVideoToYtmWithRetry(row.video_id, mode, 2)
    if (ok) {
      syncedIds.add(row.id)
      trackRowVideo(row)
      showToast(`${modeLabel(mode)}: ${row.title || 'track'}`)
      log(modeLabel(mode), row.video_id, row.title)
      return
    }
    if (!pendingRows.some((p) => p.id === row.id)) {
      pendingRows.push(row)
      log('Queued for retry when YT Music is ready', row.video_id)
      showToast(
        'Could not add yet — open the queue panel on YouTube Music, then retry',
      )
    }
    void processPending()
  }

  async function dequeueFromYtm(row: QueueRow) {
    syncedIds.delete(row.id)
    pendingRows.splice(
      pendingRows.findIndex((p) => p.id === row.id),
      1,
    )
    rowVideoById.delete(row.id)
    const ok = await removeVideoFromQueueWithRetry(row.video_id, 3)
    if (ok) {
      log('Removed from YT Music queue', row.video_id, row.title)
      showToast(`Removed: ${row.title || 'track'}`)
    } else {
      log('Could not remove from YT Music queue', row.video_id)
      showToast(`Could not remove from YT Music: ${row.title || 'track'}`)
    }
  }

  let lastPlaybackKey = ''
  let lastPublishedVideoId = ''
  let playbackJoined = false
  let queueJoined = false
  let playbackChannel = supabase.channel(`ytmq-playback:${roomId}`)
  let playbackReconnectTimer: number | undefined

  function attachPlaybackChannel() {
    void playbackChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        playbackJoined = true
        publishNowPlaying()
      } else if (
        status === 'CLOSED' ||
        status === 'CHANNEL_ERROR' ||
        status === 'TIMED_OUT'
      ) {
        playbackJoined = false
        schedulePlaybackReconnect()
      }
    })
  }

  function schedulePlaybackReconnect() {
    if (playbackReconnectTimer !== undefined) return
    playbackReconnectTimer = window.setTimeout(() => {
      playbackReconnectTimer = undefined
      void supabase.removeChannel(playbackChannel).finally(() => {
        playbackChannel = supabase.channel(`ytmq-playback:${roomId}`)
        attachPlaybackChannel()
      })
    }, 1500)
  }

  attachPlaybackChannel()

  const removePlayedFromSharedQueue = createPlayedQueueCleanup({
    findByVideoId: async (videoId) => {
      const { data, error } = await supabase
        .from('queue_items')
        .select('id, created_at, title, video_id, insert_mode')
        .eq('room_id', roomId)
        .eq('video_id', videoId)
        .order('position', { ascending: true })
        .limit(1)
      if (error) return null
      return (data?.[0] as SharedQueueRow | undefined) ?? null
    },
    findTopOfQueue: async () => {
      const { data, error } = await supabase
        .from('queue_items')
        .select('id, created_at, title, video_id, insert_mode')
        .eq('room_id', roomId)
        .order('position', { ascending: true })
        .limit(1)
      if (error) return null
      return (data?.[0] as SharedQueueRow | undefined) ?? null
    },
    deleteRow: async (row, reason) => {
      skipYtmRemoveIds.add(row.id)
      syncedIds.delete(row.id)
      const { error } = await supabase
        .from('queue_items')
        .delete()
        .eq('id', row.id)
      if (error) {
        // Roll back the skip flag so a later DELETE event (e.g. from a manual
        // remove) still triggers the YT Music cleanup.
        skipYtmRemoveIds.delete(row.id)
        log('Shared queue delete failed', reason, row.id, error.message)
        return false
      }
      log('Removed shared queue row', reason, row.video_id ?? row.id, row.title)
      return true
    },
    isInPlaybackSession: (createdAt) =>
      isInPlaybackSession(createdAt, playbackSince),
  })

  function publishNowPlaying() {
    const current = readNowPlaying()
    if (!current?.videoId) return

    // Attach YT Music's own next-up track so the lyrics "Up next" banner works
    // even when the app's shared queue is empty.
    try {
      const next = getNextSongInfo()
      if (next && (next.videoId || next.title)) {
        current.nextUp = {
          videoId: next.videoId,
          title: next.title,
          artist: next.artist,
          thumbnailUrl: next.thumbnailUrl,
        }
      }
    } catch (err) {
      log('Next-up lookup failed', err)
    }

    const key = `${current.videoId}|${current.title}|${current.artist}`
    if (key !== lastPlaybackKey) {
      lastPlaybackKey = key
      if (current.videoId !== lastPublishedVideoId) {
        lastPublishedVideoId = current.videoId
        void removePlayedFromSharedQueue(current.videoId)
      }
    }

    // Defer realtime sends until the channel is actually joined; otherwise
    // supabase-js falls back to REST and logs a deprecation warning.
    if (!playbackJoined) return

    void playbackChannel.send({
      type: 'broadcast',
      event: 'now_playing',
      payload: current,
    })
  }

  const playbackTimer = window.setInterval(publishNowPlaying, 2000)

  const nextToastTimer = window.setInterval(() => {
    try {
      checkNextSongToast()
    } catch (err) {
      log('Next-song toast tick failed', err)
    }
  }, 500)

  async function loadInitialQueue(): Promise<QueueRow[]> {
    const primary = await supabase
      .from('queue_items')
      .select('id, video_id, title, created_at, insert_mode')
      .eq('room_id', roomId)
      .order('position', { ascending: true })

    if (!primary.error) return (primary.data ?? []) as QueueRow[]

    // Fall back if the live schema is missing `insert_mode` (older deploy).
    log('Initial queue load failed, retrying without insert_mode column:', primary.error.message)
    const fallback = await supabase
      .from('queue_items')
      .select('id, video_id, title, created_at')
      .eq('room_id', roomId)
      .order('position', { ascending: true })

    if (fallback.error) {
      log('Initial queue load failed (continuing anyway):', fallback.error.message)
      return []
    }
    return (fallback.data ?? []) as QueueRow[]
  }

  const existingRows = await loadInitialQueue()
  for (const row of existingRows) {
    trackRowVideo(row)
  }

  async function syncExistingQueue() {
    const sessionRows = existingRows.filter((row) =>
      isInPlaybackSession(row.created_at, playbackSince),
    )

    for (const row of existingRows) {
      if (!isInPlaybackSession(row.created_at, playbackSince)) {
        syncedIds.add(row.id)
      }
    }

    if (sessionRows.length === 0) return

    log(
      'Syncing this session’s queue to YouTube Music…',
      sessionRows.length,
      'track(s)',
    )
    for (const row of [...sessionRows].reverse()) {
      if (syncedIds.has(row.id)) continue
      await enqueueToYtm(row)
    }
  }

  let lastControlAt = 0
  function handlePlaybackControl(
    action: PlaybackAction,
    position?: number,
    volume?: number,
  ) {
    const now = Date.now()
    // Seeks and volume changes are already throttled to a steady trickle on the
    // client during a drag, so don't let the generic debounce swallow them.
    if (action !== 'seek' && action !== 'volume' && now - lastControlAt < 300) {
      log('Playback control debounced', action)
      return
    }
    lastControlAt = now

    const ok = runPlaybackAction(action, position, volume)
    log('Playback control', action, ok ? 'ok' : 'failed')
    if (!ok) {
      showToast(`Could not ${action} — open YouTube Music tab`)
      return
    }
    window.setTimeout(publishNowPlaying, 200)
    window.setTimeout(publishNowPlaying, 800)
  }

  const channel = supabase
    .channel(`ytmq-bridge:${roomId}`)
    .on('broadcast', { event: 'playback_control' }, ({ payload }) => {
      if (!payload || typeof payload !== 'object') return
      const action = (payload as { action?: PlaybackAction }).action
      const position = (payload as { position?: number }).position
      const volume = (payload as { volume?: number }).volume
      if (
        action === 'next' ||
        action === 'prev' ||
        action === 'play' ||
        action === 'pause' ||
        action === 'toggle'
      ) {
        handlePlaybackControl(action)
      } else if (action === 'seek') {
        handlePlaybackControl(
          'seek',
          typeof position === 'number' ? position : undefined,
        )
      } else if (action === 'volume') {
        handlePlaybackControl(
          'volume',
          undefined,
          typeof volume === 'number' ? volume : undefined,
        )
      }
    })
    .on('broadcast', { event: 'queue_remove' }, ({ payload }) => {
      if (!payload || typeof payload !== 'object') return
      const p = payload as Partial<QueueRow>
      handleQueueRemove(
        {
          id: p.id ?? '',
          video_id: p.video_id ?? '',
          title: p.title ?? '',
          created_at: p.created_at ?? '',
        },
        'broadcast',
      )
    })
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'queue_items',
        filter: `room_id=eq.${roomId}`,
      },
      (payload) => {
        const row = payload.new as QueueRow | undefined
        if (!row?.id || !row?.video_id) return
        trackRowVideo(row)
        const createdAt = row.created_at ?? new Date().toISOString()
        if (!isInPlaybackSession(createdAt, playbackSince)) return
        void enqueueToYtm({ ...row, created_at: createdAt })
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'queue_items',
        filter: `room_id=eq.${roomId}`,
      },
      (payload) => {
        const row = payload.old as QueueRow | undefined
        if (!row?.id && !row?.video_id) return
        handleQueueRemove(
          {
            id: row.id ?? '',
            video_id: row.video_id ?? '',
            title: row.title ?? '',
            created_at: row.created_at ?? '',
          },
          'postgres',
        )
      },
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        queueJoined = true
        showToast('YTMQ connected')
        log('Subscribed to room', roomId)
        notifyHostConnected(roomId)
        void waitForQueueApi(8000).then(async () => {
          await syncExistingQueue()
          await processPending()
        })
      } else if (
        status === 'CLOSED' ||
        status === 'CHANNEL_ERROR' ||
        status === 'TIMED_OUT'
      ) {
        queueJoined = false
      }
    })

  window.setInterval(() => {
    if (pendingRows.length > 0) void processPending()
  }, 1500)

  async function syncAllTracks(): Promise<number> {
    const rows = await loadInitialQueue()

    let added = 0
    // Reverse so "play next" inserts retain shared-queue order on YT Music.
    for (const row of [...rows].reverse()) {
      if (!isInPlaybackSession(row.created_at, playbackSince)) continue
      if (syncedIds.has(row.id)) continue
      const mode = normalizeMode(row.insert_mode)
      if (await addVideoToYtmWithRetry(row.video_id, mode, 2)) {
        syncedIds.add(row.id)
        added += 1
      }
    }
    showToast(`YTMQ: synced ${added} track(s)`)
    return added
  }

  const ytmPanel = createYtmPanel({
    roomId,
    siteBase: defaultYtmqSiteBase(),
    supabase,
    isConnected: () => queueJoined,
    readNowPlaying: () => readNowPlaying(),
    readNextSong: getNextSongInfo,
    getPendingCount: () => pendingRows.length,
    getSyncedCount: () => syncedIds.size,
    syncAll: syncAllTracks,
    nudgeQueueUi,
    onPlayPause: doToggle,
    onNext: () => {
      doNext()
    },
    onPrev: () => {
      doPrev()
    },
    showToast,
  })

  window.__YTMQ_BRIDGE__ = {
    roomId,
    since: playbackSince,
    syncedIds,
    addVideoPlayNext: (videoId: string) => addVideoToYtm(videoId, 'play_next'),
    addVideoToQueue: (videoId: string) => addVideoToYtm(videoId, 'queue'),
    removeVideoFromQueue: removeVideoFromQueueWithRetry,
    async syncAll() {
      return syncAllTracks()
    },
    stop() {
      window.clearInterval(playbackTimer)
      window.clearInterval(nextToastTimer)
      if (playbackReconnectTimer !== undefined) {
        window.clearTimeout(playbackReconnectTimer)
      }
      hideNextSongToast({ immediate: true })
      ytmPanel.destroy()
      void supabase.removeChannel(channel)
      void supabase.removeChannel(playbackChannel)
      delete window.__YTMQ_BRIDGE__
      showToast('YTMQ disconnected')
    },
  }

  log('Bridge ready. Call __YTMQ_BRIDGE__.syncAll() to push the full queue.')
}

void runBridge()
