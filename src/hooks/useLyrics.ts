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

    const controller = new AbortController()
    const current = trackRef.current

    fetchLyrics(
      {
        title: current?.title ?? '',
        artist: current?.artist ?? '',
        duration: current?.duration,
      },
      controller.signal,
    )
      .then((result) => {
        if (controller.signal.aborted) return
        cache.set(videoId, { lyrics: result, error: false })
        bump((n) => n + 1)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        if (err instanceof DOMException && err.name === 'AbortError') return
        cache.set(videoId, { lyrics: null, error: true })
        bump((n) => n + 1)
      })

    return () => controller.abort()
  }, [videoId])

  if (!videoId) return { lyrics: null, status: 'idle' }

  const entry = cache.get(videoId)
  if (!entry) return { lyrics: null, status: 'loading' }
  if (entry.error) return { lyrics: null, status: 'error' }
  return { lyrics: entry.lyrics, status: entry.lyrics ? 'loaded' : 'notfound' }
}
