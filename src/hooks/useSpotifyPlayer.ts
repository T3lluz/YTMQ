import { useEffect, useState } from 'react'
import {
  isSpotifyLinked,
  subscribeSpotifyAuth,
} from '../lib/spotifyAuth'
import {
  startSpotifyPlayer,
  type SpotifyPlayerStatus,
} from '../lib/spotifyPlayer'

const IDLE: SpotifyPlayerStatus = { state: 'idle' }

export function useSpotifyPlayer(roomId: string, enabled: boolean) {
  const [linked, setLinked] = useState(() => isSpotifyLinked())
  const [liveStatus, setLiveStatus] = useState<SpotifyPlayerStatus>(IDLE)
  const active = Boolean(enabled && linked && roomId)

  useEffect(() => {
    return subscribeSpotifyAuth(() => setLinked(isSpotifyLinked()))
  }, [])

  useEffect(() => {
    if (!active || !roomId) return

    const stop = startSpotifyPlayer({
      roomId,
      onStatus: setLiveStatus,
    })
    return stop
  }, [active, roomId])

  return { linked, status: active ? liveStatus : IDLE }
}
