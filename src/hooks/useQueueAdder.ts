import { useState } from 'react'
import {
  defaultThumbnail,
  type AddTrackInput,
  type QueueInsertMode,
} from '../lib/queue'

export type AddableTrack = {
  videoId: string
  title: string
  channelTitle?: string
  thumbnail?: string
}

type Pending = { id: string; mode: QueueInsertMode } | null

/**
 * Shared "add to queue / play next" behaviour with per-track pending state,
 * used by search results and the recently-played history.
 */
export function useQueueAdder(
  nickname: string,
  onAdd: (track: AddTrackInput, mode: QueueInsertMode) => Promise<void>,
  onAdded?: (title: string, mode: QueueInsertMode) => void,
) {
  const [pending, setPending] = useState<Pending>(null)

  async function add(track: AddableTrack, mode: QueueInsertMode) {
    setPending({ id: track.videoId, mode })
    try {
      await onAdd(
        {
          video_id: track.videoId,
          title: track.title,
          channel_title: track.channelTitle ?? '',
          thumbnail_url: track.thumbnail || defaultThumbnail(track.videoId),
          added_by: nickname,
          insert_mode: mode,
        },
        mode,
      )
      onAdded?.(track.title, mode)
    } catch {
      /* queue hook surfaces the error */
    } finally {
      setPending(null)
    }
  }

  return { pending, add }
}
