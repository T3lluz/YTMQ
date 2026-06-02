import { useCallback, useEffect, useState } from 'react'
import {
  addTrackToQueue,
  fetchQueueItems,
  removeQueueItem,
  type AddTrackInput,
  type QueueItem,
} from '../lib/queue'
import { supabase } from '../lib/supabase'

function sortByPosition(items: QueueItem[]) {
  return [...items].sort((a, b) => a.position - b.position)
}

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
          event: 'INSERT',
          schema: 'public',
          table: 'queue_items',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const row = payload.new as QueueItem | null
          if (!row?.id) return
          setItems((prev) =>
            sortByPosition([...prev.filter((item) => item.id !== row.id), row]),
          )
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'queue_items',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const old = payload.old as Pick<QueueItem, 'id'> | null
          if (!old?.id) {
            void fetchQueueItems(roomId)
              .then((next) => {
                if (!cancelled) setItems(next)
              })
              .catch(() => {})
            return
          }
          setItems((prev) => prev.filter((item) => item.id !== old.id))
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
        const item = await addTrackToQueue(roomId, track)
        setItems((prev) =>
          sortByPosition([...prev.filter((row) => row.id !== item.id), item]),
        )
        return item
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
      setItems((prev) => prev.filter((item) => item.id !== itemId))
      try {
        await removeQueueItem(itemId)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Could not remove track')
        void refresh()
      } finally {
        setBusyId(null)
      }
    },
    [refresh],
  )

  return {
    items,
    loading,
    error,
    busyId,
    addTrack,
    removeItem,
    refresh,
  }
}
