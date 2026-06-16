import { useEffect, useState } from 'react'

type PositionSource = {
  /** Seconds into the track when this update was published. */
  currentTime?: number
  /** Track length in seconds, when known. */
  duration?: number
  /** Epoch ms when the bridge published the update. */
  updatedAt: number
  videoId: string
} | null

/**
 * Smoothly interpolated playback position (seconds).
 *
 * The bridge only broadcasts every ~2s, so we extrapolate from the last known
 * `currentTime` plus the wall-clock elapsed time while `live`, clamped to the
 * track duration. When not live we report the last reported position.
 */
export function usePlaybackPosition(
  source: PositionSource,
  live: boolean,
): number {
  const [position, setPosition] = useState(() => source?.currentTime ?? 0)

  useEffect(() => {
    if (!source || !live) return

    const compute = () => {
      const base = source.currentTime ?? 0
      const elapsed = (Date.now() - source.updatedAt) / 1000
      let next = base + elapsed
      if (source.duration != null && source.duration > 0) {
        next = Math.min(next, source.duration)
      }
      setPosition(next)
    }

    const immediate = window.setTimeout(compute, 0)
    const id = window.setInterval(compute, 250)
    return () => {
      window.clearTimeout(immediate)
      window.clearInterval(id)
    }
  }, [
    source?.videoId,
    source?.currentTime,
    source?.duration,
    source?.updatedAt,
    live,
    source,
  ])

  if (!source) return 0
  if (!live) return source.currentTime ?? 0
  return position
}
