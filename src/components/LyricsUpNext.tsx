import { useEffect, useRef, useState } from 'react'
import { holdDropSlot } from '../lib/dropSlot'
import { LiquidDrop } from './LiquidDrop'

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
 * "Up next" on the lyrics screen, as a drop of liquid that drips from the top
 * edge in the song's last stretch and snaps back up a second before the next
 * song starts.
 */
export function LyricsUpNext({ track, remaining, live, enabled }: LyricsUpNextProps) {
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

  const hanging = render !== null
  useEffect(() => (hanging ? holdDropSlot() : undefined), [hanging])

  if (!render) return null

  const { track: shown, phase } = render
  // The bar empties as the song runs out.
  const span = SHOW_WITHIN_S - LEAVE_BEFORE_S
  const progress = Math.min(1, Math.max(0, (SHOW_WITHIN_S - remaining) / span))

  return <LiquidDrop label="Up next" track={shown} leaving={phase === 'leave'} progress={progress} />
}
