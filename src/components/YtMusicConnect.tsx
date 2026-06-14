import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getOrStartPlaybackSince,
  resetPlaybackSession,
} from '../lib/playbackSession'
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

type YtMusicConnectProps = {
  roomId: string
}

type Step = 'connect' | 'waiting' | 'done'

function doneKey(roomId: string) {
  return `ytmq_ytm_connected_${roomId}`
}

/** Always-available manual connect: copy a script to paste into the YT Music console. */
function ManualConnect({
  snippet,
  defaultOpen = false,
}: {
  snippet: string | null
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
      /* fall back to selecting the code block below */
    }
  }, [snippet])

  if (!snippet) return null

  return (
    <details
      open={defaultOpen}
      className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-sm text-zinc-400"
    >
      <summary className="cursor-pointer font-medium text-violet-300">
        Connect manually (paste a script)
      </summary>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-zinc-500">
        <li>
          Open <strong className="text-zinc-300">music.youtube.com</strong> in a
          desktop Chrome tab and sign in.
        </li>
        <li>
          Open DevTools (<kbd className="rounded bg-zinc-800 px-1">F12</kbd>) and
          go to the <strong className="text-zinc-300">Console</strong> tab.
        </li>
        <li>
          If the console blocks pasting, type{' '}
          <code className="rounded bg-zinc-800 px-1">allow pasting</code> and
          press Enter.
        </li>
        <li>Paste the script below, press Enter, then open the queue panel.</li>
      </ol>
      <button
        type="button"
        onClick={() => void copy()}
        className="ytmq-press mt-3 inline-flex items-center gap-1.5 rounded-lg border border-violet-500/50 bg-violet-500/10 px-3 py-2 text-xs font-medium text-violet-200 hover:bg-violet-500/20"
      >
        {copied ? '✓ Copied' : 'Copy connect script'}
      </button>
      <pre className="mt-2 max-h-32 select-all overflow-auto rounded-lg bg-black/40 p-2 text-[10px] leading-relaxed text-zinc-300">
        {snippet}
      </pre>
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

  const markDone = useCallback(() => {
    sessionStorage.setItem(doneKey(roomId), '1')
    markYtmHostInitialized()
    setStep('done')
  }, [roomId])

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.data?.type !== YTMQ_CONNECTED_MESSAGE) return
      if (event.data.roomId !== roomId) return
      markDone()
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [roomId, markDone])

  const startConnect = useCallback(() => {
    const since = resetPlaybackSession(roomId)
    setPlaybackSince(since)
    openYtmMusicWindow(roomId, { resetSession: false })
    // Returning hosts already have the helper installed, which auto-injects on
    // music.youtube.com — link immediately instead of asking them to verify.
    if (isYtmHostInitialized()) {
      markDone()
    } else {
      setStep('waiting')
    }
  }, [roomId, markDone])

  const reopenYtm = useCallback(() => {
    openYtmMusicWindow(roomId)
  }, [roomId])

  if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
    return null
  }

  if (httpsRequired || !bridgeSiteRoot()) {
    return (
      <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
        <p className="font-medium">HTTPS URL needed for YouTube Music connect</p>
        <p className="mt-1 text-amber-200/80">
          Add to <code className="text-xs">.env.local</code>:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-black/30 p-2 text-xs text-zinc-200">
          VITE_PUBLIC_SITE_URL=https://YOUR_USER.github.io/YTMQ
        </pre>
      </section>
    )
  }

  if (step === 'done') {
    return (
      <section
        className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3"
        aria-label="YouTube Music connected"
      >
        <span className="text-lg text-emerald-400" aria-hidden>
          ✓
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-emerald-200">YouTube Music linked</p>
          <p className="text-sm text-zinc-400">
            Guest picks play next in YouTube Music. Keep this tab and YouTube Music open.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <button
            type="button"
            onClick={reopenYtm}
            className="text-xs font-medium text-violet-300 underline"
          >
            Open YouTube Music
          </button>
          <button
            type="button"
            onClick={() => {
              sessionStorage.removeItem(doneKey(roomId))
              setPlaybackSince(null)
              setStep('connect')
            }}
            className="text-xs text-zinc-500 underline"
          >
            Reconnect
          </button>
        </div>
      </section>
    )
  }

  if (step === 'waiting') {
    return (
      <section className="space-y-3 rounded-xl border border-violet-500/30 bg-violet-500/5 p-4">
        <p className="font-medium">Connecting…</p>
        <p className="text-sm text-zinc-400">
          On the YouTube Music tab, open the <strong className="text-zinc-300">queue panel</strong>,
          wait for <strong className="text-zinc-300">YTMQ connected</strong>, then add a test song
          from a guest. This page updates automatically.
        </p>
        <button
          type="button"
          onClick={() => void markDone()}
          className="w-full rounded-xl bg-violet-600 py-3 font-medium text-white active:bg-violet-500"
        >
          It&apos;s connected
        </button>
        <p className="text-xs text-zinc-500">
          Auto-connect not working? Use manual setup below.
        </p>
        <ManualConnect snippet={snippet} defaultOpen />
      </section>
    )
  }

  return (
    <section className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <p className="text-sm text-zinc-400">
        One click opens <strong className="text-zinc-300">music.youtube.com</strong> and
        links your queue. Use Chrome on desktop (not the phone app).
      </p>
      <ol className="list-decimal space-y-1 pl-5 text-xs text-zinc-500">
        {!hostInitialized && userscriptUrl && (
          <li>
            Install the{' '}
            <a
              href={userscriptUrl}
              className="text-violet-300 underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              YTMQ helper
            </a>{' '}
            in Tampermonkey (one time).
          </li>
        )}
        <li>Click Connect — a YouTube Music tab opens and links automatically.</li>
        <li>Open the queue panel on YouTube Music and wait for &quot;YTMQ connected&quot;.</li>
        <li>
          After that, every new YouTube Music tab from here reconnects on its own.
        </li>
      </ol>
      {hostInitialized && (
        <p className="text-xs text-emerald-400/90">
          Helper already set up on this browser — just click Connect.
        </p>
      )}
      <button
        type="button"
        onClick={startConnect}
        className="w-full rounded-xl bg-violet-600 py-3.5 text-base font-medium text-white active:bg-violet-500"
      >
        Connect YouTube Music
      </button>
      <ManualConnect snippet={snippet} />
    </section>
  )
}
