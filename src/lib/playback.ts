export type PlaybackState = 'playing' | 'paused' | 'unknown'

/** The track YouTube Music will play after the current one. */
export type NowPlayingNextUp = {
  videoId: string
  title: string
  artist: string
  thumbnailUrl: string
}

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
  /** Host player volume, 0–100 (0 reflects a muted player). */
  volume?: number
  /**
   * YouTube Music's own next-up track, read from its live queue by the bridge.
   * Lets the lyrics "Up next" banner work even when the app's shared queue is
   * empty (e.g. playing an album/radio directly in YT Music).
   */
  nextUp?: NowPlayingNextUp
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

export type PlaybackAction =
  | 'next'
  | 'prev'
  | 'play'
  | 'pause'
  | 'toggle'
  | 'seek'
  | 'volume'
