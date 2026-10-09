import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getOrStartPlaybackSince,
  resetPlaybackSession,
} from '../lib/playbackSession'
import {
  announceSessionToExtension,
  EXTENSION_MESSAGE_SOURCE,
  isExtensionInstalled,
  requestExtensionConnect,
} from '../lib/extensionBridge'
import {
  bridgeSiteRoot,
  buildYtmConnectSnippet,
  isYtmHostInitialized,
  markYtmHostInitialized,
  needsHttpsBridgeOrigin,
  openYtmMusicWindow,
  YTMQ_CONNECTED_MESSAGE,
  ytmUserscriptInstallUrl,
} from '../lib/ytmusicConnect'
import { isFirefox } from '../lib/firefoxExtension'
import { PlayerCard, YouTubeMusicIcon, primaryButton, secondaryButton, textButton } from './PlayerCard'

type YtMusicConnectProps = {
  roomId: string
}

type Step = 'connect' | 'waiting' | 'done'

function doneKey(roomId: string) {
  return `ytmq_ytm_connected_${roomId}`
}

const BASE = import.meta.env.BASE_URL

/** The ways to connect without the extension, folded away. */
function OtherWays({
  snippet,
  userscriptUrl,
  defaultOpen = false,
}: {
  snippet: string | null
  userscriptUrl: string | null
  defaultOpen?: boolean
}) {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(async () => {
    if (!snippet) return
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* the code block below is selectable */
    }
  }, [snippet])

  if (!snippet && !userscriptUrl) return null

  return (
    <details open={defaultOpen} className="group rounded-xl bg-black/20 px-3 py-2.5">
      <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-semibold text-neutral-300 [&::-webkit-details-marker]:hidden">
        Other ways to connect
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden>
          <path d="m5 8 5 5 5-5" />
        </svg>
      </summary>
      <div className="mt-3 space-y-4 text-xs leading-relaxed text-neutral-400">
        {userscriptUrl && (
          <div>
            <p className="font-semibold text-neutral-200">Userscript</p>
            <p className="mt-0.5">
              Already use Tampermonkey or Violentmonkey?{' '}
              <a href={userscriptUrl} target="_blank" rel="noopener noreferrer" className="text-white underline decoration-neutral-600 underline-offset-2">
                Install the YTMQ userscript
              </a>
              . It links YouTube Music the same way, without the panel.
            </p>
          </div>
        )}
        {snippet && (
          <div>
            <p className="font-semibold text-neutral-200">Paste into the console</p>
            <p className="mt-0.5">
              Works for this tab only, until it reloads. On music.youtube.com press{' '}
              <kbd className="rounded bg-white/10 px-1 font-mono">F12</kbd>, open Console, type{' '}
              <code className="rounded bg-white/10 px-1 font-mono">allow pasting</code> if asked, then paste this and press Enter.
            </p>
            <button type="button" onClick={() => void copy()} className={`${secondaryButton} mt-2`}>
              {copied ? 'Copied' : 'Copy the script'}
            </button>
            <pre className="mt-2 max-h-28 overflow-auto rounded-lg bg-black/40 p-2 font-mono text-[10px] leading-relaxed text-neutral-400 select-all">
              {snippet}
            </pre>
          </div>
        )}
        <p>
          More in the{' '}
          <a href={`${BASE}docs/troubleshooting`} target="_blank" rel="noopener noreferrer" className="text-white underline decoration-neutral-600 underline-offset-2">
            troubleshooting guide
          </a>
          .
        </p>
      </div>
    </details>
  )
}

export function YtMusicConnect({ roomId }: YtMusicConnectProps) {
  const [step, setStep] = useState<Step>(() =>
    sessionStorage.getItem(doneKey(roomId)) === '1' ? 'done' : 'connect',
  )
  const [playbackSince, setPlaybackSince] = useState<string | null>(null)

  const httpsRequired = needsHttpsBridgeOrigin()
  const userscriptUrl = useMemo(() => ytmUserscriptInstallUrl(), [])
  // Always have a snippet ready for manual pasting, even before (or instead of)
  // clicking Connect — auto-connect doesn't work in every browser.
  const snippet = useMemo(() => {
    const since = playbackSince ?? getOrStartPlaybackSince(roomId)
    return buildYtmConnectSnippet(roomId, since)
  }, [roomId, playbackSince])

  const hostInitialized = isYtmHostInitialized()
  const extensionInstalled = isExtensionInstalled()

  const markDone = useCallback(() => {
    sessionStorage.setItem(doneKey(roomId), '1')
    markYtmHostInitialized()
    setStep('done')
  }, [roomId])

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== window) return
      const data = event.data as
        | {
            type?: string
            source?: string
            roomId?: string
            connectedTabs?: number
          }
        | undefined
      if (data?.type === YTMQ_CONNECTED_MESSAGE && data.roomId === roomId) {
        markDone()
        return
      }
      // The extension auto-linked an already-open YouTube Music tab after we
      // announced this room's session — no clicking needed.
      if (
        data?.source === EXTENSION_MESSAGE_SOURCE &&
        data.type === 'ytmq:session-result' &&
        (data.connectedTabs ?? 0) > 0
      ) {
        markDone()
      }
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [roomId, markDone])

  // Keep the extension's stored session pointing at THIS room. With the
  // extension installed, any open music.youtube.com tab links automatically.
  useEffect(() => {
    announceSessionToExtension(roomId)
  }, [roomId])

  const startConnect = useCallback(async () => {
    const since = resetPlaybackSession(roomId)
    setPlaybackSince(since)

    // Extension first: it reuses an already-open YouTube Music tab (or opens
    // one itself). Fall back to the deep link when it's not installed.
    const ext = await requestExtensionConnect(roomId, since)
    if (ext?.ok) {
      markYtmHostInitialized()
      markDone()
      return
    }

    openYtmMusicWindow(roomId, { resetSession: false })
    // Returning hosts already have the helper installed, which auto-injects on
    // music.youtube.com — link immediately instead of asking them to verify.
    if (isYtmHostInitialized()) {
      markDone()
    } else {
      setStep('waiting')
    }
  }, [roomId, markDone])

  const reopenYtm = useCallback(async () => {
    // Focus/link an existing YouTube Music tab via the extension when we can,
    // instead of always spawning a new window.
    const ext = await requestExtensionConnect(
      roomId,
      getOrStartPlaybackSince(roomId),
    )
    if (ext?.ok) return
    openYtmMusicWindow(roomId)
  }, [roomId])

  const icon = <YouTubeMusicIcon />

  if (httpsRequired || !bridgeSiteRoot()) {
    return (
      <PlayerCard icon={icon} name="YouTube Music" status="warn" statusLabel="Needs an HTTPS address">
        <p>
          The bridge has to load from HTTPS. For local development, add this to{' '}
          <code className="font-mono text-xs text-neutral-200">.env.local</code>:
        </p>
        <pre className="overflow-x-auto rounded-lg bg-black/40 p-2 font-mono text-xs text-neutral-200">
          VITE_PUBLIC_SITE_URL=https://t3lluz.com/ytmq
        </pre>
      </PlayerCard>
    )
  }

  if (step === 'done') {
    return (
      <PlayerCard icon={icon} name="YouTube Music" status="live" statusLabel="Linked to this lobby">
        <p>Guest picks go straight into your YouTube Music queue. Keep YouTube Music open in this browser.</p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void reopenYtm()} className={secondaryButton}>
            Open YouTube Music
          </button>
          <button
            type="button"
            onClick={() => {
              sessionStorage.removeItem(doneKey(roomId))
              setPlaybackSince(null)
              setStep('connect')
            }}
            className={textButton}
          >
            Connect again
          </button>
        </div>
      </PlayerCard>
    )
  }

  if (step === 'waiting') {
    return (
      <PlayerCard icon={icon} name="YouTube Music" status="pending" statusLabel="Waiting for YouTube Music">
        <p>
          On the YouTube Music tab, look for the YTMQ pill above the player. It turns green once the
          tab is linked, and this card updates by itself.
        </p>
        <button type="button" onClick={() => void markDone()} className={primaryButton}>
          It&apos;s linked
        </button>
        <p className="text-xs text-neutral-500">
          Nothing happening? The extension is probably not installed in this browser.{' '}
          <a href={`${BASE}docs/install`} target="_blank" rel="noopener noreferrer" className="text-neutral-200 underline decoration-neutral-600 underline-offset-2">
            Install it
          </a>{' '}
          or use one of the other ways.
        </p>
        <OtherWays snippet={snippet} userscriptUrl={userscriptUrl} defaultOpen />
      </PlayerCard>
    )
  }

  if (!extensionInstalled && !hostInitialized) {
    return (
      <PlayerCard icon={icon} name="YouTube Music" status="off" statusLabel="Extension not found">
        <p>
          The YTMQ extension links YouTube Music to this lobby. It is a one-time install on the
          computer that plays the music{isFirefox() ? ': one click in Firefox.' : ', about two minutes in Chrome.'}
        </p>
        <a href={`${BASE}docs/install`} target="_blank" rel="noopener noreferrer" className={primaryButton}>
          Install the extension
        </a>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void startConnect()} className={textButton}>
            I have it, connect anyway
          </button>
        </div>
        <OtherWays snippet={snippet} userscriptUrl={userscriptUrl} />
      </PlayerCard>
    )
  }

  return (
    <PlayerCard
      icon={icon}
      name="YouTube Music"
      status="off"
      statusLabel={extensionInstalled ? 'Extension ready' : 'Not linked yet'}
    >
      <p>
        {extensionInstalled
          ? 'Links the YouTube Music tab you have open, or opens one. Sign in there if it asks.'
          : 'Opens music.youtube.com and links it to this lobby.'}
      </p>
      <button type="button" onClick={() => void startConnect()} className={primaryButton}>
        Connect YouTube Music
      </button>
      <OtherWays snippet={snippet} userscriptUrl={userscriptUrl} />
    </PlayerCard>
  )
}
