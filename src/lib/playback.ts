export type NowPlaying = {
  videoId: string
  title: string
  artist: string
  updatedAt: number
}

export function playbackChannelName(roomId: string) {
  return `ytmq-playback:${roomId}`
}
