import type { NowPlayingSource } from '../../lib/playback'
import { SOURCE_LABEL } from '../../lib/playback'

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

export function SourceIcon({ source, className = 'h-4 w-4' }: { source: NowPlayingSource; className?: string }) {
  return source === 'spotify' ? <SpotifyIcon className={className} /> : <YouTubeMusicIcon className={className} />
}

/**
 * Which player the song comes from. `tone="glass"` sits on artwork and
 * blurred backdrops; `tone="plain"` on the flat surfaces.
 */
export function SourceBadge({
  source,
  tone = 'plain',
  compact = false,
  className = '',
}: {
  source: NowPlayingSource
  tone?: 'plain' | 'glass'
  compact?: boolean
  className?: string
}) {
  const label = SOURCE_LABEL[source]
  return (
    <span
      title={`Playing on ${label}`}
      aria-label={`Playing on ${label}`}
      className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full pl-1 text-[11px] font-semibold ${
        compact ? 'pr-1' : 'pr-2.5'
      } ${tone === 'glass' ? 'bg-black/35 text-white/90 backdrop-blur-md' : 'bg-white/[0.07] text-neutral-200'} ${className}`}
    >
      <SourceIcon source={source} className="h-4 w-4" />
      {!compact && label}
    </span>
  )
}
