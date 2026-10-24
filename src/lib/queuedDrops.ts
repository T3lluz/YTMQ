/**
 * The "Queued in Spotify" drops for a room: which one hangs right now, and
 * where it hangs. The page shows it at the top of the screen, but the lyrics
 * screen can go native fullscreen, where only it is painted, so while lyrics
 * are open the drop hangs from the lyrics screen instead.
 */
import { isDropSlotTaken, subscribeDropSlot } from './dropSlot'
import type { NowPlayingSource, QueuedOnPlayer } from './playback'
import { subscribeNowPlaying } from './playbackChannel'

export const QUEUED_SHOW_MS = 4_200
const LEAVE_DURATION_MS = 760
/** A song that waited this long behind "Up next" is old news. */
const STALE_MS = 20_000

export type QueuedDrop = QueuedOnPlayer & { source: NowPlayingSource; receivedAt: number }
export type ShownQueuedDrop = { item: QueuedDrop; leaving: boolean }

type RoomDrops = {
  shown: ShownQueuedDrop | null
  consumers: number
  stop: () => void
}

const rooms = new Map<string, RoomDrops>()
const listeners = new Set<() => void>()
// Shared across remounts, so a song is announced once per tab.
const seen = new Set<string>()
const primedRooms = new Set<string>()
// Lyrics screens that are open, newest last; the newest one shows the drop.
const hosts: symbol[] = []

function emit() {
  for (const listener of listeners) listener()
}

function startRoom(roomId: string): RoomDrops {
  const room: RoomDrops = { shown: null, consumers: 0, stop: () => {} }
  let pending: QueuedDrop[] = []
  let timer = 0

  const show = (next: ShownQueuedDrop | null) => {
    room.shown = next
    emit()
  }

  const leave = () => {
    if (!room.shown || room.shown.leaving) return
    window.clearTimeout(timer)
    show({ ...room.shown, leaving: true })
    timer = window.setTimeout(() => {
      show(null)
      pump()
    }, LEAVE_DURATION_MS)
  }

  const pump = () => {
    if (room.shown || isDropSlotTaken()) return
    const now = Date.now()
    pending = pending.filter((p) => now - p.receivedAt < STALE_MS)
    const item = pending.shift()
    if (!item) return
    show({ item, leaving: false })
    timer = window.setTimeout(leave, QUEUED_SHOW_MS)
  }

  const unsubscribeSlot = subscribeDropSlot(() => {
    // "Up next" wins the slot: pull this one back up early.
    if (isDropSlotTaken()) leave()
    else pump()
  })

  const unsubscribePlayback = subscribeNowPlaying(roomId, (np) => {
    const fresh = (np.queued ?? []).filter((entry) => !seen.has(entry.id))
    for (const entry of fresh) seen.add(entry.id)
    // Whatever is in the first snapshot this tab sees was queued before it
    // was here: take note, don't announce.
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

  room.stop = () => {
    unsubscribeSlot()
    unsubscribePlayback()
    window.clearTimeout(timer)
  }
  return room
}

/** Keeps the room's drops running while subscribed. */
export function subscribeQueuedDrops(roomId: string, listener: () => void): () => void {
  listeners.add(listener)
  if (!roomId) return () => listeners.delete(listener)
  let room = rooms.get(roomId)
  if (!room) {
    room = startRoom(roomId)
    rooms.set(roomId, room)
  }
  room.consumers += 1
  const held = room
  return () => {
    listeners.delete(listener)
    held.consumers -= 1
    if (held.consumers > 0) return
    held.stop()
    if (rooms.get(roomId) === held) rooms.delete(roomId)
  }
}

export function getQueuedDrop(roomId: string): ShownQueuedDrop | null {
  return rooms.get(roomId)?.shown ?? null
}

/** A lyrics screen opened; it shows the drop until the returned function runs. */
export function addQueuedDropHost(host: symbol): () => void {
  hosts.push(host)
  emit()
  return () => {
    const at = hosts.indexOf(host)
    if (at >= 0) hosts.splice(at, 1)
    emit()
  }
}

/** The lyrics screen showing drops, or null for the page. */
export function getQueuedDropHost(): symbol | null {
  return hosts[hosts.length - 1] ?? null
}
