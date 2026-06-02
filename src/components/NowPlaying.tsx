import { defaultThumbnail } from '../lib/queue'
import { useNowPlaying } from '../hooks/useNowPlaying'

type NowPlayingProps = {
  roomId: string
  compact?: boolean
}

export function NowPlaying({ roomId, compact = false }: NowPlayingProps) {
  const { nowPlaying, connected, stale } = useNowPlaying(roomId)

  if (!nowPlaying && !connected) {
    return (
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <p className="text-sm font-medium text-zinc-300">Now playing</p>
        <p className="mt-1 text-sm text-zinc-500">
          Waiting for playback from the connected YouTube Music tab…
        </p>
      </section>
    )
  }

  if (!nowPlaying) {
    return (
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <p className="text-sm font-medium text-zinc-300">Now playing</p>
        <p className="mt-1 text-sm text-zinc-500">
          No recent updates — keep music.youtube.com open and playing.
        </p>
      </section>
    )
  }

  const thumb = defaultThumbnail(nowPlaying.videoId)

  return (
    <section
      className={`flex gap-3 rounded-xl border bg-zinc-900/80 p-4 ${
        stale
          ? 'border-zinc-800 opacity-80'
          : 'border-violet-500/30 ring-1 ring-violet-500/10'
      }`}
      aria-label="Now playing in YouTube Music"
    >
      <img
        src={thumb}
        alt=""
        className={`shrink-0 rounded-lg object-cover ${
          compact ? 'h-12 w-12' : 'h-16 w-16'
        }`}
      />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-violet-400">
          Now playing{stale ? ' (paused?)' : ''}
        </p>
        <p className="truncate font-medium">{nowPlaying.title}</p>
        {nowPlaying.artist && (
          <p className="truncate text-sm text-zinc-400">{nowPlaying.artist}</p>
        )}
      </div>
      {!compact && (
        <a
          href={`https://music.youtube.com/watch?v=${nowPlaying.videoId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 self-center rounded-lg border border-zinc-700 px-3 py-2 text-xs font-medium active:bg-zinc-800"
        >
          Open
        </a>
      )}
    </section>
  )
}
