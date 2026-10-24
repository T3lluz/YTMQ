import { useCallback, useEffect, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { useImagePalette } from '../hooks/useImagePalette'
import { paletteCssVars } from '../lib/imagePalette'
import { SOURCE_LABEL } from '../lib/playback'
import {
  addQueuedDropHost,
  getQueuedDrop,
  getQueuedDropHost,
  QUEUED_SHOW_MS,
  subscribeQueuedDrops,
} from '../lib/queuedDrops'
import { LiquidDrop } from './LiquidDrop'

type PlayerQueuedDropProps = {
  roomId: string
  /**
   * 'page' hangs from the top of the screen; 'lyrics' from the lyrics screen,
   * which can be native fullscreen where nothing else is painted. While a
   * lyrics screen is open, it shows the drop and the page does not.
   */
  placement: 'page' | 'lyrics'
}

/**
 * "Queued in Spotify": when someone puts a song in the player's own queue
 * (in the Spotify app, not through YTMQ), it drips down like the lyrics
 * "Up next" does, then snaps back up. Only the room's active player's
 * snapshots reach here, and it waits while "Up next" is hanging.
 */
export function PlayerQueuedDrop({ roomId, placement }: PlayerQueuedDropProps) {
  const [host] = useState(() => Symbol('lyrics'))
  useEffect(() => (placement === 'lyrics' ? addQueuedDropHost(host) : undefined), [placement, host])

  const subscribe = useCallback((listener: () => void) => subscribeQueuedDrops(roomId, listener), [roomId])
  const shown = useSyncExternalStore(subscribe, () => getQueuedDrop(roomId), () => null)
  const activeHost = useSyncExternalStore(subscribe, getQueuedDropHost, () => null)
  const mine = placement === 'lyrics' ? activeHost === host : activeHost === null

  const { palette } = useImagePalette(mine ? shown?.item.track.thumbnailUrl || undefined : undefined)
  if (!shown || !mine || !roomId) return null

  return (
    <div style={paletteCssVars(palette) as CSSProperties}>
      <LiquidDrop
        key={shown.item.id}
        label={`Queued in ${SOURCE_LABEL[shown.item.source]}`}
        track={shown.item.track}
        leaving={shown.leaving}
        barMs={QUEUED_SHOW_MS}
        className={placement === 'lyrics' ? 'absolute z-30' : 'fixed z-[70]'}
      />
    </div>
  )
}
