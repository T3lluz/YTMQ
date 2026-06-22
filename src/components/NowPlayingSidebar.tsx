import { useEffect, useRef, useState } from 'react'
import { hqThumbnail } from '../lib/queue'
import { useNowPlaying } from '../hooks/useNowPlaying'
import { usePlaybackPosition } from '../hooks/usePlaybackPosition'
import { useImagePalette } from '../hooks/useImagePalette'
import { useLyrics } from '../hooks/useLyrics'
import { paletteCssVars } from '../lib/imagePalette'
import { sendPlaybackControl, sendPlaybackSeek } from '../lib/bridgeChannel'
import { formatPlaybackTime, type PlaybackAction } from '../lib/playback'
import { LyricsBackdrop, LyricsBody } from './LyricsView'

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

  const art = nowPlaying ? hqThumbnail(nowPlaying.videoId) : undefined
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

  // Optimistic scrub target while the host drags the bar: the bar/time jump to
  // it instantly and stay there until the bridge reports a position recorded
  // after our seek was sent (so it never snaps back to a stale broadcast).
  const [pendingSeek, setPendingSeek] = useState<number | null>(null)
  const [draggingSeek, setDraggingSeek] = useState(false)
  const seekTrackRef = useRef<HTMLDivElement | null>(null)
  const seekSentAtRef = useRef(0)

  useEffect(() => {
    return () => {
      if (pendingActionTimer.current) window.clearTimeout(pendingActionTimer.current)
    }
  }, [])

  const trackId = nowPlaying?.videoId
  useEffect(() => {
    setPendingSeek(null)
  }, [trackId])

  const updatedAt = nowPlaying?.updatedAt
  useEffect(() => {
    if (pendingSeek == null) return
    if (updatedAt != null && updatedAt > seekSentAtRef.current) {
      setPendingSeek(null)
    }
  }, [updatedAt, pendingSeek])

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
        className={`relative isolate flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40 ${className}`}
      >
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-800/70 text-2xl">
            ♪
          </div>
          <p className="text-sm font-medium text-zinc-300">Nothing playing</p>
          <p className="max-w-[14rem] text-sm text-zinc-500">
            {connected
              ? 'Album art and lyrics will appear here once a song starts.'
              : 'Keep music.youtube.com open and playing to follow along here.'}
          </p>
        </div>
      </aside>
    )
  }

  const duration = nowPlaying.duration
  const hasDuration = duration != null && duration > 0
  const shownPosition = pendingSeek ?? position
  const percent = hasDuration
    ? Math.min(100, Math.max(0, (shownPosition / duration) * 100))
    : 0

  const controlsDisabled = !connected || stale || !canControl
  const canSeek = canControl && hasDuration && connected && !stale

  // Map a pointer's x to a track position (seconds) along the progress bar.
  const seekPositionFromClientX = (clientX: number): number | null => {
    const el = seekTrackRef.current
    if (!el || duration == null) return null
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) return null
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return ratio * duration
  }

  const onSeekPointerDown = (e: React.PointerEvent) => {
    if (!canSeek) return
    const next = seekPositionFromClientX(e.clientX)
    if (next == null) return
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setDraggingSeek(true)
    setPendingSeek(next)
    // Hold the optimistic value through any routine broadcasts until we send.
    seekSentAtRef.current = Number.POSITIVE_INFINITY
  }

  const onSeekPointerMove = (e: React.PointerEvent) => {
    if (!draggingSeek) return
    const next = seekPositionFromClientX(e.clientX)
    if (next != null) setPendingSeek(next)
  }

  const endSeekDrag = (e: React.PointerEvent) => {
    if (!draggingSeek) return
    const next = seekPositionFromClientX(e.clientX) ?? pendingSeek
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    setDraggingSeek(false)
    if (next != null) {
      setPendingSeek(next)
      sendPlaybackSeek(roomId, next)
      seekSentAtRef.current = Date.now()
    }
  }

  // Only reserve the lyrics pane while a lookup is in flight or real lyrics
  // exist; otherwise let the artwork breathe (centred) on its own.
  const showLyrics =
    status === 'loading' ||
    (!!lyrics &&
      !lyrics.instrumental &&
      (lyrics.synced.length > 0 || !!lyrics.plain))

  return (
    <aside
      className={`ytmq-anim-fade relative isolate flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border ${className}`}
      style={{ ...paletteCssVars(palette), borderColor: 'var(--np-accent-border)' }}
      aria-label={`Now playing: ${nowPlaying.title}`}
    >
      <LyricsBackdrop art={art} live={live} paletteReady={paletteReady} />

      <div
        className={`relative flex min-h-0 flex-1 flex-col gap-4 p-5 ${
          showLyrics ? '' : 'justify-center'
        }`}
      >
        <div className="flex shrink-0 flex-col items-center gap-3">
          <img
            src={art}
            alt=""
            crossOrigin="anonymous"
            onError={handleArtError}
            className={`ytmq-now-art aspect-square w-40 rounded-2xl object-cover shadow-2xl ring-1 ring-white/15 lg:w-48 ${
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
              <p className="truncate text-sm text-zinc-300">
                {nowPlaying.artist}
              </p>
            )}
          </div>

          <div className="w-full">
            <div
              ref={seekTrackRef}
              onPointerDown={onSeekPointerDown}
              onPointerMove={onSeekPointerMove}
              onPointerUp={endSeekDrag}
              onPointerCancel={endSeekDrag}
              className={`group/seek relative -my-2 py-2 ${
                canSeek ? 'cursor-pointer touch-none' : ''
              }`}
              title={canSeek ? 'Drag to seek' : undefined}
              role={canSeek ? 'slider' : undefined}
              aria-label={canSeek ? 'Seek track position' : undefined}
              aria-valuemin={canSeek ? 0 : undefined}
              aria-valuemax={canSeek && duration != null ? Math.floor(duration) : undefined}
              aria-valuenow={canSeek ? Math.floor(shownPosition) : undefined}
            >
              <div
                className={`ytmq-now-progress-track h-1.5 w-full overflow-hidden rounded-full transition-[height] ${
                  canSeek ? 'group-hover/seek:h-2' : ''
                } ${draggingSeek ? 'h-2' : ''}`}
              >
                <div
                  className={`ytmq-now-progress-fill h-full rounded-full transition-[width] duration-300 ease-linear ${
                    live && percent > 1 && percent < 99 ? 'is-live' : ''
                  }`}
                  style={{
                    width: `${percent}%`,
                    // Snap instantly to the scrub target instead of easing.
                    ...(pendingSeek != null ? { transition: 'none' } : null),
                  }}
                />
              </div>
              {canSeek && (
                <span
                  aria-hidden
                  className={`pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-md ring-1 ring-black/25 transition-opacity ${
                    draggingSeek
                      ? 'scale-110 opacity-100'
                      : 'opacity-0 group-hover/seek:opacity-100'
                  }`}
                  style={{ left: `${percent}%` }}
                />
              )}
            </div>
            <div
              className="mt-1.5 flex justify-between text-[10px] tabular-nums"
              style={{ color: 'color-mix(in srgb, var(--np-accent-light) 55%, #a1a1aa)' }}
            >
              <span>{formatPlaybackTime(shownPosition)}</span>
              <span>{hasDuration ? formatPlaybackTime(duration) : '--:--'}</span>
            </div>
          </div>

          <div
            className="ytmq-now-controls mt-0.5 flex items-center gap-2 rounded-full border px-2 py-1 backdrop-blur"
            title={
              !canControl ? 'The host has limited playback controls' : undefined
            }
          >
            <ControlButton
              label="Previous"
              onClick={() => trigger('prev')}
              disabled={controlsDisabled}
              active={pendingAction === 'prev'}
            >
              <PrevIcon />
            </ControlButton>
            <ControlButton
              label={isPlaying ? 'Pause' : 'Play'}
              onClick={() => trigger(isPlaying ? 'pause' : 'play')}
              disabled={controlsDisabled}
              active={pendingAction === 'play' || pendingAction === 'pause'}
              primary
            >
              {isPlaying ? <PauseIcon /> : <PlayIcon />}
            </ControlButton>
            <ControlButton
              label="Next"
              onClick={() => trigger('next')}
              disabled={controlsDisabled}
              active={pendingAction === 'next'}
            >
              <NextIcon />
            </ControlButton>
          </div>
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

type ControlButtonProps = {
  label: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
  primary?: boolean
  children: React.ReactNode
}

function ControlButton({
  label,
  onClick,
  disabled,
  active,
  primary,
  children,
}: ControlButtonProps) {
  const size = primary ? 'h-10 w-10' : 'h-9 w-9'
  const tone = primary
    ? 'ytmq-now-control-primary'
    : 'bg-white/10 hover:bg-white/20'
  const ring = active ? ' ytmq-now-control-active' : ''
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center rounded-full text-white transition active:scale-95 disabled:opacity-40 disabled:active:scale-100 ${tone} ${size}${ring}`}
    >
      {children}
    </button>
  )
}

function PrevIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-4 w-4">
      <path d="M7 6h2v12H7zM10 12l9-6v12z" />
    </svg>
  )
}

function NextIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-4 w-4">
      <path d="M15 6h2v12h-2zM5 6v12l9-6z" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-4 w-4">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-4 w-4">
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  )
}
