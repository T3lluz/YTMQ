import { useEffect, useState } from 'react'
import {
  playbackChannelName,
  type NowPlaying,
  type PlaybackState,
} from '../lib/playback'
import { supabase } from '../lib/supabase'

const STALE_MS = 15_000

export function useNowPlaying(roomId: string) {
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    let cancelled = false

    const channel = supabase
      .channel(playbackChannelName(roomId))
      .on('broadcast', { event: 'now_playing' }, ({ payload }) => {
        if (cancelled || !payload || typeof payload !== 'object') return
        const p = payload as Partial<NowPlaying> & { state?: PlaybackState }
        if (!p.videoId || !p.title) return
        setNowPlaying({
          videoId: p.videoId,
          title: p.title,
          artist: p.artist ?? '',
          updatedAt: p.updatedAt ?? Date.now(),
          currentTime:
            typeof p.currentTime === 'number' && Number.isFinite(p.currentTime)
              ? p.currentTime
              : undefined,
          state: p.state,
        })
        setConnected(true)
      })
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [roomId])

  const stale =
    !nowPlaying || Date.now() - nowPlaying.updatedAt > STALE_MS

  return { nowPlaying, connected, stale }
}
