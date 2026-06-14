export type PlaybackState = 'playing' | 'paused' | 'unknown'

export type NowPlaying = {
  videoId: string
  title: string
  artist: string
  updatedAt: number
  /** Seconds into the current track when the bridge published this update. */
  currentTime?: number
  /** Total track length in seconds, when known. */
  duration?: number
  state?: PlaybackState
}

/** Formats seconds as m:ss for playback UI. */
export function formatPlaybackTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(total / 60)
  const secs = total % 60
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

/** Parses m:ss or h:mm:ss labels from the YT Music player bar. */
export function parsePlaybackTimeLabel(label: string): number | null {
  const trimmed = label.trim()
  if (!trimmed) return null

  const parts = trimmed.split(':').map((part) => Number.parseInt(part, 10))
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return null

  if (parts.length === 2) {
    return parts[0]! * 60 + parts[1]!
  }
  if (parts.length === 3) {
    return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!
  }

  return null
}

export function playbackChannelName(roomId: string) {
  return `ytmq-playback:${roomId}`
}

export type PlaybackAction = 'next' | 'prev' | 'play' | 'pause' | 'toggle'
