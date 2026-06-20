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

type CacheEntry = { lyrics: Lyrics | null; error: boolean }

// Cache resolved lookups per video so switching tabs (or briefly losing the
// now-playing broadcast) doesn't re-fetch the same lyrics.
const cache = new Map<string, CacheEntry>()

// In-flight lookups keyed by videoId so a prefetch and the live view (or two
// prefetches) never fire the same request twice.
const inFlight = new Map<string, Promise<void>>()

// --- sessionStorage helpers -----------------------------------------------
// Lyrics are persisted per-session so page reloads and hard tab switches
// resolve instantly from storage instead of going to the network.
// Only successful lookups are persisted; errors are intentionally excluded
// so they're retried fresh on the next load.

// Bump the prefix whenever the persisted shape changes so stale entries from
// older builds (e.g. without a `source` field) don't get read back blindly.
const SS_PREFIX = 'ytmq:lrc:v2:'

function ssLoad(videoId: string): CacheEntry | null {
  try {
    const raw = sessionStorage.getItem(SS_PREFIX + videoId)
    return raw ? (JSON.parse(raw) as CacheEntry) : null
  } catch {
    return null
  }
}

function ssSave(videoId: string, lyrics: Lyrics | null): void {
  try {
    sessionStorage.setItem(
      SS_PREFIX + videoId,
      JSON.stringify({ lyrics, error: false }),
    )
  } catch {
    // Silently ignore QuotaExceededError or private-browsing restrictions.
  }
}

/**
 * Resolve lyrics for a track into the shared cache. Used by both the live
 * hook and {@link prefetchLyrics}; resolves once the cache holds an entry.
 */
function loadLyrics(track: LyricsTrack, signal?: AbortSignal): Promise<void> {
  const { videoId } = track
  if (!videoId || cache.has(videoId)) return Promise.resolve()

  // Serve from sessionStorage before hitting the network.
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
      cache.set(videoId, { lyrics: result, error: false })
      ssSave(videoId, result)
    })
    .catch((err: unknown) => {
      if (err instanceof DOMException && err.name === 'AbortError') return
      cache.set(videoId, { lyrics: null, error: true })
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
    if (!videoId || cache.has(videoId)) return

    let cancelled = false
    const current = trackRef.current

    void loadLyrics({
      videoId,
      title: current?.title ?? '',
      artist: current?.artist ?? '',
      duration: current?.duration,
    }).then(() => {
      if (!cancelled) bump((n) => n + 1)
    })

    return () => {
      cancelled = true
    }
  }, [videoId])

  if (!videoId) return { lyrics: null, status: 'idle' }

  const entry = cache.get(videoId)
  if (!entry) return { lyrics: null, status: 'loading' }
  if (entry.error) return { lyrics: null, status: 'error' }
  return { lyrics: entry.lyrics, status: entry.lyrics ? 'loaded' : 'notfound' }
}
