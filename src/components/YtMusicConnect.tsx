import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  buildYtmConnectDeepLink,
  buildYtmConnectSnippet,
  needsHttpsBridgeOrigin,
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

export function YtMusicConnect({ roomId }: YtMusicConnectProps) {
  const [step, setStep] = useState<Step>(() =>
    sessionStorage.getItem(doneKey(roomId)) === '1' ? 'done' : 'connect',
  )
  const [showManual, setShowManual] = useState(false)

  const httpsRequired = needsHttpsBridgeOrigin()
  const snippet = useMemo(() => buildYtmConnectSnippet(roomId), [roomId])
  const deepLink = useMemo(() => buildYtmConnectDeepLink(roomId), [roomId])
  const userscriptUrl = useMemo(() => ytmUserscriptInstallUrl(), [])

  const markDone = useCallback(() => {
    sessionStorage.setItem(doneKey(roomId), '1')
    setStep('done')
  }, [roomId])

  useEffect(() => {
    if (step !== 'waiting') return

    function onMessage(event: MessageEvent) {
      if (event.data?.type !== YTMQ_CONNECTED_MESSAGE) return
      if (event.data.roomId !== roomId) return
      markDone()
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [step, roomId, markDone])

  const startConnect = useCallback(() => {
    window.open(
      deepLink ?? 'https://music.youtube.com',
      '_blank',
      'noopener,noreferrer',
    )
    setStep('waiting')
    setShowManual(false)
  }, [deepLink])

  const copySnippet = useCallback(async () => {
    if (!snippet) return
    try {
      await navigator.clipboard.writeText(snippet)
    } catch {
      /* user can copy from details */
    }
  }, [snippet])

  if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
    return null
  }

  if (httpsRequired || !deepLink) {
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
            Guest picks go to your queue. Keep this tab and YouTube Music open.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            sessionStorage.removeItem(doneKey(roomId))
            setStep('connect')
          }}
          className="shrink-0 text-xs text-zinc-500 underline"
        >
          Reconnect
        </button>
      </section>
    )
  }

  if (step === 'waiting') {
    return (
      <section className="space-y-3 rounded-xl border border-violet-500/30 bg-violet-500/5 p-4">
        <p className="font-medium">Connecting…</p>
        <p className="text-sm text-zinc-400">
          On the YouTube Music tab, wait for the <strong className="text-zinc-300">YTMQ connected</strong>{' '}
          toast. This page updates automatically.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void markDone()}
            className="flex-1 rounded-xl bg-violet-600 py-3 font-medium text-white active:bg-violet-500"
          >
            It&apos;s connected
          </button>
          <button
            type="button"
            onClick={() => setShowManual((v) => !v)}
            className="rounded-xl border border-zinc-700 px-4 py-3 text-sm font-medium active:bg-zinc-900"
          >
            Help
          </button>
        </div>
        {showManual && snippet && (
          <details open className="text-sm text-zinc-400">
            <summary className="cursor-pointer text-violet-300">
              Manual setup (no Tampermonkey)
            </summary>
            <p className="mt-2">
              Open the console on the YouTube Music tab, paste the code, press Enter.
            </p>
            <button
              type="button"
              onClick={() => void copySnippet()}
              className="mt-2 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-medium active:bg-zinc-900"
            >
              Copy code
            </button>
          </details>
        )}
      </section>
    )
  }

  return (
    <section className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <p className="text-sm text-zinc-400">
        One click opens <strong className="text-zinc-300">music.youtube.com</strong> and
        links your queue. Use Chrome on desktop (not the phone app).
      </p>
      {userscriptUrl && (
        <p className="text-xs text-zinc-500">
          First time only:{' '}
          <a
            href={userscriptUrl}
            className="text-violet-300 underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            install YTMQ helper
          </a>{' '}
          (Tampermonkey) — then Connect just works.
        </p>
      )}
      <button
        type="button"
        onClick={startConnect}
        className="w-full rounded-xl bg-violet-600 py-3.5 text-base font-medium text-white active:bg-violet-500"
      >
        Connect YouTube Music
      </button>
    </section>
  )
}
