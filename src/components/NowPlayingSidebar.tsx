import type { ReactNode } from 'react'
import { hqThumbnail, nowPlayingArtwork } from '../lib/queue'
import { useImagePalette } from '../hooks/useImagePalette'
import { useLyrics } from '../hooks/useLyrics'
import { usePlayer } from '../hooks/usePlayer'
import { paletteCssVars } from '../lib/imagePalette'
import { isYoutubeVideoId } from '../lib/playback'
import { LyricsBackdrop, LyricsBody } from './LyricsView'
import { PlaybackControls } from './PlaybackControls'
import { SquigglyProgress } from './SquigglyProgress'
import { SourceBadge } from './ui/brands'
import { MusicNoteIcon } from './ui/icons'
import { VolumeBar } from './ui/VolumeBar'

type NowPlayingSidebarProps = {
  roomId: string
  className?: string
  /** Whether this viewer may drive playback (host, or guest controls enabled). */
  canControl?: boolean
  /** The host gets the volume slider. */
  isHost?: boolean
  /** The collapse button, top right. */
  headerAction?: ReactNode
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
 * The desktop now-playing rail, like Spotify's right panel: the art, the
 * song, where it comes from, the controls (with shuffle and, for the host,
 * volume), the live lyrics, and what plays next.
 */
export function NowPlayingSidebar({
  roomId,
  className = '',
  canControl = true,
  isHost = false,
  headerAction,
}: NowPlayingSidebarProps) {
  const player = usePlayer(roomId, canControl)
  const { nowPlaying, connected, stale, live, isPlaying, position } = player

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

  if (!nowPlaying) {
    return (
      <aside className={`relative isolate flex h-full min-h-0 flex-col overflow-hidden rounded-[24px] bg-[#121212] ${className}`}>
        <div className="flex h-16 shrink-0 items-center justify-between px-5">
          <span className="text-sm font-bold text-white">Now playing</span>
          {headerAction}
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <span className="ytmq-cookie-tile flex h-16 w-16 items-center justify-center bg-white/[0.07] text-neutral-400">
            <MusicNoteIcon className="h-7 w-7" />
          </span>
          <p className="text-base font-bold text-white">Nothing playing yet</p>
          <p className="max-w-[15rem] text-sm text-neutral-400">
            {connected
              ? 'The song shows up here as soon as the next one starts.'
              : 'When the host links YouTube Music or Spotify, the song playing shows up here.'}
          </p>
        </div>
      </aside>
    )
  }

  const duration = nowPlaying.duration
  const hasDuration = duration != null && duration > 0
  const canSeek = player.controlsEnabled && hasDuration
  const source = nowPlaying.source ?? 'ytm'

  // Only reserve the lyrics pane while a lookup is in flight or real lyrics
  // exist; otherwise let the artwork breathe on its own.
  const showLyrics =
    status === 'loading' ||
    (!!lyrics && !lyrics.instrumental && (lyrics.synced.length > 0 || !!lyrics.plain))

  const next = nowPlaying.nextUp
  const nextArt =
    next && (next.thumbnailUrl || (isYoutubeVideoId(next.videoId) ? hqThumbnail(next.videoId) : ''))

  return (
    <aside
      className={`ytmq-now-rail ytmq-anim-fade relative isolate flex h-full min-h-0 flex-col overflow-hidden rounded-[24px] ${className}`}
      style={paletteCssVars(palette)}
      aria-label={`Now playing: ${nowPlaying.title}`}
    >
      <LyricsBackdrop art={art} live={live} paletteReady={paletteReady} />

      <div className="relative flex h-16 shrink-0 items-center gap-2 px-5">
        <span className="flex items-center gap-2 text-sm font-bold text-white">
          {live && <Equalizer />}
          {live ? 'Now playing' : stale ? 'Not reporting' : 'Paused'}
        </span>
        <SourceBadge source={source} tone="glass" className="ml-auto" />
        {headerAction}
      </div>

      <div className={`relative flex min-h-0 flex-1 flex-col gap-4 px-5 pb-5 ${showLyrics ? '' : 'justify-center'}`}>
        <div className="flex shrink-0 flex-col gap-4">
          <img
            src={art}
            alt=""
            crossOrigin="anonymous"
            onError={handleArtError}
            className={`ytmq-now-art mx-auto aspect-square w-[clamp(9rem,82cqw,26rem)] rounded-2xl object-cover shadow-2xl ring-1 ring-white/10 ${
              live ? 'is-live' : ''
            }`}
          />
          <div className="min-w-0">
            <p className="truncate text-xl font-extrabold tracking-[-0.02em] text-white drop-shadow">{nowPlaying.title}</p>
            {nowPlaying.artist && <p className="truncate text-sm font-medium text-white/70">{nowPlaying.artist}</p>}
          </div>

          <SquigglyProgress
            className="w-full"
            position={position}
            duration={duration}
            playing={live}
            canSeek={canSeek}
            onSeek={player.seek}
            updatedAt={nowPlaying.updatedAt}
            trackKey={nowPlaying.videoId}
            size="md"
          />

          <PlaybackControls
            isPlaying={isPlaying}
            disabled={!player.controlsEnabled}
            pendingAction={player.pendingAction}
            onControl={player.control}
            shuffle={player.shuffle}
            onShuffle={player.toggleShuffle}
            title={!canControl ? 'The host has limited playback controls' : undefined}
          />

          {isHost && player.controlsEnabled && (
            <VolumeBar volume={nowPlaying.volume} onVolume={player.setVolume} updatedAt={nowPlaying.updatedAt} />
          )}
        </div>

        {showLyrics && (
          <div className="ytmq-lyrics-pane relative -mx-3 min-h-0 flex-1">
            <LyricsBody status={status} lyrics={lyrics} position={position} stale={stale} live={live} />
          </div>
        )}

        {next && next.videoId !== nowPlaying.videoId && (
          <div className="flex shrink-0 items-center gap-3 rounded-2xl bg-black/25 p-2.5 backdrop-blur-md">
            {nextArt ? (
              <img src={nextArt} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
            ) : (
              <span className="h-10 w-10 shrink-0 rounded-md bg-white/10" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/50">Up next</p>
              <p className="truncate text-sm font-semibold text-white">
                {next.title}
                {next.artist && <span className="font-normal text-white/60"> · {next.artist}</span>}
              </p>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
