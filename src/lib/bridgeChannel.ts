import { supabase } from './supabase'

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
  const channel = supabase.channel(bridgeChannelName(roomId))
  void channel.subscribe((status) => {
    if (status !== 'SUBSCRIBED') return
    void channel
      .send({
        type: 'broadcast',
        event: 'queue_remove',
        payload,
      })
      .finally(() => {
        void supabase.removeChannel(channel)
      })
  })
}
