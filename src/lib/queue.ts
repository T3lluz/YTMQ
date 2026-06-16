import { supabase } from './supabase'

export type QueueInsertMode = 'play_next' | 'queue'

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
  insert_mode: QueueInsertMode
}

export type AddTrackInput = {
  video_id: string
  title: string
  channel_title?: string
  thumbnail_url?: string
  added_by?: string
  insert_mode?: QueueInsertMode
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

async function pickInsertPosition(
  roomId: string,
  mode: QueueInsertMode,
): Promise<number> {
  if (mode === 'queue') {
    const { data, error } = await supabase
      .from('queue_items')
      .select('position')
      .eq('room_id', roomId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    return data?.position != null ? (data.position as number) + 1 : 0
  }

  // play_next: insert ABOVE the current top of the queue so the shared
  // queue mirrors YouTube Music (where Play next jumps to the top of the
  // pending list, just below the currently playing track).
  const { data, error } = await supabase
    .from('queue_items')
    .select('position')
    .eq('room_id', roomId)
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data?.position != null ? (data.position as number) - 1 : 0
}

const POSTGRES_UNIQUE_VIOLATION = '23505'
const INSERT_RETRY_ATTEMPTS = 4

export async function addTrackToQueue(
  roomId: string,
  track: AddTrackInput,
): Promise<QueueItem> {
  const mode: QueueInsertMode = track.insert_mode ?? 'play_next'

  let lastError: unknown = null
  for (let attempt = 0; attempt < INSERT_RETRY_ATTEMPTS; attempt += 1) {
    const position = await pickInsertPosition(roomId, mode)
    const { data, error } = await supabase
      .from('queue_items')
      .insert({
        room_id: roomId,
        position,
        video_id: track.video_id,
        title: track.title,
        channel_title: track.channel_title ?? '',
        thumbnail_url: track.thumbnail_url ?? '',
        added_by: track.added_by ?? '',
        insert_mode: mode,
      })
      .select()
      .single()

    if (!error) return data as QueueItem

    // Two clients racing on Play next can pick the same min-1 position and
    // trip the (room_id, position) unique constraint. Retry with a fresh
    // min/max lookup; with a few attempts collisions resolve quickly.
    if (error.code === POSTGRES_UNIQUE_VIOLATION) {
      lastError = error
      continue
    }
    throw error
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Could not pick a free queue position after retries')
}

export async function removeQueueItem(itemId: string) {
  const { error } = await supabase.from('queue_items').delete().eq('id', itemId)
  if (error) throw error
}

export function ytMusicWatchUrl(videoId: string) {
  return `https://music.youtube.com/watch?v=${videoId}`
}

// YouTube's `default`/`hqdefault`/`sddefault` thumbnails are 4:3 frames that
// pad square album art with black (top/bottom) AND grey (sides) bars baked into
// the pixels — `object-fit: cover` can't crop those out. The 16:9 variants
// (`mqdefault`, `hq720`, `maxresdefault`) have NO black bars, so a square
// `object-cover` crop trims only the grey side padding and lands on a clean
// square cover.

/** Small, always-available 16:9 thumbnail — good for list rows / fallbacks. */
export function defaultThumbnail(videoId: string) {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
}

/** High-res album art for immersive views (lyrics, now playing). */
export function hqThumbnail(videoId: string) {
  return `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`
}

/**
 * Fallback art for when {@link hqThumbnail}'s `maxresdefault` 404s (it isn't
 * generated for every video). `mqdefault` is 16:9 and always exists, so it
 * still crops cleanly to a square with no black bars.
 */
export function fallbackThumbnail(videoId: string) {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
}
