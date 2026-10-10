import { useState } from 'react'
import { nowPlayingArtwork } from '../lib/queue'
import { useImagePalette } from '../hooks/useImagePalette'
import { usePlayer } from '../hooks/usePlayer'
import { paletteCssVars } from '../lib/imagePalette'
import { ShuffleButton } from './PlaybackControls'
import { SquigglyProgress } from './SquigglyProgress'
import { SourceIcon } from './ui/brands'
import { ChevronDownIcon, MusicNoteIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon } from './ui/icons'
import { VolumeBar } from './ui/VolumeBar'

type NowPlayingProps = {
  roomId: string
  canControl?: boolean
  /** The host gets volume in the expanded card. */
  isHost?: boolean
  /** Tapping the song opens the lyrics. */
  onOpenLyrics?: () => void
}

/**
 * The phone's mini player under the top bar. Collapsed it is the song, its
 * source and play/next; the chevron opens progress, shuffle, previous and,
 * for the host, volume.
 */
export function NowPlaying({ roomId, canControl = true, isHost = false, onOpenLyrics }: NowPlayingProps) {
  const player = usePlayer(roomId, canControl)
  const { nowPlaying, connected, stale, live, isPlaying, position } = player
  const [expanded, setExpanded] = useState(false)
  const thumb = nowPlaying ? nowPlayingArtwork(nowPlaying) : undefined
  const { palette } = useImagePalette(thumb)

  if (!nowPlaying) {
    return (
      <section className="ytmq-anim-fade flex items-center gap-3 rounded-[20px] bg-white/[0.05] p-2.5 pr-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-neutral-500">
          <MusicNoteIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-white">Nothing playing yet</p>
          <p className="truncate text-xs text-neutral-400">
            {connected ? 'Waiting for the next song.' : 'Shows up once the host’s player starts.'}
          </p>
        </div>
      </section>
    )
  }

  const disabled = !player.controlsEnabled
  const source = nowPlaying.source ?? 'ytm'

  return (
    <section
      className="ytmq-mini relative isolate overflow-hidden rounded-[20px]"
      style={paletteCssVars(palette)}
      aria-label="Now playing"
    >
      <div aria-hidden className="ytmq-mini-bg absolute inset-0 -z-10" />
      <div className="flex items-center gap-3 p-2.5">
        <button
          type="button"
          onClick={onOpenLyrics}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-label={`Open lyrics for ${nowPlaying.title}`}
        >
          <img
            src={thumb}
            alt=""
            crossOrigin="anonymous"
            className={`h-12 w-12 shrink-0 rounded-xl object-cover ${stale ? 'opacity-70' : ''}`}
          />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <SourceIcon source={source} className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate text-sm font-bold text-white">{nowPlaying.title}</span>
            </span>
            <span className="block truncate text-xs text-white/70">
              {live ? nowPlaying.artist : stale ? 'Player not reporting' : `Paused · ${nowPlaying.artist}`}
            </span>
          </span>
        </button>
        {!expanded && (
          <>
            <button
              type="button"
              disabled={disabled}
              onClick={() => player.control(isPlaying ? 'pause' : 'play')}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="ytmq-press ytmq-anim-fade inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-neutral-950 disabled:opacity-40"
            >
              {isPlaying ? <PauseIcon className="h-[18px] w-[18px]" /> : <PlayIcon className="ml-0.5 h-[18px] w-[18px]" />}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => player.control('next')}
              aria-label="Next"
              className="ytmq-press ytmq-anim-fade inline-flex h-10 w-9 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-40"
            >
              <NextIcon className="h-5 w-5" />
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? 'Fewer controls' : 'More controls'}
          className="ytmq-press -ml-1 inline-flex h-10 w-8 shrink-0 items-center justify-center rounded-full text-white/70"
        >
          <ChevronDownIcon className={`h-5 w-5 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      <div className={`ytmq-collapse ${expanded ? 'is-open' : ''}`}>
        <div className="min-h-0">
          <div className="flex flex-col gap-3 px-4 pb-4 pt-1">
            <SquigglyProgress
              position={position}
              duration={nowPlaying.duration}
              playing={live}
              canSeek={!disabled && Boolean(nowPlaying.duration)}
              onSeek={player.seek}
              updatedAt={nowPlaying.updatedAt}
              trackKey={nowPlaying.videoId}
              size="sm"
              times="elapsed-remaining"
            />
            <div className="flex items-center justify-between">
              <ShuffleButton state={player.shuffle} onShuffle={player.toggleShuffle} disabled={disabled} size="md" />
              <button
                type="button"
                disabled={disabled}
                onClick={() => player.control('prev')}
                aria-label="Previous"
                className="ytmq-press inline-flex h-11 w-11 items-center justify-center rounded-full text-white disabled:opacity-40"
              >
                <PrevIcon className="h-6 w-6" />
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => player.control(isPlaying ? 'pause' : 'play')}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className="ytmq-press inline-flex h-14 w-14 items-center justify-center rounded-full bg-white text-neutral-950 disabled:opacity-40"
              >
                {isPlaying ? <PauseIcon className="h-6 w-6" /> : <PlayIcon className="ml-0.5 h-6 w-6" />}
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => player.control('next')}
                aria-label="Next"
                className="ytmq-press inline-flex h-11 w-11 items-center justify-center rounded-full text-white disabled:opacity-40"
              >
                <NextIcon className="h-6 w-6" />
              </button>
              <span className="h-9 w-9" aria-hidden />
            </div>
            {isHost && !disabled && (
              <VolumeBar volume={nowPlaying.volume} onVolume={player.setVolume} updatedAt={nowPlaying.updatedAt} />
            )}
            {!canControl && (
              <p className="text-center text-xs text-white/60">The host keeps the controls for now.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
