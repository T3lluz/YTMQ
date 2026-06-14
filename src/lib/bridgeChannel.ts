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
  sendBridgeBroadcast(roomId, 'queue_remove', payload)
}

export type PlaybackControlPayload = {
  action: PlaybackAction
}

/** Tell the YT Music bridge to next/prev/play/pause the current track. */
export function sendPlaybackControl(
  roomId: string,
  action: PlaybackAction,
): void {
  sendBridgeBroadcast(roomId, 'playback_control', { action })
}

function sendBridgeBroadcast(
  roomId: string,
  event: string,
  payload: Record<string, unknown>,
): void {
  const channel = supabase.channel(bridgeChannelName(roomId))
  void channel.subscribe((status) => {
    if (status !== 'SUBSCRIBED') return
    void channel
      .send({
        type: 'broadcast',
        event,
        payload,
      })
      .finally(() => {
        void supabase.removeChannel(channel)
      })
  })
}
