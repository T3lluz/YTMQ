import { useEffect, useRef, useState } from 'react'

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

// Appear in the final stretch of the song, then bounce away just before the
// next track takes over — mirroring the bridge's on-page "Up next" banner.
const SHOW_WITHIN_S = 15
const LEAVE_BEFORE_S = 1.4
const LEAVE_DURATION_MS = 520

type RenderState = {
  track: UpNextTrack
  phase: 'enter' | 'leave'
}

/**
 * Immersive "Up next" banner for the fullscreen desktop lyrics view. It slides
 * and bounces down from the top-centre when the current song nears its end,
 * and bounces back up out of view right before the next track starts.
 */
export function LyricsUpNext({
  track,
  remaining,
  live,
  enabled,
}: LyricsUpNextProps) {
  const shouldShow =
    enabled &&
    live &&
    Boolean(track) &&
    Number.isFinite(remaining) &&
    remaining <= SHOW_WITHIN_S &&
    remaining > LEAVE_BEFORE_S

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
      setRender({ track: current, phase: 'enter' })
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
  // Bar fills as the song winds down toward the next track.
  const span = SHOW_WITHIN_S - LEAVE_BEFORE_S
  const progress = Math.min(
    100,
    Math.max(0, ((SHOW_WITHIN_S - remaining) / span) * 100),
  )

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-3 z-30 flex justify-center px-4 sm:top-5"
      aria-live="polite"
    >
      <div
        className={`ytmq-upnext relative flex w-full max-w-sm items-center gap-3 overflow-hidden rounded-2xl border px-3.5 py-3 ${
          phase === 'leave' ? 'is-leaving' : ''
        }`}
        style={{
          borderColor: 'var(--np-accent-border)',
          background:
            'linear-gradient(135deg, rgba(24,24,27,.82), rgba(39,39,42,.78))',
        }}
      >
        {shown.thumbnailUrl ? (
          <img
            src={shown.thumbnailUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="h-12 w-12 shrink-0 rounded-lg object-cover shadow-lg ring-1 ring-white/15"
          />
        ) : (
          <div className="h-12 w-12 shrink-0 rounded-lg bg-zinc-800 ring-1 ring-white/10" />
        )}
        <div className="min-w-0 flex-1">
          <p
            className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em]"
            style={{ color: 'color-mix(in srgb, var(--np-accent-light) 86%, white)' }}
          >
            <span className="ytmq-upnext-dot" aria-hidden />
            Up next
          </p>
          <p className="truncate text-sm font-semibold text-white drop-shadow">
            {shown.title}
          </p>
          {shown.artist && (
            <p className="truncate text-xs text-zinc-300">{shown.artist}</p>
          )}
        </div>
        <div
          aria-hidden
          className="ytmq-upnext-bar absolute inset-x-0 bottom-0 h-[3px] origin-left"
          style={{ transform: `scaleX(${progress / 100})` }}
        />
      </div>
    </div>
  )
}
