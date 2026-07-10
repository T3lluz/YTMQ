/**
 * Talks to the YTMQ Chrome extension via window.postMessage. The extension's
 * site content script (extension/site.js) relays these messages to its service
 * worker, which links any open music.youtube.com tab to the current room —
 * no deep link or new window required.
 */
import { getOrStartPlaybackSince } from './playbackSession'

export const APP_MESSAGE_SOURCE = 'ytmq-app' as const
export const EXTENSION_MESSAGE_SOURCE = 'ytmq-extension' as const

export type ExtensionSession = {
  roomId: string
  sb: string
  key: string
  since: string
  at: number
}

export type ExtensionConnectResult = {
  ok: boolean
  /** True when an already-open YouTube Music tab was linked. */
  hadTab: boolean
}

function buildSession(roomId: string, since: string): ExtensionSession | null {
  const sb = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!sb || !key) return null
  return { roomId, sb, key, since, at: Date.now() }
}

/**
 * The extension's site content script sets this marker at document_start,
 * before the app boots. Lets us skip waiting for replies that will never come.
 */
export function isExtensionInstalled(): boolean {
  try {
    return document.documentElement.dataset.ytmqExtension === '1'
  } catch {
    return false
  }
}

function post(message: Record<string, unknown>) {
  try {
    window.postMessage(
      { source: APP_MESSAGE_SOURCE, ...message },
      window.location.origin,
    )
  } catch {
    /* ignore */
  }
}

/**
 * Tell the extension (if installed) which room this browser hosts. The
 * extension stores the session and auto-links every open YouTube Music tab,
 * so simply having the room open keeps the link fresh — and stale sessions
 * from previous lobbies get replaced instead of lingering.
 */
export function announceSessionToExtension(roomId: string): void {
  const session = buildSession(roomId, getOrStartPlaybackSince(roomId))
  if (!session) return
  post({ type: 'ytmq:session', session })
}

/** Tell the extension the lobby ended so it drops the stored session. */
export function announceSessionClearToExtension(): void {
  post({ type: 'ytmq:session-clear' })
}

/**
 * Ask the extension to connect this room to YouTube Music. Links an existing
 * music.youtube.com tab when one is open (and focuses it), otherwise the
 * extension opens one. Resolves null when the extension isn't installed
 * (no reply within the timeout) so callers can fall back to the deep link.
 */
export function requestExtensionConnect(
  roomId: string,
  since: string,
  timeoutMs = 1200,
): Promise<ExtensionConnectResult | null> {
  const session = buildSession(roomId, since)
  if (!session || !isExtensionInstalled()) return Promise.resolve(null)

  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`

  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', onMessage)
      resolve(null)
    }, timeoutMs)

    function onMessage(event: MessageEvent) {
      const data = event.data as
        | {
            source?: string
            type?: string
            requestId?: string
            ok?: boolean
            hadTab?: boolean
          }
        | undefined
      if (event.source !== window) return
      if (data?.source !== EXTENSION_MESSAGE_SOURCE) return
      if (data.type !== 'ytmq:connect-result') return
      if (data.requestId !== requestId) return

      window.clearTimeout(timer)
      window.removeEventListener('message', onMessage)
      resolve({ ok: Boolean(data.ok), hadTab: Boolean(data.hadTab) })
    }

    window.addEventListener('message', onMessage)
    post({ type: 'ytmq:connect-request', session, requestId })
  })
}
