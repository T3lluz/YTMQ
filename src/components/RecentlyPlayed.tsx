import { useRecentlyPlayed } from '../hooks/useRecentlyPlayed'
import { useQueueAdder } from '../hooks/useQueueAdder'
import { clearRecentlyPlayed, formatPlayedAgo } from '../lib/recentlyPlayed'
import {
  defaultThumbnail,
  type AddTrackInput,
  type QueueInsertMode,
} from '../lib/queue'
import { TrackRow } from './TrackRow'

type RecentlyPlayedProps = {
  roomId: string
  nickname: string
  onAdd: (track: AddTrackInput, mode: QueueInsertMode) => Promise<void>
  onAdded?: (title: string, mode: QueueInsertMode) => void
}

function HistoryIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-8 w-8 text-zinc-600"
    >
      <path d="M3 3v5h5" />
      <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

export function RecentlyPlayed({
  roomId,
  nickname,
  onAdd,
  onAdded,
}: RecentlyPlayedProps) {
  const items = useRecentlyPlayed(roomId)
  const { pending, add } = useQueueAdder(nickname, onAdd, onAdded)

  if (items.length === 0) {
    return (
      <div className="ytmq-anim-pop flex flex-col items-center gap-3 rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 px-6 py-12 text-center">
        <HistoryIcon />
        <p className="text-sm font-medium text-zinc-300">No history yet</p>
        <p className="max-w-xs text-sm text-zinc-500">
          Songs appear here as they play in YouTube Music. Search above to add
          the first track, then come back to replay favourites in one tap.
        </p>
      </div>
    )
  }

  return (
    <section className="flex flex-col gap-2 pb-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Recently played
        </h3>
        <button
          type="button"
          onClick={() => clearRecentlyPlayed(roomId)}
          className="text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
        >
          Clear
        </button>
      </div>
      <ul className="flex flex-col gap-1.5">
        {items.map((track) => {
          const addable = {
            videoId: track.videoId,
            title: track.title,
            channelTitle: track.artist,
            thumbnail: defaultThumbnail(track.videoId),
          }
          return (
            <TrackRow
              key={`${track.videoId}:${track.playedAt}`}
              thumbnail={defaultThumbnail(track.videoId)}
              title={track.title}
              subtitle={track.artist || 'Unknown artist'}
              meta={formatPlayedAgo(track.playedAt)}
              pendingMode={pending?.id === track.videoId ? pending.mode : null}
              disabled={pending !== null}
              onPlayNext={() => void add(addable, 'play_next')}
              onQueue={() => void add(addable, 'queue')}
            />
          )
        })}
      </ul>
    </section>
  )
}
