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

const POSITION_OFFSET = 100_000

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

export async function removeQueueItem(itemId: string, roomId: string) {
  const { error } = await supabase.from('queue_items').delete().eq('id', itemId)
  if (error) throw error

  const remaining = await fetchQueueItems(roomId)
  if (remaining.length > 0) {
    await applyQueueOrder(remaining)
  }
}

async function applyQueueOrder(orderedItems: QueueItem[]) {
  for (const item of orderedItems) {
    const { error } = await supabase
      .from('queue_items')
      .update({ position: item.position + POSITION_OFFSET })
      .eq('id', item.id)
    if (error) throw error
  }

  for (let i = 0; i < orderedItems.length; i++) {
    const { error } = await supabase
      .from('queue_items')
      .update({ position: i })
      .eq('id', orderedItems[i].id)
    if (error) throw error
  }
}

export async function moveQueueItem(
  items: QueueItem[],
  itemId: string,
  direction: 'up' | 'down',
) {
  const index = items.findIndex((item) => item.id === itemId)
  if (index < 0) return

  const targetIndex = direction === 'up' ? index - 1 : index + 1
  if (targetIndex < 0 || targetIndex >= items.length) return

  const reordered = [...items]
  const [moved] = reordered.splice(index, 1)
  reordered.splice(targetIndex, 0, moved)

  await applyQueueOrder(reordered)
}

export function ytMusicWatchUrl(videoId: string) {
  return `https://music.youtube.com/watch?v=${videoId}`
}

export function defaultThumbnail(videoId: string) {
  return `https://i.ytimg.com/vi/${videoId}/default.jpg`
}
