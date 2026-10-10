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
import { CardActions, PlayerCard, SpotifyIcon } from './PlayerCard'
import { buttonClass } from './ui/buttonStyles'

const secondaryButton = buttonClass('tonal', 'md')
const textButton = buttonClass('ghost', 'md')

type SpotifyConnectProps = {
  roomId: string
  playerStatus: SpotifyPlayerStatus
  /** Spotify is the room's player right now. */
  active?: boolean
}

export function SpotifyConnect({ roomId, playerStatus, active = false }: SpotifyConnectProps) {
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
        active={active}
      >
        <p>
          {playerStatus.deviceName
            ? `Playing on ${playerStatus.deviceName}. While Spotify plays, the shared queue plays there too, one song ahead.`
            : 'Play something in any Spotify app; the lobby follows it and plays the shared queue on it.'}
        </p>
        {statusMessage && <p className="text-amber-200">{statusMessage}</p>}
        <CardActions>
          <a href="https://open.spotify.com" target="_blank" rel="noopener noreferrer" className={secondaryButton}>
            Open Spotify
          </a>
          <button type="button" onClick={disconnect} className={textButton}>
            Disconnect
          </button>
        </CardActions>
      </PlayerCard>
    )
  }

  return (
    <PlayerCard icon={icon} name="Spotify" status="off" statusLabel="Optional">
      <p>
        Log in and the lobby follows what you play on Spotify, on any device, and plays the shared
        queue there. Controls, shuffle and smart shuffle need Premium.
      </p>
      {error && (
        <p className="text-accent-300" role="alert">
          {error}
        </p>
      )}
      <CardActions>
        <button type="button" onClick={() => void startLogin()} disabled={busy} className={buttonClass('spotify', 'md')}>
          {busy && <span className="ytmq-spinner h-4 w-4" aria-hidden />}
          Connect Spotify
        </button>
      </CardActions>
    </PlayerCard>
  )
}
