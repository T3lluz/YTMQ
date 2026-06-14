/**
 * "Up next" banner that the YT Music bridge shows on music.youtube.com in
 * the last 15 seconds of the current track. Extracted from the bridge so it
 * can be unit-tested with mock readers — the bridge wires real readers that
 * pull from the YT Music DOM.
 */

export type NextSongInfo = {
  videoId: string
  title: string
  artist: string
  thumbnailUrl: string
}

export type PlayerTimes = {
  current: number
  duration: number
}

export type NextSongToastDeps = {
  /** Current playback position + duration, or null if the player isn't ready. */
  readTimes: () => PlayerTimes | null
  /** Currently-playing video id, or '' if it's not known. */
  readCurrentVideoId: () => string
  /** Up-next song metadata, or null when nothing is queued. */
  readNextSong: () => NextSongInfo | null
}

const TOAST_ID = 'ytmq-next-toast'
const STYLE_ID = 'ytmq-next-toast-style'
const LEAVE_DURATION_MS = 480
const MIN_VISIBLE_MS = 1500
const MAX_VISIBLE_MS = 15_000
const TRIGGER_REMAINING_MAX_S = 15
const TRIGGER_REMAINING_MIN_S = 0.5

type ToastState = {
  shownForVideoId: string
  hideTimer: number
  removeTimer: number
}

const state: ToastState = {
  shownForVideoId: '',
  hideTimer: 0,
  removeTimer: 0,
}

export function ensureNextToastStyles(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    @keyframes ytmq-next-in {
      0% { opacity: 0; transform: translate(-50%, 36px) scale(.92); filter: blur(8px); }
      55% { opacity: 1; transform: translate(-50%, -3px) scale(1.02); filter: blur(0); }
      100% { opacity: 1; transform: translate(-50%, 0) scale(1); filter: blur(0); }
    }
    @keyframes ytmq-next-out {
      0% { opacity: 1; transform: translate(-50%, 0) scale(1); filter: blur(0); }
      100% { opacity: 0; transform: translate(-50%, -28px) scale(.96); filter: blur(6px); }
    }
    @keyframes ytmq-next-bar {
      0% { transform: scaleX(0); }
      100% { transform: scaleX(1); }
    }
    @keyframes ytmq-next-glow {
      0%, 100% { box-shadow: 0 18px 48px rgba(0,0,0,.55), 0 0 0 1px rgba(244,63,94,.2), 0 0 24px rgba(244,63,94,.15); }
      50% { box-shadow: 0 18px 48px rgba(0,0,0,.55), 0 0 0 1px rgba(244,63,94,.45), 0 0 32px rgba(244,63,94,.35); }
    }
    #${TOAST_ID} {
      position: fixed;
      left: 50%;
      bottom: 96px;
      z-index: 99999;
      transform: translate(-50%, 0);
      background: linear-gradient(135deg, rgba(24,24,27,.96), rgba(39,39,42,.96));
      color: #fafafa;
      padding: 12px 20px 14px 14px;
      border-radius: 14px;
      font: 14px/1.4 'YouTube Sans', 'Roboto', system-ui, sans-serif;
      border: 1px solid rgba(244,63,94,.35);
      max-width: min(440px, 92vw);
      min-width: 240px;
      display: flex;
      align-items: center;
      gap: 12px;
      backdrop-filter: blur(10px) saturate(140%);
      -webkit-backdrop-filter: blur(10px) saturate(140%);
      animation:
        ytmq-next-in 520ms cubic-bezier(.22,1.4,.36,1) both,
        ytmq-next-glow 2.4s ease-in-out 520ms infinite;
      overflow: hidden;
      pointer-events: none;
      will-change: transform, opacity, filter;
    }
    #${TOAST_ID}.is-leaving {
      animation: ytmq-next-out ${LEAVE_DURATION_MS}ms cubic-bezier(.4,0,.8,.4) both;
    }
    #${TOAST_ID} .ytmq-next-thumb {
      width: 44px;
      height: 44px;
      border-radius: 8px;
      object-fit: cover;
      flex-shrink: 0;
      background: #27272a;
      box-shadow: 0 4px 12px rgba(0,0,0,.5);
    }
    #${TOAST_ID} .ytmq-next-text {
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 1;
    }
    #${TOAST_ID} .ytmq-next-label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: .14em;
      text-transform: uppercase;
      color: #fb7185;
      margin-bottom: 3px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    #${TOAST_ID} .ytmq-next-label::before {
      content: '';
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #fb7185;
      box-shadow: 0 0 8px #fb7185;
      animation: ytmq-next-glow 1.2s ease-in-out infinite;
    }
    #${TOAST_ID} .ytmq-next-title {
      font-size: 14px;
      font-weight: 600;
      color: #fafafa;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    #${TOAST_ID} .ytmq-next-artist {
      font-size: 12px;
      color: #a1a1aa;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 1px;
    }
    #${TOAST_ID} .ytmq-next-progress {
      position: absolute;
      left: 0;
      bottom: 0;
      height: 3px;
      width: 100%;
      background: linear-gradient(90deg, #f43f5e, #ec4899, #f97316);
      transform-origin: left center;
      animation-name: ytmq-next-bar;
      animation-timing-function: linear;
      animation-fill-mode: forwards;
    }
  `
  document.head.appendChild(style)
}

export function hideNextSongToast(opts: { immediate?: boolean } = {}): void {
  if (state.hideTimer) {
    window.clearTimeout(state.hideTimer)
    state.hideTimer = 0
  }
  if (state.removeTimer) {
    window.clearTimeout(state.removeTimer)
    state.removeTimer = 0
  }
  const el = document.getElementById(TOAST_ID)
  if (!el) {
    state.shownForVideoId = ''
    return
  }
  if (opts.immediate) {
    el.remove()
    state.shownForVideoId = ''
    return
  }
  el.classList.add('is-leaving')
  state.removeTimer = window.setTimeout(() => {
    el.remove()
    state.removeTimer = 0
    state.shownForVideoId = ''
  }, LEAVE_DURATION_MS)
}

export function showNextSongToast(
  info: NextSongInfo,
  currentVideoId: string,
  visibleMs: number,
): void {
  ensureNextToastStyles()
  hideNextSongToast({ immediate: true })

  const el = document.createElement('div')
  el.id = TOAST_ID

  const thumb = document.createElement('img')
  thumb.className = 'ytmq-next-thumb'
  thumb.alt = ''
  thumb.referrerPolicy = 'no-referrer'
  if (info.thumbnailUrl) thumb.src = info.thumbnailUrl
  else thumb.style.visibility = 'hidden'

  const text = document.createElement('div')
  text.className = 'ytmq-next-text'

  const label = document.createElement('span')
  label.className = 'ytmq-next-label'
  label.textContent = 'Up next'

  const title = document.createElement('span')
  title.className = 'ytmq-next-title'
  title.textContent = info.title

  const artist = document.createElement('span')
  artist.className = 'ytmq-next-artist'
  artist.textContent = info.artist

  text.appendChild(label)
  text.appendChild(title)
  if (info.artist) text.appendChild(artist)

  const progress = document.createElement('div')
  progress.className = 'ytmq-next-progress'
  progress.style.animationDuration = `${visibleMs}ms`

  el.appendChild(thumb)
  el.appendChild(text)
  el.appendChild(progress)

  document.body.appendChild(el)
  state.shownForVideoId = currentVideoId

  state.hideTimer = window.setTimeout(() => {
    state.hideTimer = 0
    hideNextSongToast()
  }, visibleMs)
}

/**
 * Compute the visible duration for the banner. Exported so tests and the
 * bridge agree on the math.
 */
export function computeVisibleMs(remainingSeconds: number): number {
  return Math.max(
    MIN_VISIBLE_MS,
    Math.min(MAX_VISIBLE_MS, Math.floor((remainingSeconds - 0.4) * 1000)),
  )
}

/**
 * Single tick of the banner scheduler. Call this on a polling interval
 * (the bridge runs it every 500 ms). All input is read through {@link deps}
 * so tests can drive scenarios without a real YT Music page.
 */
export function tickNextSongToast(deps: NextSongToastDeps): void {
  const times = deps.readTimes()
  if (!times) return
  const currentVideoId = deps.readCurrentVideoId()
  if (!currentVideoId) return

  if (state.shownForVideoId && state.shownForVideoId !== currentVideoId) {
    hideNextSongToast({ immediate: true })
  }

  if (state.shownForVideoId === currentVideoId) return

  const remaining = times.duration - times.current
  if (!Number.isFinite(remaining)) return
  if (remaining > TRIGGER_REMAINING_MAX_S) return
  if (remaining <= TRIGGER_REMAINING_MIN_S) return

  const next = deps.readNextSong()
  if (!next) return
  if (next.videoId === currentVideoId) return

  showNextSongToast(next, currentVideoId, computeVisibleMs(remaining))
}

/** Test-only: read the video id the banner is currently shown for. */
export function getShownVideoIdForTest(): string {
  return state.shownForVideoId
}

/** Test-only: reset module state so each test starts clean. */
export function resetNextSongToastForTest(): void {
  if (state.hideTimer) {
    window.clearTimeout(state.hideTimer)
    state.hideTimer = 0
  }
  if (state.removeTimer) {
    window.clearTimeout(state.removeTimer)
    state.removeTimer = 0
  }
  state.shownForVideoId = ''
  document.getElementById(TOAST_ID)?.remove()
  document.getElementById(STYLE_ID)?.remove()
}
