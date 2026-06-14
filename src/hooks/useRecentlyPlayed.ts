import { useEffect, useState } from 'react'
import {
  getRecentlyPlayed,
  subscribeRecentlyPlayed,
  type PlayedTrack,
} from '../lib/recentlyPlayed'

/**
 * Reactive view of the room's recently played history. Re-renders when new
 * tracks are recorded (same tab) or written by another tab, and ticks every
 * 30s so the "x ago" labels stay fresh.
 */
export function useRecentlyPlayed(roomId: string): PlayedTrack[] {
  const [items, setItems] = useState<PlayedTrack[]>(() =>
    roomId ? getRecentlyPlayed(roomId) : [],
  )

  useEffect(() => {
    if (!roomId) return

    const refresh = () => setItems(getRecentlyPlayed(roomId))
    refresh()

    const unsubscribe = subscribeRecentlyPlayed(roomId, refresh)
    const onStorage = (e: StorageEvent) => {
      if (e.key === `ytmq_recent_${roomId}`) refresh()
    }
    window.addEventListener('storage', onStorage)

    // Re-render periodically so relative timestamps update without new data.
    const tick = window.setInterval(() => {
      setItems((prev) => (prev.length ? [...prev] : prev))
    }, 30_000)

    return () => {
      unsubscribe()
      window.removeEventListener('storage', onStorage)
      window.clearInterval(tick)
    }
  }, [roomId])

  return items
}
