import { useCallback, useEffect, useState } from 'react'
import {
  addTrackToQueue,
  fetchQueueItems,
  moveQueueItem,
  removeQueueItem,
  type AddTrackInput,
  type QueueItem,
} from '../lib/queue'
import { supabase } from '../lib/supabase'

export function useQueue(roomId: string) {
  const [items, setItems] = useState<QueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const next = await fetchQueueItems(roomId)
    setItems(next)
  }, [roomId])

  useEffect(() => {
    let cancelled = false

    void fetchQueueItems(roomId)
      .then((next) => {
        if (!cancelled) setItems(next)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load queue')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    const channel = supabase
      .channel(`queue:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'queue_items',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          void fetchQueueItems(roomId)
            .then((next) => {
              if (!cancelled) setItems(next)
            })
            .catch((err: unknown) => {
              if (!cancelled) {
                setError(
                  err instanceof Error ? err.message : 'Queue sync failed',
                )
              }
            })
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [roomId])

  const addTrack = useCallback(
    async (track: AddTrackInput) => {
      setError(null)
      try {
        await addTrackToQueue(roomId, track)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Could not add track')
        throw err
      }
    },
    [roomId],
  )

  const removeItem = useCallback(
    async (itemId: string) => {
      setBusyId(itemId)
      setError(null)
      try {
        await removeQueueItem(itemId, roomId)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Could not remove track')
      } finally {
        setBusyId(null)
      }
    },
    [roomId],
  )

  const moveItem = useCallback(
    async (itemId: string, direction: 'up' | 'down') => {
      setBusyId(itemId)
      setError(null)
      try {
        await moveQueueItem(items, itemId, direction)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Could not reorder queue')
      } finally {
        setBusyId(null)
      }
    },
    [roomId, items],
  )

  return {
    items,
    loading,
    error,
    busyId,
    addTrack,
    removeItem,
    moveItem,
    refresh,
  }
}
