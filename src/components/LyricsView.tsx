import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { hqThumbnail, type QueueItem } from '../lib/queue'
import { useNowPlaying } from '../hooks/useNowPlaying'
import { usePlaybackPosition } from '../hooks/usePlaybackPosition'
import { useImagePalette } from '../hooks/useImagePalette'
import { useLyrics, prefetchLyrics, type LyricsStatus } from '../hooks/useLyrics'
import { activeLineIndex, type LyricLine, type Lyrics } from '../lib/lyrics'
import { paletteCssVars } from '../lib/imagePalette'
import { sendPlaybackControl } from '../lib/bridgeChannel'
import { formatPlaybackTime, type PlaybackAction } from '../lib/playback'
import { LyricsUpNext, type UpNextTrack } from './LyricsUpNext'

type LyricsViewProps = {
  roomId: string
  /** Render edge-to-edge over the whole viewport (desktop immersion). */
  fullscreen?: boolean
  /** Shared queue, used to preview + prefetch the upcoming track. */
  queueItems?: QueueItem[]
  /** Whether the viewer may drive playback from the lyrics screen. */
  canControl?: boolean
}

/** Connected wrapper: pulls live now-playing + lyrics data for the room. */
export function LyricsView({
  roomId,
  fullscreen = false,
  queueItems = [],
  canControl = false,
}: LyricsViewProps) {
  const { nowPlaying, connected, stale } = useNowPlaying(roomId)
  const isPlaying = nowPlaying?.state === 'playing'
  const live = Boolean(isPlaying && !stale && nowPlaying)
  const position = usePlaybackPosition(nowPlaying ?? null, live)

  const [pendingAction, setPendingAction] = useState<PlaybackAction | null>(null)
  const pendingTimer = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (pendingTimer.current !== null) window.clearTimeout(pendingTimer.current)
    },
    [],
  )
  const onControl = useCallback(
    (action: PlaybackAction) => {
      if (!roomId) return
      sendPlaybackControl(roomId, action)
      setPendingAction(action)
      if (pendingTimer.current !== null) window.clearTimeout(pendingTimer.current)
      pendingTimer.current = window.setTimeout(
        () => setPendingAction(null),
        700,
      )
    },
    [roomId],
  )

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

  // "Up next" mirrors the YT Music on-page banner: prefer YT Music's own live
  // queue (broadcast by the bridge as `nextUp`) so it works even when the app's
  // shared queue is empty, and fall back to the shared queue otherwise.
  const ytmNextUp = nowPlaying?.nextUp
  const upNext = useMemo<UpNextTrack | null>(() => {
    const currentId = nowPlaying?.videoId

    if (ytmNextUp && (ytmNextUp.title || ytmNextUp.videoId) && ytmNextUp.videoId !== currentId) {
      return {
        videoId: ytmNextUp.videoId,
        title: ytmNextUp.title,
        artist: ytmNextUp.artist,
        thumbnailUrl:
          ytmNextUp.thumbnailUrl ||
          (ytmNextUp.videoId ? hqThumbnail(ytmNextUp.videoId) : ''),
      }
    }

    const next = queueItems.find((item) => item.video_id !== currentId)
    if (!next) return null
    return {
      videoId: next.video_id,
      title: next.title,
      artist: next.channel_title ?? '',
      thumbnailUrl: next.thumbnail_url || hqThumbnail(next.video_id),
    }
  }, [queueItems, nowPlaying?.videoId, ytmNextUp])

  // Warm the lyrics cache for the upcoming track so it renders instantly the
  // moment it becomes the now-playing song.
  useEffect(() => {
    if (!upNext) return
    prefetchLyrics({
      videoId: upNext.videoId,
      title: upNext.title,
      artist: upNext.artist,
    })
  }, [upNext])

  const remaining =
    nowPlaying?.duration != null && nowPlaying.duration > 0
      ? nowPlaying.duration - position
      : Number.POSITIVE_INFINITY

  return (
    <LyricsScreen
      hasTrack={Boolean(nowPlaying)}
      connected={connected}
      title={nowPlaying?.title ?? ''}
      artist={nowPlaying?.artist ?? ''}
      art={art}
      themeStyle={paletteCssVars(palette)}
      paletteReady={paletteReady}
      live={live}
      stale={stale}
      position={position}
      duration={nowPlaying?.duration}
      status={status}
      lyrics={lyrics}
      fullscreen={fullscreen}
      upNext={upNext}
      remaining={remaining}
      isPlaying={isPlaying}
      controlsEnabled={canControl && connected && !stale}
      pendingAction={pendingAction}
      onControl={onControl}
    />
  )
}

/**
 * `maxresdefault` isn't generated for every video; swap to the always-present
 * 16:9 `mqdefault` once on error so the art still crops cleanly (no black bars)
 * instead of showing a broken image.
 */
function handleArtError(event: React.SyntheticEvent<HTMLImageElement>) {
  const img = event.currentTarget
  if (img.dataset.fallback === '1') return
  if (img.src.includes('/maxresdefault.jpg')) {
    img.dataset.fallback = '1'
    img.src = img.src.replace('/maxresdefault.jpg', '/mqdefault.jpg')
  }
}

export type LyricsScreenProps = {
  hasTrack: boolean
  connected: boolean
  title: string
  artist: string
  art?: string
  themeStyle: CSSProperties
  paletteReady: boolean
  live: boolean
  stale: boolean
  position: number
  duration?: number
  status: LyricsStatus
  lyrics: Lyrics | null
  fullscreen?: boolean
  upNext?: UpNextTrack | null
  remaining?: number
  isPlaying?: boolean
  controlsEnabled?: boolean
  pendingAction?: PlaybackAction | null
  onControl?: (action: PlaybackAction) => void
}

/** Pure presentation — easy to render with mock data for visual testing. */
export function LyricsScreen({
  hasTrack,
  connected,
  title,
  artist,
  art,
  themeStyle,
  paletteReady,
  live,
  stale,
  position,
  duration,
  status,
  lyrics,
  fullscreen = false,
  upNext = null,
  remaining = Number.POSITIVE_INFINITY,
  isPlaying = false,
  controlsEnabled = false,
  pendingAction = null,
  onControl,
}: LyricsScreenProps) {
  const sectionRef = useRef<HTMLElement | null>(null)

  if (!hasTrack) {
    return (
      <section className="ytmq-tab-panel flex min-h-[18rem] flex-1 flex-col">
        <h2 className="sr-only">Lyrics</h2>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
          <LyricsGlyph className="h-10 w-10 text-zinc-600" />
          <p className="text-sm font-medium text-zinc-300">No track playing</p>
          <p className="max-w-xs text-sm text-zinc-500">
            {connected
              ? 'Lyrics will appear here once a song starts playing.'
              : 'Keep music.youtube.com open and playing to follow along with lyrics.'}
          </p>
        </div>
      </section>
    )
  }

  return (
    <section
      ref={sectionRef}
      className={`ytmq-lyrics ytmq-tab-panel isolate flex min-h-0 flex-1 flex-col overflow-hidden border ${
        fullscreen
          ? 'ytmq-lyrics-fullscreen fixed inset-0 z-40 rounded-none bg-zinc-950'
          : 'relative rounded-2xl'
      }`}
      style={{ ...themeStyle, borderColor: 'var(--np-accent-border)' }}
      aria-label={`Lyrics for ${title}`}
    >
      <LyricsUpNext track={upNext} remaining={remaining} live={live} enabled />
      {fullscreen && <FullscreenButton targetRef={sectionRef} />}
      {/* Abstract, blurry, palette-coloured moving background. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-30 scale-110 bg-cover bg-center blur-3xl saturate-150 transition-opacity duration-700"
        style={{
          backgroundImage: art ? `url(${art})` : undefined,
          opacity: paletteReady ? 0.9 : 0.6,
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
        <div className="ytmq-now-light ytmq-now-light-e" />
        <div className="ytmq-now-light ytmq-now-light-f" />
        <div className="ytmq-now-light ytmq-now-light-g" />
        <div className="ytmq-now-light ytmq-now-light-h" />
        <div className="ytmq-now-light ytmq-now-light-i" />
        <div className="ytmq-now-light ytmq-now-light-j" />
      </div>
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-b from-zinc-950/55 via-zinc-950/45 to-zinc-950/70"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-[5] bg-zinc-950/10 backdrop-blur-md"
      />

      {fullscreen ? (
        // Two equal halves: the art + controls are centred in the left half of
        // the screen, the lyrics centred in the right half. On narrow screens
        // they stack instead.
        <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-7 px-6 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:grid sm:grid-cols-2 sm:items-center sm:gap-0 sm:px-0 sm:pt-[calc(env(safe-area-inset-top)+1rem)]">
          <div className="flex w-full min-h-0 items-center justify-center px-4 sm:px-8 lg:px-12 xl:px-16">
            <ArtPanel
              art={art}
              title={title}
              artist={artist}
              position={position}
              duration={duration}
              live={live}
              fullscreen={fullscreen}
              isPlaying={isPlaying}
              controlsEnabled={controlsEnabled}
              pendingAction={pendingAction}
              onControl={onControl}
            />
          </div>
          <div className="flex w-full min-h-0 items-stretch justify-center px-2 sm:px-8 lg:px-12 xl:px-16">
            <div className="ytmq-lyrics-pane relative min-h-0 w-full max-w-2xl self-stretch">
              <LyricsBody
                status={status}
                lyrics={lyrics}
                position={position}
                stale={stale}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="relative flex min-h-0 flex-1 flex-col gap-4 p-4 sm:flex-row sm:gap-5 sm:p-5 md:gap-7 md:p-6">
          <ArtPanel
            art={art}
            title={title}
            artist={artist}
            position={position}
            duration={duration}
            live={live}
            fullscreen={fullscreen}
            isPlaying={isPlaying}
            controlsEnabled={controlsEnabled}
            pendingAction={pendingAction}
            onControl={onControl}
          />
          <div className="ytmq-lyrics-pane relative min-h-0 flex-1">
            <LyricsBody
              status={status}
              lyrics={lyrics}
              position={position}
              stale={stale}
            />
          </div>
        </div>
      )}
    </section>
  )
}

type ArtPanelProps = {
  art?: string
  title: string
  artist: string
  position: number
  duration?: number
  live: boolean
  fullscreen?: boolean
  isPlaying?: boolean
  controlsEnabled?: boolean
  pendingAction?: PlaybackAction | null
  onControl?: (action: PlaybackAction) => void
}

function ArtPanel({
  art,
  title,
  artist,
  position,
  duration,
  live,
  fullscreen = false,
  isPlaying = false,
  controlsEnabled = false,
  pendingAction = null,
  onControl,
}: ArtPanelProps) {
  const hasDuration = duration != null && duration > 0
  const percent = hasDuration
    ? Math.min(100, Math.max(0, (position / duration) * 100))
    : 0

  if (fullscreen) {
    return (
      <div className="flex w-full shrink-0 flex-col items-center gap-5 sm:w-60 md:w-72 lg:w-80 xl:w-[22rem]">
        <div className="ytmq-lyrics-art-wrap relative w-44 sm:w-full">
          <img
            src={art}
            alt=""
            crossOrigin="anonymous"
            onError={handleArtError}
            className={`ytmq-now-art aspect-square w-full rounded-2xl object-cover shadow-2xl ring-1 ring-white/15 ${
              live ? 'is-live' : ''
            }`}
          />
        </div>

        <div className="w-full min-w-0 text-center">
          <p
            className="flex items-center justify-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: 'color-mix(in srgb, var(--np-accent-light) 88%, white)' }}
          >
            {live && <Equalizer />}
            {live ? 'Now playing' : 'Paused'}
          </p>
          <p className="truncate text-2xl font-bold text-white drop-shadow lg:text-3xl">
            {title}
          </p>
          {artist && (
            <p className="truncate text-base text-zinc-300 lg:text-lg">{artist}</p>
          )}
        </div>

        <div className="w-full">
          <div className="ytmq-now-progress-track h-1.5 w-full overflow-hidden rounded-full">
            <div
              className={`ytmq-now-progress-fill h-full rounded-full transition-[width] duration-300 ease-linear ${
                live && percent > 1 && percent < 99 ? 'is-live' : ''
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <div
            className="mt-1.5 flex justify-between text-xs tabular-nums"
            style={{ color: 'color-mix(in srgb, var(--np-accent-light) 60%, #a1a1aa)' }}
          >
            <span>{formatPlaybackTime(position)}</span>
            <span>{hasDuration ? formatPlaybackTime(duration) : '--:--'}</span>
          </div>
        </div>

        {onControl && (
          <div className="flex items-center gap-4">
            <TransportButton
              label="Previous"
              disabled={!controlsEnabled}
              active={pendingAction === 'prev'}
              onClick={() => onControl('prev')}
            >
              <PrevIcon />
            </TransportButton>
            <TransportButton
              label={isPlaying ? 'Pause' : 'Play'}
              primary
              disabled={!controlsEnabled}
              active={pendingAction === 'play' || pendingAction === 'pause'}
              onClick={() => onControl(isPlaying ? 'pause' : 'play')}
            >
              {isPlaying ? <PauseIcon /> : <PlayIcon />}
            </TransportButton>
            <TransportButton
              label="Next"
              disabled={!controlsEnabled}
              active={pendingAction === 'next'}
              onClick={() => onControl('next')}
            >
              <NextIcon />
            </TransportButton>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex shrink-0 flex-row items-center gap-3 sm:w-40 sm:flex-col sm:items-start md:w-52 lg:w-64">
      <div className="ytmq-lyrics-art-wrap relative shrink-0 sm:w-full">
        <img
          src={art}
          alt=""
          crossOrigin="anonymous"
          onError={handleArtError}
          className={`ytmq-now-art aspect-square h-16 w-16 rounded-xl object-cover shadow-2xl ring-1 ring-white/15 sm:h-auto sm:w-full sm:rounded-2xl ${
            live ? 'is-live' : ''
          }`}
        />
      </div>
      <div className="min-w-0 flex-1 sm:flex-none sm:max-w-full">
        <p
          className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: 'color-mix(in srgb, var(--np-accent-light) 88%, white)' }}
        >
          {live && <Equalizer />}
          {live ? 'Now playing' : 'Paused'}
        </p>
        <p className="truncate text-sm font-semibold text-white drop-shadow sm:text-base md:text-lg">
          {title}
        </p>
        {artist && (
          <p className="truncate text-xs text-zinc-300 sm:text-sm">{artist}</p>
        )}
      </div>
      {hasDuration && (
        <div className="hidden w-full sm:block">
          <div className="ytmq-now-progress-track h-1 w-full overflow-hidden rounded-full">
            <div
              className="ytmq-now-progress-fill h-full rounded-full transition-[width] duration-300 ease-linear"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Desktop-only toggle that drops the immersive lyrics section into (and out of)
 * native browser fullscreen. Collapsed to just an icon; on hover the pill grows
 * leftward to reveal its label, keeping the icon pinned to the right edge so it
 * never shifts.
 */
function FullscreenButton({
  targetRef,
}: {
  targetRef: React.RefObject<HTMLElement | null>
}) {
  const [active, setActive] = useState(
    () => typeof document !== 'undefined' && Boolean(document.fullscreenElement),
  )

  useEffect(() => {
    const onChange = () => setActive(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggle = useCallback(() => {
    if (typeof document === 'undefined') return
    if (!document.fullscreenElement) {
      void targetRef.current?.requestFullscreen?.().catch(() => {})
    } else {
      void document.exitFullscreen?.().catch(() => {})
    }
  }, [targetRef])

  const label = active ? 'Minimize' : 'Fullscreen'

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="group absolute right-4 top-[calc(env(safe-area-inset-top)+1rem)] z-30 flex items-center rounded-full border bg-black/35 px-2.5 py-2 text-white shadow-lg backdrop-blur transition-colors hover:bg-black/60"
      style={{ borderColor: 'var(--np-accent-border)' }}
    >
      <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-semibold opacity-0 transition-all duration-300 ease-out group-hover:mr-2 group-hover:max-w-[7rem] group-hover:opacity-100">
        {label}
      </span>
      {active ? <MinimizeIcon /> : <FullscreenIcon />}
    </button>
  )
}

function FullscreenIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-5 w-5 shrink-0"
    >
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M16 3h3a2 2 0 0 1 2 2v3" />
      <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  )
}

function MinimizeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-5 w-5 shrink-0"
    >
      <path d="M8 3v3a2 2 0 0 1-2 2H3" />
      <path d="M16 3v3a2 2 0 0 0 2 2h3" />
      <path d="M8 21v-3a2 2 0 0 0-2-2H3" />
      <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
    </svg>
  )
}

type LyricsBodyProps = {
  status: LyricsStatus
  lyrics: Lyrics | null
  position: number
  stale: boolean
}

function LyricsBody({ status, lyrics, position, stale }: LyricsBodyProps) {
  if (status === 'loading') return <LyricsSkeleton />

  if (status === 'error') {
    return (
      <LyricsMessage
        title="Couldn’t load lyrics"
        detail="There was a problem reaching the lyrics service. It’ll retry on the next track."
      />
    )
  }

  if (lyrics?.instrumental) {
    return (
      <LyricsMessage
        title="Instrumental"
        detail="This track has no lyrics to follow — enjoy the music."
      />
    )
  }

  if (status === 'notfound' || !lyrics) {
    return (
      <LyricsMessage
        title="No lyrics found"
        detail="We couldn’t find matching lyrics for this track yet."
      />
    )
  }

  if (lyrics.synced.length > 0) {
    return <SyncedLyrics lines={lyrics.synced} position={position} dim={stale} />
  }

  if (lyrics.plain) {
    return <PlainLyrics text={lyrics.plain} />
  }

  return (
    <LyricsMessage
      title="No lyrics found"
      detail="We couldn’t find matching lyrics for this track yet."
    />
  )
}

type SyncedLyricsProps = {
  lines: LyricLine[]
  position: number
  dim: boolean
}

function SyncedLyrics({ lines, position, dim }: SyncedLyricsProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([])
  const activeIndex = activeLineIndex(lines, position)

  useLayoutEffect(() => {
    const scroll = scrollRef.current
    const el = activeIndex >= 0 ? lineRefs.current[activeIndex] : null
    if (!scroll || !el) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const target = el.offsetTop - scroll.clientHeight / 2 + el.clientHeight / 2
    scroll.scrollTo({
      top: Math.max(0, target),
      behavior: reduce ? 'auto' : 'smooth',
    })
  }, [activeIndex])

  return (
    <div
      ref={scrollRef}
      className={`ytmq-lyrics-scroll h-full overflow-y-auto px-1 ${
        dim ? 'opacity-70' : ''
      }`}
      role="list"
      aria-label="Synced lyrics"
    >
      {/* Half-viewport spacers let the first and last lines scroll to the
          vertical centre, so the active line is always centred. */}
      <div aria-hidden className="ytmq-lyrics-spacer" />
      {lines.map((line, index) => {
        const state =
          index === activeIndex
            ? 'is-active'
            : index < activeIndex
              ? 'is-sung'
              : 'is-upcoming'
        return (
          <p
            key={`${line.time}-${index}`}
            ref={(node) => {
              lineRefs.current[index] = node
            }}
            role="listitem"
            className={`ytmq-lyric-line ${state}`}
          >
            {line.text || '♪'}
          </p>
        )
      })}
      <div aria-hidden className="ytmq-lyrics-spacer" />
    </div>
  )
}

function PlainLyrics({ text }: { text: string }) {
  return (
    <div className="ytmq-lyrics-scroll h-full overflow-y-auto px-1 py-2">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
        Live sync unavailable for this track
      </p>
      <pre className="ytmq-lyrics-plain whitespace-pre-wrap font-sans leading-relaxed text-zinc-200">
        {text}
      </pre>
    </div>
  )
}

function LyricsSkeleton() {
  const widths = ['70%', '85%', '55%', '78%', '62%', '90%', '48%', '72%']
  return (
    <div className="flex h-full flex-col justify-center gap-4 px-1">
      {widths.map((w, i) => (
        <div
          key={i}
          className="ytmq-skeleton h-5 rounded-md"
          style={{ width: w, opacity: 1 - i * 0.08 }}
        />
      ))}
    </div>
  )
}

function LyricsMessage({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
      <LyricsGlyph className="mb-1 h-8 w-8 text-white/40" />
      <p className="text-base font-semibold text-white drop-shadow">{title}</p>
      <p className="max-w-xs text-sm text-zinc-300">{detail}</p>
    </div>
  )
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

type TransportButtonProps = {
  label: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
  primary?: boolean
  children: React.ReactNode
}

function TransportButton({
  label,
  onClick,
  disabled,
  active,
  primary,
  children,
}: TransportButtonProps) {
  const size = primary ? 'h-14 w-14' : 'h-11 w-11'
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
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-5 w-5">
      <path d="M7 6h2v12H7zM10 12l9-6v12z" />
    </svg>
  )
}

function NextIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-5 w-5">
      <path d="M15 6h2v12h-2zM5 6v12l9-6z" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-6 w-6">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-6 w-6">
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  )
}

function LyricsGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M4 6h10" />
      <path d="M4 12h7" />
      <path d="M4 18h6" />
      <circle cx="17" cy="15" r="3" />
      <path d="M20 15V5l-3 1" />
    </svg>
  )
}
