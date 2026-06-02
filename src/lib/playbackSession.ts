/** Browser session: which lobby tracks belong in this YouTube Music playback run. */

export function playbackSinceKey(roomId: string) {
  return `ytmq_playback_since_${roomId}`
}

export function getOrStartPlaybackSince(roomId: string): string {
  const key = playbackSinceKey(roomId)
  const existing = sessionStorage.getItem(key)
  if (existing) return existing

  const since = new Date().toISOString()
  sessionStorage.setItem(key, since)
  return since
}

/** Call when starting a fresh YT Music connect (not when guests add songs). */
export function resetPlaybackSession(roomId: string): string {
  const since = new Date().toISOString()
  sessionStorage.setItem(playbackSinceKey(roomId), since)
  return since
}

export function clearPlaybackSession(roomId: string) {
  sessionStorage.removeItem(playbackSinceKey(roomId))
}

export function isTrackInPlaybackSession(
  createdAt: string,
  playbackSince: string,
): boolean {
  return new Date(createdAt).getTime() >= new Date(playbackSince).getTime()
}
