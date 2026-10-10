import type { RealtimeChannel } from './ytmqClient'
import {
  playbackChannelName,
  type NowPlaying,
  type NowPlayingSource,
  type PlaybackState,
} from './playback'
import { recordPlayed } from './recentlyPlayed'
import { ytmq } from './api'

const HEALTH_CHECK_MS = 5_000
/** ~4 missed bridge broadcasts before we try to rejoin the channel. */
const RECONNECT_AFTER_MS = 8_000
export const PLAYBACK_STALE_MS = 30_000
/** Both players publish every 2 s; a source quiet this long is gone. */
const SOURCE_FRESH_MS = 12_000

type Listener = (nowPlaying: NowPlaying) => void

type RoomPlayback = {
  channel: RealtimeChannel
  listeners: Set<Listener>
  lastReceivedAt: number
  subscribed: boolean
  reconnecting: boolean
  reconnectTimer?: number
}

const rooms = new Map<string, RoomPlayback>()
const lastNowPlaying = new Map<string, NowPlaying>()

/**
 * What each player last said, per room. YouTube Music (the bridge) and
 * Spotify (the host's tab) can both be linked; the one that is playing is
 * the room's player, and only it gets the controls.
 */
type SourceState = {
  np: NowPlaying
  receivedAt: number
  /** When this source last went from paused to playing. */
  playingSince: number
  /** When this source was last seen playing. */
  lastPlayingAt: number
}
const sourceStates = new Map<string, Map<NowPlayingSource, SourceState>>()
const sourceListeners = new Set<() => void>()

let healthInterval: number | undefined
let visibilityBound = false

function parseNowPlayingPayload(payload: unknown): NowPlaying | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Partial<NowPlaying> & { state?: PlaybackState }
  if (!p.videoId || !p.title) return null
  return {
    videoId: p.videoId,
    title: p.title,
    artist: p.artist ?? '',
    updatedAt: p.updatedAt ?? Date.now(),
    currentTime:
      typeof p.currentTime === 'number' && Number.isFinite(p.currentTime)
        ? p.currentTime
        : undefined,
    duration:
      typeof p.duration === 'number' &&
      Number.isFinite(p.duration) &&
      p.duration > 0
        ? p.duration
        : undefined,
    state: p.state,
    volume:
      typeof p.volume === 'number' && Number.isFinite(p.volume)
        ? Math.min(100, Math.max(0, p.volume))
        : undefined,
    nextUp:
      p.nextUp && typeof p.nextUp === 'object' && p.nextUp.videoId
        ? {
            videoId: p.nextUp.videoId,
            title: p.nextUp.title ?? '',
            artist: p.nextUp.artist ?? '',
            thumbnailUrl: p.nextUp.thumbnailUrl ?? '',
          }
        : undefined,
    // Bridges from before sources existed are YouTube Music.
    source: p.source === 'spotify' ? 'spotify' : 'ytm',
    thumbnailUrl:
      typeof p.thumbnailUrl === 'string' && p.thumbnailUrl
        ? p.thumbnailUrl
        : undefined,
    shuffle: typeof p.shuffle === 'boolean' ? p.shuffle : undefined,
    smartShuffle: typeof p.smartShuffle === 'boolean' ? p.smartShuffle : undefined,
    deviceName: typeof p.deviceName === 'string' ? p.deviceName : undefined,
  }
}

function trackSource(roomId: string, next: NowPlaying) {
  const source: NowPlayingSource = next.source ?? 'ytm'
  let states = sourceStates.get(roomId)
  if (!states) {
    states = new Map()
    sourceStates.set(roomId, states)
  }
  const now = Date.now()
  const prev = states.get(source)
  const playing = next.state === 'playing'
  const wasPlaying = prev?.np.state === 'playing' && now - prev.receivedAt < SOURCE_FRESH_MS
  states.set(source, {
    np: { ...next, source },
    receivedAt: now,
    playingSince: playing ? (wasPlaying ? prev!.playingSince : now) : prev?.playingSince ?? 0,
    lastPlayingAt: playing ? now : prev?.lastPlayingAt ?? 0,
  })
}

/**
 * The room's player right now: the one playing (the latest to start, if
 * both are), else the one that played last. Every phone runs the same rule
 * on the same broadcasts, so they agree.
 */
function pickActive(roomId: string): SourceState | null {
  const states = [...(sourceStates.get(roomId)?.values() ?? [])]
  if (states.length === 0) return null
  const now = Date.now()
  const fresh = states.filter((s) => now - s.receivedAt < SOURCE_FRESH_MS)
  const playing = fresh.filter((s) => s.np.state === 'playing')
  if (playing.length > 0) {
    return playing.sort((a, b) => b.playingSince - a.playingSince)[0]!
  }
  const pool = fresh.length > 0 ? fresh : states
  return pool.sort(
    (a, b) => b.lastPlayingAt - a.lastPlayingAt || b.receivedAt - a.receivedAt,
  )[0]!
}

/** Which player the room's controls go to, when one is known. */
export function getActiveSource(roomId: string): NowPlayingSource | undefined {
  return pickActive(roomId)?.np.source
}

/** Every player that reported recently, for the Admin tab's status. */
export function getSourceSnapshots(roomId: string): Partial<Record<NowPlayingSource, NowPlaying & { fresh: boolean }>> {
  const out: Partial<Record<NowPlayingSource, NowPlaying & { fresh: boolean }>> = {}
  const now = Date.now()
  for (const [source, state] of sourceStates.get(roomId) ?? []) {
    out[source] = { ...state.np, fresh: now - state.receivedAt < SOURCE_FRESH_MS }
  }
  return out
}

export function subscribeSources(listener: () => void): () => void {
  sourceListeners.add(listener)
  return () => sourceListeners.delete(listener)
}

function applyNowPlaying(roomId: string, incoming: NowPlaying) {
  trackSource(roomId, incoming)
  for (const listener of sourceListeners) listener()
  const active = pickActive(roomId)
  if (!active) return
  const next = active.np
  recordPlayed(roomId, {
    videoId: next.videoId,
    title: next.title,
    artist: next.artist,
    thumbnailUrl: next.thumbnailUrl,
  })
  lastNowPlaying.set(roomId, next)
  const room = rooms.get(roomId)
  if (room) {
    room.lastReceivedAt = Date.now()
    room.reconnecting = false
  }
  notifyListeners(roomId)
}

function notifyListeners(roomId: string) {
  const next = lastNowPlaying.get(roomId)
  if (!next) return
  const room = rooms.get(roomId)
  if (!room) return
  for (const listener of room.listeners) {
    listener(next)
  }
}

function ensureHealthCheck() {
  if (healthInterval !== undefined) return
  healthInterval = window.setInterval(() => {
    const now = Date.now()
    for (const [roomId, room] of rooms) {
      if (room.listeners.size === 0) continue
      if (room.reconnecting) continue
      // Still waiting for the first broadcast from the bridge.
      if (room.lastReceivedAt === 0) continue
      if (now - room.lastReceivedAt < RECONNECT_AFTER_MS) {
        continue
      }
      reconnectRoom(roomId)
    }
  }, HEALTH_CHECK_MS)
}

function stopHealthCheck() {
  if (rooms.size > 0) return
  if (healthInterval === undefined) return
  window.clearInterval(healthInterval)
  healthInterval = undefined
}

function bindVisibilityRecovery() {
  if (visibilityBound || typeof document === 'undefined') return
  visibilityBound = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    for (const roomId of rooms.keys()) {
      reconnectRoom(roomId)
    }
  })
}

function attachChannel(roomId: string, room: RoomPlayback) {
  room.channel.on('broadcast', { event: 'now_playing' }, ({ payload }) => {
    const next = parseNowPlayingPayload(payload)
    if (!next) return
    applyNowPlaying(roomId, next)
  })

  room.channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      room.subscribed = true
      room.reconnecting = false
      if (lastNowPlaying.has(roomId)) notifyListeners(roomId)
      return
    }
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      room.subscribed = false
      reconnectRoom(roomId)
    }
  })
}

function createRoom(roomId: string): RoomPlayback {
  const room: RoomPlayback = {
    channel: ytmq.channel(playbackChannelName(roomId)),
    listeners: new Set(),
    lastReceivedAt: lastNowPlaying.has(roomId) ? Date.now() : 0,
    subscribed: false,
    reconnecting: false,
  }
  rooms.set(roomId, room)
  attachChannel(roomId, room)
  return room
}

function reconnectRoom(roomId: string) {
  const room = rooms.get(roomId)
  if (!room || room.listeners.size === 0) return
  if (room.reconnectTimer !== undefined) return

  room.reconnecting = true
  room.subscribed = false
  room.reconnectTimer = window.setTimeout(() => {
    room.reconnectTimer = undefined
    const listeners = room.listeners
    void ytmq.removeChannel(room.channel).finally(() => {
      if (!rooms.has(roomId) || rooms.get(roomId) !== room) return
      rooms.delete(roomId)
      const next = createRoom(roomId)
      next.listeners = listeners
    })
  }, 300)
}

function ensureRoom(roomId: string): RoomPlayback {
  const existing = rooms.get(roomId)
  if (existing) return existing
  return createRoom(roomId)
}

export function getCachedNowPlaying(roomId: string): NowPlaying | null {
  return lastNowPlaying.get(roomId) ?? null
}

export function getPlaybackLastReceivedAt(roomId: string): number {
  return rooms.get(roomId)?.lastReceivedAt ?? 0
}

/**
 * Publish a now-playing snapshot from a player running in this tab (Spotify).
 * Updates local listeners immediately, then broadcasts to the rest of the room.
 */
export function publishNowPlaying(roomId: string, payload: NowPlaying): void {
  applyNowPlaying(roomId, payload)
  const room = ensureRoom(roomId)
  if (!room.subscribed) return
  void room.channel.send({
    type: 'broadcast',
    event: 'now_playing',
    payload,
  })
}

/** A player went away (Spotify disconnected): stop counting it. */
export function forgetSource(roomId: string, source: NowPlayingSource): void {
  sourceStates.get(roomId)?.delete(source)
  for (const listener of sourceListeners) listener()
  const active = pickActive(roomId)
  if (active) {
    lastNowPlaying.set(roomId, active.np)
    notifyListeners(roomId)
  }
}

/** One shared realtime channel per room; components only register listeners. */
export function subscribeNowPlaying(
  roomId: string,
  listener: Listener,
): () => void {
  bindVisibilityRecovery()
  ensureHealthCheck()

  const room = ensureRoom(roomId)
  room.listeners.add(listener)

  const cached = lastNowPlaying.get(roomId)
  if (cached) listener(cached)

  return () => {
    room.listeners.delete(listener)
    if (room.listeners.size > 0) return
    if (room.reconnectTimer !== undefined) {
      window.clearTimeout(room.reconnectTimer)
    }
    rooms.delete(roomId)
    void ytmq.removeChannel(room.channel)
    stopHealthCheck()
  }
}

export function disposePlaybackChannel(roomId: string): void {
  const room = rooms.get(roomId)
  if (!room) return
  if (room.reconnectTimer !== undefined) {
    window.clearTimeout(room.reconnectTimer)
  }
  room.listeners.clear()
  rooms.delete(roomId)
  void ytmq.removeChannel(room.channel)
  stopHealthCheck()
}
