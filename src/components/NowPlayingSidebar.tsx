import { useEffect, useRef, useState } from 'react'
import { nowPlayingArtwork } from '../lib/queue'
import { useNowPlaying } from '../hooks/useNowPlaying'
import { usePlaybackPosition } from '../hooks/usePlaybackPosition'
import { useImagePalette } from '../hooks/useImagePalette'
import { useLyrics } from '../hooks/useLyrics'
import { paletteCssVars } from '../lib/imagePalette'
import { sendPlaybackControl, sendPlaybackSeek } from '../lib/bridgeChannel'
import type { PlaybackAction } from '../lib/playback'
import { LyricsBackdrop, LyricsBody } from './LyricsView'
import { PlaybackControls } from './PlaybackControls'
import { SquigglyProgress } from './SquigglyProgress'

type NowPlayingSidebarProps = {
  roomId: string
  className?: string
  /** Whether this viewer may drive playback (host, or guest controls enabled). */
  canControl?: boolean
}

/**
 * `maxresdefault` isn't generated for every video; swap to the always-present
 * 16:9 `mqdefault` once on error so the art still crops cleanly.
 */
function handleArtError(event: React.SyntheticEvent<HTMLImageElement>) {
  const img = event.currentTarget
  if (img.dataset.fallback === '1') return
  if (img.src.includes('/maxresdefault.jpg')) {
    img.dataset.fallback = '1'
    img.src = img.src.replace('/maxresdefault.jpg', '/mqdefault.jpg')
  }
}

function Equalizer() {
  return (
    <span className="ytmq-eq" aria-hidden>
      <span className="ytmq-eq-bar" />
      <span className="ytmq-eq-bar" />
      <span className="ytmq-eq-bar" />
      <span className="ytmq-eq-bar" />
    </span>
  )
}

/**
 * Spotify-style "now playing" rail: album art, the live synced lyrics, and the
 * palette-tinted moving background. Persists alongside every tab except the
 * dedicated Lyrics tab (where the immersive full view takes over instead).
 */
export function NowPlayingSidebar({
  roomId,
  className = '',
  canControl = true,
}: NowPlayingSidebarProps) {
  const { nowPlaying, connected, stale } = useNowPlaying(roomId)
  const isPlaying = nowPlaying?.state === 'playing'
  const live = Boolean(isPlaying && !stale && nowPlaying)
  const position = usePlaybackPosition(nowPlaying ?? null, live)

  const art = nowPlaying ? nowPlayingArtwork(nowPlaying, 'hq') : undefined
  const { palette, ready: paletteReady } = useImagePalette(art)

  const { lyrics, status } = useLyrics(
    nowPlaying
      ? {
          videoId: nowPlaying.videoId,
          title: nowPlaying.title,
          artist: nowPlaying.artist,
          duration: nowPlaying.duration,
        }
      : null,
  )

  // Transient "pressed" highlight for the transport buttons.
  const [pendingAction, setPendingAction] = useState<PlaybackAction | null>(null)
  const pendingActionTimer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (pendingActionTimer.current) window.clearTimeout(pendingActionTimer.current)
    }
  }, [])

  const trackId = nowPlaying?.videoId
  const updatedAt = nowPlaying?.updatedAt

  const trigger = (action: PlaybackAction) => {
    sendPlaybackControl(roomId, action)
    setPendingAction(action)
    if (pendingActionTimer.current) window.clearTimeout(pendingActionTimer.current)
    pendingActionTimer.current = window.setTimeout(
      () => setPendingAction(null),
      700,
    )
  }

  if (!nowPlaying) {
    return (
      <aside
        className={`relative isolate flex h-full min-h-0 flex-col overflow-hidden rounded-3xl bg-neutral-900/60 ${className}`}
      >
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.06] text-neutral-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden>
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </div>
          <p className="text-base font-bold text-white">Nothing playing yet</p>
          <p className="max-w-[15rem] text-sm text-neutral-500">
            {connected
              ? 'Art, progress and controls show up here when the next song starts.'
              : 'When the host links YouTube Music or Spotify, the current song shows up here.'}
          </p>
        </div>
      </aside>
    )
  }

  const duration = nowPlaying.duration
  const hasDuration = duration != null && duration > 0

  const controlsDisabled = !connected || stale || !canControl
  const canSeek = canControl && hasDuration && connected && !stale

  // Only reserve the lyrics pane while a lookup is in flight or real lyrics
  // exist; otherwise let the artwork breathe (centred) on its own.
  const showLyrics =
    status === 'loading' ||
    (!!lyrics &&
      !lyrics.instrumental &&
      (lyrics.synced.length > 0 || !!lyrics.plain))

  return (
    <aside
      className={`ytmq-now-rail ytmq-anim-fade relative isolate flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border ${className}`}
      style={{ ...paletteCssVars(palette), borderColor: 'var(--np-accent-border)' }}
      aria-label={`Now playing: ${nowPlaying.title}`}
    >
      <LyricsBackdrop art={art} live={live} paletteReady={paletteReady} />

      <div
        className={`relative flex min-h-0 flex-1 flex-col gap-4 px-2.5 py-5 ${
          showLyrics ? '' : 'justify-center'
        }`}
      >
        <div className="flex shrink-0 flex-col items-center gap-3">
          <img
            src={art}
            alt=""
            crossOrigin="anonymous"
            onError={handleArtError}
            className={`ytmq-now-art aspect-square w-[clamp(9rem,90cqw,30rem)] rounded-2xl object-cover shadow-2xl ring-1 ring-white/15 ${
              live ? 'is-live' : ''
            }`}
          />
          <div className="w-full min-w-0 text-center">
            <p
              className="flex items-center justify-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: 'color-mix(in srgb, var(--np-accent-light) 88%, white)' }}
            >
              {live && <Equalizer />}
              {live ? 'Now playing' : 'Paused'}
            </p>
            <p className="truncate text-lg font-bold text-white drop-shadow">
              {nowPlaying.title}
            </p>
            {nowPlaying.artist && (
              <p className="truncate text-sm text-neutral-300">
                {nowPlaying.artist}
              </p>
            )}
          </div>

          <SquigglyProgress
            className="w-full"
            position={position}
            duration={duration}
            playing={live}
            canSeek={canSeek}
            onSeek={(v) => sendPlaybackSeek(roomId, v)}
            updatedAt={updatedAt}
            trackKey={trackId}
            size="md"
          />

          <PlaybackControls
            className="mt-1"
            isPlaying={isPlaying}
            disabled={controlsDisabled}
            pendingAction={pendingAction}
            onControl={trigger}
            title={
              !canControl ? 'The host has limited playback controls' : undefined
            }
          />
        </div>

        {showLyrics && (
          <div className="ytmq-lyrics-pane relative min-h-0 flex-1">
            <LyricsBody
              status={status}
              lyrics={lyrics}
              position={position}
              stale={stale}
            />
          </div>
        )}
      </div>
    </aside>
  )
}

