import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { installedExtensionVersion, isExtensionInstalled } from '../../../lib/extensionBridge'
import { isFirefox, useFirefoxExtension, type FirefoxExtension } from '../../../lib/firefoxExtension'
import { ChromeExtensionsMock, FirefoxPromptsMock } from '../mocks'
import { A, B, Callout, Code, CopyButton, Figure, H2, Lead, P, Step, Steps } from '../ui'

type ExtensionInfo = { version: string; zip: string; fingerprint?: string }

const BASE = import.meta.env.BASE_URL
const ZIP_URL = `${BASE}ytmq-extension.zip`
const USERSCRIPT_URL = `${BASE}ytmq-connect.user.js`

/** The zip, stamped with the build it is, so no cache serves an older one. */
function zipHref(info: ExtensionInfo | null): string {
  const stamp = info ? `${info.version}-${(info.fingerprint ?? '').slice(0, 12)}` : Date.now().toString(36)
  return `${ZIP_URL}?v=${encodeURIComponent(stamp)}`
}

function newer(a: string, b: string): boolean {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d > 0
  }
  return false
}

const DOWNLOAD_ICON = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <path d="M5 21h14" />
  </svg>
)

const bigButton =
  'ytmq-press inline-flex min-h-12 items-center gap-2.5 rounded-full bg-accent-600 px-6 text-base font-bold text-white hover:bg-accent-500'

function BrowserTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      onClick={onClick}
      aria-selected={active}
      className={`ytmq-press rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
        active ? 'bg-white text-neutral-950' : 'bg-white/[0.06] text-neutral-300 hover:bg-white/[0.1]'
      }`}
    >
      {children}
    </button>
  )
}

function DoneCard() {
  return (
    <div className="mt-10 flex flex-col gap-4 rounded-3xl bg-white/[0.04] p-6 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-lg font-extrabold text-white">Installed? Start the party.</p>
        <p className="mt-1 text-sm text-neutral-400">
          Create a lobby on the homepage, then press Connect YouTube Music in its Admin tab.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link to="/" className="ytmq-press inline-flex min-h-11 items-center rounded-full bg-white px-5 text-sm font-bold text-neutral-950 hover:bg-neutral-200">
          Back to the homepage
        </Link>
        <Link to="/docs/hosting" className="ytmq-press inline-flex min-h-11 items-center rounded-full bg-white/[0.08] px-5 text-sm font-semibold text-white hover:bg-white/[0.14]">
          Hosting guide
        </Link>
      </div>
    </div>
  )
}

function ChromeSteps({ info }: { info: ExtensionInfo | null }) {
  return (
    <>
      <Steps>
        <Step title="Download the extension">
          <a href={zipHref(info)} download="ytmq-extension.zip" className={bigButton}>
            {DOWNLOAD_ICON}
            Download ytmq-extension.zip
            {info && <span className="font-medium text-white/70">v{info.version}</span>}
          </a>
          <p className="text-sm text-neutral-500">Always the newest build.</p>
        </Step>
        <Step title="Unzip it into a folder you keep">
          <p>
            For example <Code>Documents/ytmq-extension</Code>. Chrome runs the extension from that
            folder and updates go into the same place, so do not leave it in Downloads where it might
            get cleaned up.
          </p>
        </Step>
        <Step title="Open the extensions page and turn on Developer mode">
          <p>Websites cannot link to Chrome&apos;s own pages, so paste this into the address bar:</p>
          <div className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] py-1 pl-4 pr-1 font-mono text-sm text-white">
            chrome://extensions
            <CopyButton value="chrome://extensions" />
          </div>
          <p>
            Then switch on <B>Developer mode</B> in the top right corner. In Edge it is{' '}
            <Code>edge://extensions</Code>, in Brave <Code>brave://extensions</Code>.
          </p>
        </Step>
        <Step title="Load the folder">
          <p>
            Click <B>Load unpacked</B> and pick the folder from step 2, the one with{' '}
            <Code>manifest.json</Code> in it. YTMQ shows up in the list.
          </p>
        </Step>
        <Step title="Pin it">
          <p>
            Click the puzzle piece in the toolbar and pin YTMQ. Its popup is the lobby at a glance:
            the code and QR, what is playing with controls, and the queue. The icon says <B>NEW</B>{' '}
            when there is an update.
          </p>
        </Step>
      </Steps>
      <Figure caption="What step 3 and 4 look like. The YTMQ card appears at the bottom once the folder is loaded.">
        <ChromeExtensionsMock />
      </Figure>
      <Callout tone="note" title="Why Developer mode?">
        <p>
          YTMQ is not on the Chrome Web Store, so Chrome only runs it as an unpacked extension. It is
          the same code you can read in the folder. Chrome may show a banner about developer
          extensions when it starts; that is expected.
        </p>
      </Callout>
    </>
  )
}

function FirefoxSteps({ firefox }: { firefox: FirefoxExtension | null }) {
  if (firefox && !firefox.xpiUrl) {
    return (
      <Callout tone="warn" title="The signed Firefox build is not out yet">
        <p>Release Firefox only installs add-ons Mozilla has signed. Until then:</p>
        <p>
          <B>For this session:</B> open <Code>about:debugging#/runtime/this-firefox</Code>, click{' '}
          <B>Load Temporary Add-on</B> and pick the file below. Firefox drops it when it closes.
        </p>
        <p>
          <B>For good</B>, in Developer Edition, Nightly, LibreWolf and other forks that allow it: set{' '}
          <Code>xpinstall.signatures.required</Code> to <Code>false</Code> in <Code>about:config</Code>,
          then open the file.
        </p>
        <p>
          <a href={firefox.unsignedUrl} className="font-semibold text-white underline underline-offset-4">
            ytmq-firefox-unsigned.xpi
          </a>{' '}
          (v{firefox.version})
        </p>
      </Callout>
    )
  }
  return (
    <>
      <Steps>
        <Step title="Add YTMQ to Firefox">
          <a href={firefox?.xpiUrl ?? `${BASE}ytmq-firefox.xpi`} className={bigButton}>
            {DOWNLOAD_ICON}
            Add to Firefox
            {firefox && <span className="font-medium text-white/70">v{firefox.version}</span>}
          </a>
          <p>
            Firefox asks twice. First <B>Continue to Installation</B>, because the add-on comes from
            t3lluz.com and not from the add-ons site. Then <B>Add</B>.
          </p>
        </Step>
        <Step title="Pin it">
          <p>
            Click the puzzle piece in the toolbar, then the gear next to YTMQ, and pick <B>Pin to
            Toolbar</B>. The popup shows the code and QR, what is playing, and the queue.
          </p>
        </Step>
        <Step title="Reload this page">
          <p>A green box at the top of this page confirms Firefox has it. Updates arrive on their own.</p>
        </Step>
      </Steps>
      <Figure caption="The two prompts Firefox shows. Press the highlighted button on each.">
        <FirefoxPromptsMock />
      </Figure>
      <Callout tone="tip" title="Works in Firefox forks">
        <p>LibreWolf, Zen, Floorp and Waterfox install the same file the same way.</p>
      </Callout>
    </>
  )
}

function InstallStatus({ info, firefox }: { info: ExtensionInfo | null; firefox: FirefoxExtension | null }) {
  const installed = isExtensionInstalled()
  const installedVersion = installedExtensionVersion()
  const onFirefox = isFirefox()
  if (!installed) return null
  // Installs from before 1.8.1 do not report a version. Firefox compares
  // against the signed build, which is all it can install.
  const latest = onFirefox ? (firefox?.xpiUrl ? firefox.version : null) : info?.version
  const outdated = latest != null && (!installedVersion || newer(latest, installedVersion))
  const v = installedVersion ? ` (v${installedVersion})` : ''

  if (!outdated) {
    return (
      <div className="mt-8 flex items-start gap-3 rounded-2xl bg-emerald-500/10 p-4 text-sm" role="status">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400 text-neutral-950">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden>
            <path d="m5 10 3.5 3.5L15 7" />
          </svg>
        </span>
        <div>
          <p className="font-bold text-emerald-100">YTMQ is installed in this browser{v}.</p>
          <p className="mt-0.5 text-emerald-100/70">
            You are set. <Link to="/" className="font-semibold text-white underline underline-offset-4">Create a lobby</Link> and
            connect YouTube Music from its Admin tab.
          </p>
        </div>
      </div>
    )
  }
  return (
    <div className="mt-8 rounded-2xl bg-amber-500/10 p-4 text-sm" role="status">
      <p className="font-bold text-amber-100">
        Your extension{v} is out of date. v{latest} is out.
      </p>
      <p className="mt-1 text-amber-100/75">
        {onFirefox
          ? 'Firefox updates it on its own within a day. To get it now, install it over the old one; YTMQ restarts by itself.'
          : 'Download it, unzip it over the same folder, then press Reload in the YTMQ popup. Copies older than v1.8 have no Reload button: use the reload arrow on the YTMQ card in chrome://extensions instead.'}
      </p>
      <a
        href={onFirefox ? (firefox?.xpiUrl ?? undefined) : zipHref(info)}
        download={onFirefox ? undefined : 'ytmq-extension.zip'}
        className="ytmq-press mt-3 inline-flex min-h-10 items-center gap-2 rounded-full bg-amber-300 px-4 text-sm font-bold text-neutral-950 hover:bg-amber-200"
      >
        {onFirefox ? `Install v${latest}` : `Download v${latest}`}
      </a>
    </div>
  )
}

export default function Install() {
  const [info, setInfo] = useState<ExtensionInfo | null>(null)
  const [browser, setBrowser] = useState<'chrome' | 'firefox'>(isFirefox() ? 'firefox' : 'chrome')
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

  return (
    <>
      <Lead>
        One time, on the computer that plays the music. The extension links YouTube Music to your
        lobby and puts the code, QR and queue on the YouTube Music page. Guests need nothing.
      </Lead>

      <InstallStatus info={info} firefox={firefox} />

      <H2>Pick your browser</H2>
      <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Browser">
        <BrowserTab active={browser === 'chrome'} onClick={() => setBrowser('chrome')}>
          Chrome, Edge, Brave
        </BrowserTab>
        <BrowserTab active={browser === 'firefox'} onClick={() => setBrowser('firefox')}>
          Firefox, LibreWolf, Zen
        </BrowserTab>
      </div>

      <div key={browser} className="ytmq-anim-fade">
        {browser === 'firefox' ? <FirefoxSteps firefox={firefox} /> : <ChromeSteps info={info} />}
        <DoneCard />
      </div>

      <H2>Updates</H2>
      <P>
        <B>Firefox</B> updates YTMQ like any other add-on. The popup offers the new version as soon as
        it is out if you do not want to wait.
      </P>
      <P>
        <B>Chrome</B> does not update unpacked extensions, so YTMQ does most of it itself. The part
        that talks to YouTube Music (the bridge) loads fresh from this site every time a tab connects,
        so most fixes reach you without doing anything. When the extension itself changes, its icon
        says <B>NEW</B> and the panel and popup show <B>Download</B> and <B>Reload</B>. Unzip the
        download over the same folder and press Reload.
      </P>

      <H2>Prefer a userscript?</H2>
      <P>
        If you already use Tampermonkey or Violentmonkey, the <A to={USERSCRIPT_URL}>YTMQ userscript</A>{' '}
        links YouTube Music the same way. You do not get the panel or the toolbar popup, and you
        update it through your userscript manager.
      </P>

      <H2>Remove it</H2>
      <P>
        Chrome: <Code>chrome://extensions</Code>, then <B>Remove</B> on the YTMQ card, and delete the
        folder. Firefox: <Code>about:addons</Code>, the three dots next to YTMQ, <B>Remove</B>. Nothing
        is left behind on the server; lobbies delete themselves after 24 hours.
      </P>
      <Callout tone="note" title="Had the old extension from t3lluz.github.io?">
        <p>Remove it first. It points at the old server and no longer connects.</p>
      </Callout>
    </>
  )
}
