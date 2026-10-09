/**
 * Publishes lobby/playback state to the extension content-script panel
 * (extension/ytm-panel.js, a closed shadow root that survives YouTube Music
 * DOM sweeps) and runs the actions the panel sends back.
 *
 * The panel shows what YouTube Music itself can't: the shared queue with who
 * added each song, who is listening, the lobby code with a QR to scan, and
 * songs that have not made it into YouTube Music yet.
 */

import QRCode from 'qrcode'
import type { YtmqClient } from '../lib/ytmqClient'
import { DEFAULT_IMAGE_PALETTE, loadImagePalette } from '../lib/imagePalette'
import type { NextSongInfo } from './nextSongToast'

export type PanelBridgePlayback = {
  videoId: string
  title: string
  artist: string
  currentTime: number
  duration?: number
  state: 'playing' | 'paused' | 'unknown'
}

export type PanelBridgeDeps = {
  roomId: string
  siteBase: string
  ytmq: YtmqClient
  isConnected: () => boolean
  readNowPlaying: () => PanelBridgePlayback | null
  readNextSong: () => NextSongInfo | null
  /** Shared-queue songs this bridge could not put into YouTube Music yet. */
  pendingCount: () => number
  onRetrySync: () => void
  onPlayPause: () => void
  onNext: () => void
  onPrev: () => void
  showToast: (message: string) => void
}

type PanelQueueRow = {
  id: string
  video_id: string
  title: string
  channel_title: string
  thumbnail_url: string
  added_by: string
  insert_mode: 'play_next' | 'queue'
}

const BRIDGE_SOURCE = 'ytmq-bridge'
const PANEL_SOURCE = 'ytmq-panel-ui'
const DEFAULT_SITE = 'https://t3lluz.com/ytmq'
/** Rows the panel lists; the rest is a count. */
const PANEL_QUEUE_ROWS = 8
const REFRESH_MS = 4000
/** Same window the app uses for its "N listening" pill. */
const ONLINE_WINDOW_MS = 45_000

type PanelParticipant = { last_seen: string }

type PanelState = {
  roomCode: string
  queue: PanelQueueRow[]
  queueCount: number
  participantCount: number
  listeningCount: number
  qr: { size: number; bits: string } | null
  accent: { videoId: string; rgb: [number, number, number] }
  refreshTimer: number
  refreshing: boolean
  actionHandler: ((e: MessageEvent) => void) | null
}

const state: PanelState = {
  roomCode: '',
  queue: [],
  queueCount: 0,
  participantCount: 0,
  listeningCount: 0,
  qr: null,
  accent: { videoId: '', rgb: DEFAULT_IMAGE_PALETTE.accentRgb },
  refreshTimer: 0,
  refreshing: false,
  actionHandler: null,
}

let deps: PanelBridgeDeps | null = null

function roomUrl(roomId: string, siteBase: string): string {
  const base = siteBase.replace(/\/$/, '')
  return `${base}/room/${encodeURIComponent(roomId)}`
}

function postPanelState(payload: Record<string, unknown>) {
  try {
    window.postMessage({ source: BRIDGE_SOURCE, type: 'panel-state', payload }, '*')
  } catch {
    /* ignore */
  }
}

/** QR as a bit string, so the panel draws it without parsing any markup. */
function buildQr(url: string): PanelState['qr'] {
  try {
    const { modules } = QRCode.create(url, { errorCorrectionLevel: 'M' })
    let bits = ''
    for (let i = 0; i < modules.data.length; i++) bits += modules.data[i] ? '1' : '0'
    return { size: modules.size, bits }
  } catch {
    return null
  }
}

function artworkUrl(videoId: string): string {
  return videoId ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : ''
}

function playerBarArtwork(): string {
  const img = document.querySelector(
    'ytmusic-player-bar img.image, ytmusic-player-bar .thumbnail img',
  ) as HTMLImageElement | null
  const src = img?.src ?? ''
  return src.startsWith('https://') ? src : ''
}

/** Tint the panel from the album art, like the app's now-playing sidebar. */
function updateAccent(videoId: string, art: string) {
  if (!videoId || state.accent.videoId === videoId) return
  state.accent = { videoId, rgb: state.accent.rgb }
  void loadImagePalette(art || artworkUrl(videoId)).then((palette) => {
    if (state.accent.videoId !== videoId) return
    state.accent = { videoId, rgb: palette.accentRgb }
    publishState()
  })
}

async function refresh() {
  if (!deps || state.refreshing) return
  state.refreshing = true
  const { ytmq, roomId } = deps
  const room = `/rooms/${encodeURIComponent(roomId)}`
  try {
    const [info, queue, participants] = await Promise.all([
      state.roomCode
        ? Promise.resolve(null)
        : ytmq.rpc<{ code?: string } | null>('get_room', { p_room_id: roomId }).catch(() => null),
      ytmq.get<PanelQueueRow[]>(`${room}/queue`).catch(() => null),
      ytmq.get<PanelParticipant[]>(`${room}/participants`).catch(() => null),
    ])
    if (info?.code) state.roomCode = info.code
    if (queue) {
      state.queueCount = queue.length
      state.queue = queue.slice(0, PANEL_QUEUE_ROWS).map((row) => ({
        id: row.id,
        video_id: row.video_id,
        title: row.title,
        channel_title: row.channel_title,
        thumbnail_url: row.thumbnail_url,
        added_by: row.added_by,
        insert_mode: row.insert_mode,
      }))
    }
    if (participants) {
      const now = Date.now()
      state.participantCount = participants.length
      state.listeningCount = participants.filter(
        (p) => now - new Date(p.last_seen).getTime() <= ONLINE_WINDOW_MS,
      ).length
    }
  } finally {
    state.refreshing = false
  }
}

function buildPayload(): Record<string, unknown> {
  if (!deps) return {}
  const np = deps.readNowPlaying()
  const next = deps.readNextSong()
  const art = np ? playerBarArtwork() || artworkUrl(np.videoId) : ''
  if (np) updateAccent(np.videoId, art)
  const url = roomUrl(deps.roomId, deps.siteBase)
  if (!state.qr) state.qr = buildQr(url)
  return {
    roomId: deps.roomId,
    roomCode: state.roomCode,
    roomUrl: url,
    siteBase: deps.siteBase,
    connected: deps.isConnected(),
    queue: state.queue,
    queueCount: state.queueCount,
    participantCount: state.participantCount,
    listeningCount: state.listeningCount,
    pendingCount: deps.pendingCount(),
    qr: state.qr,
    accent: state.accent.rgb,
    nowPlaying: np ? { ...np, thumbnailUrl: art } : null,
    nextSong: next,
  }
}

function publishState() {
  postPanelState(buildPayload())
}

async function removeRow(id: string) {
  if (!deps || !id) return
  const row = state.queue.find((r) => r.id === id)
  // Optimistic: the server's DELETE event also takes it out of YouTube Music.
  state.queue = state.queue.filter((r) => r.id !== id)
  state.queueCount = Math.max(0, state.queueCount - 1)
  publishState()
  try {
    await deps.ytmq.delete(`/queue/${encodeURIComponent(id)}`)
    deps.showToast(`Removed: ${row?.title || 'track'}`)
  } catch {
    deps.showToast('Could not remove that song')
  }
  await refresh()
  publishState()
}

function handlePanelAction(data: Record<string, unknown>) {
  if (!deps) return
  const action = data.action
  if (action === 'toggle') deps.onPlayPause()
  else if (action === 'next') deps.onNext()
  else if (action === 'prev') deps.onPrev()
  else if (action === 'retry-sync') deps.onRetrySync()
  else if (action === 'remove' && typeof data.id === 'string') void removeRow(data.id)
  else if (action === 'copy-link') {
    const link = roomUrl(deps.roomId, deps.siteBase)
    void navigator.clipboard.writeText(link).then(
      () => deps?.showToast('Room link copied'),
      () => deps?.showToast('Could not copy link'),
    )
  } else if (action === 'open-app' || action === 'focus-app') {
    try {
      window.postMessage(
        {
          source: PANEL_SOURCE,
          type: action === 'focus-app' ? 'ytmq:focus-app' : 'ytmq:open-app',
          roomId: deps.roomId,
        },
        '*',
      )
    } catch {
      /* ignore */
    }
  }
  if (action === 'toggle' || action === 'next' || action === 'prev') {
    window.setTimeout(publishState, 250)
  }
}

function bindActionListener() {
  if (state.actionHandler) return
  state.actionHandler = (event: MessageEvent) => {
    if (event.source !== window) return
    const data = event.data as Record<string, unknown> | undefined
    if (!data || data.source !== PANEL_SOURCE) return
    if (data.type === 'panel-action') handlePanelAction(data)
  }
  window.addEventListener('message', state.actionHandler)
}

/** Push the current state to the panel now (it mounts on the first one). */
export function ensurePanelMounted(): void {
  publishState()
}

export function startPanelBridge(panelDeps: PanelBridgeDeps): {
  destroy: () => void
  /** Re-read the queue and participants, e.g. after a realtime change. */
  refresh: () => void
} {
  deps = panelDeps
  bindActionListener()

  void refresh().then(publishState)

  // Playback moves every second; the queue only on changes (see refresh()).
  const playbackTimer = window.setInterval(publishState, 1000)
  state.refreshTimer = window.setInterval(() => {
    void refresh().then(publishState)
  }, REFRESH_MS)

  return {
    destroy() {
      window.clearInterval(playbackTimer)
      window.clearInterval(state.refreshTimer)
      state.refreshTimer = 0
      if (state.actionHandler) {
        window.removeEventListener('message', state.actionHandler)
        state.actionHandler = null
      }
      postPanelState({ connected: false, destroy: true })
      deps = null
      state.roomCode = ''
      state.queue = []
      state.queueCount = 0
      state.participantCount = 0
      state.listeningCount = 0
      state.qr = null
    },
    refresh() {
      void refresh().then(publishState)
    },
  }
}

export function defaultYtmqSiteBase(): string {
  return DEFAULT_SITE
}
