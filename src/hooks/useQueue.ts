import { useCallback, useEffect, useState } from 'react'
import {
  addTrackToQueue,
  fetchQueueItems,
  removeQueueItem,
  type AddTrackInput,
  type QueueInsertMode,
  type QueueItem,
} from '../lib/queue'
import { notifyBridgeQueueRemove } from '../lib/bridgeChannel'
import { ytmq } from '../lib/api'

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
    let joinedOnce = false

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

    const channel = ytmq
      .channel(`queue:${roomId}`)
      .on<QueueItem>(
        'changes',
        { event: 'INSERT', table: 'queue_items', roomId },
        (payload) => {
          const row = payload.new
          if (!row?.id) return
          setItems((prev) =>
            sortByPosition([...prev.filter((item) => item.id !== row.id), row]),
          )
        },
      )
      .on<QueueItem>(
        'changes',
        { event: 'DELETE', table: 'queue_items', roomId },
        (payload) => {
          const old = payload.old
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
      .subscribe((status) => {
        // Changes made while the socket was down were never sent; catch up.
        if (status === 'SUBSCRIBED' && joinedOnce) {
          void fetchQueueItems(roomId)
            .then((next) => {
              if (!cancelled) setItems(next)
            })
            .catch(() => {})
        }
        if (status === 'SUBSCRIBED') joinedOnce = true
      })

    return () => {
      cancelled = true
      void ytmq.removeChannel(channel)
    }
  }, [roomId])

  const addTrack = useCallback(
    async (track: AddTrackInput, mode: QueueInsertMode = 'play_next') => {
      setError(null)
      try {
        const item = await addTrackToQueue(roomId, {
          ...track,
          insert_mode: track.insert_mode ?? mode,
        })
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
      const target = items.find((item) => item.id === itemId)
      if (!target) return

      setBusyId(itemId)
      setError(null)
      setItems((prev) => prev.filter((item) => item.id !== itemId))
      try {
        notifyBridgeQueueRemove(roomId, {
          id: target.id,
          video_id: target.video_id,
          title: target.title,
        })
        await removeQueueItem(itemId)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Could not remove track')
        void refresh()
      } finally {
        setBusyId(null)
      }
    },
    [items, roomId, refresh],
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
