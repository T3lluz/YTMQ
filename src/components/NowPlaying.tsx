import { useCallback, useEffect, useRef, useState } from 'react'
import { defaultThumbnail } from '../lib/queue'
import { useNowPlaying } from '../hooks/useNowPlaying'
import { sendPlaybackControl } from '../lib/bridgeChannel'
import {
  formatPlaybackTime,
  type PlaybackAction,
  type PlaybackState,
} from '../lib/playback'

type NowPlayingProps = {
  roomId: string
  compact?: boolean
}

export function NowPlaying({ roomId, compact = false }: NowPlayingProps) {
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

  if (!nowPlaying && !connected) {
    return (
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
        <p className="text-sm font-medium text-zinc-300">Now playing</p>
        <p className="mt-1 text-sm text-zinc-500">
          Waiting for playback from the connected YouTube Music tab…
        </p>
      </section>
    )
  }

  if (!nowPlaying) {
    return (
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
        <p className="text-sm font-medium text-zinc-300">Now playing</p>
        <p className="mt-1 text-sm text-zinc-500">
          No recent updates — keep music.youtube.com open and playing.
        </p>
      </section>
    )
  }

  const thumb = defaultThumbnail(nowPlaying.videoId)
  const disabled = !connected || stale

  return (
    <section
      className={`relative isolate overflow-hidden rounded-2xl border bg-zinc-900 shadow-lg ${
        stale
          ? 'border-zinc-800 opacity-90'
          : 'border-violet-500/30 ring-1 ring-violet-500/10'
      }`}
      aria-label="Now playing in YouTube Music"
    >
      <div
        aria-hidden
        className="absolute inset-0 -z-10 scale-110 bg-cover bg-center blur-2xl saturate-150"
        style={{ backgroundImage: `url(${thumb})` }}
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-r from-zinc-950/85 via-zinc-950/70 to-zinc-950/40"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-zinc-900/30 backdrop-blur-sm"
      />

      <div
        className={`relative flex items-center gap-3 ${
          compact ? 'p-3' : 'p-4'
        }`}
      >
        <img
          src={thumb}
          alt=""
          className={`shrink-0 rounded-xl object-cover shadow-md ring-1 ring-white/10 ${
            compact ? 'h-14 w-14' : 'h-16 w-16'
          }`}
        />

        <div className="min-w-0 flex-1 pr-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-300/90">
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
          className={`flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-black/40 px-1 py-1 backdrop-blur ${
            compact ? '' : 'gap-1.5 px-1.5'
          }`}
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
  const [position, setPosition] = useState(0)

  useEffect(() => {
    if (!nowPlaying) {
      setPosition(0)
      return
    }

    const compute = () => {
      const base = nowPlaying.currentTime ?? 0
      const elapsed = live ? (Date.now() - nowPlaying.updatedAt) / 1000 : 0
      let next = base + elapsed
      if (nowPlaying.duration != null && nowPlaying.duration > 0) {
        next = Math.min(next, nowPlaying.duration)
      }
      setPosition(next)
    }

    compute()
    if (!live) return

    const id = window.setInterval(compute, 250)
    return () => window.clearInterval(id)
  }, [
    nowPlaying?.videoId,
    nowPlaying?.currentTime,
    nowPlaying?.duration,
    nowPlaying?.updatedAt,
    live,
  ])

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
  const percent =
    duration != null && duration > 0
      ? Math.min(100, Math.max(0, (position / duration) * 100))
      : 0
  const hasDuration = duration != null && duration > 0

  return (
    <div
      className={`pointer-events-none select-none border-t border-white/5 ${
        compact ? 'pb-2.5 pt-2' : 'pb-3 pt-2.5'
      }`}
      aria-hidden
    >
      <div className="h-1 w-full overflow-hidden bg-white/10">
        <div
          className="h-full bg-violet-400/90 transition-[width] duration-300 ease-linear"
          style={{ width: hasDuration ? `${percent}%` : '0%' }}
        />
      </div>
      <div
        className={`mt-1 flex justify-between text-[10px] tabular-nums text-zinc-400 ${
          compact ? 'px-3' : 'px-4'
        }`}
      >
        <span>{formatPlaybackTime(position)}</span>
        <span>{hasDuration ? formatPlaybackTime(duration) : '--:--'}</span>
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
    ? 'bg-violet-500 hover:bg-violet-400 shadow-md shadow-violet-500/30'
    : 'bg-white/10 hover:bg-white/20'
  const ring = active ? ' ring-2 ring-violet-300/70' : ''
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
