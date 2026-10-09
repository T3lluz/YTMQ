import { isYoutubeVideoId, type NowPlaying } from './playback'
import { ytmq } from './api'

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
  /** The host's token, so the host can add while guest adds are off. */
  host_token?: string
}

export async function fetchQueueItems(roomId: string): Promise<QueueItem[]> {
  return ytmq.get<QueueItem[]>(`/rooms/${encodeURIComponent(roomId)}/queue`)
}

/**
 * Add a track. The server picks the position: Play next goes ABOVE the
 * current top of the queue (mirroring YouTube Music, where Play next jumps
 * to just below the playing track), Add to queue goes to the bottom.
 */
export async function addTrackToQueue(
  roomId: string,
  track: AddTrackInput,
): Promise<QueueItem> {
  return ytmq.post<QueueItem>(`/rooms/${encodeURIComponent(roomId)}/queue`, {
    video_id: track.video_id,
    title: track.title,
    channel_title: track.channel_title ?? '',
    thumbnail_url: track.thumbnail_url ?? '',
    added_by: track.added_by ?? '',
    insert_mode: track.insert_mode ?? 'play_next',
    ...(track.host_token ? { host_token: track.host_token } : {}),
  })
}

export async function removeQueueItem(itemId: string) {
  await ytmq.delete(`/queue/${encodeURIComponent(itemId)}`)
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

/** Placeholder avatar for artists when YT Music omits thumbnail art. */
export function defaultArtistThumbnail(name = '?'): string {
  const initial = (name.trim()[0] ?? '?').toUpperCase()
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect fill="#262626" width="128" height="128"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#ff6b52" font-family="system-ui,sans-serif" font-size="52" font-weight="600">${initial}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
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

/** Cover art for a now-playing snapshot (Spotify album art or YouTube thumb). */
export function nowPlayingArtwork(
  track: Pick<NowPlaying, 'videoId' | 'title' | 'thumbnailUrl'>,
  quality: 'default' | 'hq' = 'default',
): string {
  if (track.thumbnailUrl) return track.thumbnailUrl
  if (isYoutubeVideoId(track.videoId)) {
    return quality === 'hq' ? hqThumbnail(track.videoId) : defaultThumbnail(track.videoId)
  }
  return defaultArtistThumbnail(track.title)
}
