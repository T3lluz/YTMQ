/**
 * Floating YTMQ control panel on music.youtube.com — pill toggle that expands
 * into a data-rich overlay with lobby info, playback, and quick actions.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { NextSongInfo } from './nextSongToast'

export type YtmPanelPlayback = {
  videoId: string
  title: string
  artist: string
  currentTime: number
  duration?: number
  state: 'playing' | 'paused' | 'unknown'
}

export type YtmPanelDeps = {
  roomId: string
  siteBase: string
  supabase: SupabaseClient
  isConnected: () => boolean
  readNowPlaying: () => YtmPanelPlayback | null
  readNextSong: () => NextSongInfo | null
  getPendingCount: () => number
  getSyncedCount: () => number
  syncAll: () => Promise<number>
  nudgeQueueUi: () => void
  onPlayPause: () => void
  onNext: () => void
  onPrev: () => void
  showToast: (message: string) => void
}

const PANEL_ID = 'ytmq-ytm-panel'
const STYLE_ID = 'ytmq-ytm-panel-style'
const UI_SOURCE = 'ytmq-bridge-ui'
const DEFAULT_SITE = 'https://t3lluz.github.io/YTMQ'

const LOGO_SVG = `<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><defs><linearGradient id="ytmq-yp-bg" x1="6" y1="4" x2="26" y2="28" gradientUnits="userSpaceOnUse"><stop stop-color="#8B5CF6"/><stop offset="1" stop-color="#D946EF"/></linearGradient></defs><rect width="32" height="32" rx="8" fill="url(#ytmq-yp-bg)"/><rect x="6" y="7" width="20" height="6.5" rx="3.25" fill="#fff" fill-opacity="0.96"/><path fill="#7C3AED" d="M10.2 9.1v3.3l3.1-1.65z"/><rect x="6" y="15.5" width="20" height="4.5" rx="2.25" fill="#fff" fill-opacity="0.42"/><rect x="6" y="21.5" width="13.5" height="4.5" rx="2.25" fill="#fff" fill-opacity="0.24"/></svg>`

type PanelState = {
  expanded: boolean
  roomCode: string
  queueCount: number
  refreshTimer: number
  outsideHandler: ((e: PointerEvent) => void) | null
  keyHandler: ((e: KeyboardEvent) => void) | null
}

const state: PanelState = {
  expanded: false,
  roomCode: '',
  queueCount: 0,
  refreshTimer: 0,
  outsideHandler: null,
  keyHandler: null,
}

let deps: YtmPanelDeps | null = null

function roomUrl(roomId: string, siteBase: string): string {
  const base = siteBase.replace(/\/$/, '')
  return `${base}/room/${encodeURIComponent(roomId)}`
}

function shortRoomId(roomId: string): string {
  return roomId.length > 8 ? `${roomId.slice(0, 8)}…` : roomId
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function hasExtension(): boolean {
  try {
    return document.documentElement.dataset.ytmqExtension === '1'
  } catch {
    return false
  }
}

function postUiMessage(type: string, roomId: string) {
  try {
    window.postMessage({ source: UI_SOURCE, type, roomId }, '*')
  } catch {
    /* ignore */
  }
}

function focusOrOpenYtmq(roomId: string, siteBase: string) {
  if (hasExtension()) {
    postUiMessage('ytmq:focus-app', roomId)
    return
  }
  window.open(roomUrl(roomId, siteBase), '_blank', 'noopener,noreferrer')
}

function openYtmqTab(roomId: string, siteBase: string) {
  if (hasExtension()) {
    postUiMessage('ytmq:open-app', roomId)
    return
  }
  window.open(roomUrl(roomId, siteBase), '_blank', 'noopener,noreferrer')
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    @keyframes ytmq-yp-in {
      0% { opacity: 0; transform: translateY(12px) scale(0.94); filter: blur(6px); }
      100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
    }
    @keyframes ytmq-yp-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(139,92,246,.45); }
      50% { box-shadow: 0 0 0 6px rgba(139,92,246,0); }
    }
  #${PANEL_ID} {
    position: fixed;
    right: 16px;
    bottom: 92px;
    z-index: 99998;
    font: 13px/1.4 'YouTube Sans', 'Roboto', system-ui, sans-serif;
    color: #fafafa;
    pointer-events: auto;
    max-width: min(360px, calc(100vw - 24px));
  }
  #${PANEL_ID} .ytmq-yp-shell {
    border-radius: 999px;
    border: 1px solid rgba(139,92,246,.35);
    background: linear-gradient(145deg, rgba(24,24,27,.94), rgba(39,39,42,.92));
    backdrop-filter: blur(14px) saturate(150%);
    -webkit-backdrop-filter: blur(14px) saturate(150%);
    box-shadow: 0 16px 48px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.04);
    overflow: hidden;
    transition:
      border-radius 360ms cubic-bezier(.22,1.2,.36,1),
      width 360ms cubic-bezier(.22,1.2,.36,1),
      max-height 420ms cubic-bezier(.22,1.2,.36,1);
    width: auto;
    max-height: 44px;
  }
  #${PANEL_ID}.is-expanded .ytmq-yp-shell {
    border-radius: 18px;
    width: min(360px, calc(100vw - 24px));
    max-height: min(78vh, 560px);
  }
  #${PANEL_ID} .ytmq-yp-pill {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    padding: 6px 12px 6px 6px;
    text-align: left;
  }
  #${PANEL_ID} .ytmq-yp-logo {
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    border-radius: 10px;
    overflow: hidden;
    animation: ytmq-yp-pulse 2.8s ease-in-out infinite;
  }
  #${PANEL_ID} .ytmq-yp-logo svg { display: block; width: 100%; height: 100%; }
  #${PANEL_ID} .ytmq-yp-pill-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }
  #${PANEL_ID} .ytmq-yp-pill-title {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: .02em;
    color: #e9d5ff;
  }
  #${PANEL_ID} .ytmq-yp-pill-sub {
    font-size: 10px;
    color: #a1a1aa;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 140px;
    transition: opacity 220ms ease, max-width 280ms ease;
  }
  #${PANEL_ID}.is-expanded .ytmq-yp-pill-sub { opacity: 0; max-width: 0; }
  #${PANEL_ID} .ytmq-yp-chevron {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    color: #a78bfa;
    transition: transform 320ms cubic-bezier(.22,1.2,.36,1);
  }
  #${PANEL_ID}.is-expanded .ytmq-yp-chevron { transform: rotate(180deg); }
  #${PANEL_ID} .ytmq-yp-body {
    display: grid;
    grid-template-rows: 0fr;
    opacity: 0;
    transition:
      grid-template-rows 420ms cubic-bezier(.22,1.2,.36,1),
      opacity 280ms ease;
  }
  #${PANEL_ID}.is-expanded .ytmq-yp-body {
    grid-template-rows: 1fr;
    opacity: 1;
  }
  #${PANEL_ID} .ytmq-yp-body-inner {
    overflow: hidden;
    padding: 0 12px 12px;
    animation: ytmq-yp-in 360ms cubic-bezier(.22,1.2,.36,1) both;
  }
  #${PANEL_ID} .ytmq-yp-section {
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,.08);
    background: rgba(0,0,0,.22);
    padding: 10px 12px;
    margin-bottom: 8px;
  }
  #${PANEL_ID} .ytmq-yp-section:last-child { margin-bottom: 0; }
  #${PANEL_ID} .ytmq-yp-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  #${PANEL_ID} .ytmq-yp-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .12em;
    text-transform: uppercase;
    color: #a78bfa;
    margin-bottom: 6px;
  }
  #${PANEL_ID} .ytmq-yp-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(34,197,94,.15);
    color: #86efac;
    border: 1px solid rgba(34,197,94,.25);
  }
  #${PANEL_ID} .ytmq-yp-badge.is-off {
    background: rgba(113,113,122,.2);
    color: #d4d4d8;
    border-color: rgba(113,113,122,.35);
  }
  #${PANEL_ID} .ytmq-yp-badge-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }
  #${PANEL_ID} .ytmq-yp-code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: .18em;
    color: #fafafa;
  }
  #${PANEL_ID} .ytmq-yp-meta {
    font-size: 11px;
    color: #a1a1aa;
    margin-top: 2px;
  }
  #${PANEL_ID} .ytmq-yp-track-title {
    font-size: 14px;
    font-weight: 600;
    color: #fafafa;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  #${PANEL_ID} .ytmq-yp-track-artist {
    font-size: 12px;
    color: #a1a1aa;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 2px;
  }
  #${PANEL_ID} .ytmq-yp-progress {
    margin-top: 8px;
    height: 4px;
    border-radius: 999px;
    background: rgba(255,255,255,.08);
    overflow: hidden;
  }
  #${PANEL_ID} .ytmq-yp-progress > span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #8b5cf6, #d946ef);
    transition: width 400ms linear;
  }
  #${PANEL_ID} .ytmq-yp-times {
    display: flex;
    justify-content: space-between;
    margin-top: 4px;
    font-size: 10px;
    color: #71717a;
    font-variant-numeric: tabular-nums;
  }
  #${PANEL_ID} .ytmq-yp-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    margin-top: 4px;
  }
  #${PANEL_ID} .ytmq-yp-stat {
    text-align: center;
    padding: 6px 4px;
    border-radius: 10px;
    background: rgba(255,255,255,.04);
    border: 1px solid rgba(255,255,255,.06);
  }
  #${PANEL_ID} .ytmq-yp-stat strong {
    display: block;
    font-size: 15px;
    font-weight: 700;
    color: #e9d5ff;
  }
  #${PANEL_ID} .ytmq-yp-stat span {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: .08em;
    color: #71717a;
  }
  #${PANEL_ID} .ytmq-yp-controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-top: 8px;
  }
  #${PANEL_ID} .ytmq-yp-ctl {
    border: 1px solid rgba(255,255,255,.1);
    background: rgba(255,255,255,.06);
    color: #fafafa;
    border-radius: 999px;
    width: 36px;
    height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 150ms ease, transform 100ms ease;
  }
  #${PANEL_ID} .ytmq-yp-ctl:hover { background: rgba(255,255,255,.12); }
  #${PANEL_ID} .ytmq-yp-ctl:active { transform: scale(.92); }
  #${PANEL_ID} .ytmq-yp-ctl.is-primary {
    width: 42px;
    height: 42px;
    background: linear-gradient(135deg, #7c3aed, #c026d3);
    border-color: transparent;
  }
  #${PANEL_ID} .ytmq-yp-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  #${PANEL_ID} .ytmq-yp-btn {
    border: 1px solid rgba(255,255,255,.1);
    background: rgba(255,255,255,.05);
    color: #f4f4f5;
    border-radius: 10px;
    padding: 8px 10px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    text-align: center;
    transition: background 150ms ease, border-color 150ms ease;
  }
  #${PANEL_ID} .ytmq-yp-btn:hover {
    background: rgba(139,92,246,.18);
    border-color: rgba(167,139,250,.35);
  }
  #${PANEL_ID} .ytmq-yp-btn.is-accent {
    background: rgba(139,92,246,.22);
    border-color: rgba(167,139,250,.4);
    color: #ede9fe;
  }
  #${PANEL_ID} .ytmq-yp-next {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid rgba(255,255,255,.06);
    font-size: 11px;
    color: #a1a1aa;
  }
  #${PANEL_ID} .ytmq-yp-next strong {
    display: block;
    color: #e4e4e7;
    font-size: 12px;
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  `
  document.head.appendChild(style)
}

function iconSvg(paths: string): string {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`
}

function bindOutsideClose(root: HTMLElement) {
  unbindOutsideClose()
  state.outsideHandler = (e: PointerEvent) => {
    if (!state.expanded) return
    if (root.contains(e.target as Node)) return
    setExpanded(root, false)
  }
  state.keyHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && state.expanded) setExpanded(root, false)
  }
  document.addEventListener('pointerdown', state.outsideHandler)
  document.addEventListener('keydown', state.keyHandler)
}

function unbindOutsideClose() {
  if (state.outsideHandler) {
    document.removeEventListener('pointerdown', state.outsideHandler)
    state.outsideHandler = null
  }
  if (state.keyHandler) {
    document.removeEventListener('keydown', state.keyHandler)
    state.keyHandler = null
  }
}

function setExpanded(root: HTMLElement, expanded: boolean) {
  state.expanded = expanded
  root.classList.toggle('is-expanded', expanded)
  if (expanded) {
    bindOutsideClose(root)
    void refreshPanelData(root)
  } else {
    unbindOutsideClose()
  }
}

async function fetchRoomCode(panelDeps: YtmPanelDeps): Promise<string> {
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

async function fetchQueueCount(panelDeps: YtmPanelDeps): Promise<number> {
  try {
    const { count, error } = await panelDeps.supabase
      .from('queue_items')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', panelDeps.roomId)
    if (error) return panelDeps.getPendingCount()
    return count ?? 0
  } catch {
    return panelDeps.getPendingCount()
  }
}

async function refreshPanelData(root: HTMLElement) {
  if (!deps) return
  const codeEl = root.querySelector<HTMLElement>('[data-ytmq-code]')
  const queueEl = root.querySelector<HTMLElement>('[data-ytmq-queue-count]')
  const pendingEl = root.querySelector<HTMLElement>('[data-ytmq-pending]')
  const syncedEl = root.querySelector<HTMLElement>('[data-ytmq-synced]')
  const statusEl = root.querySelector<HTMLElement>('[data-ytmq-status]')
  const pillSub = root.querySelector<HTMLElement>('[data-ytmq-pill-sub]')
  const titleEl = root.querySelector<HTMLElement>('[data-ytmq-np-title]')
  const artistEl = root.querySelector<HTMLElement>('[data-ytmq-np-artist]')
  const progressEl = root.querySelector<HTMLElement>('[data-ytmq-progress]')
  const curEl = root.querySelector<HTMLElement>('[data-ytmq-cur]')
  const durEl = root.querySelector<HTMLElement>('[data-ytmq-dur]')
  const nextEl = root.querySelector<HTMLElement>('[data-ytmq-next]')
  const playBtn = root.querySelector<HTMLButtonElement>('[data-ytmq-play]')

  if (!state.roomCode) {
    state.roomCode = await fetchRoomCode(deps)
  }
  state.queueCount = await fetchQueueCount(deps)

  const connected = deps.isConnected()
  const np = deps.readNowPlaying()
  const next = deps.readNextSong()

  if (codeEl) {
    codeEl.textContent = state.roomCode || shortRoomId(deps.roomId)
  }
  if (queueEl) queueEl.textContent = String(state.queueCount)
  if (pendingEl) pendingEl.textContent = String(deps.getPendingCount())
  if (syncedEl) syncedEl.textContent = String(deps.getSyncedCount())
  if (statusEl) {
    statusEl.classList.toggle('is-off', !connected)
    statusEl.querySelector('[data-ytmq-status-text]')!.textContent = connected
      ? 'Live'
      : 'Connecting…'
  }
  if (pillSub) {
    pillSub.textContent = connected
      ? state.roomCode
        ? `Lobby ${state.roomCode}`
        : 'Lobby linked'
      : 'Connecting…'
  }
  if (titleEl) titleEl.textContent = np?.title || 'Nothing playing'
  if (artistEl) artistEl.textContent = np?.artist || '—'
  if (progressEl && np?.duration) {
    const pct = Math.min(100, Math.max(0, (np.currentTime / np.duration) * 100))
    progressEl.style.width = `${pct}%`
  } else if (progressEl) {
    progressEl.style.width = '0%'
  }
  if (curEl) curEl.textContent = formatTime(np?.currentTime ?? 0)
  if (durEl) durEl.textContent = formatTime(np?.duration ?? 0)
  if (nextEl) {
    nextEl.innerHTML = next
      ? `<span>Up next on YT Music</span><strong>${escapeHtml(next.title)}${next.artist ? ` · ${escapeHtml(next.artist)}` : ''}</strong>`
      : '<span>Up next</span><strong>—</strong>'
  }
  if (playBtn) {
    const playing = np?.state === 'playing'
    playBtn.innerHTML = playing
      ? iconSvg('<rect x="7" y="5" width="4" height="14"/><rect x="13" y="5" width="4" height="14"/>')
      : iconSvg('<path d="M8 5v14l11-7z"/>')
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play')
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function tickRefresh(root: HTMLElement) {
  if (!state.expanded) {
    const pillSub = root.querySelector<HTMLElement>('[data-ytmq-pill-sub]')
    const status = deps?.isConnected()
    if (pillSub && deps) {
      pillSub.textContent = status
        ? state.roomCode
          ? `Lobby ${state.roomCode}`
          : 'Lobby linked'
        : 'Connecting…'
    }
    return
  }
  void refreshPanelData(root)
}

export function createYtmPanel(panelDeps: YtmPanelDeps): { destroy: () => void } {
  deps = panelDeps
  ensureStyles()
  document.getElementById(PANEL_ID)?.remove()

  const root = document.createElement('div')
  root.id = PANEL_ID
  root.setAttribute('role', 'region')
  root.setAttribute('aria-label', 'YTMQ controls')

  root.innerHTML = `
    <div class="ytmq-yp-shell">
      <button type="button" class="ytmq-yp-pill" data-ytmq-toggle aria-expanded="false">
        <span class="ytmq-yp-logo">${LOGO_SVG}</span>
        <span class="ytmq-yp-pill-text">
          <span class="ytmq-yp-pill-title">YTMQ</span>
          <span class="ytmq-yp-pill-sub" data-ytmq-pill-sub>Connecting…</span>
        </span>
        <span class="ytmq-yp-chevron" aria-hidden="true">${iconSvg('<path d="m6 9 6 6 6-6"/>')}</span>
      </button>
      <div class="ytmq-yp-body">
        <div class="ytmq-yp-body-inner">
          <div class="ytmq-yp-section">
            <div class="ytmq-yp-row">
              <span class="ytmq-yp-label" style="margin:0">Lobby</span>
              <span class="ytmq-yp-badge" data-ytmq-status><span class="ytmq-yp-badge-dot"></span><span data-ytmq-status-text>Connecting…</span></span>
            </div>
            <div class="ytmq-yp-code" data-ytmq-code>…</div>
            <div class="ytmq-yp-meta">Room ${escapeHtml(shortRoomId(panelDeps.roomId))}</div>
            <div class="ytmq-yp-stats">
              <div class="ytmq-yp-stat"><strong data-ytmq-queue-count>0</strong><span>Queue</span></div>
              <div class="ytmq-yp-stat"><strong data-ytmq-pending>0</strong><span>Pending</span></div>
              <div class="ytmq-yp-stat"><strong data-ytmq-synced>0</strong><span>Synced</span></div>
            </div>
          </div>
          <div class="ytmq-yp-section">
            <div class="ytmq-yp-label">Now playing</div>
            <div class="ytmq-yp-track-title" data-ytmq-np-title>—</div>
            <div class="ytmq-yp-track-artist" data-ytmq-np-artist>—</div>
            <div class="ytmq-yp-progress"><span data-ytmq-progress style="width:0%"></span></div>
            <div class="ytmq-yp-times"><span data-ytmq-cur>0:00</span><span data-ytmq-dur>0:00</span></div>
            <div class="ytmq-yp-controls">
              <button type="button" class="ytmq-yp-ctl" data-ytmq-prev aria-label="Previous">${iconSvg('<path d="m15 18-6-6 6-6"/><path d="M5 6v12"/>')}</button>
              <button type="button" class="ytmq-yp-ctl is-primary" data-ytmq-play aria-label="Play">${iconSvg('<path d="M8 5v14l11-7z"/>')}</button>
              <button type="button" class="ytmq-yp-ctl" data-ytmq-next aria-label="Next">${iconSvg('<path d="m9 18 6-6-6-6"/><path d="M19 6v12"/>')}</button>
            </div>
            <div class="ytmq-yp-next" data-ytmq-next><span>Up next</span><strong>—</strong></div>
          </div>
          <div class="ytmq-yp-section">
            <div class="ytmq-yp-label">Quick actions</div>
            <div class="ytmq-yp-actions">
              <button type="button" class="ytmq-yp-btn is-accent" data-ytmq-open-app>Open YTMQ</button>
              <button type="button" class="ytmq-yp-btn" data-ytmq-focus-app>Switch to YTMQ</button>
              <button type="button" class="ytmq-yp-btn" data-ytmq-sync>Sync queue</button>
              <button type="button" class="ytmq-yp-btn" data-ytmq-copy>Copy room link</button>
              <button type="button" class="ytmq-yp-btn" data-ytmq-yt-queue>Open YT queue</button>
              <button type="button" class="ytmq-yp-btn" data-ytmq-collapse>Collapse</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `

  const toggle = root.querySelector<HTMLButtonElement>('[data-ytmq-toggle]')!
  toggle.addEventListener('click', () => {
    setExpanded(root, !state.expanded)
    toggle.setAttribute('aria-expanded', state.expanded ? 'true' : 'false')
  })

  root.querySelector('[data-ytmq-prev]')?.addEventListener('click', () => {
    panelDeps.onPrev()
    panelDeps.showToast('Previous track')
  })
  root.querySelector('[data-ytmq-play]')?.addEventListener('click', () => {
    panelDeps.onPlayPause()
  })
  root.querySelector('[data-ytmq-next]')?.addEventListener('click', () => {
    panelDeps.onNext()
    panelDeps.showToast('Next track')
  })
  root.querySelector('[data-ytmq-open-app]')?.addEventListener('click', () => {
    openYtmqTab(panelDeps.roomId, panelDeps.siteBase)
  })
  root.querySelector('[data-ytmq-focus-app]')?.addEventListener('click', () => {
    focusOrOpenYtmq(panelDeps.roomId, panelDeps.siteBase)
    panelDeps.showToast('Switching to YTMQ…')
  })
  root.querySelector('[data-ytmq-sync]')?.addEventListener('click', () => {
    void panelDeps.syncAll().then((n) => {
      panelDeps.showToast(`Synced ${n} track(s)`)
      void refreshPanelData(root)
    })
  })
  root.querySelector('[data-ytmq-copy]')?.addEventListener('click', () => {
    const link = roomUrl(panelDeps.roomId, panelDeps.siteBase)
    void navigator.clipboard.writeText(link).then(
      () => panelDeps.showToast('Room link copied'),
      () => panelDeps.showToast('Could not copy link'),
    )
  })
  root.querySelector('[data-ytmq-yt-queue]')?.addEventListener('click', () => {
    panelDeps.nudgeQueueUi()
    panelDeps.showToast('Opening YouTube Music queue')
  })
  root.querySelector('[data-ytmq-collapse]')?.addEventListener('click', () => {
    setExpanded(root, false)
    toggle.setAttribute('aria-expanded', 'false')
  })

  document.body.appendChild(root)

  void fetchRoomCode(panelDeps).then((code) => {
    state.roomCode = code
    tickRefresh(root)
  })

  state.refreshTimer = window.setInterval(() => tickRefresh(root), 2000)

  return {
    destroy() {
      window.clearInterval(state.refreshTimer)
      state.refreshTimer = 0
      unbindOutsideClose()
      root.remove()
      document.getElementById(STYLE_ID)?.remove()
      deps = null
      state.expanded = false
      state.roomCode = ''
      state.queueCount = 0
    },
  }
}

export function defaultYtmqSiteBase(): string {
  return DEFAULT_SITE
}
