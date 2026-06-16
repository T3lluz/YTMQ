import { useEffect, useState } from 'react'
import {
  playbackChannelName,
  type NowPlaying,
  type PlaybackState,
} from '../lib/playback'
import { recordPlayed } from '../lib/recentlyPlayed'
import { supabase } from '../lib/supabase'

const STALE_MS = 15_000

// Remember the most recent track per room so a freshly-mounted consumer (e.g.
// switching to the Lyrics tab) can render the current song immediately instead
// of waiting up to ~2s for the next broadcast from the bridge.
const lastNowPlaying = new Map<string, NowPlaying>()

export function useNowPlaying(roomId: string) {
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(
    () => lastNowPlaying.get(roomId) ?? null,
  )
  const [connected, setConnected] = useState(() => lastNowPlaying.has(roomId))
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 5_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    let cancelled = false

    const channel = supabase
      .channel(playbackChannelName(roomId))
      .on('broadcast', { event: 'now_playing' }, ({ payload }) => {
        if (cancelled || !payload || typeof payload !== 'object') return
        const p = payload as Partial<NowPlaying> & { state?: PlaybackState }
        if (!p.videoId || !p.title) return
        recordPlayed(roomId, {
          videoId: p.videoId,
          title: p.title,
          artist: p.artist ?? '',
        })
        const next: NowPlaying = {
          videoId: p.videoId,
          title: p.title,
          artist: p.artist ?? '',
          updatedAt: p.updatedAt ?? Date.now(),
          currentTime:
            typeof p.currentTime === 'number' && Number.isFinite(p.currentTime)
              ? p.currentTime
              : undefined,
          duration:
            typeof p.duration === 'number' &&
            Number.isFinite(p.duration) &&
            p.duration > 0
              ? p.duration
              : undefined,
          state: p.state,
        }
        lastNowPlaying.set(roomId, next)
        setNowPlaying(next)
        setConnected(true)
      })
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [roomId])

  const stale = !nowPlaying || now - nowPlaying.updatedAt > STALE_MS

  return { nowPlaying, connected, stale }
}
