import { useEffect, useState } from 'react'
import type { NowPlaying } from '../lib/playback'
import {
  getCachedNowPlaying,
  getPlaybackLastReceivedAt,
  PLAYBACK_STALE_MS,
  subscribeNowPlaying,
} from '../lib/playbackChannel'

export function useNowPlaying(roomId: string) {
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(
    () => getCachedNowPlaying(roomId),
  )
  const [lastReceivedAt, setLastReceivedAt] = useState(
    () => getPlaybackLastReceivedAt(roomId),
  )
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 2_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    return subscribeNowPlaying(roomId, (next) => {
      setNowPlaying(next)
      setLastReceivedAt(Date.now())
    })
  }, [roomId])

  const receivedAt = lastReceivedAt || nowPlaying?.updatedAt || 0
  const connected = receivedAt > 0
  const stale = !nowPlaying || now - receivedAt > PLAYBACK_STALE_MS

  return { nowPlaying, connected, stale }
}
