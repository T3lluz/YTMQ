import {
  getSpotifyDeviceId,
  getValidSpotifyAccessToken,
  setSpotifyDisplayName,
} from './spotifyAuth'
import {
  buildSpotifySearchQueries,
  pickSpotifyMatch,
  type SpotifyTrackCandidate,
} from './spotifyMatch'

const API = 'https://api.spotify.com/v1'

export class SpotifyApiError extends Error {
  status: number
  reason: string | null

  constructor(status: number, message: string, reason: string | null = null) {
    super(message)
    this.name = 'SpotifyApiError'
    this.status = status
    this.reason = reason
  }
}

export function isNoActiveDevice(err: unknown): boolean {
  return err instanceof SpotifyApiError && (err.status === 404 || err.reason === 'NO_ACTIVE_DEVICE')
}

export function isPremiumRequired(err: unknown): boolean {
  return (
    err instanceof SpotifyApiError &&
    (err.status === 403 || err.reason === 'PREMIUM_REQUIRED')
  )
}

type ErrorBody = {
  error?: { status?: number; message?: string; reason?: string }
}

async function spotifyFetch(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<Response> {
  const token = await getValidSpotifyAccessToken()
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })

  if (response.status === 401 && retry) {
    await getValidSpotifyAccessToken(true)
    return spotifyFetch(path, init, false)
  }

  if (!response.ok && response.status !== 204) {
    let reason: string | null = null
    let message = `Spotify ${response.status}`
    try {
      const body = (await response.json()) as ErrorBody
      reason = body.error?.reason ?? null
      if (body.error?.message) message = body.error.message
    } catch {
      /* ignore */
    }
    throw new SpotifyApiError(response.status, message, reason)
  }

  return response
}

async function spotifyJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await spotifyFetch(path, init)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export type SpotifyDevice = {
  id: string | null
  is_active: boolean
  name: string
  type: string
  volume_percent?: number | null
}

export type SpotifyPlayback = {
  is_playing: boolean
  progress_ms: number | null
  device?: SpotifyDevice
  item: {
    type?: string
    id: string | null
    uri: string
    name: string
    duration_ms: number
    artists: { name: string }[]
    album?: { images?: { url: string }[] }
  } | null
}

export async function fetchSpotifyProfile(): Promise<{ displayName: string } | null> {
  try {
    const me = await spotifyJson<{ display_name?: string }>('/me')
    const displayName = me.display_name?.trim() || 'Spotify'
    setSpotifyDisplayName(displayName)
    return { displayName }
  } catch {
    return null
  }
}

export async function fetchSpotifyDevices(): Promise<SpotifyDevice[]> {
  const data = await spotifyJson<{ devices?: SpotifyDevice[] }>('/me/player/devices')
  return (data.devices ?? []).filter((device) => Boolean(device.id))
}

export async function fetchSpotifyPlayback(): Promise<SpotifyPlayback | null> {
  const response = await spotifyFetch('/me/player')
  if (response.status === 204) return null
  return (await response.json()) as SpotifyPlayback
}

function deviceQuery(): string {
  const id = getSpotifyDeviceId()
  return id ? `?device_id=${encodeURIComponent(id)}` : ''
}

export async function transferSpotifyPlayback(deviceId: string, play = false) {
  await spotifyFetch('/me/player', {
    method: 'PUT',
    body: JSON.stringify({ device_ids: [deviceId], play }),
  })
}

export async function playSpotifyTrack(uri: string, deviceId?: string) {
  const id = deviceId || getSpotifyDeviceId()
  const query = id ? `?device_id=${encodeURIComponent(id)}` : ''
  await spotifyFetch(`/me/player/play${query}`, {
    method: 'PUT',
    body: JSON.stringify({ uris: [uri] }),
  })
}

export async function pauseSpotifyPlayback() {
  await spotifyFetch(`/me/player/pause${deviceQuery()}`, { method: 'PUT' })
}

export async function resumeSpotifyPlayback() {
  await spotifyFetch(`/me/player/play${deviceQuery()}`, { method: 'PUT' })
}

export async function skipSpotifyNext() {
  await spotifyFetch(`/me/player/next${deviceQuery()}`, { method: 'POST' })
}

export async function skipSpotifyPrevious() {
  await spotifyFetch(`/me/player/previous${deviceQuery()}`, { method: 'POST' })
}

export async function seekSpotifyPlayback(positionSec: number) {
  const ms = Math.max(0, Math.round(positionSec * 1000))
  const join = deviceQuery() ? '&' : '?'
  await spotifyFetch(
    `/me/player/seek${deviceQuery()}${join}position_ms=${ms}`,
    { method: 'PUT' },
  )
}

export async function setSpotifyVolume(volume: number) {
  const pct = Math.min(100, Math.max(0, Math.round(volume)))
  const join = deviceQuery() ? '&' : '?'
  await spotifyFetch(
    `/me/player/volume${deviceQuery()}${join}volume_percent=${pct}`,
    { method: 'PUT' },
  )
}

type SearchTrack = {
  id: string
  uri: string
  name: string
  duration_ms: number
  artists?: { name: string }[]
  album?: { images?: { url: string }[] }
}

function candidateFromTrack(track: SearchTrack): SpotifyTrackCandidate {
  return {
    id: track.id,
    uri: track.uri,
    name: track.name,
    artist: (track.artists ?? []).map((artist) => artist.name).join(', '),
    albumArt: track.album?.images?.[0]?.url ?? '',
    durationMs: track.duration_ms,
  }
}

export async function searchSpotifyTrack(
  title: string,
  artist: string,
): Promise<SpotifyTrackCandidate | null> {
  const queries = buildSpotifySearchQueries(title, artist)
  for (const query of queries) {
    const data = await spotifyJson<{
      tracks?: { items?: SearchTrack[] }
    }>(`/search?type=track&limit=5&q=${encodeURIComponent(query)}`)
    const candidates = (data.tracks?.items ?? [])
      .filter((track) => track?.id && track.uri)
      .map(candidateFromTrack)
    const match = pickSpotifyMatch(title, artist, candidates)
    if (match) return match
  }
  return null
}
