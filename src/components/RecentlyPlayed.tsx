import { useRecentlyPlayed } from '../hooks/useRecentlyPlayed'
import { useQueueAdder } from '../hooks/useQueueAdder'
import { clearRecentlyPlayed, formatPlayedAgo } from '../lib/recentlyPlayed'
import { isYoutubeVideoId } from '../lib/playback'
import {
  defaultArtistThumbnail,
  defaultThumbnail,
  type AddTrackInput,
  type QueueInsertMode,
} from '../lib/queue'
import { TrackRow } from './TrackRow'

type RecentlyPlayedProps = {
  roomId: string
  nickname: string
  canAdd?: boolean
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
      className="h-8 w-8 text-neutral-600"
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
  canAdd = true,
  onAdd,
  onAdded,
}: RecentlyPlayedProps) {
  const items = useRecentlyPlayed(roomId)
  const { pending, add } = useQueueAdder(nickname, onAdd, onAdded)

  if (items.length === 0) {
    return (
      <div className="ytmq-anim-pop flex h-full min-h-[14rem] flex-col items-center justify-center gap-2 rounded-2xl bg-white/[0.03] px-6 py-12 text-center">
        <HistoryIcon />
        <p className="text-base font-bold text-white">Nothing played yet</p>
        <p className="max-w-xs text-sm text-neutral-500">
          Songs collect here as they play, so you can queue one again with a tap.
        </p>
      </div>
    )
  }

  return (
    <section className="flex flex-col gap-2 pb-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Played</h2>
        <button
          type="button"
          onClick={() => clearRecentlyPlayed(roomId)}
          className="text-xs font-medium text-neutral-500 underline-offset-2 hover:text-neutral-300 hover:underline"
        >
          Clear
        </button>
      </div>
      <ul className="flex flex-col gap-1.5">
        {items.map((track) => {
          const fromYoutube = isYoutubeVideoId(track.videoId)
          const thumb =
            track.thumbnailUrl ||
            (fromYoutube
              ? defaultThumbnail(track.videoId)
              : defaultArtistThumbnail(track.title))
          const addable = {
            videoId: track.videoId,
            title: track.title,
            channelTitle: track.artist,
            thumbnail: thumb,
          }
          return (
            <TrackRow
              key={`${track.videoId}:${track.playedAt}`}
              thumbnail={thumb}
              title={track.title}
              subtitle={track.artist || 'Unknown artist'}
              meta={formatPlayedAgo(track.playedAt)}
              pendingMode={pending?.id === track.videoId ? pending.mode : null}
              disabled={pending !== null || !canAdd || !fromYoutube}
              onPlayNext={() => void add(addable, 'play_next')}
              onQueue={() => void add(addable, 'queue')}
            />
          )
        })}
      </ul>
    </section>
  )
}
