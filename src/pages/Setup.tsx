import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { YtmqLogo } from '../components/YtmqLogo'
import { installedExtensionVersion, isExtensionInstalled } from '../lib/extensionBridge'
import { isFirefox, useFirefoxExtension, type FirefoxExtension } from '../lib/firefoxExtension'

type ExtensionInfo = { version: string; zip: string; fingerprint?: string }

const BASE = import.meta.env.BASE_URL
const ZIP_URL = `${BASE}ytmq-extension.zip`

/** The zip, stamped with the build it is, so no cache serves an older one. */
function zipHref(info: ExtensionInfo | null): string {
  const stamp = info
    ? `${info.version}-${(info.fingerprint ?? '').slice(0, 12)}`
    : Date.now().toString(36)
  return `${ZIP_URL}?v=${encodeURIComponent(stamp)}`
}
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

const DOWNLOAD_ICON = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <path d="M5 21h14" />
  </svg>
)

function BrowserTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`ytmq-press rounded-lg px-3 py-1.5 text-sm font-medium ${
        active ? 'bg-violet-500/20 text-violet-200 ring-1 ring-violet-500/40' : 'text-zinc-400 hover:text-zinc-200'
      }`}
    >
      {children}
    </button>
  )
}

function FirefoxSteps({ firefox }: { firefox: FirefoxExtension | null }) {
  if (firefox && !firefox.xpiUrl) {
    return (
      <div className="mt-6 space-y-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-relaxed text-amber-100/90">
        <p className="font-semibold text-amber-100">The signed Firefox build is not out yet.</p>
        <p>
          Regular Firefox only installs add-ons Mozilla has signed. Until that is in place you
          can still use YTMQ:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            For this session only: open <Kbd>about:debugging#/runtime/this-firefox</Kbd>, click{' '}
            <strong>Load Temporary Add-on</strong> and pick the file below. Firefox drops it when
            it closes.
          </li>
          <li>
            For good, in Developer Edition, Nightly, LibreWolf and other forks that allow it: set{' '}
            <Kbd>xpinstall.signatures.required</Kbd> to <Kbd>false</Kbd> in{' '}
            <Kbd>about:config</Kbd>, then open the file below.
          </li>
        </ul>
        <a
          href={firefox.unsignedUrl}
          className="ytmq-press inline-flex min-h-10 items-center gap-2 rounded-xl bg-amber-400 px-4 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
        >
          {DOWNLOAD_ICON}
          ytmq-firefox-unsigned.xpi <span className="opacity-70">v{firefox.version}</span>
        </a>
      </div>
    )
  }
  return (
    <ol className="mt-6 space-y-6">
      <Step n={1} title="Add YTMQ to Firefox">
        <a
          href={firefox?.xpiUrl ?? `${BASE}ytmq-firefox.xpi`}
          className="ytmq-press inline-flex min-h-11 items-center gap-2 rounded-xl bg-gradient-to-br from-violet-500 to-violet-700 px-5 font-medium text-white shadow-lg shadow-violet-900/30 hover:brightness-110"
        >
          {DOWNLOAD_ICON}
          Add to Firefox
          {firefox && <span className="text-violet-200/80">v{firefox.version}</span>}
        </a>
        <p>
          Firefox asks twice: <strong className="text-zinc-200">Continue to installation</strong>{' '}
          (it is from t3lluz.com, not the add-ons site), then{' '}
          <strong className="text-zinc-200">Add</strong>. That is the whole install.
        </p>
      </Step>
      <Step n={2} title="Pin it">
        <p>
          Click the puzzle piece in the toolbar, then the gear next to YTMQ, and pick{' '}
          <strong className="text-zinc-200">Pin to Toolbar</strong>. Its popup is your lobby at
          a glance: the code and QR, what is playing with controls, and the queue.
        </p>
      </Step>
      <Step n={3} title="Reload this page">
        <p>
          The green box at the top shows up once Firefox has it. Updates come by themselves,
          like any other add-on.
        </p>
      </Step>
    </ol>
  )
}

export function Setup() {
  const [info, setInfo] = useState<ExtensionInfo | null>(null)
  const installed = isExtensionInstalled()
  const installedVersion = installedExtensionVersion()
  const [browser, setBrowser] = useState<'chrome' | 'firefox'>(isFirefox() ? 'firefox' : 'chrome')
  const onFirefox = isFirefox()
  const firefox = useFirefoxExtension()

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

  // Installs from before 1.8.1 do not report a version. Firefox compares
  // against the signed build, which is all it can install.
  const latest = onFirefox ? (firefox?.xpiUrl ? firefox.version : null) : info?.version
  const outdated =
    installed && latest != null && (!installedVersion || newer(latest, installedVersion))

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
          {outdated && onFirefox ? (
            <>
              <p className="font-semibold">
                Your extension{installedVersion ? ` (v${installedVersion})` : ''} is out of
                date. v{latest} is out.
              </p>
              <p className="mt-1 text-amber-100/80">
                Firefox updates it on its own within a day. To get it now, install it over
                the old one; YTMQ restarts by itself.
              </p>
              <a
                href={firefox?.xpiUrl ?? undefined}
                className="ytmq-press mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-amber-400 px-4 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
              >
                Install v{latest}
              </a>
            </>
          ) : outdated ? (
            <>
              <p className="font-semibold">
                Your extension{installedVersion ? ` (v${installedVersion})` : ''} is out of
                date{info ? `. v${info.version} is out.` : '.'}
              </p>
              <p className="mt-1 text-amber-100/80">
                Download it, unzip it over the same folder, then press{' '}
                <strong>Reload</strong> in the YTMQ popup. Copies older than v1.8 have no
                Reload button: use the reload arrow on the YTMQ card in{' '}
                <code className="rounded bg-black/30 px-1 font-mono text-[0.85em]">
                  chrome://extensions
                </code>{' '}
                instead. From v1.8 on it updates itself as far as Chrome allows.
              </p>
              <a
                href={zipHref(info)}
                download="ytmq-extension.zip"
                className="ytmq-press mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-amber-400 px-4 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
              >
                Download v{info?.version ?? 'latest'}
              </a>
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
        <h2 className="text-lg font-bold">1. Install the extension</h2>
        <p className="mt-1 text-sm text-zinc-400">
          It links YouTube Music to your lobby by itself and adds the YTMQ panel there: the
          lobby code and QR, who is listening, and the queue with who added what. Same
          extension in both browsers.
        </p>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Browser">
          <BrowserTab active={browser === 'chrome'} onClick={() => setBrowser('chrome')}>
            Chrome, Edge, Brave
          </BrowserTab>
          <BrowserTab active={browser === 'firefox'} onClick={() => setBrowser('firefox')}>
            Firefox, LibreWolf, Zen
          </BrowserTab>
        </div>

        {browser === 'firefox' ? (
          <FirefoxSteps firefox={firefox} />
        ) : (
        <>
        <ol className="mt-6 space-y-6">
          <Step n={1} title="Download the extension">
            <a
              href={zipHref(info)}
              download="ytmq-extension.zip"
              className="ytmq-press inline-flex min-h-11 items-center gap-2 rounded-xl bg-gradient-to-br from-violet-500 to-violet-700 px-5 font-medium text-white shadow-lg shadow-violet-900/30 hover:brightness-110"
            >
              {DOWNLOAD_ICON}
              Download ytmq-extension.zip
              {info && <span className="text-violet-200/80">v{info.version}</span>}
            </a>
            <p className="text-xs text-zinc-500">
              Always the newest build. From v1.8 on the extension keeps itself current: the
              YouTube Music bridge loads live from this site, and the popup offers new
              versions with a one-click Reload.
            </p>
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
          <Step n={5} title="Pin it">
            <p>
              Click the puzzle piece in the toolbar and pin YTMQ. Its popup is your lobby at a
              glance: the code and QR, what is playing on YouTube Music or Spotify with
              controls, and the queue. The icon says{' '}
              <strong className="text-zinc-200">NEW</strong> when an update is out.
            </p>
          </Step>
        </ol>

        <p className="mt-6 text-sm text-zinc-500">
          Had the old YTMQ extension from <Kbd>t3lluz.github.io</Kbd>? Remove it on the
          extensions page first; it no longer connects.
        </p>
        </>
        )}
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
            linked. Click it for the queue and the QR; drag it if it is in the way
            (double-click puts it back).
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
          In Firefox there is nothing to do: it updates YTMQ like any other add-on, and the
          popup offers the new version in the meantime. In Chrome:
        </p>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Most fixes reach you on their own: the extension loads the newest YouTube Music
          bridge from this site every time it connects. When the extension itself changes, its
          icon says <strong className="text-zinc-200">NEW</strong> and the YTMQ panel and the
          popup show <strong className="text-zinc-200">Download</strong> and{' '}
          <strong className="text-zinc-200">Reload</strong>. Unzip the download over the same
          folder and press Reload. (That needs v1.8 or newer; older copies need the download
          above once.)
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
