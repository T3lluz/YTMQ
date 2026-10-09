import { Lead } from '../ui'

type Entry = { date: string; version?: string; items: string[] }

const ENTRIES: Entry[] = [
  {
    date: 'October 2026',
    version: 'Extension 1.11',
    items: [
      'New look everywhere: a new icon, red instead of purple, flat surfaces, one typeface.',
      'Docs at /docs, with diagrams, an API reference and troubleshooting. The old /setup link lands on the install guide.',
      'The homepage takes a lobby code directly and lists lobbies you were in today under Jump back in.',
      'Hosts keep Admin after closing the tab, for the lobby\'s 24 hours.',
      'Hosts can add songs while adding is switched off for guests.',
      'Join remembers your name for next time.',
      'The pill, panel and popup match the new look and no longer load fonts from Google.',
    ],
  },
  {
    date: 'October 2026',
    version: 'Extension 1.10',
    items: [
      'Firefox: a signed add-on, installed with one click, that updates itself.',
      'The toolbar popup covers the whole lobby, Spotify included, and works without a YouTube Music tab.',
      'Chrome: the extension offers its own updates (Download, Reload) and the bridge loads fresh from the site.',
      'A first-time setup page for hosts.',
      'YTMQ moved off Supabase onto its own server at t3lluz.com/ytmq.',
    ],
  },
  {
    date: 'August 2026',
    items: [
      'Spotify as a host player: now playing and lyrics follow Spotify on any device.',
      'Keyboard shortcuts in the lobby: Space, Left and Right.',
    ],
  },
  {
    date: 'July 2026',
    version: 'Extension 1.0 to 1.5',
    items: [
      'The Chrome extension: every YouTube Music tab links to the lobby by itself.',
      'A panel inside YouTube Music with the code, QR and guest queue.',
    ],
  },
  {
    date: 'June 2026',
    items: [
      'Lyrics from Musixmatch, LRCLIB, NetEase and KuGou, synced line by line.',
      'Fullscreen lyrics with an Up next banner, volume and the F key.',
      'Playback controls with album-colored now playing.',
    ],
  },
]

export default function Changelog() {
  return (
    <>
      <Lead>Newest first. Extension versions are listed where the extension changed.</Lead>
      <ol className="relative mt-10 space-y-10 border-l border-white/[0.08] pl-8">
        {ENTRIES.map((e, i) => (
          <li key={i} className="relative">
            <span className={`absolute -left-[37px] top-1.5 h-3 w-3 rounded-full ring-4 ring-neutral-950 ${i === 0 ? 'bg-accent-500' : 'bg-neutral-600'}`} />
            <p className="flex flex-wrap items-baseline gap-x-3">
              <span className="text-lg font-extrabold text-white">{e.date}</span>
              {e.version && <span className="rounded-full bg-white/[0.07] px-2.5 py-0.5 text-xs font-bold text-neutral-300">{e.version}</span>}
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 leading-7 text-neutral-300 marker:text-neutral-600">
              {e.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </>
  )
}
