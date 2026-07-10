/**
 * Publishes lobby/playback state to the extension content-script panel
 * (shadow DOM — survives YouTube Music DOM sweeps). Falls back to a MAIN-world
 * shadow host for userscript-only installs.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
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
  supabase: SupabaseClient
  isConnected: () => boolean
  readNowPlaying: () => PanelBridgePlayback | null
  readNextSong: () => NextSongInfo | null
  onPlayPause: () => void
  onNext: () => void
  onPrev: () => void
  showToast: (message: string) => void
}

const BRIDGE_SOURCE = 'ytmq-bridge'
const PANEL_SOURCE = 'ytmq-panel-ui'
const DEFAULT_SITE = 'https://t3lluz.github.io/YTMQ'

type PanelState = {
  roomCode: string
  queueCount: number
  participantCount: number
  refreshTimer: number
  actionHandler: ((e: MessageEvent) => void) | null
  shadowHost: HTMLDivElement | null
}

const state: PanelState = {
  roomCode: '',
  queueCount: 0,
  participantCount: 0,
  refreshTimer: 0,
  actionHandler: null,
  shadowHost: null,
}

let deps: PanelBridgeDeps | null = null

function hasExtensionPanel(): boolean {
  try {
    return document.documentElement.dataset.ytmqExtension === '1'
  } catch {
    return false
  }
}

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

async function fetchRoomCode(panelDeps: PanelBridgeDeps): Promise<string> {
  try {
    const { data, error } = await panelDeps.supabase.rpc('get_room', {
      p_room_id: panelDeps.roomId,
    })
    if (error || !data || typeof data !== 'object') return ''
    const code = (data as { code?: string }).code
    return typeof code === 'string' ? code : ''
  } catch {
    return ''
  }
}

async function fetchQueueCount(panelDeps: PanelBridgeDeps): Promise<number> {
  try {
    const { count, error } = await panelDeps.supabase
      .from('queue_items')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', panelDeps.roomId)
    if (error) return 0
    return count ?? 0
  } catch {
    return 0
  }
}

async function fetchParticipantCount(panelDeps: PanelBridgeDeps): Promise<number> {
  try {
    const { count, error } = await panelDeps.supabase
      .from('participants')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', panelDeps.roomId)
      .eq('kicked', false)
    if (error) return 0
    return count ?? 0
  } catch {
    return 0
  }
}

async function refreshCounts() {
  if (!deps) return
  if (!state.roomCode) state.roomCode = await fetchRoomCode(deps)
  state.queueCount = await fetchQueueCount(deps)
  state.participantCount = await fetchParticipantCount(deps)
}

function buildPayload(): Record<string, unknown> {
  if (!deps) return {}
  const np = deps.readNowPlaying()
  const next = deps.readNextSong()
  return {
    roomId: deps.roomId,
    roomCode: state.roomCode,
    roomUrl: roomUrl(deps.roomId, deps.siteBase),
    siteBase: deps.siteBase,
    connected: deps.isConnected(),
    queueCount: state.queueCount,
    participantCount: state.participantCount,
    nowPlaying: np,
    nextSong: next,
  }
}

function publishState() {
  postPanelState(buildPayload())
}

function handlePanelAction(data: Record<string, unknown>) {
  if (!deps) return
  const action = data.action
  if (action === 'toggle') deps.onPlayPause()
  else if (action === 'next') deps.onNext()
  else if (action === 'prev') deps.onPrev()
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

/** Userscript fallback: tiny signal that panel UI should exist in content script. */
export function ensurePanelMounted(): void {
  publishState()
}

function mountUserscriptShadowHint() {
  if (hasExtensionPanel() || state.shadowHost) return
  const host = document.createElement('div')
  host.id = 'ytmq-userscript-hint'
  host.setAttribute('data-ytmq-wants-panel', '1')
  host.style.cssText = 'display:none!important'
  const parent = document.documentElement
  parent.appendChild(host)
  state.shadowHost = host
}

export function startPanelBridge(panelDeps: PanelBridgeDeps): { destroy: () => void } {
  deps = panelDeps
  bindActionListener()
  mountUserscriptShadowHint()

  void refreshCounts().then(() => publishState())

  state.refreshTimer = window.setInterval(() => {
    void refreshCounts().then(() => publishState())
  }, 2000)

  return {
    destroy() {
      window.clearInterval(state.refreshTimer)
      state.refreshTimer = 0
      if (state.actionHandler) {
        window.removeEventListener('message', state.actionHandler)
        state.actionHandler = null
      }
      state.shadowHost?.remove()
      state.shadowHost = null
      postPanelState({ connected: false, destroy: true })
      deps = null
      state.roomCode = ''
      state.queueCount = 0
      state.participantCount = 0
    },
  }
}

export function defaultYtmqSiteBase(): string {
  return DEFAULT_SITE
}
