/**
 * The host tab's Spotify player. After OAuth it polls the host's Spotify,
 * publishes what plays as the room's now playing, takes the room's controls
 * when Spotify is the active player, and plays the shared queue on it.
 *
 * Spotify's queue cannot be reordered or trimmed through the API, so the
 * shared queue is handed over one song at a time: when the current track has
 * under half a minute left (or someone presses next), the top row goes into
 * Spotify's queue, and once it starts playing it leaves the shared queue.
 * Until that moment guests can still remove and reorder freely.
 *
 * Smart shuffle: Spotify's own cannot be switched on through the API, so
 * YTMQ does it. With it on, every third song is a related one from YouTube
 * Music's radio for what is playing, added to the shared queue marked as a
 * smart shuffle pick, where anyone can remove it.
 */
import { subscribePlaybackControl, type PlaybackControlPayload } from './bridgeChannel'
import {
  PREV_RESTART_SECONDS,
  type NowPlaying,
  type NowPlayingNextUp,
} from './playback'
import { forgetSource, getActiveSource, publishNowPlaying } from './playbackChannel'
import {
  addToSpotifyQueue,
  fetchSpotifyNextUp,
  fetchSpotifyPlayback,
  isNoActiveDevice,
  isPremiumRequired,
  pauseSpotifyPlayback,
  resumeSpotifyPlayback,
  searchSpotifyTracks,
  seekSpotifyPlayback,
  setSpotifyShuffle,
  setSpotifyVolume,
  skipSpotifyNext,
  skipSpotifyPrevious,
  type SpotifyPlayback,
} from './spotifyApi'
import { buildSpotifySearchQueries, pickSpotifyMatch } from './spotifyMatch'
import { addTrackToQueue, removeQueueItem, type QueueItem } from './queue'
import { notifyBridgeQueueRemove } from './bridgeChannel'
import { ytmq } from './api'

export type SpotifyPlayerStatus = {
  state: 'idle' | 'running' | 'no_device' | 'error'
  message?: string
  deviceName?: string
}

export type SpotifyPlayerOptions = {
  roomId: string
  hostToken: string | null
  /** The shared queue as the room page has it, top first. */
  getQueue: () => QueueItem[]
  onStatus: (status: SpotifyPlayerStatus) => void
  /** Something the host should know ("Not on Spotify: …"). */
  onNotice?: (message: string) => void
}

const POLL_MS = 2_000
/** Hand the next shared song to Spotify this long before the current one ends. */
const FEED_LEAD_MS = 25_000
/** A handed-over song that has not started after this long is given up on. */
const PUSH_EXPIRES_MS = 20 * 60_000
const SMART_EVERY = 3
const SMART_KEY = (roomId: string) => `ytmq_smart_shuffle_${roomId}`

function log(message: string, ...rest: unknown[]) {
  console.log('[YTMQ:Spotify]', message, ...rest)
}

function trackId(playback: SpotifyPlayback): string | null {
  const item = playback.item
  if (!item?.id || item.type === 'episode') return null
  return `spotify:${item.id}`
}

function artistOf(row: QueueItem): string {
  const names = row.meta?.artists?.map((a) => a.name).filter(Boolean)
  return names?.length ? names.join(', ') : row.channel_title
}

function readSmart(roomId: string): boolean {
  try {
    return localStorage.getItem(SMART_KEY(roomId)) === '1'
  } catch {
    return false
  }
}

function writeSmart(roomId: string, on: boolean) {
  try {
    localStorage.setItem(SMART_KEY(roomId), on ? '1' : '0')
  } catch {
    /* private mode */
  }
}

export function startSpotifyPlayer(options: SpotifyPlayerOptions): () => void {
  const { roomId, hostToken, getQueue, onStatus, onNotice } = options
  let stopped = false
  let inFlight = false
  let lastStatusKey = ''
  let lastTrackId: string | null = null
  let nextUp: NowPlayingNextUp | undefined
  let lastPlayback: SpotifyPlayback | null = null
  let smart = readSmart(roomId)
  let tracksSinceSmart = 0
  let smartBusy = false

  // Shared rows handed to Spotify that have not started yet: row id → uri.
  const pushed = new Map<string, { uri: string; at: number; title: string }>()
  // Rows whose Spotify twin was looked up: video id → uri, or null for none.
  const resolved = new Map<string, string | null>()
  let feeding = false

  function setStatus(status: SpotifyPlayerStatus) {
    const key = `${status.state}|${status.message ?? ''}|${status.deviceName ?? ''}`
    if (key === lastStatusKey) return
    lastStatusKey = key
    onStatus(status)
  }

  function publish(playback: SpotifyPlayback) {
    const item = playback.item
    const videoId = trackId(playback)
    if (!item?.name || !videoId) return
    const snapshot: NowPlaying = {
      videoId,
      title: item.name,
      artist: (item.artists ?? []).map((entry) => entry.name).join(', '),
      updatedAt: Date.now(),
      currentTime: typeof playback.progress_ms === 'number' ? playback.progress_ms / 1000 : undefined,
      duration: item.duration_ms > 0 ? item.duration_ms / 1000 : undefined,
      state: playback.is_playing ? 'playing' : 'paused',
      volume:
        typeof playback.device?.volume_percent === 'number' ? playback.device.volume_percent : undefined,
      source: 'spotify',
      thumbnailUrl: item.album?.images?.[0]?.url || undefined,
      nextUp,
      shuffle: Boolean(playback.shuffle_state),
      smartShuffle: smart || Boolean(playback.smart_shuffle),
      deviceName: playback.device?.name,
    }
    publishNowPlaying(roomId, snapshot)
  }

  async function resolveRow(row: QueueItem): Promise<string | null> {
    if (resolved.has(row.video_id)) return resolved.get(row.video_id) ?? null
    const artist = artistOf(row)
    let uri: string | null = null
    for (const query of buildSpotifySearchQueries(row.title, artist)) {
      const candidates = await searchSpotifyTracks(query, 8)
      const match = pickSpotifyMatch(row.title, artist, candidates, undefined, row.meta?.duration)
      if (match) {
        uri = match.uri
        break
      }
    }
    resolved.set(row.video_id, uri)
    return uri
  }

  async function dropRow(row: QueueItem) {
    notifyBridgeQueueRemove(roomId, { id: row.id, video_id: row.video_id, title: row.title })
    await removeQueueItem(row.id).catch(() => {})
  }

  /** Hand the top shared song to Spotify. True when one was handed over. */
  async function feedNext(): Promise<boolean> {
    if (feeding) return false
    feeding = true
    try {
      for (const row of getQueue()) {
        if (pushed.has(row.id)) return false
        const uri = await resolveRow(row).catch(() => undefined)
        if (uri === undefined) return false
        if (!uri) {
          onNotice?.(`Not on Spotify, skipped: ${row.title}`)
          log('No Spotify match', row.title)
          await dropRow(row)
          continue
        }
        await addToSpotifyQueue(uri)
        pushed.set(row.id, { uri, at: Date.now(), title: row.title })
        log('Handed to Spotify', row.title, uri)
        return true
      }
      return false
    } finally {
      feeding = false
    }
  }

  async function onTrackStarted(playback: SpotifyPlayback) {
    const uri = playback.item?.uri
    if (!uri) return
    const queue = getQueue()
    let smartPlayed = false
    for (const [rowId, entry] of pushed) {
      if (entry.uri !== uri) continue
      pushed.delete(rowId)
      const row = queue.find((r) => r.id === rowId)
      if (!row) {
        // Removed from the shared queue after it was handed over: skip it.
        log('Skipping a song removed from the queue', entry.title)
        await skipSpotifyNext().catch(() => {})
        return
      }
      if (row.meta?.smart) smartPlayed = true
      await dropRow(row)
    }
    tracksSinceSmart = smartPlayed ? 0 : tracksSinceSmart + 1
    void maybeSmartPick(playback)
  }

  async function maybeSmartPick(playback: SpotifyPlayback) {
    if (!smart || smartBusy || !hostToken) return
    const queue = getQueue()
    if (queue.some((r) => r.meta?.smart)) return
    if (tracksSinceSmart < SMART_EVERY - 1 && queue.length > 0) return
    const item = playback.item
    if (!item?.name) return
    smartBusy = true
    try {
      const artist = (item.artists ?? []).map((a) => a.name).join(', ')
      const match = await ytmq.invoke<{ track?: { videoId: string } | null }>('search', {
        type: 'match',
        title: item.name,
        artist,
        duration: item.duration_ms / 1000,
      })
      const seed = match?.track?.videoId
      if (!seed) return
      const radio = await ytmq.invoke<{
        tracks?: {
          videoId: string
          title: string
          artists: { id: string | null; name: string }[]
          album: { name: string } | null
          duration: number | null
          explicit: boolean
          thumbnail: string
        }[]
      }>('search', { type: 'radio', videoId: seed })
      const taken = new Set(queue.map((r) => r.video_id))
      const pick = (radio?.tracks ?? []).find(
        (t) => !taken.has(t.videoId) && t.title.toLowerCase() !== item.name.toLowerCase(),
      )
      if (!pick) return
      await addTrackToQueue(roomId, {
        video_id: pick.videoId,
        title: pick.title,
        channel_title: pick.artists.map((a) => a.name).join(', '),
        thumbnail_url: pick.thumbnail,
        added_by: 'Smart shuffle',
        insert_mode: 'queue',
        host_token: hostToken,
        meta: {
          duration: pick.duration ?? undefined,
          album: pick.album?.name,
          artists: pick.artists,
          explicit: pick.explicit,
          smart: true,
        },
      })
      tracksSinceSmart = 0
      log('Smart shuffle added', pick.title)
    } catch (err) {
      log('Smart shuffle pick failed', err)
    } finally {
      smartBusy = false
    }
  }

  async function handleControl(payload: PlaybackControlPayload) {
    const { action, position, volume, state } = payload
    // With YouTube Music the room's player, its bridge takes the controls.
    if (payload.target && payload.target !== 'spotify') return
    if (!payload.target && getActiveSource(roomId) === 'ytm') return
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
        // A shared song waiting its turn goes first, as "next" means it.
        const waiting = [...pushed.values()].some((p) => Date.now() - p.at < PUSH_EXPIRES_MS)
        if (!waiting && getQueue().length > 0) await feedNext().catch(() => false)
        await skipSpotifyNext()
      } else if (action === 'prev') {
        const playback = await fetchSpotifyPlayback()
        const progress = (playback?.progress_ms ?? 0) / 1000
        if (progress > PREV_RESTART_SECONDS) await seekSpotifyPlayback(0)
        else await skipSpotifyPrevious()
      } else if (action === 'seek' && typeof position === 'number') {
        await seekSpotifyPlayback(position)
      } else if (action === 'volume' && typeof volume === 'number') {
        await setSpotifyVolume(volume)
      } else if (action === 'shuffle') {
        const next = state ?? !lastPlayback?.shuffle_state
        await setSpotifyShuffle(next)
        if (!next && smart) {
          smart = false
          writeSmart(roomId, false)
        }
      } else if (action === 'smart_shuffle') {
        smart = state ?? !smart
        writeSmart(roomId, smart)
        if (smart) {
          tracksSinceSmart = SMART_EVERY
          await setSpotifyShuffle(true).catch(() => {})
          if (lastPlayback) void maybeSmartPick(lastPlayback)
        }
      }
      window.setTimeout(() => void tick(), 350)
    } catch (err) {
      if (isPremiumRequired(err)) {
        onNotice?.('Spotify needs Premium for that')
        log('Control needs Spotify Premium')
        return
      }
      if (isNoActiveDevice(err)) {
        setStatus({ state: 'no_device', message: 'Open Spotify and play a song.' })
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
          setStatus({ state: 'no_device', message: 'Open Spotify and play a song.' })
          return
        }
        const message = err instanceof Error ? err.message : 'Spotify player error'
        log(message, err)
        setStatus({ state: 'error', message })
        return
      }

      const id = playback ? trackId(playback) : null
      if (!playback || !id) {
        setStatus({ state: 'no_device', message: 'Open Spotify and play a song.' })
        return
      }
      lastPlayback = playback

      if (id !== lastTrackId) {
        const first = lastTrackId === null
        lastTrackId = id
        nextUp = (await fetchSpotifyNextUp()) ?? undefined
        if (!first) await onTrackStarted(playback)
      }
      if (stopped) return
      publish(playback)
      setStatus({ state: 'running', deviceName: playback.device?.name })

      // Spotify plays the shared queue only while it is the room's player.
      const ours = playback.is_playing || getActiveSource(roomId) === 'spotify'
      if (!ours) return
      for (const [rowId, entry] of pushed) {
        if (Date.now() - entry.at > PUSH_EXPIRES_MS) pushed.delete(rowId)
      }
      const waiting = pushed.size > 0
      const remaining = (playback.item?.duration_ms ?? 0) - (playback.progress_ms ?? 0)
      if (!waiting && playback.is_playing && remaining > 0 && remaining < FEED_LEAD_MS) {
        if (await feedNext().catch(() => false)) nextUp = (await fetchSpotifyNextUp()) ?? nextUp
      }
    } finally {
      inFlight = false
    }
  }

  const unsubscribe = subscribePlaybackControl(roomId, (payload) => {
    if (stopped) return
    void handleControl(payload)
  })
  void tick()
  const pollTimer = window.setInterval(() => {
    void tick()
  }, POLL_MS)

  return () => {
    stopped = true
    unsubscribe()
    window.clearInterval(pollTimer)
    forgetSource(roomId, 'spotify')
  }
}
