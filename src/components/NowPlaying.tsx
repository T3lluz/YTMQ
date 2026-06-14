import { useCallback, useEffect, useRef, useState } from 'react'
import { defaultThumbnail } from '../lib/queue'
import { useNowPlaying } from '../hooks/useNowPlaying'
import { useImagePalette } from '../hooks/useImagePalette'
import { sendPlaybackControl } from '../lib/bridgeChannel'
import { paletteCssVars } from '../lib/imagePalette'
import {
  formatPlaybackTime,
  type PlaybackAction,
  type PlaybackState,
} from '../lib/playback'

type NowPlayingProps = {
  roomId: string
  compact?: boolean
  canControl?: boolean
}

export function NowPlaying({
  roomId,
  compact = false,
  canControl = true,
}: NowPlayingProps) {
  const { nowPlaying, connected, stale } = useNowPlaying(roomId)
  const [pendingAction, setPendingAction] = useState<PlaybackAction | null>(null)
  const pendingTimer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (pendingTimer.current !== null) {
        window.clearTimeout(pendingTimer.current)
      }
    }
  }, [])

  const trigger = useCallback(
    (action: PlaybackAction) => {
      if (!roomId) return
      sendPlaybackControl(roomId, action)
      setPendingAction(action)
      if (pendingTimer.current !== null) {
        window.clearTimeout(pendingTimer.current)
      }
      pendingTimer.current = window.setTimeout(() => {
        setPendingAction(null)
      }, 700)
    },
    [roomId],
  )

  const effectiveState: PlaybackState = nowPlaying?.state ?? 'unknown'
  const isPlaying = effectiveState === 'playing'
  const position = usePlaybackPosition(
    nowPlaying,
    Boolean(nowPlaying && isPlaying && !stale),
  )
  const thumb = nowPlaying ? defaultThumbnail(nowPlaying.videoId) : undefined
  const { palette, ready: paletteReady } = useImagePalette(thumb)
  const themeStyle = paletteCssVars(palette)
  const live = isPlaying && !stale && Boolean(nowPlaying)

  if (!nowPlaying && !connected) {
    return (
      <section className="ytmq-anim-fade-up rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 shrink-0 rounded-full bg-zinc-600">
            <span className="h-2 w-2 animate-ping rounded-full bg-zinc-500" />
          </span>
          <p className="text-sm font-medium text-zinc-300">Now playing</p>
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          Waiting for playback from the connected YouTube Music tab…
        </p>
      </section>
    )
  }

  if (!nowPlaying) {
    return (
      <section className="ytmq-anim-fade-up rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
        <p className="text-sm font-medium text-zinc-300">Now playing</p>
        <p className="mt-1 text-sm text-zinc-500">
          No recent updates — keep music.youtube.com open and playing.
        </p>
      </section>
    )
  }

  const disabled = !connected || stale || !canControl

  return (
    <section
      className={`ytmq-now-playing-card ytmq-anim-fade-up relative isolate overflow-hidden rounded-2xl border bg-zinc-900 ${
        stale ? 'border-zinc-800 opacity-90' : ''
      }`}
      style={{
        ...themeStyle,
        borderColor: stale ? undefined : 'var(--np-accent-border)',
      }}
      aria-label="Now playing in YouTube Music"
    >
      <div
        aria-hidden
        className="absolute inset-0 -z-30 scale-110 bg-cover bg-center blur-2xl saturate-150 transition-opacity duration-700"
        style={{
          backgroundImage: `url(${thumb})`,
          opacity: paletteReady ? 1 : 0.75,
        }}
      />
      <div
        aria-hidden
        className={`ytmq-now-lights absolute inset-0 -z-20 overflow-hidden ${live ? 'is-live' : ''}`}
      >
        <div className="ytmq-now-light ytmq-now-light-a" />
        <div className="ytmq-now-light ytmq-now-light-b" />
        <div className="ytmq-now-light ytmq-now-light-c" />
        <div className="ytmq-now-light ytmq-now-light-d" />
      </div>
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-br from-zinc-950/55 via-zinc-950/45 to-zinc-950/65"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-[5] bg-zinc-950/10 backdrop-blur-md"
      />

      <div
        className={`relative flex items-center gap-3 ${
          compact ? 'p-3' : 'p-4'
        }`}
      >
        <img
          src={thumb}
          alt=""
          crossOrigin="anonymous"
          className={`ytmq-now-art shrink-0 rounded-xl object-cover ring-1 ring-white/10 transition-shadow duration-700 ${
            live ? 'is-live' : ''
          } ${compact ? 'h-14 w-14' : 'h-16 w-16'}`}
        />

        <div className="min-w-0 flex-1 pr-2">
          <p
            className="text-[10px] font-semibold uppercase tracking-wider transition-colors duration-700"
            style={{ color: 'color-mix(in srgb, var(--np-accent-light) 88%, white)' }}
          >
            Now playing
            {stale ? ' · paused?' : ''}
          </p>
          <p className="truncate text-sm font-semibold text-white drop-shadow-sm sm:text-base">
            {nowPlaying.title}
          </p>
          {nowPlaying.artist && (
            <p className="truncate text-xs text-zinc-300 sm:text-sm">
              {nowPlaying.artist}
            </p>
          )}
        </div>

        <div
          className={`ytmq-now-controls flex shrink-0 items-center gap-1 rounded-full border px-1 py-1 backdrop-blur ${
            compact ? '' : 'gap-1.5 px-1.5'
          }`}
          title={!canControl ? 'The host has limited playback controls' : undefined}
        >
          <ControlButton
            label="Previous"
            onClick={() => trigger('prev')}
            disabled={disabled}
            active={pendingAction === 'prev'}
            compact={compact}
          >
            <PrevIcon />
          </ControlButton>
          <ControlButton
            label={isPlaying ? 'Pause' : 'Play'}
            onClick={() => trigger(isPlaying ? 'pause' : 'play')}
            disabled={disabled}
            active={pendingAction === 'play' || pendingAction === 'pause'}
            primary
            compact={compact}
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </ControlButton>
          <ControlButton
            label="Next"
            onClick={() => trigger('next')}
            disabled={disabled}
            active={pendingAction === 'next'}
            compact={compact}
          >
            <NextIcon />
          </ControlButton>
        </div>
      </div>

      <PlaybackProgress
        position={position}
        duration={nowPlaying.duration}
        compact={compact}
      />
    </section>
  )
}

function usePlaybackPosition(
  nowPlaying: {
    currentTime?: number
    duration?: number
    updatedAt: number
    videoId: string
  } | null,
  live: boolean,
) {
  const [position, setPosition] = useState(() => nowPlaying?.currentTime ?? 0)

  useEffect(() => {
    if (!nowPlaying || !live) return

    const compute = () => {
      const base = nowPlaying.currentTime ?? 0
      const elapsed = (Date.now() - nowPlaying.updatedAt) / 1000
      let next = base + elapsed
      if (nowPlaying.duration != null && nowPlaying.duration > 0) {
        next = Math.min(next, nowPlaying.duration)
      }
      setPosition(next)
    }

    const immediate = window.setTimeout(compute, 0)
    const id = window.setInterval(compute, 250)
    return () => {
      window.clearTimeout(immediate)
      window.clearInterval(id)
    }
  }, [
    nowPlaying?.videoId,
    nowPlaying?.currentTime,
    nowPlaying?.duration,
    nowPlaying?.updatedAt,
    live,
    nowPlaying,
  ])

  if (!nowPlaying) return 0
  if (!live) return nowPlaying.currentTime ?? 0
  return position
}

type PlaybackProgressProps = {
  position: number
  duration?: number
  compact?: boolean
}

function PlaybackProgress({
  position,
  duration,
  compact = false,
}: PlaybackProgressProps) {
  const hasDuration = duration != null && duration > 0
  const percent = hasDuration
    ? Math.min(100, Math.max(0, (position / duration) * 100))
    : 0
  const inset = compact ? 'px-3' : 'px-4'

  return (
    <div
      className={`pointer-events-none select-none border-t ${
        compact ? 'pb-2.5 pt-2' : 'pb-3 pt-2.5'
      }`}
      style={{ borderColor: 'color-mix(in srgb, var(--np-accent) 18%, transparent)' }}
      role="progressbar"
      aria-valuenow={Math.floor(position)}
      aria-valuemin={0}
      aria-valuemax={hasDuration ? Math.floor(duration) : undefined}
      aria-label="Track progress"
    >
      <div className={inset}>
        <div className="ytmq-now-progress-track h-1.5 w-full overflow-hidden rounded-full">
          <div
            className="ytmq-now-progress-fill h-full rounded-full transition-[width] duration-300 ease-linear"
            style={{ width: `${percent}%` }}
          />
        </div>
        <div
          className="mt-1.5 flex justify-between text-[10px] tabular-nums"
          style={{ color: 'color-mix(in srgb, var(--np-accent-light) 55%, #a1a1aa)' }}
        >
          <span>{formatPlaybackTime(position)}</span>
          <span>{hasDuration ? formatPlaybackTime(duration) : '--:--'}</span>
        </div>
      </div>
    </div>
  )
}

type ControlButtonProps = {
  label: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
  primary?: boolean
  compact?: boolean
  children: React.ReactNode
}

function ControlButton({
  label,
  onClick,
  disabled,
  active,
  primary,
  compact,
  children,
}: ControlButtonProps) {
  const size = compact
    ? primary
      ? 'h-9 w-9'
      : 'h-8 w-8'
    : primary
      ? 'h-10 w-10'
      : 'h-9 w-9'
  const base =
    'inline-flex items-center justify-center rounded-full text-white transition active:scale-95 disabled:opacity-40 disabled:active:scale-100'
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
      className={`${base} ${tone} ${size}${ring}`}
    >
      {children}
    </button>
  )
}

function PrevIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className="h-4 w-4"
    >
      <path d="M7 6h2v12H7zM10 12l9-6v12z" />
    </svg>
  )
}

function NextIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className="h-4 w-4"
    >
      <path d="M15 6h2v12h-2zM5 6v12l9-6z" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className="h-4 w-4"
    >
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className="h-4 w-4"
    >
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  )
}
