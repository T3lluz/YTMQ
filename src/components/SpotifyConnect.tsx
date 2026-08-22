import { useCallback, useEffect, useState } from 'react'
import type { SpotifyPlayerStatus } from '../lib/spotifyPlayer'
import {
  beginSpotifyLogin,
  clearSpotifyAuth,
  getSpotifyTokens,
  isSpotifyLinked,
  subscribeSpotifyAuth,
} from '../lib/spotifyAuth'
import { fetchSpotifyProfile } from '../lib/spotifyApi'

type SpotifyConnectProps = {
  roomId: string
  playerStatus: SpotifyPlayerStatus
}

export function SpotifyConnect({ roomId, playerStatus }: SpotifyConnectProps) {
  const [linked, setLinked] = useState(() => isSpotifyLinked())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const displayName = getSpotifyTokens()?.displayName

  useEffect(() => {
    return subscribeSpotifyAuth(() => {
      setLinked(isSpotifyLinked())
    })
  }, [])

  useEffect(() => {
    if (!linked) return
    void fetchSpotifyProfile()
  }, [linked])

  const startLogin = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await beginSpotifyLogin(roomId)
    } catch (err) {
      setBusy(false)
      setError(err instanceof Error ? err.message : 'Could not start Spotify login')
    }
  }, [roomId])

  const disconnect = useCallback(() => {
    clearSpotifyAuth()
    setError(null)
  }, [])

  if (linked) {
    const statusMessage =
      playerStatus.state === 'no_device' || playerStatus.state === 'error'
        ? playerStatus.message
        : null
    const following =
      playerStatus.state === 'running' || playerStatus.state === 'idle'

    return (
      <section
        className={`rounded-xl border px-4 py-3 ${
          following
            ? 'border-emerald-500/30 bg-emerald-500/10'
            : 'border-amber-500/30 bg-amber-500/10'
        }`}
        aria-label="Spotify connected"
      >
        <div className="flex items-start gap-3">
          <span
            className={`text-lg ${following ? 'text-emerald-400' : 'text-amber-300'}`}
            aria-hidden
          >
            {following ? '✓' : '!'}
          </span>
          <div className="min-w-0 flex-1">
            <p
              className={`font-medium ${
                following ? 'text-emerald-200' : 'text-amber-100'
              }`}
            >
              Spotify linked
              {displayName ? ` · ${displayName}` : ''}
            </p>
            <p className="text-sm text-zinc-400">
              {playerStatus.deviceName
                ? `Following ${playerStatus.deviceName}. Lyrics show whatever is playing.`
                : 'Play something in the Spotify app and this lobby will follow it.'}
            </p>
            {statusMessage && (
              <p className="mt-1 text-sm text-amber-200">{statusMessage}</p>
            )}
            <div className="mt-2 flex flex-wrap gap-3">
              <a
                href="https://open.spotify.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-[#1db954] underline"
              >
                Open Spotify
              </a>
              <button
                type="button"
                onClick={disconnect}
                className="text-xs text-zinc-500 underline"
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <p className="text-sm text-zinc-400">
        Log in with Spotify. This lobby then follows whatever is already playing
        on your phone or computer.
      </p>
      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={() => void startLogin()}
        disabled={busy}
        className="ytmq-press inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#1db954] py-3.5 text-base font-medium text-black hover:brightness-110 disabled:opacity-60"
      >
        {busy && <span className="ytmq-spinner h-4 w-4" aria-hidden />}
        Connect Spotify
      </button>
    </section>
  )
}
