import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { YtmqLogo } from '../components/YtmqLogo'
import { installedExtensionVersion, isExtensionInstalled } from '../lib/extensionBridge'

type ExtensionInfo = { version: string; zip: string }

const BASE = import.meta.env.BASE_URL
const ZIP_URL = `${BASE}ytmq-extension.zip`
const USERSCRIPT_URL = `${BASE}ytmq-connect.user.js`

function newer(a: string, b: string): boolean {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d > 0
  }
  return false
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-violet-500/15 text-sm font-bold text-violet-300 ring-1 ring-violet-500/30">
        {n}
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <h3 className="font-semibold text-zinc-100">{title}</h3>
        <div className="mt-1 space-y-2 text-sm leading-relaxed text-zinc-400">{children}</div>
      </div>
    </li>
  )
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-md bg-zinc-800 px-1.5 py-0.5 font-mono text-[0.8em] text-zinc-200">
      {children}
    </code>
  )
}

/** chrome:// links are blocked from web pages, so copy the address instead. */
function CopyAddress({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1800)
        })
      }}
      className="ytmq-press inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 font-mono text-xs text-zinc-200 hover:border-zinc-600"
    >
      {value}
      <span className="font-sans text-violet-300">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  )
}

export function Setup() {
  const [info, setInfo] = useState<ExtensionInfo | null>(null)
  const installed = isExtensionInstalled()
  const installedVersion = installedExtensionVersion()

  useEffect(() => {
    let cancelled = false
    fetch(`${BASE}ytmq-extension.json`, { cache: 'no-cache' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ExtensionInfo | null) => {
        if (!cancelled && data?.version) setInfo(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // Installs from before 1.8.1 do not report a version.
  const outdated =
    installed && info != null && (!installedVersion || newer(info.version, installedVersion))

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="flex items-center gap-4">
        <Link to="/" aria-label="YTMQ home">
          <YtmqLogo className="h-12 w-12 rounded-xl shadow-lg shadow-violet-900/40" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Set up hosting</h1>
          <p className="text-sm text-zinc-400">
            One time, on the computer that plays the music. Guests need nothing.
          </p>
        </div>
      </header>

      {installed && (
        <div
          className={`mt-8 rounded-2xl border p-4 text-sm ${
            outdated
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
          }`}
          role="status"
        >
          {outdated ? (
            <>
              <p className="font-semibold">
                Your extension{installedVersion ? ` (v${installedVersion})` : ''} is out of
                date{info ? `. v${info.version} is out.` : '.'}
              </p>
              <p className="mt-1 text-amber-100/80">
                Download it below, unzip it over the same folder, then press Reload in the
                YTMQ panel or the extension popup.
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold">
                The extension is installed{installedVersion ? ` (v${installedVersion})` : ''}.
              </p>
              <p className="mt-1 text-emerald-100/80">
                You are set. <Link to="/" className="underline">Create a lobby</Link> and
                connect YouTube Music from the Admin tab.
              </p>
            </>
          )}
        </div>
      )}

      <section className="mt-10">
        <h2 className="text-lg font-bold">1. Install the Chrome extension</h2>
        <p className="mt-1 text-sm text-zinc-400">
          It links YouTube Music to your lobby by itself and adds the YTMQ panel there: the
          lobby code and QR, who is listening, and the queue with who added what. Works in
          desktop Chrome, Edge and Brave.
        </p>

        <ol className="mt-6 space-y-6">
          <Step n={1} title="Download the extension">
            <a
              href={ZIP_URL}
              download
              className="ytmq-press inline-flex min-h-11 items-center gap-2 rounded-xl bg-gradient-to-br from-violet-500 to-violet-700 px-5 font-medium text-white shadow-lg shadow-violet-900/30 hover:brightness-110"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 3v12" />
                <path d="m7 10 5 5 5-5" />
                <path d="M5 21h14" />
              </svg>
              Download ytmq-extension.zip
              {info && <span className="text-violet-200/80">v{info.version}</span>}
            </a>
          </Step>
          <Step n={2} title="Unzip it into a folder you keep">
            <p>
              For example <Kbd>Documents/ytmq-extension</Kbd>. Chrome runs the extension from
              that folder, and updates go into the same place, so do not delete it or leave
              it in Downloads to be cleaned up.
            </p>
          </Step>
          <Step n={3} title="Open the extensions page and turn on Developer mode">
            <p>Paste this into the address bar:</p>
            <CopyAddress value="chrome://extensions" />
            <p>
              Then switch on <strong className="text-zinc-200">Developer mode</strong> in the
              top right corner.
            </p>
          </Step>
          <Step n={4} title="Load the folder">
            <p>
              Click <strong className="text-zinc-200">Load unpacked</strong> and pick the folder
              from step 2 (the one with <Kbd>manifest.json</Kbd> in it).
            </p>
          </Step>
          <Step n={5} title="Pin it (optional)">
            <p>
              Click the puzzle piece in the toolbar and pin YTMQ. Its icon says{' '}
              <strong className="text-zinc-200">NEW</strong> when an update is out.
            </p>
          </Step>
        </ol>

        <p className="mt-6 text-sm text-zinc-500">
          Had the old YTMQ extension from <Kbd>t3lluz.github.io</Kbd>? Remove it on the
          extensions page first; it no longer connects.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-bold">2. Host a lobby</h2>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-zinc-400">
          <li>
            <Link to="/" className="text-violet-300 underline">
              Create a lobby
            </Link>{' '}
            here.
          </li>
          <li>
            Open the <strong className="text-zinc-200">Admin</strong> tab and click{' '}
            <strong className="text-zinc-200">Connect YouTube Music</strong>. It links an open
            YouTube Music tab or opens one; sign in there if asked.
          </li>
          <li>
            The YTMQ pill shows up above the YouTube Music player with a green dot once it is
            linked.
          </li>
          <li>
            Guests open <strong className="text-zinc-200">t3lluz.com/ytmq</strong> and enter the
            code, or scan the QR from the pill on your screen. Their songs land in your YouTube
            Music queue.
          </li>
        </ol>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-bold">Updates</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Most fixes reach you on their own: the extension loads the newest YouTube Music
          bridge from this site every time it connects. When the extension itself changes, the
          YTMQ panel and the popup show <strong className="text-zinc-200">Download</strong> and{' '}
          <strong className="text-zinc-200">Reload</strong>. Unzip the download over the same
          folder and press Reload.
        </p>
      </section>

      <section className="mt-12 border-t border-zinc-800 pt-8 text-sm text-zinc-500">
        <p>
          Prefer Tampermonkey or Violentmonkey?{' '}
          <a href={USERSCRIPT_URL} className="text-violet-300 underline" target="_blank" rel="noopener noreferrer">
            Install the userscript
          </a>{' '}
          instead. It connects YouTube Music the same way, without the panel.
        </p>
        <p className="mt-2">
          <Link to="/" className="text-violet-300 underline">
            ← Back to YTMQ
          </Link>
        </p>
      </section>
    </main>
  )
}
