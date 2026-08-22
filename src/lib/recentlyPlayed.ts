/**
 * Per-room "recently played" history, derived from now-playing broadcasts
 * (YouTube Music bridge or the Spotify follower). Persisted in localStorage
 * so it survives reloads. Every connected guest sees the same list because
 * they all receive the same broadcasts.
 */

export type PlayedTrack = {
  videoId: string
  title: string
  artist: string
  /** Epoch ms when this track became the active track. */
  playedAt: number
  /** Album art when the track is not a YouTube video. */
  thumbnailUrl?: string
}

const MAX_ITEMS = 60

function storageKey(roomId: string) {
  return `ytmq_recent_${roomId}`
}

const listeners = new Map<string, Set<() => void>>()

function emit(roomId: string) {
  const set = listeners.get(roomId)
  if (!set) return
  for (const cb of set) {
    try {
      cb()
    } catch {
      /* ignore listener errors */
    }
  }
}

export function subscribeRecentlyPlayed(
  roomId: string,
  cb: () => void,
): () => void {
  let set = listeners.get(roomId)
  if (!set) {
    set = new Set()
    listeners.set(roomId, set)
  }
  set.add(cb)
  return () => {
    set?.delete(cb)
  }
}

function isPlayedTrack(value: unknown): value is PlayedTrack {
  if (!value || typeof value !== 'object') return false
  const t = value as Record<string, unknown>
  if (
    typeof t.videoId !== 'string' ||
    typeof t.title !== 'string' ||
    typeof t.playedAt !== 'number'
  ) {
    return false
  }
  if (t.thumbnailUrl != null && typeof t.thumbnailUrl !== 'string') return false
  return true
}

export function getRecentlyPlayed(roomId: string): PlayedTrack[] {
  try {
    const raw = localStorage.getItem(storageKey(roomId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isPlayedTrack)
  } catch {
    return []
  }
}

function save(roomId: string, list: PlayedTrack[]) {
  try {
    localStorage.setItem(storageKey(roomId), JSON.stringify(list))
  } catch {
    /* private mode / quota — ignore */
  }
  emit(roomId)
}

/**
 * Record the track that just became active. No-op when it's the same track
 * that's already at the top (the bridge re-broadcasts every few seconds).
 */
export function recordPlayed(
  roomId: string,
  track: {
    videoId: string
    title: string
    artist?: string
    thumbnailUrl?: string
  },
): void {
  if (!roomId || !track.videoId || !track.title) return

  const list = getRecentlyPlayed(roomId)
  if (list[0]?.videoId === track.videoId) return

  const next: PlayedTrack[] = [
    {
      videoId: track.videoId,
      title: track.title,
      artist: track.artist ?? '',
      playedAt: Date.now(),
      thumbnailUrl: track.thumbnailUrl,
    },
    ...list.filter((t) => t.videoId !== track.videoId),
  ].slice(0, MAX_ITEMS)

  save(roomId, next)
}

export function clearRecentlyPlayed(roomId: string): void {
  try {
    localStorage.removeItem(storageKey(roomId))
  } catch {
    /* ignore */
  }
  emit(roomId)
}

/** Human friendly "x ago" label for a play timestamp. */
export function formatPlayedAgo(playedAt: number, now = Date.now()): string {
  const diffMs = Math.max(0, now - playedAt)
  const minutes = Math.floor(diffMs / 60_000)

  if (minutes < 1) return 'just now'
  if (minutes === 1) return '1 min ago'
  if (minutes < 60) return `${minutes} min ago`

  const hours = Math.floor(minutes / 60)
  if (hours === 1) return '1 hr ago'
  if (hours < 24) return `${hours} hr ago`

  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}
