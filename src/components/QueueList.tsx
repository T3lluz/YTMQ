import {
  defaultThumbnail,
  ytMusicWatchUrl,
  type QueueInsertMode,
  type QueueItem,
} from '../lib/queue'
import { useAnimatedList } from '../hooks/useAnimatedList'

function InsertModeBadge({ mode }: { mode: QueueInsertMode }) {
  const isPlayNext = mode === 'play_next'
  const label = isPlayNext ? 'Play next' : 'Queue'
  const classes = isPlayNext
    ? 'border-violet-500/40 bg-violet-500/15 text-violet-200'
    : 'border-zinc-600/70 bg-zinc-800/80 text-zinc-200'

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide leading-none ${classes}`}
      aria-label={`Added as ${label.toLowerCase()}`}
    >
      {label}
    </span>
  )
}

function AddedByLine({ addedBy }: { addedBy?: string }) {
  if (!addedBy) return null

  return (
    <p className="mt-0.5 truncate text-xs text-zinc-500">Added by {addedBy}</p>
  )
}

function QueueSkeleton() {
  return (
    <ul className="flex flex-col gap-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <li
          key={index}
          className="ytmq-anim-fade flex gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3"
          style={{ animationDelay: `${index * 70}ms` }}
        >
          <div className="ytmq-skeleton h-14 w-14 shrink-0 rounded-lg" />
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
            <div className="ytmq-skeleton h-3.5 w-3/4 rounded-full" />
            <div className="ytmq-skeleton h-3 w-1/2 rounded-full" />
          </div>
        </li>
      ))}
    </ul>
  )
}

function EmptyState() {
  return (
    <div className="ytmq-anim-pop flex flex-col items-center gap-3 rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 px-6 py-12 text-center">
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
        <path d="M3 6h13M3 12h9M3 18h9" />
        <path d="M18 12v8" />
        <path d="M21.5 15.5 18 12l-3.5 3.5" />
      </svg>
      <p className="text-sm font-medium text-zinc-300">Queue is empty</p>
      <p className="max-w-xs text-sm text-zinc-500">
        Use Search to add the first track.
      </p>
    </div>
  )
}

type QueueListProps = {
  items: QueueItem[]
  loading?: boolean
  busyId?: string | null
  editable?: boolean
  showYtMusicLink?: boolean
  onRemove?: (itemId: string) => void
}

export function QueueList({
  items,
  loading,
  busyId,
  editable = false,
  showYtMusicLink = false,
  onRemove,
}: QueueListProps) {
  const entries = useAnimatedList(items, (item) => item.id)

  if (loading) {
    return <QueueSkeleton />
  }

  if (items.length === 0) {
    return <EmptyState />
  }

  // Map id -> position among the *present* items for the rank badge.
  const positionById = new Map(items.map((item, index) => [item.id, index + 1]))

  return (
    <ul className="flex flex-col">
      {entries.map(({ key, item, leaving }) => {
        const thumb = item.thumbnail_url || defaultThumbnail(item.video_id)
        const isBusy = busyId === item.id
        const rank = positionById.get(item.id)

        return (
          <li
            key={key}
            className={`mb-2 flex gap-3 rounded-xl border border-zinc-800 bg-zinc-900/80 p-3 transition-colors hover:border-zinc-700 ${
              leaving ? 'ytmq-leaving' : 'ytmq-anim-row'
            }`}
          >
            <span className="flex w-6 shrink-0 items-center justify-center text-sm tabular-nums text-zinc-500">
              {rank ?? ''}
            </span>
            <img
              src={thumb}
              alt=""
              className="h-14 w-14 shrink-0 rounded-lg object-cover"
            />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <p className="min-w-0 flex-1 truncate font-medium">
                  {item.title}
                </p>
                <InsertModeBadge mode={item.insert_mode ?? 'play_next'} />
              </div>
              <p className="truncate text-sm text-zinc-400">
                {item.channel_title || 'Unknown artist'}
              </p>
              <AddedByLine addedBy={item.added_by} />
            </div>
            <div className="flex shrink-0 flex-col gap-1">
              {showYtMusicLink && (
                <a
                  href={ytMusicWatchUrl(item.video_id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ytmq-press min-h-9 rounded-lg bg-violet-600 px-3 text-center text-xs font-medium leading-9 text-white hover:bg-violet-500"
                >
                  Open
                </a>
              )}
              {editable && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => onRemove?.(item.id)}
                  className="ytmq-press inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-red-900/60 px-3 text-sm text-red-400 hover:border-red-700 hover:bg-red-950/50 disabled:opacity-40"
                  aria-label="Remove"
                >
                  {isBusy ? (
                    <span className="ytmq-spinner h-3.5 w-3.5" aria-hidden />
                  ) : (
                    'Remove'
                  )}
                </button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
