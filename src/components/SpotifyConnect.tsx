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
import { PlayerCard, SpotifyIcon, secondaryButton, textButton } from './PlayerCard'

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

  const icon = <SpotifyIcon />

  if (linked) {
    const statusMessage =
      playerStatus.state === 'no_device' || playerStatus.state === 'error'
        ? playerStatus.message
        : null
    const following =
      playerStatus.state === 'running' || playerStatus.state === 'idle'

    return (
      <PlayerCard
        icon={icon}
        name="Spotify"
        status={following ? 'live' : 'warn'}
        statusLabel={`Linked${displayName ? ` as ${displayName}` : ''}`}
      >
        <p>
          {playerStatus.deviceName
            ? `Following ${playerStatus.deviceName}. Now playing and lyrics show whatever plays there.`
            : 'Play something in any Spotify app and this lobby follows it.'}
        </p>
        {statusMessage && <p className="text-amber-200">{statusMessage}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <a href="https://open.spotify.com" target="_blank" rel="noopener noreferrer" className={secondaryButton}>
            Open Spotify
          </a>
          <button type="button" onClick={disconnect} className={textButton}>
            Disconnect
          </button>
        </div>
      </PlayerCard>
    )
  }

  return (
    <PlayerCard icon={icon} name="Spotify" status="off" statusLabel="Optional">
      <p>
        Log in and the lobby follows what you play on Spotify, on any device. Guests see it in now
        playing and lyrics. The shared queue still goes to YouTube Music.
      </p>
      {error && (
        <p className="text-accent-300" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={() => void startLogin()}
        disabled={busy}
        className="ytmq-press inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#1ed760] px-5 text-sm font-bold text-black hover:bg-[#3be477] disabled:opacity-60"
      >
        {busy && <span className="ytmq-spinner h-4 w-4" aria-hidden />}
        Connect Spotify
      </button>
    </PlayerCard>
  )
}
