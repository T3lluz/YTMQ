import { useLayoutEffect, useRef } from 'react'
import { hqThumbnail } from '../lib/queue'
import { useNowPlaying } from '../hooks/useNowPlaying'
import { usePlaybackPosition } from '../hooks/usePlaybackPosition'
import { useImagePalette } from '../hooks/useImagePalette'
import { useLyrics } from '../hooks/useLyrics'
import { activeLineIndex, type LyricLine } from '../lib/lyrics'
import { paletteCssVars } from '../lib/imagePalette'

type LyricsViewProps = {
  roomId: string
}

export function LyricsView({ roomId }: LyricsViewProps) {
  const { nowPlaying, connected, stale } = useNowPlaying(roomId)
  const isPlaying = nowPlaying?.state === 'playing'
  const live = isPlaying && !stale && Boolean(nowPlaying)
  const position = usePlaybackPosition(nowPlaying ?? null, live)

  const art = nowPlaying ? hqThumbnail(nowPlaying.videoId) : undefined
  const { palette, ready: paletteReady } = useImagePalette(art)
  const themeStyle = paletteCssVars(palette)

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

  if (!nowPlaying) {
    return (
      <section className="ytmq-tab-panel flex flex-1 flex-col">
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
      className="ytmq-lyrics ytmq-tab-panel relative isolate flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border"
      style={{ ...themeStyle, borderColor: 'var(--np-accent-border)' }}
      aria-label={`Lyrics for ${nowPlaying.title}`}
    >
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

      <div className="relative flex min-h-0 flex-1 flex-col gap-4 p-4 sm:flex-row sm:gap-5 sm:p-5">
        <ArtPanel
          art={art}
          title={nowPlaying.title}
          artist={nowPlaying.artist}
          position={position}
          duration={nowPlaying.duration}
          live={Boolean(live)}
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
    <div className="flex shrink-0 flex-col items-center gap-3 sm:w-40 sm:items-start md:w-52">
      <div className="ytmq-lyrics-art-wrap relative">
        <img
          src={art}
          alt=""
          crossOrigin="anonymous"
          className={`ytmq-now-art aspect-square w-28 rounded-2xl object-cover shadow-2xl ring-1 ring-white/15 sm:w-full ${
            live ? 'is-live' : ''
          }`}
        />
      </div>
      <div className="min-w-0 text-center sm:text-left">
        <p
          className="flex items-center justify-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider sm:justify-start"
          style={{ color: 'color-mix(in srgb, var(--np-accent-light) 88%, white)' }}
        >
          {live && <Equalizer />}
          {live ? 'Now playing' : 'Paused'}
        </p>
        <p className="truncate text-sm font-semibold text-white drop-shadow sm:text-base">
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
  status: ReturnType<typeof useLyrics>['status']
  lyrics: ReturnType<typeof useLyrics>['lyrics']
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
    const target =
      el.offsetTop - scroll.clientHeight / 2 + el.clientHeight / 2
    scroll.scrollTo({
      top: Math.max(0, target),
      behavior: reduce ? 'auto' : 'smooth',
    })
  }, [activeIndex])

  return (
    <div
      ref={scrollRef}
      className={`ytmq-lyrics-scroll h-full overflow-y-auto px-1 py-[35%] sm:py-[40%] ${
        dim ? 'opacity-70' : ''
      }`}
      role="list"
      aria-label="Synced lyrics"
    >
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
    </div>
  )
}

function PlainLyrics({ text }: { text: string }) {
  return (
    <div className="ytmq-lyrics-scroll h-full overflow-y-auto px-1 py-2">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
        Live sync unavailable for this track
      </p>
      <pre className="whitespace-pre-wrap font-sans text-base leading-relaxed text-zinc-200">
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
