import { useEffect, useState } from 'react'

/**
 * The landing page's picture of a lobby: a now-playing card and the shared
 * queue, with friends' picks dropping in every few seconds. Album art is
 * drawn, not fetched, so the page makes no requests for it.
 */

type Track = { id: number; title: string; artist: string; by: string; art: [string, string]; next?: boolean }

const POOL: Omit<Track, 'id'>[] = [
  { title: 'Midnight City', artist: 'M83', by: 'Sara', art: ['#2b2d6e', '#f472b6'] },
  { title: 'Electric Feel', artist: 'MGMT', by: 'Jonas', art: ['#14532d', '#facc15'] },
  { title: 'Redbone', artist: 'Childish Gambino', by: 'Ali', art: ['#3f1d0b', '#fb923c'] },
  { title: 'Dreams', artist: 'Fleetwood Mac', by: 'Mia', art: ['#1e293b', '#93c5fd'] },
  { title: 'The Less I Know the Better', artist: 'Tame Impala', by: 'Emil', art: ['#4c0519', '#fda4af'] },
  { title: 'Feel It Still', artist: 'Portugal. The Man', by: 'Sara', art: ['#0f172a', '#fde047'] },
  { title: 'Blinding Lights', artist: 'The Weeknd', by: 'Jonas', art: ['#450a0a', '#f87171'] },
  { title: 'Kids', artist: 'MGMT', by: 'Mia', art: ['#083344', '#5eead4'] },
]

function Art({ colors, className }: { colors: [string, string]; className: string }) {
  return (
    <span className={`relative block overflow-hidden ${className}`} style={{ background: colors[0] }} aria-hidden>
      <span
        className="absolute rounded-full"
        style={{ background: colors[1], width: '70%', height: '70%', right: '-18%', bottom: '-18%' }}
      />
      <span
        className="absolute rounded-full border-2"
        style={{ borderColor: colors[1], width: '38%', height: '38%', left: '14%', top: '14%', opacity: 0.7 }}
      />
    </span>
  )
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function QueuePreview() {
  const [state, setState] = useState(() => ({
    now: { ...POOL[0], id: 0 } as Track,
    queue: POOL.slice(1, 4).map((t, i) => ({ ...t, id: i + 1 })) as Track[],
    nextPool: 4,
    nextId: 4,
    tick: 0,
    progress: 0.34,
  }))

  useEffect(() => {
    if (prefersReducedMotion()) return
    const timer = window.setInterval(() => {
      setState((s) => {
        const tick = s.tick + 1
        // Every third beat the song ends: the top of the queue starts playing.
        if (tick % 3 === 0 && s.queue.length > 0) {
          const [head, ...rest] = s.queue
          return { ...s, now: head, queue: rest, tick, progress: 0.02 }
        }
        const pick = POOL[s.nextPool % POOL.length]
        const track: Track = { ...pick, id: s.nextId, next: tick % 2 === 1 }
        const queue = track.next ? [track, ...s.queue] : [...s.queue, track]
        return {
          ...s,
          queue: queue.slice(0, 4),
          nextPool: s.nextPool + 1,
          nextId: s.nextId + 1,
          tick,
          progress: Math.min(0.95, s.progress + 0.22),
        }
      })
    }, 2600)
    return () => window.clearInterval(timer)
  }, [])

  const { now, queue, progress } = state

  return (
    <div className="relative mx-auto w-full max-w-sm" aria-label="Example lobby" role="img">
      <div className="rounded-[32px] bg-[#121212] p-3 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] ring-1 ring-white/[0.06]">
        <div className="flex items-center justify-between px-2 pb-3 pt-1 text-xs">
          <span className="font-mono text-[13px] font-semibold tracking-[0.2em] text-white">4F9K2A</span>
          <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 font-semibold text-neutral-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />5 here
          </span>
        </div>

        <div key={now.id} className="ytmq-anim-fade flex items-center gap-3 rounded-[22px] bg-white/[0.06] p-3">
          <Art colors={now.art} className="h-16 w-16 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-400">Now playing</p>
            <p className="mt-0.5 truncate font-bold text-white">{now.title}</p>
            <p className="truncate text-sm text-neutral-400">{now.artist}</p>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-white transition-[width] duration-[2400ms] ease-linear"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>
        </div>

        <p className="px-2 pb-1.5 pt-4 text-[15px] font-extrabold tracking-[-0.01em] text-white">Next in queue</p>
        <ul className="flex min-h-[13.75rem] flex-col">
          {queue.map((track, i) => (
            <li key={track.id} className="ytmq-anim-row flex items-center gap-3 rounded-xl px-2 py-2">
              <span className="w-4 text-center text-xs tabular-nums text-neutral-500">{i + 1}</span>
              <Art colors={track.art} className="h-10 w-10 shrink-0 rounded-md" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm font-semibold text-neutral-100">
                  <span className="truncate">{track.title}</span>
                  {track.next && (
                    <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-accent-500/15 px-2 text-[10px] font-bold text-accent-300">
                      Play next
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-neutral-500">
                  {track.artist} · added by {track.by}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
