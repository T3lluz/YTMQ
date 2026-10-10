import type { ReactNode } from 'react'

export { SpotifyIcon, YouTubeMusicIcon } from './ui/brands'

export type PlayerStatus = 'off' | 'pending' | 'live' | 'warn'

const STATUS: Record<PlayerStatus, { dot: string; text: string }> = {
  off: { dot: 'bg-neutral-500', text: 'text-neutral-400' },
  pending: { dot: 'bg-amber-400 animate-pulse', text: 'text-amber-200' },
  live: { dot: 'bg-emerald-400', text: 'text-emerald-300' },
  warn: { dot: 'bg-amber-400', text: 'text-amber-200' },
}

/** One player in Admin: brand icon, name, a status line, then actions. */
export function PlayerCard({
  icon,
  name,
  status,
  statusLabel,
  active = false,
  children,
}: {
  icon: ReactNode
  name: string
  status: PlayerStatus
  statusLabel: string
  /** This player is the one the room plays on right now. */
  active?: boolean
  children: ReactNode
}) {
  const s = STATUS[status]
  return (
    <section
      className={`rounded-2xl p-4 transition-colors ${active ? 'bg-white/[0.07] ring-1 ring-white/10' : 'bg-white/[0.04]'}`}
      aria-label={`${name}: ${statusLabel}`}
    >
      <div className="flex items-center gap-3">
        {icon}
        <div className="min-w-0 flex-1">
          <p className="font-bold text-white">{name}</p>
          <p className={`flex items-center gap-1.5 text-xs font-semibold ${s.text}`}>
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} />
            <span className="truncate">{statusLabel}</span>
          </p>
        </div>
        {active && (
          <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-accent-600 px-2.5 text-[11px] font-bold text-white">
            Playing
          </span>
        )}
      </div>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-neutral-400">{children}</div>
    </section>
  )
}

/** Card actions sit on one row, left aligned, never full width. */
export function CardActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 pt-1">{children}</div>
}
