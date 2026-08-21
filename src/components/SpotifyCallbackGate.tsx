import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  completeSpotifyAuth,
  consumeSpotifyReturnRoom,
  isSpotifyCallback,
  RESTORE_TAB_KEY,
} from '../lib/spotifyAuth'

function hasPendingSpotifyReturn(): boolean {
  try {
    return Boolean(sessionStorage.getItem('ytmq_spotify_return_room'))
  } catch {
    return false
  }
}

/**
 * Completes the Spotify OAuth redirect before the rest of the app boots.
 * Spotify always returns to the site root; we then send the host back to
 * their lobby's Admin tab.
 */
export function SpotifyCallbackGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [handling, setHandling] = useState(
    () => isSpotifyCallback() || hasPendingSpotifyReturn(),
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isSpotifyCallback() && !hasPendingSpotifyReturn()) return
    let cancelled = false

    void (async () => {
      if (isSpotifyCallback()) {
        try {
          const result = await completeSpotifyAuth()
          if (!cancelled && result.error) setError(result.error)
        } catch (err: unknown) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : 'Spotify login failed')
          }
        }
      }
      if (cancelled) return
      const roomId = consumeSpotifyReturnRoom()
      if (roomId) {
        sessionStorage.setItem(RESTORE_TAB_KEY, 'admin')
        navigate(`/room/${roomId}`, { replace: true })
      }
      setHandling(false)
    })()

    return () => {
      cancelled = true
    }
  }, [navigate])

  if (handling) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-3 p-6 text-center">
        <span className="ytmq-spinner h-7 w-7 text-[#1db954]" aria-hidden />
        <p className="text-zinc-300">Connecting Spotify…</p>
      </main>
    )
  }

  if (error) {
    return (
      <>
        <div className="mx-auto max-w-lg px-4 pt-4">
          <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        </div>
        {children}
      </>
    )
  }

  return children
}
