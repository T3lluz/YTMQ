export type PlaybackState = 'playing' | 'paused' | 'unknown'

export type NowPlaying = {
  videoId: string
  title: string
  artist: string
  updatedAt: number
  /** Seconds into the current track when the bridge published this update. */
  currentTime?: number
  state?: PlaybackState
}

export function playbackChannelName(roomId: string) {
  return `ytmq-playback:${roomId}`
}

export type PlaybackAction = 'next' | 'prev' | 'play' | 'pause' | 'toggle'
