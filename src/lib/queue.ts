import { supabase } from './supabase'

export type QueueItem = {
  id: string
  room_id: string
  position: number
  video_id: string
  title: string
  channel_title: string
  thumbnail_url: string
  added_by: string
  created_at: string
}

export type AddTrackInput = {
  video_id: string
  title: string
  channel_title?: string
  thumbnail_url?: string
  added_by?: string
}

export async function fetchQueueItems(roomId: string): Promise<QueueItem[]> {
  const { data, error } = await supabase
    .from('queue_items')
    .select('*')
    .eq('room_id', roomId)
    .order('position', { ascending: true })

  if (error) throw error
  return (data ?? []) as QueueItem[]
}

export async function addTrackToQueue(
  roomId: string,
  track: AddTrackInput,
): Promise<QueueItem> {
  const { data: maxRow, error: maxError } = await supabase
    .from('queue_items')
    .select('position')
    .eq('room_id', roomId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (maxError) throw maxError

  const nextPosition =
    maxRow?.position != null ? (maxRow.position as number) + 1 : 0

  const { data, error } = await supabase
    .from('queue_items')
    .insert({
      room_id: roomId,
      position: nextPosition,
      video_id: track.video_id,
      title: track.title,
      channel_title: track.channel_title ?? '',
      thumbnail_url: track.thumbnail_url ?? '',
      added_by: track.added_by ?? '',
    })
    .select()
    .single()

  if (error) throw error
  return data as QueueItem
}

export async function removeQueueItem(itemId: string) {
  const { error } = await supabase.from('queue_items').delete().eq('id', itemId)
  if (error) throw error
}

export function ytMusicWatchUrl(videoId: string) {
  return `https://music.youtube.com/watch?v=${videoId}`
}

export function defaultThumbnail(videoId: string) {
  return `https://i.ytimg.com/vi/${videoId}/default.jpg`
}
