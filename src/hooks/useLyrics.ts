import { useEffect, useRef, useState } from 'react'
import { fetchLyrics, type Lyrics } from '../lib/lyrics'

export type LyricsStatus = 'idle' | 'loading' | 'loaded' | 'notfound' | 'error'

export type LyricsTrack = {
  videoId: string
  title: string
  artist: string
  duration?: number
}

export type UseLyricsResult = {
  lyrics: Lyrics | null
  status: LyricsStatus
}

type CacheEntry = { lyrics: Lyrics | null; error: boolean; ts: number }

// Cache resolved lookups per video so switching tabs (or briefly losing the
// now-playing broadcast) doesn't re-fetch the same lyrics.
const cache = new Map<string, CacheEntry>()

// Negative lookups (not-found / errored) are only cached briefly so a track
// that had no match is retried later in the same session — important because
// provider coverage changes over time (and after a backend deploy). Positive
// results never expire in-session.
const NEGATIVE_TTL_MS = 5 * 60_000

function isFresh(entry: CacheEntry): boolean {
  if (entry.lyrics) return true
  return Date.now() - entry.ts < NEGATIVE_TTL_MS
}

// In-flight lookups keyed by videoId so a prefetch and the live view (or two
// prefetches) never fire the same request twice.
const inFlight = new Map<string, Promise<void>>()

// Tracks that the live hook is still actively retrying. While a videoId is in
// here we keep reporting "loading" (instead of "not found") so a track that
// hasn't resolved yet doesn't flash the empty/visualizer state between attempts.
const retrying = new Set<string>()

// --- sessionStorage helpers -----------------------------------------------
// Lyrics are persisted per-session so page reloads and hard tab switches
// resolve instantly from storage instead of going to the network.
// Only successful lookups are persisted; errors are intentionally excluded
// so they're retried fresh on the next load.

// Bump the prefix whenever the persisted shape changes (or to invalidate
// poisoned entries from older builds — e.g. negative results that used to be
// cached permanently before coverage improved).
const SS_PREFIX = 'ytmq:lrc:v3:'

function ssLoad(videoId: string): CacheEntry | null {
  try {
    const raw = sessionStorage.getItem(SS_PREFIX + videoId)
    if (!raw) return null
    const entry = JSON.parse(raw) as CacheEntry
    // Only positive results are ever persisted; ignore anything else.
    return entry?.lyrics ? entry : null
  } catch {
    return null
  }
}

function ssSave(videoId: string, lyrics: Lyrics): void {
  try {
    sessionStorage.setItem(
      SS_PREFIX + videoId,
      JSON.stringify({ lyrics, error: false, ts: Date.now() }),
    )
  } catch {
    // Silently ignore QuotaExceededError or private-browsing restrictions.
  }
}

/**
 * Resolve lyrics for a track into the shared cache. Used by both the live
 * hook and {@link prefetchLyrics}; resolves once the cache holds an entry.
 *
 * Pass `force` to bypass a cached *negative* result (used by the live hook's
 * retry loop). A cached *positive* result is always reused — once we have
 * lyrics for a track there's never a reason to look them up again.
 */
function loadLyrics(
  track: LyricsTrack,
  signal?: AbortSignal,
  force = false,
): Promise<void> {
  const { videoId } = track
  if (!videoId) return Promise.resolve()

  const cached = cache.get(videoId)
  if (cached?.lyrics) return Promise.resolve()
  if (!force && cached && isFresh(cached)) return Promise.resolve()

  // Serve from sessionStorage before hitting the network (positives only).
  const persisted = ssLoad(videoId)
  if (persisted) {
    cache.set(videoId, persisted)
    return Promise.resolve()
  }

  const existing = inFlight.get(videoId)
  if (existing) return existing

  const request = fetchLyrics(
    { title: track.title, artist: track.artist, duration: track.duration },
    signal,
  )
    .then((result) => {
      cache.set(videoId, { lyrics: result, error: false, ts: Date.now() })
      // Only persist real lyrics; negative results stay in-memory with a TTL
      // so they're retried later instead of being frozen for the session.
      if (result) ssSave(videoId, result)
    })
    .catch((err: unknown) => {
      if (err instanceof DOMException && err.name === 'AbortError') return
      cache.set(videoId, { lyrics: null, error: true, ts: Date.now() })
      // Errors are not persisted so they're retried next load.
    })
    .finally(() => {
      inFlight.delete(videoId)
    })

  inFlight.set(videoId, request)
  return request
}

/**
 * Warm the lyrics cache for an upcoming track so it's already resolved by the
 * time it becomes the now-playing song — making the lyrics appear instantly on
 * track change instead of after a fresh network round-trip.
 */
export function prefetchLyrics(track: LyricsTrack | null): void {
  if (!track?.videoId) return
  void loadLyrics(track)
}

export function useLyrics(track: LyricsTrack | null): UseLyricsResult {
  const videoId = track?.videoId ?? ''
  // Bump to re-render once an async lookup resolves and updates the cache.
  const [, bump] = useState(0)

  // Keep the latest track fields without re-running the fetch effect on every
  // render (the caller passes a fresh object each render). videoId is the
  // stable identity of a track, so the effect only depends on it.
  const trackRef = useRef(track)
  useEffect(() => {
    trackRef.current = track
  })

  useEffect(() => {
    if (!videoId) return
    // Already have lyrics cached for this track — nothing to do.
    if (cache.get(videoId)?.lyrics) return

    let cancelled = false
    let timer: number | undefined
    let attempt = 0

    // Keep trying until lyrics actually resolve. Provider coverage and latency
    // are flaky (LRCLIB can be slow, the edge can cold-start), so a single
    // miss must NOT leave the current song without lyrics for its whole
    // duration. We back off between attempts and give up only after a generous
    // number of tries — by which point the track genuinely has no lyrics.
    const RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 15_000, 30_000]

    retrying.add(videoId)

    const attemptLoad = () => {
      const current = trackRef.current
      void loadLyrics(
        {
          videoId,
          title: current?.title ?? '',
          artist: current?.artist ?? '',
          duration: current?.duration,
        },
        undefined,
        // Force a real refetch on every retry so a cached negative from the
        // previous attempt doesn't short-circuit us.
        attempt > 0,
      ).then(() => {
        if (cancelled) return
        const resolved = Boolean(cache.get(videoId)?.lyrics)
        if (resolved || attempt >= RETRY_DELAYS_MS.length) {
          retrying.delete(videoId)
          bump((n) => n + 1)
          return
        }
        const delay = RETRY_DELAYS_MS[attempt]!
        attempt += 1
        bump((n) => n + 1)
        timer = window.setTimeout(attemptLoad, delay)
      })
    }

    attemptLoad()

    return () => {
      cancelled = true
      retrying.delete(videoId)
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [videoId])

  if (!videoId) return { lyrics: null, status: 'idle' }

  const entry = cache.get(videoId)
  if (entry?.lyrics) return { lyrics: entry.lyrics, status: 'loaded' }
  // No lyrics yet: while the retry loop is still running (or no attempt has
  // settled), show the skeleton instead of a "no lyrics" flash. Only report
  // not-found/error once we've actually stopped trying.
  if (retrying.has(videoId) || !entry) return { lyrics: null, status: 'loading' }
  return { lyrics: null, status: entry.error ? 'error' : 'notfound' }
}
