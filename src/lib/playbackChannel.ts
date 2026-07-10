import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  playbackChannelName,
  type NowPlaying,
  type PlaybackState,
} from './playback'
import { recordPlayed } from './recentlyPlayed'
import { supabase } from './supabase'

const HEALTH_CHECK_MS = 5_000
/** ~4 missed bridge broadcasts before we try to rejoin the channel. */
const RECONNECT_AFTER_MS = 8_000
export const PLAYBACK_STALE_MS = 30_000

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
  }
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
    recordPlayed(roomId, {
      videoId: next.videoId,
      title: next.title,
      artist: next.artist,
    })
    lastNowPlaying.set(roomId, next)
    room.lastReceivedAt = Date.now()
    room.reconnecting = false
    notifyListeners(roomId)
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
    channel: supabase.channel(playbackChannelName(roomId)),
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
    void supabase.removeChannel(room.channel).finally(() => {
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
    void supabase.removeChannel(room.channel)
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
  void supabase.removeChannel(room.channel)
  stopHealthCheck()
}
