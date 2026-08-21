import { useCallback, useEffect, useState } from 'react'
import type { SpotifyPlayerStatus } from '../lib/spotifyPlayer'
import {
  beginSpotifyLogin,
  clearSpotifyAuth,
  getSpotifyDeviceId,
  getSpotifyTokens,
  isSpotifyConfigured,
  isSpotifyLinked,
  setSpotifyDeviceId,
  spotifyRedirectUri,
  subscribeSpotifyAuth,
} from '../lib/spotifyAuth'
import {
  fetchSpotifyDevices,
  fetchSpotifyProfile,
  isPremiumRequired,
  transferSpotifyPlayback,
  type SpotifyDevice,
} from '../lib/spotifyApi'

type SpotifyConnectProps = {
  roomId: string
  playerStatus: SpotifyPlayerStatus
}

export function SpotifyConnect({ roomId, playerStatus }: SpotifyConnectProps) {
  const configured = isSpotifyConfigured()
  const [linked, setLinked] = useState(() => isSpotifyLinked())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [devices, setDevices] = useState<SpotifyDevice[]>([])
  const [deviceId, setDeviceId] = useState(() => getSpotifyDeviceId())
  const displayName = getSpotifyTokens()?.displayName

  useEffect(() => {
    return subscribeSpotifyAuth(() => {
      setLinked(isSpotifyLinked())
      setDeviceId(getSpotifyDeviceId())
    })
  }, [])

  const refreshDevices = useCallback(async () => {
    if (!isSpotifyLinked()) return
    setBusy(true)
    setError(null)
    try {
      await fetchSpotifyProfile()
      const list = await fetchSpotifyDevices()
      setDevices(list)
      const selected = getSpotifyDeviceId()
      const stillThere = list.some((device) => device.id === selected)
      if (!stillThere) {
        const active = list.find((device) => device.is_active && device.id)
        const nextId = active?.id ?? list[0]?.id ?? null
        setSpotifyDeviceId(nextId)
        setDeviceId(nextId)
      }
    } catch (err) {
      if (isPremiumRequired(err)) {
        setError('Spotify Premium is required to control playback.')
      } else {
        setError(err instanceof Error ? err.message : 'Could not list Spotify devices')
      }
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (!linked) return
    const timer = window.setTimeout(() => {
      void refreshDevices()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [linked, refreshDevices])

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
    setDevices([])
    setError(null)
  }, [])

  async function chooseDevice(id: string) {
    setDeviceId(id)
    setSpotifyDeviceId(id)
    setBusy(true)
    setError(null)
    try {
      await transferSpotifyPlayback(id, false)
    } catch (err) {
      if (!isPremiumRequired(err)) {
        setError(
          err instanceof Error
            ? err.message
            : 'Could not switch Spotify device',
        )
      }
    } finally {
      setBusy(false)
    }
  }

  if (!configured) {
    return (
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-400">
        <p className="font-medium text-zinc-100">Connect Spotify</p>
        <p className="mt-1">
          Add a Spotify app to enable this player. Create one at{' '}
          <a
            href="https://developer.spotify.com/dashboard"
            className="text-[#1db954] underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            developer.spotify.com/dashboard
          </a>
          , set the redirect URI to:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-black/30 p-2 text-xs text-zinc-200">
          {spotifyRedirectUri() || 'http://localhost:5173/YTMQ/'}
        </pre>
        <p className="mt-2 text-xs text-zinc-500">
          Then set <code className="text-zinc-300">VITE_SPOTIFY_CLIENT_ID</code> in{' '}
          <code className="text-zinc-300">.env.local</code> and as a GitHub Actions
          secret.
        </p>
      </section>
    )
  }

  if (linked) {
    const statusMessage =
      playerStatus.state === 'not_premium'
        ? playerStatus.message
        : playerStatus.state === 'no_device'
          ? playerStatus.message
          : playerStatus.state === 'error'
            ? playerStatus.message
            : null
    const linkedOk = playerStatus.state === 'running' || playerStatus.state === 'idle'

    return (
      <section
        className={`rounded-xl border px-4 py-3 ${
          linkedOk
            ? 'border-emerald-500/30 bg-emerald-500/10'
            : 'border-amber-500/30 bg-amber-500/10'
        }`}
        aria-label="Spotify connected"
      >
        <div className="flex items-start gap-3">
          <span
            className={`text-lg ${linkedOk ? 'text-emerald-400' : 'text-amber-300'}`}
            aria-hidden
          >
            {linkedOk ? '✓' : '!'}
          </span>
          <div className="min-w-0 flex-1">
            <p
              className={`font-medium ${
                linkedOk ? 'text-emerald-200' : 'text-amber-100'
              }`}
            >
              Spotify linked
              {displayName ? ` · ${displayName}` : ''}
            </p>
            <p className="text-sm text-zinc-400">
              {playerStatus.deviceName
                ? `Playing on ${playerStatus.deviceName}. Keep this tab open.`
                : 'Guest picks play on your Spotify. Keep this tab open.'}
            </p>
            {statusMessage && (
              <p className="mt-1 text-sm text-amber-200">{statusMessage}</p>
            )}
            {devices.length > 0 && (
              <label className="mt-3 block text-xs text-zinc-500">
                Device
                <select
                  value={deviceId ?? ''}
                  onChange={(e) => void chooseDevice(e.target.value)}
                  className="mt-1 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-100"
                >
                  {devices.map((device) =>
                    device.id ? (
                      <option key={device.id} value={device.id}>
                        {device.name}
                        {device.is_active ? ' (active)' : ''}
                      </option>
                    ) : null,
                  )}
                </select>
              </label>
            )}
            <div className="mt-2 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void refreshDevices()}
                disabled={busy}
                className="text-xs font-medium text-[#1db954] underline disabled:opacity-50"
              >
                Refresh devices
              </button>
              <a
                href="https://open.spotify.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-zinc-400 underline"
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
        Link <strong className="text-zinc-300">Spotify Premium</strong> so guest
        picks play on your phone, computer, or speaker. YouTube Music can stay
        connected too.
      </p>
      <ol className="list-decimal space-y-1 pl-5 text-xs text-zinc-500">
        <li>Open the Spotify app on the device you want to hear music from.</li>
        <li>Click Connect and approve access.</li>
        <li>Keep this YTMQ tab open while the lobby is running.</li>
      </ol>
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
