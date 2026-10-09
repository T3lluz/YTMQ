import { YtmqLogo } from '../../components/YtmqLogo'

/*
 * Drawn stand-ins for browser and extension UI, so the docs can point at
 * buttons without screenshots that go stale. They copy the real layout and
 * labels, not pixels.
 */

function Dot({ className }: { className: string }) {
  return <span className={`h-1.5 w-1.5 rounded-full ${className}`} />
}

export function PillMock() {
  return (
    <div className="inline-flex h-11 items-center gap-2.5 rounded-full border border-white/10 bg-[#1c1c1c] py-0 pl-1.5 pr-3 shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
      <span className="relative">
        <YtmqLogo size={32} trail={false} className="h-8 w-8" />
        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#1c1c1c] bg-emerald-400" />
      </span>
      <span className="font-mono text-[15px] font-semibold tracking-[0.14em] text-white">B72F25</span>
      <span className="h-4 w-px bg-white/15" />
      <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-neutral-300">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3.5 w-3.5 text-accent-400" aria-hidden>
          <path d="M3 6h13M3 12h9M3 18h9" />
        </svg>
        6
      </span>
      <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-neutral-300">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3.5 w-3.5 text-accent-400" aria-hidden>
          <circle cx="9" cy="8" r="4" />
          <path d="M2 21v-1a6 6 0 0 1 12 0v1" />
        </svg>
        4
      </span>
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-neutral-400" aria-hidden>
        <path d="m5 12 5-5 5 5" />
      </svg>
    </div>
  )
}

/** A YouTube Music window with the pill sitting above the player bar. */
export function YtmWindowMock() {
  return (
    <div className="relative mx-auto aspect-[16/9] w-full max-w-2xl overflow-hidden rounded-xl border border-white/10 bg-[#030303]">
      <div className="flex h-7 items-center gap-1.5 border-b border-white/[0.06] bg-[#111] px-3">
        <Dot className="bg-neutral-600" />
        <Dot className="bg-neutral-600" />
        <Dot className="bg-neutral-600" />
        <span className="ml-3 truncate rounded bg-white/[0.06] px-2 py-0.5 font-mono text-[10px] text-neutral-400">music.youtube.com</span>
      </div>
      <div className="flex h-[calc(100%-1.75rem-3.25rem)]">
        <div className="hidden w-32 shrink-0 space-y-2 border-r border-white/[0.06] p-3 sm:block">
          {[60, 48, 54].map((w, i) => (
            <div key={i} className="h-2.5 rounded-full bg-white/10" style={{ width: `${w}%` }} />
          ))}
        </div>
        <div className="flex-1 space-y-3 p-4">
          <div className="h-3 w-28 rounded-full bg-white/15" />
          <div className="grid grid-cols-4 gap-2">
            {['#3b2a5c', '#5c2a2a', '#2a4d5c', '#4d5c2a'].map((c) => (
              <div key={c} className="aspect-square rounded-md" style={{ background: c }} />
            ))}
          </div>
          <div className="h-2.5 w-40 rounded-full bg-white/10" />
        </div>
      </div>
      <div className="absolute bottom-[3.9rem] right-3 origin-bottom-right scale-[0.8] sm:scale-90">
        <PillMock />
      </div>
      <div className="absolute inset-x-0 bottom-0 flex h-[3.25rem] items-center gap-3 border-t border-white/[0.06] bg-[#212121] px-3">
        <span className="h-3 w-3 rotate-180 border-y-[6px] border-l-[9px] border-y-transparent border-l-neutral-300" />
        <span className="h-3.5 w-3.5 border-y-[7px] border-l-[11px] border-y-transparent border-l-white" />
        <div className="h-8 w-8 rounded bg-[#5c2a2a]" />
        <div className="space-y-1">
          <div className="h-2 w-24 rounded-full bg-white/40" />
          <div className="h-2 w-16 rounded-full bg-white/15" />
        </div>
      </div>
    </div>
  )
}

export function PopupMock() {
  return (
    <div className="w-[300px] overflow-hidden rounded-2xl border border-white/10 bg-[#161616] text-[12px] shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
      <div className="flex items-center gap-2 px-3 pb-1 pt-3">
        <YtmqLogo size={26} trail={false} className="h-[26px] w-[26px]" />
        <span className="text-[14px] font-extrabold text-white">YTMQ</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
          <Dot className="bg-emerald-400" />
          Live
        </span>
      </div>
      <div className="px-3 pt-2">
        <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-neutral-500">Lobby code</p>
        <p className="font-mono text-[24px] font-semibold tracking-[0.16em] text-white">B72F25</p>
        <p className="text-[11px] text-neutral-400">
          Guests join at <b className="text-neutral-200">t3lluz.com/ytmq</b>
        </p>
        <div className="mt-2.5 flex items-center gap-2.5 rounded-xl bg-white/[0.05] p-2">
          <div className="h-10 w-10 rounded-md bg-[#2a4d5c]" />
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-accent-400">Playing</p>
            <p className="truncate font-bold text-white">Dreams</p>
            <p className="truncate text-[11px] text-neutral-400">Fleetwood Mac</p>
          </div>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white">
            <span className="flex gap-[3px]">
              <span className="h-2.5 w-[3px] rounded-sm bg-neutral-950" />
              <span className="h-2.5 w-[3px] rounded-sm bg-neutral-950" />
            </span>
          </span>
        </div>
        <div className="mt-2 space-y-1">
          {[
            ['#FF0033', 'YouTube Music', 'Linked · guest picks play here', 'bg-emerald-400'],
            ['#1ED760', 'Spotify', 'Optional · set up in Admin', 'bg-neutral-600'],
          ].map(([c, n, t, d]) => (
            <div key={n} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-2 py-1.5">
              <Dot className={d} />
              <span className="h-4 w-4 rounded-full" style={{ background: c }} />
              <span className="min-w-0 flex-1">
                <b className="block text-[11px] text-white">{n}</b>
                <span className="block truncate text-[10px] text-neutral-500">{t}</span>
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 flex justify-between text-[12px] font-bold text-white">
          Up next <span className="font-medium text-neutral-500">6 songs</span>
        </p>
        <div className="mt-1 space-y-0.5 pb-3">
          {[
            ['#14532d', 'Electric Feel', 'Added by Jonas · MGMT'],
            ['#4c0519', 'The Less I Know the Better', 'Added by Mia · Tame Impala'],
          ].map(([c, t, b], i) => (
            <div key={t} className="flex items-center gap-2 py-1">
              <span className="w-3 text-center text-[10px] text-neutral-500">{i + 1}</span>
              <span className="h-7 w-7 rounded" style={{ background: c }} />
              <span className="min-w-0">
                <b className="block truncate text-[11px] text-white">{t}</b>
                <span className="block truncate text-[10px] text-neutral-500">{b}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** chrome://extensions with Developer mode on and Load unpacked showing. */
export function ChromeExtensionsMock() {
  return (
    <div className="mx-auto w-full max-w-xl overflow-hidden rounded-xl border border-white/10 bg-[#202124] text-[12px] text-[#e8eaed]">
      <div className="flex h-8 items-center gap-2 bg-[#35363a] px-3">
        <span className="truncate rounded-full bg-[#202124] px-3 py-0.5 font-mono text-[11px] text-neutral-300">chrome://extensions</span>
      </div>
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <span className="text-[15px] font-medium">Extensions</span>
        <span className="ml-auto flex items-center gap-2 rounded-lg px-2 py-1 ring-2 ring-accent-500">
          Developer mode
          <span className="relative h-3.5 w-7 rounded-full bg-[#8ab4f8]/50">
            <span className="absolute -top-[3px] right-[-2px] h-5 w-5 rounded-full bg-[#8ab4f8]" />
          </span>
        </span>
      </div>
      <div className="flex flex-wrap gap-2 px-4 py-3">
        <span className="rounded-md border border-[#8ab4f8]/60 px-3 py-1 font-medium text-[#8ab4f8] ring-2 ring-accent-500 ring-offset-2 ring-offset-[#202124]">
          Load unpacked
        </span>
        <span className="rounded-md border border-white/20 px-3 py-1 text-neutral-400">Pack extension</span>
        <span className="rounded-md border border-white/20 px-3 py-1 text-neutral-400">Update</span>
      </div>
      <div className="m-4 mt-1 flex items-center gap-3 rounded-lg bg-[#292a2d] p-3">
        <YtmqLogo size={36} trail={false} className="h-9 w-9" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            YTMQ <span className="text-neutral-400">1.11.0</span>
          </p>
          <p className="truncate text-[11px] text-neutral-400">Host companion for YTMQ: links YouTube Music to your lobby…</p>
        </div>
        <span className="relative h-3.5 w-7 rounded-full bg-[#8ab4f8]/50">
          <span className="absolute -top-[3px] right-[-2px] h-5 w-5 rounded-full bg-[#8ab4f8]" />
        </span>
      </div>
    </div>
  )
}

/** Firefox's two install prompts for an add-on from a website. */
export function FirefoxPromptsMock() {
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-center">
      <div className="w-64 rounded-xl border border-white/10 bg-[#2b2a33] p-4 text-[12px] text-[#fbfbfe] shadow-xl">
        <p className="font-semibold">t3lluz.com would like to install an add-on in Firefox.</p>
        <div className="mt-4 flex justify-end gap-2">
          <span className="rounded-md bg-white/10 px-3 py-1.5">Cancel</span>
          <span className="rounded-md bg-[#00ddff] px-3 py-1.5 font-semibold text-[#15141a] ring-2 ring-accent-500 ring-offset-2 ring-offset-[#2b2a33]">
            Continue to Installation
          </span>
        </div>
      </div>
      <div className="w-64 rounded-xl border border-white/10 bg-[#2b2a33] p-4 text-[12px] text-[#fbfbfe] shadow-xl">
        <div className="flex items-center gap-2">
          <YtmqLogo size={24} trail={false} className="h-6 w-6" />
          <p className="font-semibold">Add YTMQ?</p>
        </div>
        <p className="mt-2 text-[11px] text-neutral-300">It requires your permission to access your data for:</p>
        <ul className="mt-1 list-disc pl-4 text-[11px] text-neutral-300">
          <li>music.youtube.com</li>
          <li>t3lluz.com</li>
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          <span className="rounded-md bg-white/10 px-3 py-1.5">Cancel</span>
          <span className="rounded-md bg-[#00ddff] px-3 py-1.5 font-semibold text-[#15141a] ring-2 ring-accent-500 ring-offset-2 ring-offset-[#2b2a33]">
            Add
          </span>
        </div>
      </div>
    </div>
  )
}
