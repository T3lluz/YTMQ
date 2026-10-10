import { useEffect, useId, useRef, useState } from 'react'

export type UpNextTrack = {
  videoId: string
  title: string
  artist: string
  thumbnailUrl: string
}

type LyricsUpNextProps = {
  /** The track queued to play after the current one, or null if none. */
  track: UpNextTrack | null
  /** Seconds left in the currently-playing track. */
  remaining: number
  /** Whether the current track is actively playing. */
  live: boolean
  /** Gate the banner to the immersive desktop layout. */
  enabled: boolean
}

// The drop forms in the song's last stretch and is pulled back up a second
// before the next song starts.
const SHOW_WITHIN_S = 15
const LEAVE_BEFORE_S = 1
const LEAVE_DURATION_MS = 760

type RenderState = {
  track: UpNextTrack
  phase: 'enter' | 'leave'
}

/**
 * "Up next" on the lyrics screen, as a drop of liquid: it gathers at the top
 * edge, drips down and swells into a card that hangs from the edge by a
 * neck, then a second before the next song it dips, stretches and snaps
 * back up into the edge. The liquid is a gooey SVG filter over two plain
 * shapes (the edge and the drop); the card's text sits on top, unfiltered.
 */
export function LyricsUpNext({ track, remaining, live, enabled }: LyricsUpNextProps) {
  const shouldShow =
    enabled &&
    live &&
    Boolean(track) &&
    Number.isFinite(remaining) &&
    remaining <= SHOW_WITHIN_S &&
    remaining > LEAVE_BEFORE_S

  const filterId = `ytmq-goo-${useId().replace(/:/g, '')}`
  const trackId = track?.videoId ?? ''
  const trackRef = useRef(track)
  useEffect(() => {
    trackRef.current = track
  }, [track])

  const [render, setRender] = useState<RenderState | null>(null)
  const leaveTimer = useRef(0)

  useEffect(() => {
    if (shouldShow) {
      const current = trackRef.current
      if (!current) return
      if (leaveTimer.current) {
        window.clearTimeout(leaveTimer.current)
        leaveTimer.current = 0
      }
      setRender((prev) => (prev?.phase === 'enter' && prev.track.videoId === current.videoId ? prev : { track: current, phase: 'enter' }))
    } else {
      setRender((prev) => {
        if (!prev || prev.phase === 'leave') return prev
        leaveTimer.current = window.setTimeout(() => {
          setRender(null)
          leaveTimer.current = 0
        }, LEAVE_DURATION_MS)
        return { ...prev, phase: 'leave' }
      })
    }
  }, [shouldShow, trackId])

  useEffect(
    () => () => {
      if (leaveTimer.current) window.clearTimeout(leaveTimer.current)
    },
    [],
  )

  if (!render) return null

  const { track: shown, phase } = render
  // The bar empties as the song runs out.
  const span = SHOW_WITHIN_S - LEAVE_BEFORE_S
  const progress = Math.min(1, Math.max(0, (SHOW_WITHIN_S - remaining) / span))

  return (
    <div
      className={`ytmq-drop pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center ${phase === 'leave' ? 'is-leaving' : ''}`}
      aria-live="polite"
    >
      <svg aria-hidden className="absolute h-0 w-0">
        <defs>
          <filter id={filterId}>
            <feGaussianBlur in="SourceGraphic" stdDeviation="9" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" result="goo" />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>

      {/* The liquid: the top edge and the drop, melted together. */}
      <div aria-hidden className="ytmq-drop-liquid absolute inset-x-0 top-0 h-40" style={{ filter: `url(#${filterId})` }}>
        <span className="ytmq-drop-edge" />
        <span className="ytmq-drop-blob" />
      </div>

      {/* The card's contents, over the drop once it has swollen. */}
      <div className="ytmq-drop-card relative flex items-center gap-3 overflow-hidden px-3.5">
        {shown.thumbnailUrl ? (
          <img
            src={shown.thumbnailUrl}
            alt=""
            referrerPolicy="no-referrer"
            onError={(event) => {
              const img = event.currentTarget
              if (img.dataset.fallback === '1') return
              if (img.src.includes('/maxresdefault.jpg')) {
                img.dataset.fallback = '1'
                img.src = img.src.replace('/maxresdefault.jpg', '/mqdefault.jpg')
              }
            }}
            className="h-11 w-11 shrink-0 rounded-[10px] object-cover shadow-lg"
          />
        ) : (
          <div className="h-11 w-11 shrink-0 rounded-[10px] bg-white/10" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/60">Up next</p>
          <p className="truncate text-sm font-bold leading-tight text-white">{shown.title}</p>
          {shown.artist && <p className="truncate text-xs text-white/65">{shown.artist}</p>}
        </div>
        <span
          aria-hidden
          className="absolute inset-x-6 bottom-1.5 h-[3px] overflow-hidden rounded-full bg-white/15"
        >
          <span
            className="block h-full origin-left rounded-full bg-white/80 transition-transform duration-300 ease-linear"
            style={{ transform: `scaleX(${1 - progress})` }}
          />
        </span>
      </div>
    </div>
  )
}
