import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { PlaybackAction } from './playback'

export function bridgeChannelName(roomId: string) {
  return `ytmq-bridge:${roomId}`
}

export type QueueRemovePayload = {
  id: string
  video_id: string
  title?: string
}

/** Tell the YT Music bridge to remove a track immediately (in addition to Realtime DELETE). */
export function notifyBridgeQueueRemove(
  roomId: string,
  payload: QueueRemovePayload,
): void {
  void sendBridgeBroadcast(roomId, 'queue_remove', payload)
}

export type PlaybackControlPayload = {
  action: PlaybackAction
  /** Target position in seconds — only used by the `seek` action. */
  position?: number
  /** Target volume 0–100 — only used by the `volume` action. */
  volume?: number
}

/** Tell the YT Music bridge to next/prev/play/pause the current track. */
export function sendPlaybackControl(
  roomId: string,
  action: PlaybackAction,
): void {
  void sendBridgeBroadcast(roomId, 'playback_control', { action })
}

/** Tell the YT Music bridge to seek the current track to `position` seconds. */
export function sendPlaybackSeek(roomId: string, position: number): void {
  void sendBridgeBroadcast(roomId, 'playback_control', {
    action: 'seek',
    position: Math.max(0, Math.round(position)),
  })
}

/** Tell the YT Music bridge to set the host player volume to `volume` (0–100). */
export function sendPlaybackVolume(roomId: string, volume: number): void {
  void sendBridgeBroadcast(roomId, 'playback_control', {
    action: 'volume',
    volume: Math.min(100, Math.max(0, Math.round(volume))),
  })
}

type SenderState = {
  channel: RealtimeChannel
  ready: Promise<boolean>
}

const senders = new Map<string, SenderState>()
const JOIN_TIMEOUT_MS = 5000

function getSender(roomId: string): SenderState {
  const existing = senders.get(roomId)
  if (existing) return existing

  const channel = supabase.channel(bridgeChannelName(roomId))
  const ready = new Promise<boolean>((resolve) => {
    let settled = false
    const timer = window.setTimeout(() => {
      if (settled) return
      settled = true
      resolve(false)
    }, JOIN_TIMEOUT_MS)

    channel.subscribe((status) => {
      if (settled) return
      if (status === 'SUBSCRIBED') {
        settled = true
        window.clearTimeout(timer)
        resolve(true)
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        settled = true
        window.clearTimeout(timer)
        // Drop the cached sender so the next call can retry on a fresh channel.
        if (senders.get(roomId)?.channel === channel) {
          senders.delete(roomId)
          void supabase.removeChannel(channel)
        }
        resolve(false)
      }
    })
  })

  const state: SenderState = { channel, ready }
  senders.set(roomId, state)
  return state
}

async function sendBridgeBroadcast(
  roomId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const sender = getSender(roomId)
  const joined = await sender.ready
  if (!joined) {
    // Fall back to REST delivery so the action still reaches the bridge even
    // when the realtime websocket can't open in time.
    try {
      await sender.channel.httpSend(event, payload)
    } catch (err) {
      console.warn('[YTMQ] bridge broadcast failed', event, err)
    }
    return
  }

  try {
    await sender.channel.send({ type: 'broadcast', event, payload })
  } catch (err) {
    console.warn('[YTMQ] bridge broadcast failed', event, err)
  }
}

/** Tear down cached sender channels for a room (e.g. when leaving the lobby). */
export function disposeBridgeSender(roomId: string): void {
  const existing = senders.get(roomId)
  if (!existing) return
  senders.delete(roomId)
  void supabase.removeChannel(existing.channel)
}
