import { useEffect, useRef, useState } from 'react'
import { getOrStartPlaybackSince } from '../lib/playbackSession'
import type { QueueItem } from '../lib/queue'
import {
  isSpotifyLinked,
  subscribeSpotifyAuth,
} from '../lib/spotifyAuth'
import {
  startSpotifyPlayer,
  type SpotifyPlayerStatus,
} from '../lib/spotifyPlayer'

const IDLE: SpotifyPlayerStatus = { state: 'idle' }

export function useSpotifyPlayer(
  roomId: string,
  enabled: boolean,
  queueItems: QueueItem[],
) {
  const [linked, setLinked] = useState(() => isSpotifyLinked())
  const [liveStatus, setLiveStatus] = useState<SpotifyPlayerStatus>(IDLE)
  const itemsRef = useRef(queueItems)
  const active = Boolean(enabled && linked && roomId)

  useEffect(() => {
    itemsRef.current = queueItems
  }, [queueItems])

  useEffect(() => {
    return subscribeSpotifyAuth(() => setLinked(isSpotifyLinked()))
  }, [])

  useEffect(() => {
    if (!active || !roomId) return

    const stop = startSpotifyPlayer({
      roomId,
      getQueueItems: () => itemsRef.current,
      getPlaybackSince: () => getOrStartPlaybackSince(roomId),
      onStatus: setLiveStatus,
    })
    return stop
  }, [active, roomId])

  return { linked, status: active ? liveStatus : IDLE }
}
