import { useCallback, useMemo, useState } from 'react'
import {
  buildYtmConnectSnippet,
  needsHttpsBridgeOrigin,
} from '../lib/ytmusicConnect'

type YtMusicConnectProps = {
  roomId: string
}

type Step = 'start' | 'paste' | 'done'

function doneKey(roomId: string) {
  return `ytmq_ytm_connected_${roomId}`
}

export function YtMusicConnect({ roomId }: YtMusicConnectProps) {
  const [step, setStep] = useState<Step>(() =>
    sessionStorage.getItem(doneKey(roomId)) === '1' ? 'done' : 'start',
  )
  const [copyError, setCopyError] = useState<string | null>(null)

  const httpsRequired = needsHttpsBridgeOrigin()
  const snippet = useMemo(() => buildYtmConnectSnippet(roomId), [roomId])

  const startConnect = useCallback(async () => {
    if (!snippet) return
    setCopyError(null)
    try {
      await navigator.clipboard.writeText(snippet)
    } catch {
      setCopyError('Could not copy — use “Copy code” below.')
    }
    window.open('https://music.youtube.com', '_blank', 'noopener,noreferrer')
    setStep('paste')
  }, [snippet])

  const markDone = useCallback(() => {
    sessionStorage.setItem(doneKey(roomId), '1')
    setStep('done')
  }, [roomId])

  const copyAgain = useCallback(async () => {
    if (!snippet) return
    setCopyError(null)
    try {
      await navigator.clipboard.writeText(snippet)
    } catch {
      setCopyError('Copy failed')
    }
  }, [snippet])

  if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
    return null
  }

  if (httpsRequired || !snippet) {
    return (
      <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
        <p className="font-medium">HTTPS URL needed for YouTube Music connect</p>
        <p className="mt-1 text-amber-200/80">
          Local dev uses HTTP, but music.youtube.com only loads scripts over HTTPS.
          Add to <code className="text-xs">.env.local</code>:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-black/30 p-2 text-xs text-zinc-200">
          VITE_PUBLIC_SITE_URL=https://YOUR_USER.github.io/YTMQ
        </pre>
        <p className="mt-2 text-amber-200/80">
          Use your deployed GitHub Pages URL, then reload this page and connect
          again.
        </p>
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
            Guest adds go to your queue. Keep that tab open.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            sessionStorage.removeItem(doneKey(roomId))
            setStep('start')
          }}
          className="shrink-0 text-xs text-zinc-500 underline"
        >
          Reconnect
        </button>
      </section>
    )
  }

  if (step === 'paste') {
    return (
      <section className="space-y-3 rounded-xl border border-violet-500/30 bg-violet-500/5 p-4">
        <p className="font-medium">Finish on the YouTube Music tab</p>
        <ol className="space-y-2 text-sm text-zinc-300">
          <li className="flex gap-2">
            <span className="font-semibold text-violet-400">1</span>
            <span>
              Type <code className="text-violet-300">allow pasting</code> in the
              console if Chrome asks, then Enter
            </span>
          </li>
          <li className="flex gap-2">
            <span className="font-semibold text-violet-400">2</span>
            <span>
              Open console{' '}
              <span className="text-zinc-500">
                ({navigator.platform.includes('Mac') ? '⌘⌥J' : 'Ctrl+Shift+J'})
              </span>
            </span>
          </li>
          <li className="flex gap-2">
            <span className="font-semibold text-violet-400">3</span>
            <span>Paste, Enter — look for “YTMQ connected” toast</span>
          </li>
        </ol>
        {copyError && (
          <p className="text-sm text-amber-400" role="alert">
            {copyError}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void markDone()}
            className="flex-1 rounded-xl bg-violet-600 py-3 font-medium text-white active:bg-violet-500"
          >
            Done
          </button>
          <button
            type="button"
            onClick={() => void copyAgain()}
            className="rounded-xl border border-zinc-700 px-4 py-3 text-sm font-medium active:bg-zinc-900"
          >
            Copy code
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <p className="mb-3 text-sm text-zinc-400">
        Link browser YouTube Music so guest picks land in your queue.
      </p>
      <button
        type="button"
        onClick={() => void startConnect()}
        className="w-full rounded-xl bg-violet-600 py-3.5 text-base font-medium text-white active:bg-violet-500"
      >
        Connect YouTube Music
      </button>
    </section>
  )
}
