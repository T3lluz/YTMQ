/**
 * Host-tab Spotify player. The shared YTMQ queue is the source of truth:
 * we match each row to a Spotify track and play the top of the queue on the
 * host's Spotify Connect device. We do not use Spotify's own native queue, so
 * guest remove/reorder work the same as they do for YouTube Music.
 */
import { subscribePlaybackControl } from './bridgeChannel'
import {
  PREV_RESTART_SECONDS,
  type NowPlaying,
  type PlaybackAction,
} from './playback'
import {
  clearSpotifyNowPlayingHold,
  publishNowPlaying,
} from './playbackChannel'
import { isTrackInPlaybackSession } from './playbackSession'
import type { QueueItem } from './queue'
import { removeQueueItem } from './queue'
import {
  createPlayedQueueCleanup,
  type SharedQueueRow,
} from '../bridge/playedQueueCleanup'
import {
  fetchSpotifyPlayback,
  isNoActiveDevice,
  isPremiumRequired,
  pauseSpotifyPlayback,
  playSpotifyTrack,
  resumeSpotifyPlayback,
  searchSpotifyTrack,
  seekSpotifyPlayback,
  setSpotifyVolume,
  skipSpotifyPrevious,
  type SpotifyPlayback,
} from './spotifyApi'
import { getSpotifyDeviceId } from './spotifyAuth'
import {
  pickNextPlayable,
  type SpotifyTrackCandidate,
} from './spotifyMatch'

export type SpotifyPlayerStatus = {
  state: 'idle' | 'running' | 'no_device' | 'not_premium' | 'error'
  message?: string
  deviceName?: string
}

export type SpotifyPlayerOptions = {
  roomId: string
  getQueueItems: () => QueueItem[]
  getPlaybackSince: () => string
  onStatus: (status: SpotifyPlayerStatus) => void
}

const POLL_MS = 2_000
const COMMAND_GRACE_MS = 2_500

function log(message: string, ...rest: unknown[]) {
  console.log('[YTMQ:Spotify]', message, ...rest)
}

function playbackToNowPlaying(
  playback: SpotifyPlayback,
  videoId: string,
): NowPlaying | null {
  const item = playback.item
  if (!item?.name) return null
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
  }
}

export function startSpotifyPlayer(options: SpotifyPlayerOptions): () => void {
  const { roomId, getQueueItems, getPlaybackSince, onStatus } = options
  let stopped = false
  let inFlight = false
  let lastCommandAt = 0
  let lastCommandedUri: string | null = null
  let lastCleanupUri: string | null = null
  let lastStatusKey = ''

  const matched = new Map<string, SpotifyTrackCandidate>()
  const failed = new Set<string>()
  const matching = new Set<string>()

  function setStatus(status: SpotifyPlayerStatus) {
    const key = `${status.state}|${status.message ?? ''}|${status.deviceName ?? ''}`
    if (key === lastStatusKey) return
    lastStatusKey = key
    onStatus(status)
  }

  function sessionItems(): QueueItem[] {
    const since = getPlaybackSince()
    return getQueueItems().filter((item) =>
      isTrackInPlaybackSession(item.created_at, since),
    )
  }

  const cleanup = createPlayedQueueCleanup({
    findByVideoId: async (videoId) => {
      const item = getQueueItems().find((row) => row.video_id === videoId)
      if (!item) return null
      return {
        id: item.id,
        created_at: item.created_at,
        title: item.title,
        video_id: item.video_id,
        insert_mode: item.insert_mode,
      } satisfies SharedQueueRow
    },
    findTopOfQueue: async () => {
      const top = sessionItems()[0]
      if (!top) return null
      return {
        id: top.id,
        created_at: top.created_at,
        title: top.title,
        video_id: top.video_id,
        insert_mode: top.insert_mode,
      } satisfies SharedQueueRow
    },
    deleteRow: async (row, reason) => {
      try {
        await removeQueueItem(row.id)
        log('Removed shared queue row', reason, row.title)
        return true
      } catch (err) {
        log('Shared queue delete failed', reason, err)
        return false
      }
    },
    isInPlaybackSession: (createdAt) =>
      isTrackInPlaybackSession(createdAt, getPlaybackSince()),
  })

  async function ensureMatches() {
    const items = sessionItems()
    await Promise.all(
      items.map(async (item) => {
        if (matched.has(item.id) || failed.has(item.id) || matching.has(item.id)) {
          return
        }
        matching.add(item.id)
        try {
          const match = await searchSpotifyTrack(item.title, item.channel_title)
          if (stopped) return
          if (match) {
            matched.set(item.id, match)
            log('Matched', item.title, '→', match.name, match.artist)
          } else {
            failed.add(item.id)
            log('No Spotify match', item.title, item.channel_title)
          }
        } catch (err) {
          log('Search failed', item.title, err)
        } finally {
          matching.delete(item.id)
        }
      }),
    )
  }

  function videoIdForUri(uri: string, fallbackId: string): string {
    for (const item of getQueueItems()) {
      if (matched.get(item.id)?.uri === uri) return item.video_id
    }
    return fallbackId
  }

  async function playNextFromQueue(reason: string): Promise<boolean> {
    const next = pickNextPlayable(sessionItems(), matched, failed)
    if (!next) return false
    if (next.match.uri === lastCommandedUri && Date.now() - lastCommandAt < COMMAND_GRACE_MS) {
      return true
    }
    lastCommandedUri = next.match.uri
    lastCommandAt = Date.now()
    log('Play', reason, next.item.title, next.match.uri)
    await playSpotifyTrack(next.match.uri, getSpotifyDeviceId() ?? undefined)
    return true
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
        const played = await playNextFromQueue('skip')
        if (!played) await pauseSpotifyPlayback()
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
      lastCommandAt = Date.now()
    } catch (err) {
      handlePlayerError(err)
    }
  }

  function handlePlayerError(err: unknown) {
    if (isPremiumRequired(err)) {
      setStatus({
        state: 'not_premium',
        message: 'Spotify Premium is required to control playback.',
      })
      return
    }
    if (isNoActiveDevice(err)) {
      setStatus({
        state: 'no_device',
        message: 'Open Spotify on a phone, computer, or speaker, then play something.',
      })
      return
    }
    const message = err instanceof Error ? err.message : 'Spotify player error'
    log(message, err)
    setStatus({ state: 'error', message })
  }

  async function tick() {
    if (stopped || inFlight) return
    inFlight = true
    try {
      await ensureMatches()
      if (stopped) return

      let playback: SpotifyPlayback | null = null
      try {
        playback = await fetchSpotifyPlayback()
      } catch (err) {
        handlePlayerError(err)
        return
      }

      if (playback?.device?.name) {
        setStatus({
          state: 'running',
          deviceName: playback.device.name,
        })
      } else if (!playback) {
        setStatus({
          state: 'no_device',
          message: 'Open Spotify on a phone, computer, or speaker, then play something.',
        })
      }

      const playingUri =
        playback?.item?.type === 'episode' ? null : playback?.item?.uri ?? null
      const withinGrace = Date.now() - lastCommandAt < COMMAND_GRACE_MS
      const progressSec = (playback?.progress_ms ?? 0) / 1000
      const durationSec = (playback?.item?.duration_ms ?? 0) / 1000
      const ended =
        Boolean(playingUri) &&
        !playback?.is_playing &&
        durationSec > 0 &&
        progressSec >= durationSec - 1.5

      if (playingUri && playback) {
        const videoId = videoIdForUri(playingUri, playingUri)
        const snapshot = playbackToNowPlaying(playback, videoId)
        if (snapshot) publishNowPlaying(roomId, snapshot)

        const queued = pickNextPlayable(sessionItems(), matched, failed)
        const isOurs = [...matched.values()].some((match) => match.uri === playingUri)

        if (isOurs && playingUri !== lastCleanupUri) {
          lastCleanupUri = playingUri
          void cleanup(videoId)
        }

        if (ended && !withinGrace) {
          await playNextFromQueue('ended')
        } else if (
          playback.is_playing &&
          !withinGrace &&
          queued &&
          playingUri !== queued.match.uri &&
          !isOurs
        ) {
          // Spotify started autoplay / radio — take back control.
          await playNextFromQueue('autoplay takeover')
        }
      } else if (!withinGrace) {
        await playNextFromQueue('idle')
      }
    } catch (err) {
      handlePlayerError(err)
    } finally {
      inFlight = false
    }
  }

  setStatus({ state: 'running' })
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
