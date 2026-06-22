import { hqThumbnail } from '../lib/queue'
import { useNowPlaying } from '../hooks/useNowPlaying'
import { usePlaybackPosition } from '../hooks/usePlaybackPosition'
import { useImagePalette } from '../hooks/useImagePalette'
import { useLyrics } from '../hooks/useLyrics'
import { paletteCssVars } from '../lib/imagePalette'
import { formatPlaybackTime } from '../lib/playback'
import { LyricsBackdrop, LyricsBody } from './LyricsView'

type NowPlayingSidebarProps = {
  roomId: string
  className?: string
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
export function NowPlayingSidebar({ roomId, className = '' }: NowPlayingSidebarProps) {
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
  const percent = hasDuration
    ? Math.min(100, Math.max(0, (position / duration) * 100))
    : 0

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
            <div className="ytmq-now-progress-track h-1.5 w-full overflow-hidden rounded-full">
              <div
                className={`ytmq-now-progress-fill h-full rounded-full transition-[width] duration-300 ease-linear ${
                  live && percent > 1 && percent < 99 ? 'is-live' : ''
                }`}
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
