import { useId, type CSSProperties, type ReactNode } from 'react'

type IconProps = { className?: string; style?: CSSProperties }

function Stroke({
  className = 'h-5 w-5',
  style,
  width = 2,
  children,
}: IconProps & { width?: number; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden
    >
      {children}
    </svg>
  )
}

export const SearchIcon = (p: IconProps) => (
  <Stroke {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.6-3.6" />
  </Stroke>
)

export const PlusIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M12 5v14M5 12h14" />
  </Stroke>
)

export const PlusCircleIcon = (p: IconProps) => (
  <Stroke {...p} width={1.8}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v8M8 12h8" />
  </Stroke>
)

export const CheckIcon = (p: IconProps) => (
  <Stroke {...p} width={2.4}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Stroke>
)

export const CheckCircleIcon = ({ className = 'h-5 w-5', style }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden>
    <circle cx="12" cy="12" r="10" fill="currentColor" />
    <path d="m7.5 12.3 3 3 6-6.3" fill="none" stroke="#0a0a0a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const CloseIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Stroke>
)

export const MoreIcon = ({ className = 'h-5 w-5', style }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} style={style} aria-hidden>
    <circle cx="5" cy="12" r="1.9" />
    <circle cx="12" cy="12" r="1.9" />
    <circle cx="19" cy="12" r="1.9" />
  </svg>
)

export const ChevronLeftIcon = (p: IconProps) => (
  <Stroke {...p} width={2.2}>
    <path d="m15 18-6-6 6-6" />
  </Stroke>
)

export const ChevronRightIcon = (p: IconProps) => (
  <Stroke {...p} width={2.2}>
    <path d="m9 18 6-6-6-6" />
  </Stroke>
)

export const ChevronDownIcon = (p: IconProps) => (
  <Stroke {...p} width={2.2}>
    <path d="m6 9 6 6 6-6" />
  </Stroke>
)

export const ArrowRightIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Stroke>
)

export const PlayNextIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M4 6h10M4 12h7M4 18h7" />
    <path d="M15.5 11.2v7.6l5.5-3.8z" fill="currentColor" />
  </Stroke>
)

export const AddToQueueIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M4 6h12M4 12h8M4 18h8" />
    <path d="M18 13v7M14.5 16.5h7" />
  </Stroke>
)

export const QueueListIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M4 6h16M4 12h16M4 18h10" />
  </Stroke>
)

export const PersonIcon = (p: IconProps) => (
  <Stroke {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
  </Stroke>
)

export const AlbumIcon = (p: IconProps) => (
  <Stroke {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="2.5" />
  </Stroke>
)

export const MusicNoteIcon = (p: IconProps) => (
  <Stroke {...p} width={1.8}>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </Stroke>
)

export const ClockIcon = (p: IconProps) => (
  <Stroke {...p} width={1.8}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Stroke>
)

export const HistoryIcon = (p: IconProps) => (
  <Stroke {...p} width={1.8}>
    <path d="M3 3v5h5" />
    <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
    <path d="M12 7v5l3 2" />
  </Stroke>
)

export const TrashIcon = (p: IconProps) => (
  <Stroke {...p} width={1.8}>
    <path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
  </Stroke>
)

export const LinkIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" />
    <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />
  </Stroke>
)

export const CopyIcon = (p: IconProps) => (
  <Stroke {...p} width={1.8}>
    <rect x="8" y="8" width="12" height="12" rx="3" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </Stroke>
)

export const QrIcon = (p: IconProps) => (
  <Stroke {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <path d="M14 14h3v3M21 14v.01M14 21h.01M17 21h4v-4" />
  </Stroke>
)

export const LockIcon = ({ className = 'h-4 w-4', style }: IconProps) => (
  <svg viewBox="0 0 20 20" fill="currentColor" className={className} style={style} aria-hidden>
    <path
      fillRule="evenodd"
      d="M10 1.5A3.5 3.5 0 0 0 6.5 5v2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-.5V5A3.5 3.5 0 0 0 10 1.5Zm2 5.5V5a2 2 0 1 0-4 0v2h4Z"
      clipRule="evenodd"
    />
  </svg>
)

export const SparkleIcon = ({ className = 'h-4 w-4', style }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} style={style} aria-hidden>
    <path d="M12 2.5c.5 4.6 2.9 7 7.5 7.5-4.6.5-7 2.9-7.5 7.5-.5-4.6-2.9-7-7.5-7.5 4.6-.5 7-2.9 7.5-7.5Z" />
    <path d="M19 15.5c.2 1.8 1.2 2.8 3 3-1.8.2-2.8 1.2-3 3-.2-1.8-1.2-2.8-3-3 1.8-.2 2.8-1.2 3-3Z" />
  </svg>
)

export const ShuffleIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M16 3h5v5" />
    <path d="M4 20 21 3" />
    <path d="M21 16v5h-5" />
    <path d="m15 15 6 6" />
    <path d="M4 4l5 5" />
  </Stroke>
)

/** Shuffle with a sparkle: YTMQ's smart shuffle. */
export const SmartShuffleIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M16 3h5v5" />
    <path d="M4 20 21 3" />
    <path d="M4 4l5 5" />
    <path
      d="M17.5 13.5c.25 2.2 1.3 3.25 3.5 3.5-2.2.25-3.25 1.3-3.5 3.5-.25-2.2-1.3-3.25-3.5-3.5 2.2-.25 3.25-1.3 3.5-3.5Z"
      fill="currentColor"
      strokeWidth={1.2}
    />
  </Stroke>
)

export const PlayIcon = ({ className = 'h-5 w-5', style }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} style={style} aria-hidden>
    <path d="M7.5 4.9v14.2a1 1 0 0 0 1.5.86l11.3-7.1a1 1 0 0 0 0-1.72L9 4.04a1 1 0 0 0-1.5.86Z" />
  </svg>
)

export const PauseIcon = ({ className = 'h-5 w-5', style }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} style={style} aria-hidden>
    <rect x="6" y="4.5" width="4" height="15" rx="1.4" />
    <rect x="14" y="4.5" width="4" height="15" rx="1.4" />
  </svg>
)

export const NextIcon = ({ className = 'h-5 w-5', style }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} style={style} aria-hidden>
    <path d="M5 5.6v12.8a1 1 0 0 0 1.55.83l9.2-6.4a1 1 0 0 0 0-1.66l-9.2-6.4A1 1 0 0 0 5 5.6Z" />
    <rect x="16.6" y="5" width="2.6" height="14" rx="1.3" />
  </svg>
)

export const PrevIcon = ({ className = 'h-5 w-5', style }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} style={style} aria-hidden>
    <path d="M19 5.6v12.8a1 1 0 0 1-1.55.83l-9.2-6.4a1 1 0 0 1 0-1.66l9.2-6.4A1 1 0 0 1 19 5.6Z" />
    <rect x="4.8" y="5" width="2.6" height="14" rx="1.3" />
  </svg>
)

/** The "E" Spotify and Apple Music put next to explicit songs. */
export function ExplicitBadge({ className = '' }: { className?: string }) {
  return (
    <span
      aria-label="Explicit"
      title="Explicit"
      className={`inline-flex h-[15px] min-w-[15px] shrink-0 items-center justify-center rounded-[3px] bg-white/60 px-[3px] text-[9px] font-extrabold leading-none text-neutral-950 ${className}`}
    >
      E
    </span>
  )
}

/**
 * Speaker that shows the level with one to three waves. Muted, a slash
 * draws across it and cuts a clean gap through the speaker (a mask), the way
 * the system icons do, instead of a line lying on top.
 */
export function VolumeIcon({
  level,
  muted,
  className = 'h-5 w-5',
}: {
  level: number
  muted: boolean
  className?: string
}) {
  const id = useId().replace(/:/g, '')
  const wave = (show: boolean): CSSProperties => ({
    opacity: show && !muted ? 1 : 0,
    transformOrigin: '9px 12px',
    transform: show && !muted ? 'scale(1)' : 'scale(0.5)',
    transition: 'opacity 220ms ease, transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1)',
  })
  const slash: CSSProperties = {
    strokeDasharray: '1 1',
    strokeDashoffset: muted ? 0 : 1,
    transition: 'stroke-dashoffset 320ms cubic-bezier(0.65, 0, 0.35, 1)',
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`shrink-0 ${className}`}
    >
      <defs>
        <mask id={`vol-${id}`} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
          <rect width="24" height="24" fill="#fff" />
          <path d="M3 3 21 21" stroke="#000" strokeWidth="5" pathLength={1} style={slash} />
        </mask>
      </defs>
      <g mask={`url(#vol-${id})`}>
        <path
          d="M3.5 9.6c0-.6.45-1.1 1.05-1.1H7.3l3.95-3.3c.65-.55 1.65-.08 1.65.77v12.06c0 .85-1 1.32-1.65.77L7.3 15.5H4.55c-.6 0-1.05-.5-1.05-1.1Z"
          fill="currentColor"
          stroke="none"
        />
        <path d="M15.6 9.3a4 4 0 0 1 0 5.4" style={wave(level > 0)} />
        <path d="M18.2 6.8a7.6 7.6 0 0 1 0 10.4" style={wave(level >= 40)} />
      </g>
      <path d="M3 3 21 21" pathLength={1} style={slash} />
    </svg>
  )
}
