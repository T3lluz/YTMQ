/**
 * One liquid drop at a time: the lyrics "Up next" holds the slot while it
 * hangs, and the "Queued in Spotify" drop waits for it (or leaves early).
 */
let holders = 0
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

/** Take the slot; call the returned function to give it back. */
export function holdDropSlot(): () => void {
  holders += 1
  emit()
  let released = false
  return () => {
    if (released) return
    released = true
    holders -= 1
    emit()
  }
}

export function isDropSlotTaken(): boolean {
  return holders > 0
}

export function subscribeDropSlot(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
