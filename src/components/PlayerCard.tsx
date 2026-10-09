import type { ReactNode } from 'react'

export function YouTubeMusicIcon({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <circle cx="12" cy="12" r="11" fill="#FF0033" />
      <circle cx="12" cy="12" r="5.6" fill="none" stroke="#fff" strokeWidth="1.3" />
      <path d="M10.4 9.4v5.2l4.3-2.6z" fill="#fff" />
    </svg>
  )
}

export function SpotifyIcon({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <circle cx="12" cy="12" r="11" fill="#1ED760" />
      <path d="M6.6 9.2c3.6-1.1 7.7-.8 10.8 1" stroke="#000" strokeWidth="1.7" strokeLinecap="round" fill="none" />
      <path d="M7.2 12.4c3-.9 6.3-.6 8.9.9" stroke="#000" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <path d="M7.9 15.4c2.4-.7 4.8-.4 6.9.7" stroke="#000" strokeWidth="1.3" strokeLinecap="round" fill="none" />
    </svg>
  )
}

export type PlayerStatus = 'off' | 'pending' | 'live' | 'warn'

const STATUS: Record<PlayerStatus, { dot: string; text: string }> = {
  off: { dot: 'bg-neutral-600', text: 'text-neutral-400' },
  pending: { dot: 'bg-amber-400 animate-pulse', text: 'text-amber-200' },
  live: { dot: 'bg-emerald-400', text: 'text-emerald-300' },
  warn: { dot: 'bg-amber-400', text: 'text-amber-200' },
}

/** One connected player in Admin: brand icon, name, a status line, then actions. */
export function PlayerCard({
  icon,
  name,
  status,
  statusLabel,
  children,
}: {
  icon: ReactNode
  name: string
  status: PlayerStatus
  statusLabel: string
  children: ReactNode
}) {
  const s = STATUS[status]
  return (
    <section className="rounded-2xl bg-white/[0.04] p-4" aria-label={`${name}: ${statusLabel}`}>
      <div className="flex items-center gap-3">
        {icon}
        <div className="min-w-0 flex-1">
          <p className="font-bold text-white">{name}</p>
          <p className={`flex items-center gap-1.5 text-xs font-semibold ${s.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
            {statusLabel}
          </p>
        </div>
      </div>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-neutral-400">{children}</div>
    </section>
  )
}

export const primaryButton =
  'ytmq-press inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-neutral-950 hover:bg-neutral-200 disabled:opacity-60'
export const secondaryButton =
  'ytmq-press inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full bg-white/[0.08] px-4 text-xs font-semibold text-neutral-100 hover:bg-white/[0.14]'
export const textButton =
  'text-xs font-semibold text-neutral-400 underline decoration-neutral-700 underline-offset-4 hover:text-white'
