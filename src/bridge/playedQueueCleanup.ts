/**
 * Decides which shared-queue row (if any) to remove when YT Music advances to
 * a new now-playing track. Extracted from the bridge so it can be unit-tested
 * with a mocked queue store.
 *
 * Two-stage logic:
 *
 *   1. Exact match — the most common path. If the now-playing videoId matches
 *      a row in the shared queue, that's the row that just started playing,
 *      so we delete it.
 *
 *   2. Play-next fallback — YT Music can advance to a videoId that doesn't
 *      match the row we queued (because YT Music substituted a track variant,
 *      because autoplay kicked in before the bridge finished inserting the
 *      track, or because the user manually picked a different upcoming
 *      track). If the shared queue still has a "Play next" row from this
 *      playback session sitting at the top, the user expected *that* row to
 *      play right now, so we treat it as consumed and remove it. Without this
 *      the row would otherwise be stuck at the top forever — that's the bug
 *      this module exists to fix.
 *
 * The fallback is debounced so a run of autoplay-driven track changes can't
 * drain the queue: at most one fallback fires per `fallbackCooldownMs`.
 */

export type SharedQueueRow = {
  id: string
  created_at: string
  title?: string | null
  video_id?: string | null
  insert_mode?: 'play_next' | 'queue' | null
}

export type PlayedQueueCleanupDeps = {
  /** Return the shared-queue row that has `video_id` === videoId and the
   *  lowest position, or null if none. */
  findByVideoId: (videoId: string) => Promise<SharedQueueRow | null>
  /** Return the lowest-position shared-queue row, or null if the queue is
   *  empty. */
  findTopOfQueue: () => Promise<SharedQueueRow | null>
  /** Delete a shared-queue row by id. Returns true on success. */
  deleteRow: (row: SharedQueueRow, reason: string) => Promise<boolean>
  /** Whether the row was added during the current playback session. */
  isInPlaybackSession: (createdAt: string) => boolean
  /** Monotonic clock (defaults to `Date.now`) — overridable for tests. */
  now?: () => number
}

export type PlayedQueueCleanupOptions = {
  fallbackCooldownMs?: number
}

export type PlayedQueueCleanupResult = {
  removedRowId: string | null
  reason:
    | 'exact-match'
    | 'play-next-fallback'
    | 'no-match'
    | 'fallback-cooldown'
    | 'fallback-not-in-session'
    | 'fallback-not-play-next'
    | 'fallback-matches-now-playing'
    | 'exact-not-in-session'
}

const DEFAULT_FALLBACK_COOLDOWN_MS = 8_000

/**
 * Stateful runner — pass `createPlayedQueueCleanup(deps)` once at bridge
 * startup so the fallback cooldown is shared across calls. Each invocation
 * resolves with the outcome so callers can log or surface it.
 */
export function createPlayedQueueCleanup(
  deps: PlayedQueueCleanupDeps,
  options: PlayedQueueCleanupOptions = {},
) {
  const cooldownMs = options.fallbackCooldownMs ?? DEFAULT_FALLBACK_COOLDOWN_MS
  const now = deps.now ?? (() => Date.now())
  let lastFallbackAt: number | null = null

  return async function cleanup(
    videoId: string,
  ): Promise<PlayedQueueCleanupResult> {
    const exact = await deps.findByVideoId(videoId)
    if (exact) {
      if (!deps.isInPlaybackSession(exact.created_at)) {
        return { removedRowId: null, reason: 'exact-not-in-session' }
      }
      const ok = await deps.deleteRow(exact, `now playing ${videoId}`)
      return ok
        ? { removedRowId: exact.id, reason: 'exact-match' }
        : { removedRowId: null, reason: 'exact-match' }
    }

    const t = now()
    if (lastFallbackAt !== null && t - lastFallbackAt < cooldownMs) {
      return { removedRowId: null, reason: 'fallback-cooldown' }
    }

    const top = await deps.findTopOfQueue()
    if (!top) return { removedRowId: null, reason: 'no-match' }
    if (top.insert_mode !== 'play_next') {
      return { removedRowId: null, reason: 'fallback-not-play-next' }
    }
    if (!deps.isInPlaybackSession(top.created_at)) {
      return { removedRowId: null, reason: 'fallback-not-in-session' }
    }
    if (top.video_id && top.video_id === videoId) {
      // The exact-match query above somehow missed this row (e.g. transient
      // read-after-write delay). Don't double up — leave it to the next tick.
      return { removedRowId: null, reason: 'fallback-matches-now-playing' }
    }

    lastFallbackAt = t
    const ok = await deps.deleteRow(
      top,
      `play_next fallback (now playing ${videoId})`,
    )
    return ok
      ? { removedRowId: top.id, reason: 'play-next-fallback' }
      : { removedRowId: null, reason: 'play-next-fallback' }
  }
}
