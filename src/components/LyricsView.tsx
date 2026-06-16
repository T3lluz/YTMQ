import { useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react'
import { hqThumbnail, type QueueItem } from '../lib/queue'
import { useNowPlaying } from '../hooks/useNowPlaying'
import { usePlaybackPosition } from '../hooks/usePlaybackPosition'
import { useImagePalette } from '../hooks/useImagePalette'
import { useLyrics, prefetchLyrics, type LyricsStatus } from '../hooks/useLyrics'
import { activeLineIndex, type LyricLine, type Lyrics } from '../lib/lyrics'
import { paletteCssVars } from '../lib/imagePalette'
import { LyricsUpNext, type UpNextTrack } from './LyricsUpNext'

type LyricsViewProps = {
  roomId: string
  /** Render edge-to-edge over the whole viewport (desktop immersion). */
  fullscreen?: boolean
  /** Shared queue, used to preview + prefetch the upcoming track. */
  queueItems?: QueueItem[]
}

/** Connected wrapper: pulls live now-playing + lyrics data for the room. */
export function LyricsView({
  roomId,
  fullscreen = false,
  queueItems = [],
}: LyricsViewProps) {
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

  // The first queued track that isn't the one already playing is "up next".
  const upNext = useMemo<UpNextTrack | null>(() => {
    const currentId = nowPlaying?.videoId
    const next = queueItems.find((item) => item.video_id !== currentId)
    if (!next) return null
    return {
      videoId: next.video_id,
      title: next.title,
      artist: next.channel_title ?? '',
      thumbnailUrl: next.thumbnail_url || hqThumbnail(next.video_id),
    }
  }, [queueItems, nowPlaying?.videoId])

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
    />
  )
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
}: LyricsScreenProps) {
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
      className={`ytmq-lyrics ytmq-tab-panel isolate flex min-h-0 flex-1 flex-col overflow-hidden border ${
        fullscreen
          ? 'ytmq-lyrics-fullscreen fixed inset-0 z-40 rounded-none bg-zinc-950'
          : 'relative rounded-2xl'
      }`}
      style={{ ...themeStyle, borderColor: 'var(--np-accent-border)' }}
      aria-label={`Lyrics for ${title}`}
    >
      <LyricsUpNext
        track={upNext}
        remaining={remaining}
        live={live}
        enabled={fullscreen}
      />
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
      </div>
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-b from-zinc-950/55 via-zinc-950/45 to-zinc-950/70"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-[5] bg-zinc-950/10 backdrop-blur-md"
      />

      <div
        className={`relative flex min-h-0 flex-1 flex-col gap-4 p-4 sm:flex-row sm:gap-5 sm:p-5 md:gap-7 md:p-6 ${
          fullscreen
            ? 'pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(5rem+env(safe-area-inset-bottom))] lg:px-12'
            : ''
        }`}
      >
        <ArtPanel
          art={art}
          title={title}
          artist={artist}
          position={position}
          duration={duration}
          live={live}
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
}

function ArtPanel({ art, title, artist, position, duration, live }: ArtPanelProps) {
  const hasDuration = duration != null && duration > 0
  const percent = hasDuration
    ? Math.min(100, Math.max(0, (position / duration) * 100))
    : 0

  return (
    <div className="flex shrink-0 flex-row items-center gap-3 sm:w-40 sm:flex-col sm:items-start md:w-52 lg:w-64">
      <div className="ytmq-lyrics-art-wrap relative shrink-0 sm:w-full">
        <img
          src={art}
          alt=""
          crossOrigin="anonymous"
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
