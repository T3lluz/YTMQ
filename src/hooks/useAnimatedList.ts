import { useEffect, useRef, useState } from 'react'

export type AnimatedEntry<T> = {
  key: string
  item: T
  leaving: boolean
}

/**
 * Keeps a list rendered through enter/exit animations. Items removed from
 * `items` stay mounted (flagged `leaving`) for `exitMs` so a CSS exit
 * animation can play before they unmount. New items mount immediately and are
 * expected to play an entrance animation via CSS on mount.
 */
export function useAnimatedList<T>(
  items: T[],
  getKey: (item: T) => string,
  exitMs = 340,
): AnimatedEntry<T>[] {
  // Keep getKey in a ref so an inline callback at the call site doesn't make
  // the effect re-run (and loop) on every render.
  const getKeyRef = useRef(getKey)
  getKeyRef.current = getKey

  const [entries, setEntries] = useState<AnimatedEntry<T>[]>(() =>
    items.map((item) => ({ key: getKey(item), item, leaving: false })),
  )
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const key = getKeyRef.current
    const nextKeys = new Set(items.map(key))

    setEntries((prev) => {
      const prevByKey = new Map(prev.map((entry) => [entry.key, entry]))
      const result: AnimatedEntry<T>[] = []

      // Present items, in their desired order.
      for (const item of items) {
        const itemKey = key(item)
        const existing = prevByKey.get(itemKey)
        if (existing?.leaving) {
          // Re-added while leaving — cancel the scheduled removal.
          const timer = timers.current.get(itemKey)
          if (timer) {
            clearTimeout(timer)
            timers.current.delete(itemKey)
          }
        }
        result.push({ key: itemKey, item, leaving: false })
      }

      // Re-insert items that just left, near their previous position, so they
      // can collapse out in place.
      prev.forEach((entry, index) => {
        if (nextKeys.has(entry.key)) return
        if (!timers.current.has(entry.key)) {
          const timer = setTimeout(() => {
            timers.current.delete(entry.key)
            setEntries((current) =>
              current.filter((candidate) => candidate.key !== entry.key),
            )
          }, exitMs)
          timers.current.set(entry.key, timer)
        }
        const insertAt = Math.min(index, result.length)
        result.splice(insertAt, 0, { ...entry, leaving: true })
      })

      return result
    })
  }, [items, exitMs])

  useEffect(() => {
    const map = timers.current
    return () => {
      map.forEach((timer) => clearTimeout(timer))
      map.clear()
    }
  }, [])

  return entries
}
