import { useCallback, useRef, useState } from 'react'
import type { AddTrackInput, QueueInsertMode } from '../lib/queue'

export type QueueAdder = {
  /** Video ids being added right now. */
  pending: ReadonlySet<string>
  /** Video ids added a moment ago, for the check mark. */
  added: ReadonlyMap<string, QueueInsertMode>
  canAdd: boolean
  add: (input: AddTrackInput) => Promise<boolean>
  /** Add several in order (an album, a playlist). Returns how many made it. */
  addMany: (inputs: AddTrackInput[]) => Promise<number>
}

/**
 * Adding to the shared queue from anywhere (search, an album, the history),
 * with per-song pending and "just added" state.
 */
export function useQueueAdder({
  canAdd,
  onAdd,
  onAdded,
}: {
  canAdd: boolean
  onAdd: (track: AddTrackInput, mode: QueueInsertMode) => Promise<void>
  onAdded?: (title: string, mode: QueueInsertMode, count?: number) => void
}): QueueAdder {
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())
  const [added, setAdded] = useState<ReadonlyMap<string, QueueInsertMode>>(new Map())
  const timers = useRef(new Map<string, number>())

  const markAdded = useCallback((id: string, mode: QueueInsertMode) => {
    setAdded((prev) => new Map(prev).set(id, mode))
    window.clearTimeout(timers.current.get(id))
    timers.current.set(
      id,
      window.setTimeout(() => {
        setAdded((prev) => {
          const next = new Map(prev)
          next.delete(id)
          return next
        })
      }, 2400),
    )
  }, [])

  const run = useCallback(
    async (input: AddTrackInput): Promise<boolean> => {
      const id = input.video_id
      const mode = input.insert_mode ?? 'queue'
      setPending((prev) => new Set(prev).add(id))
      try {
        await onAdd(input, mode)
        markAdded(id, mode)
        return true
      } catch {
        // useQueue surfaces the error as a toast.
        return false
      } finally {
        setPending((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }
    },
    [onAdd, markAdded],
  )

  const add = useCallback(
    async (input: AddTrackInput) => {
      if (!canAdd) return false
      const ok = await run(input)
      if (ok) onAdded?.(input.title, input.insert_mode ?? 'queue')
      return ok
    },
    [canAdd, run, onAdded],
  )

  const addMany = useCallback(
    async (inputs: AddTrackInput[]) => {
      if (!canAdd || inputs.length === 0) return 0
      // Play next lands above the queue's top, so a block of play-next songs
      // goes in back to front to keep its order.
      const ordered = inputs[0]?.insert_mode === 'play_next' ? [...inputs].reverse() : inputs
      let count = 0
      for (const input of ordered) {
        if (await run(input)) count += 1
      }
      if (count > 0) onAdded?.(inputs[0]!.title, inputs[0]!.insert_mode ?? 'queue', count)
      return count
    },
    [canAdd, run, onAdded],
  )

  return { pending, added, canAdd, add, addMany }
}
