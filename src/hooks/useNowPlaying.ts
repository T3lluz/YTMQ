import { useEffect, useState } from 'react'
import {
  playbackChannelName,
  type NowPlaying,
} from '../lib/playback'
import { supabase } from '../lib/supabase'

const STALE_MS = 12_000

export function useNowPlaying(roomId: string) {
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    let cancelled = false

    const channel = supabase
      .channel(playbackChannelName(roomId))
      .on('broadcast', { event: 'now_playing' }, ({ payload }) => {
        if (cancelled || !payload || typeof payload !== 'object') return
        const p = payload as Partial<NowPlaying>
        if (!p.videoId || !p.title) return
        setNowPlaying({
          videoId: p.videoId,
          title: p.title,
          artist: p.artist ?? '',
          updatedAt: p.updatedAt ?? Date.now(),
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

  return { nowPlaying, connected: connected && !stale, stale }
}
