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

export function playbackChannelName(roomId: string) {
  return `ytmq-playback:${roomId}`
}

export type PlaybackAction = 'next' | 'prev' | 'play' | 'pause' | 'toggle'
