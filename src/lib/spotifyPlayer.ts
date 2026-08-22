/**
 * Host-tab Spotify follower. OAuth, then poll whatever is already playing on
 * the host's Spotify app and publish it as the room now-playing so lyrics and
 * the sidebar stay in sync. Playback controls are a remote for that player.
 * We do not push the shared YTMQ queue onto Spotify.
 */
import { subscribePlaybackControl } from './bridgeChannel'
import {
  PREV_RESTART_SECONDS,
  type NowPlaying,
  type NowPlayingNextUp,
  type PlaybackAction,
} from './playback'
import {
  clearSpotifyNowPlayingHold,
  publishNowPlaying,
} from './playbackChannel'
import {
  fetchSpotifyNextUp,
  fetchSpotifyPlayback,
  isNoActiveDevice,
  isPremiumRequired,
  pauseSpotifyPlayback,
  resumeSpotifyPlayback,
  seekSpotifyPlayback,
  setSpotifyVolume,
  skipSpotifyNext,
  skipSpotifyPrevious,
  type SpotifyPlayback,
} from './spotifyApi'

export type SpotifyPlayerStatus = {
  state: 'idle' | 'running' | 'no_device' | 'error'
  message?: string
  deviceName?: string
}

export type SpotifyPlayerOptions = {
  roomId: string
  onStatus: (status: SpotifyPlayerStatus) => void
}

const POLL_MS = 2_000

function log(message: string, ...rest: unknown[]) {
  console.log('[YTMQ:Spotify]', message, ...rest)
}

function trackId(playback: SpotifyPlayback): string | null {
  const item = playback.item
  if (!item?.id || item.type === 'episode') return null
  return `spotify:${item.id}`
}

function playbackToNowPlaying(
  playback: SpotifyPlayback,
  nextUp: NowPlayingNextUp | undefined,
): NowPlaying | null {
  const item = playback.item
  const videoId = trackId(playback)
  if (!item?.name || !videoId) return null
  const artist = (item.artists ?? []).map((entry) => entry.name).join(', ')
  const thumbnailUrl = item.album?.images?.[0]?.url ?? ''
  const duration =
    item.duration_ms > 0 ? item.duration_ms / 1000 : undefined
  const currentTime =
    typeof playback.progress_ms === 'number'
      ? playback.progress_ms / 1000
      : undefined
  const volume =
    typeof playback.device?.volume_percent === 'number'
      ? playback.device.volume_percent
      : undefined
  return {
    videoId,
    title: item.name,
    artist,
    updatedAt: Date.now(),
    currentTime,
    duration,
    state: playback.is_playing ? 'playing' : 'paused',
    volume,
    source: 'spotify',
    thumbnailUrl: thumbnailUrl || undefined,
    nextUp,
  }
}

export function startSpotifyPlayer(options: SpotifyPlayerOptions): () => void {
  const { roomId, onStatus } = options
  let stopped = false
  let inFlight = false
  let lastStatusKey = ''
  let lastTrackId: string | null = null
  let nextUp: NowPlayingNextUp | undefined

  function setStatus(status: SpotifyPlayerStatus) {
    const key = `${status.state}|${status.message ?? ''}|${status.deviceName ?? ''}`
    if (key === lastStatusKey) return
    lastStatusKey = key
    onStatus(status)
  }

  async function refreshNextUp(id: string) {
    if (id === lastTrackId) return
    lastTrackId = id
    nextUp = (await fetchSpotifyNextUp()) ?? undefined
  }

  async function handleControl(
    action: PlaybackAction,
    position?: number,
    volume?: number,
  ) {
    try {
      if (action === 'play') {
        await resumeSpotifyPlayback()
      } else if (action === 'pause') {
        await pauseSpotifyPlayback()
      } else if (action === 'toggle') {
        const playback = await fetchSpotifyPlayback()
        if (playback?.is_playing) await pauseSpotifyPlayback()
        else await resumeSpotifyPlayback()
      } else if (action === 'next') {
        await skipSpotifyNext()
      } else if (action === 'prev') {
        const playback = await fetchSpotifyPlayback()
        const progress = (playback?.progress_ms ?? 0) / 1000
        if (progress > PREV_RESTART_SECONDS) {
          await seekSpotifyPlayback(0)
        } else {
          await skipSpotifyPrevious()
        }
      } else if (action === 'seek' && typeof position === 'number') {
        await seekSpotifyPlayback(position)
      } else if (action === 'volume' && typeof volume === 'number') {
        await setSpotifyVolume(volume)
      }
    } catch (err) {
      if (isPremiumRequired(err)) {
        log('Control needs Spotify Premium')
        return
      }
      if (isNoActiveDevice(err)) {
        setStatus({
          state: 'no_device',
          message: 'Open Spotify and play a song.',
        })
        return
      }
      log('Control failed', err)
    }
  }

  async function tick() {
    if (stopped || inFlight) return
    inFlight = true
    try {
      let playback: SpotifyPlayback | null = null
      try {
        playback = await fetchSpotifyPlayback()
      } catch (err) {
        if (isNoActiveDevice(err)) {
          setStatus({
            state: 'no_device',
            message: 'Open Spotify and play a song.',
          })
          return
        }
        const message =
          err instanceof Error ? err.message : 'Spotify player error'
        log(message, err)
        setStatus({ state: 'error', message })
        return
      }

      const id = playback ? trackId(playback) : null
      if (!playback || !id) {
        setStatus({
          state: 'no_device',
          message: 'Open Spotify and play a song.',
        })
        return
      }

      await refreshNextUp(id)
      if (stopped) return

      const snapshot = playbackToNowPlaying(playback, nextUp)
      if (snapshot) publishNowPlaying(roomId, snapshot)

      setStatus({
        state: 'running',
        deviceName: playback.device?.name,
      })
    } finally {
      inFlight = false
    }
  }

  const unsubscribe = subscribePlaybackControl(roomId, (payload) => {
    if (stopped) return
    void handleControl(payload.action, payload.position, payload.volume)
  })
  void tick()
  const pollTimer = window.setInterval(() => {
    void tick()
  }, POLL_MS)

  return () => {
    stopped = true
    unsubscribe()
    window.clearInterval(pollTimer)
    clearSpotifyNowPlayingHold(roomId)
  }
}
