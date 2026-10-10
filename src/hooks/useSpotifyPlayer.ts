import { useEffect, useRef, useState } from 'react'
import { isSpotifyLinked, subscribeSpotifyAuth } from '../lib/spotifyAuth'
import { startSpotifyPlayer, type SpotifyPlayerStatus } from '../lib/spotifyPlayer'
import type { QueueItem } from '../lib/queue'

const IDLE: SpotifyPlayerStatus = { state: 'idle' }

type Options = {
  roomId: string
  /** Only the host's tab runs the Spotify player. */
  hostToken: string | null
  queue: QueueItem[]
  onNotice?: (message: string) => void
}

export function useSpotifyPlayer({ roomId, hostToken, queue, onNotice }: Options) {
  const [linked, setLinked] = useState(() => isSpotifyLinked())
  const [liveStatus, setLiveStatus] = useState<SpotifyPlayerStatus>(IDLE)
  const active = Boolean(hostToken && linked && roomId)

  // The player reads the queue and reports through refs, so a queue change
  // never restarts it.
  const queueRef = useRef(queue)
  const noticeRef = useRef(onNotice)
  useEffect(() => {
    queueRef.current = queue
    noticeRef.current = onNotice
  })

  useEffect(() => {
    return subscribeSpotifyAuth(() => setLinked(isSpotifyLinked()))
  }, [])

  useEffect(() => {
    if (!active || !roomId) return
    return startSpotifyPlayer({
      roomId,
      hostToken,
      getQueue: () => queueRef.current,
      onStatus: setLiveStatus,
      onNotice: (message) => noticeRef.current?.(message),
    })
  }, [active, roomId, hostToken])

  return { linked, status: active ? liveStatus : IDLE }
}
