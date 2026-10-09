import type { ReactNode } from 'react'
import { A, B, Code, H2, Lead, P } from '../ui'

function Fix({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="group mt-3 rounded-2xl bg-white/[0.04] px-5 py-4 open:bg-white/[0.06]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold text-white [&::-webkit-details-marker]:hidden">
        {q}
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-neutral-400 transition-transform group-open:rotate-180" aria-hidden>
          <path d="m5 8 5 5 5-5" />
        </svg>
      </summary>
      <div className="mt-3 space-y-3 text-[15px] leading-7 text-neutral-300">{children}</div>
    </details>
  )
}

export default function Troubleshooting() {
  return (
    <>
      <Lead>The usual suspects, roughly in the order people run into them.</Lead>

      <H2>Hosting</H2>
      <Fix q="Songs are added in YTMQ but never reach YouTube Music">
        <p>
          Look at the pill above the YouTube Music player. Grey means no lobby is linked: press{' '}
          <B>Connect YouTube Music</B> in Admin. Amber means it is still connecting; a sign-in prompt
          on YouTube Music can hold it up.
        </p>
        <p>
          No pill at all? The extension is not running in this browser. Check{' '}
          <Code>chrome://extensions</Code> or <Code>about:addons</Code>, then reload the YouTube Music
          tab.
        </p>
        <p>Songs that failed show in the panel with <B>Retry</B>.</p>
      </Fix>
      <Fix q="Connect YouTube Music opens a new tab every time">
        <p>
          That happens when the lobby page cannot see the extension, usually because it is installed
          in a different browser or profile. Install it in this one, or link the open tab from the
          toolbar popup.
        </p>
      </Fix>
      <Fix q="The Admin tab is gone">
        <p>
          Host status lives in the browser that created the lobby, for 24 hours. In another browser,
          a private window, or after clearing site data, you are a guest. Create a new lobby there if
          you need Admin.
        </p>
      </Fix>
      <Fix q="The extension icon says NEW">
        <p>
          There is a newer build. Chrome: open the popup, press <B>Download</B>, unzip over the same
          folder, press <B>Reload</B>. Firefox: press <B>Install</B> in the popup, or wait for Firefox
          to update it.
        </p>
      </Fix>
      <Fix q="Firefox says the add-on could not be verified">
        <p>
          Release Firefox only takes signed add-ons. Install from the button on{' '}
          <A to="/docs/install">Install the extension</A>, which always serves the signed build, rather
          than an old file from your downloads.
        </p>
      </Fix>

      <H2>Guests</H2>
      <Fix q="Lobby not found">
        <p>
          The code is wrong, or the lobby ended. Lobbies last 24 hours, and the host can end one early.
          Codes use the digits 0 to 9 and the letters A to F, so an O is always a zero.
        </p>
      </Fix>
      <Fix q="I can search but cannot add songs">
        <p>The host turned off adding for guests. The search tab says so at the top.</p>
      </Fix>
      <Fix q="Now playing says nothing is playing">
        <p>
          It shows what the host&apos;s player reports. If the host&apos;s YouTube Music tab is closed or
          asleep, or Spotify is linked but the host&apos;s lobby tab is closed, updates stop after about
          30 seconds.
        </p>
      </Fix>
      <Fix q="The controls do nothing">
        <p>
          Either the host turned off playback controls for guests, or the player is Spotify on a Free
          account, which does not allow remote control.
        </p>
      </Fix>

      <H2>Still stuck?</H2>
      <P>
        Open an issue on <A to="https://github.com/T3lluz/YTMQ/issues">GitHub</A> with what you see and
        which browser you use. A screenshot of the YTMQ panel helps.
      </P>
    </>
  )
}
