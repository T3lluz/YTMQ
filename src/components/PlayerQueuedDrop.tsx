import { useEffect, useState, type CSSProperties } from 'react'
import { useImagePalette } from '../hooks/useImagePalette'
import { isDropSlotTaken, subscribeDropSlot } from '../lib/dropSlot'
import { paletteCssVars } from '../lib/imagePalette'
import { SOURCE_LABEL, type NowPlayingSource, type QueuedOnPlayer } from '../lib/playback'
import { subscribeNowPlaying } from '../lib/playbackChannel'
import { LiquidDrop } from './LiquidDrop'

const SHOW_MS = 4_200
const LEAVE_DURATION_MS = 760
/** A song that waited this long behind "Up next" is old news. */
const STALE_MS = 20_000

type Pending = QueuedOnPlayer & { source: NowPlayingSource; receivedAt: number }
type Shown = { item: Pending; leaving: boolean }

// Shared across remounts, so a song is announced once per tab.
const seen = new Set<string>()
const primedRooms = new Set<string>()

/**
 * "Queued in Spotify": when someone puts a song in the player's own queue
 * (in the Spotify app, not through YTMQ), it drips from the top of the screen
 * like the lyrics "Up next" does, then snaps back up. Only the room's active
 * player's snapshots reach here, and it waits while "Up next" is hanging.
 */
export function PlayerQueuedDrop({ roomId }: { roomId: string }) {
  const [shown, setShown] = useState<Shown | null>(null)

  useEffect(() => {
    if (!roomId) return
    let pending: Pending[] = []
    let current: Shown | null = null
    let timer = 0

    const show = (next: Shown | null) => {
      current = next
      setShown(next)
    }

    const leave = () => {
      if (!current || current.leaving) return
      window.clearTimeout(timer)
      show({ ...current, leaving: true })
      timer = window.setTimeout(() => {
        show(null)
        pump()
      }, LEAVE_DURATION_MS)
    }

    const pump = () => {
      if (current || isDropSlotTaken()) return
      const now = Date.now()
      pending = pending.filter((p) => now - p.receivedAt < STALE_MS)
      const item = pending.shift()
      if (!item) return
      show({ item, leaving: false })
      timer = window.setTimeout(leave, SHOW_MS)
    }

    const unsubscribeSlot = subscribeDropSlot(() => {
      // "Up next" wins the slot: pull this one back up early.
      if (isDropSlotTaken()) leave()
      else pump()
    })

    const unsubscribePlayback = subscribeNowPlaying(roomId, (np) => {
      const fresh = (np.queued ?? []).filter((entry) => !seen.has(entry.id))
      for (const entry of fresh) seen.add(entry.id)
      // Whatever is in the first snapshot this tab sees was queued before
      // it was here: take note, don't announce.
      if (!primedRooms.has(roomId)) {
        primedRooms.add(roomId)
        return
      }
      if (fresh.length === 0) return
      const now = Date.now()
      const source = np.source ?? 'ytm'
      pending.push(...fresh.map((entry) => ({ ...entry, source, receivedAt: now })))
      pump()
    })

    return () => {
      unsubscribeSlot()
      unsubscribePlayback()
      window.clearTimeout(timer)
      setShown(null)
    }
  }, [roomId])

  const { palette } = useImagePalette(shown?.item.track.thumbnailUrl || undefined)
  if (!shown) return null

  return (
    <div style={paletteCssVars(palette) as CSSProperties}>
      <LiquidDrop
        key={shown.item.id}
        label={`Queued in ${SOURCE_LABEL[shown.item.source]}`}
        track={shown.item.track}
        leaving={shown.leaving}
        barMs={SHOW_MS}
        className="fixed z-[70]"
      />
    </div>
  )
}
