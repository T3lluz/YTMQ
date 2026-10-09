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
    ? 'bg-accent-500/15 text-accent-300'
    : 'bg-white/[0.07] text-neutral-300'

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide leading-tight ${classes}`}
      aria-label={`Added as ${label.toLowerCase()}`}
    >
      {label}
    </span>
  )
}

function QueueSkeleton() {
  return (
    <ul className="flex flex-col gap-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <li
          key={index}
          className="ytmq-anim-fade flex gap-3 rounded-xl p-2"
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
    <div className="ytmq-anim-pop flex h-full min-h-[14rem] flex-col items-center justify-center gap-2 rounded-2xl bg-white/[0.03] px-6 py-12 text-center">
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
        <path d="M3 6h13M3 12h9M3 18h9" />
        <path d="M18 12v8" />
        <path d="M21.5 15.5 18 12l-3.5 3.5" />
      </svg>
      <p className="text-base font-bold text-white">Nothing queued yet</p>
      <p className="max-w-xs text-sm text-neutral-500">
        Search for a song and pick Play next or Queue. It shows up here for everyone.
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
            className={`group mb-1 flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/[0.05] ${
              leaving ? 'ytmq-leaving' : 'ytmq-anim-row'
            }`}
          >
            <span className="flex w-6 shrink-0 items-center justify-center text-sm tabular-nums text-neutral-500">
              {rank ?? ''}
            </span>
            <img
              src={thumb}
              alt=""
              className="h-12 w-12 shrink-0 rounded-md bg-neutral-800 object-cover"
            />
            <div className="min-w-0 flex-1">
              {/* The title gets the whole width; the badge goes on the line
                  below so narrow phones do not cut titles to a few letters. */}
              <p className="truncate font-semibold text-neutral-100">{item.title}</p>
              <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-sm text-neutral-400">
                <InsertModeBadge mode={item.insert_mode ?? 'play_next'} />
                <span className="truncate">
                  {item.channel_title || 'Unknown artist'}
                  {item.added_by && <span className="text-neutral-500"> · added by {item.added_by}</span>}
                </span>
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-1">
              {showYtMusicLink && (
                <a
                  href={ytMusicWatchUrl(item.video_id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ytmq-press min-h-9 rounded-full bg-white/[0.08] px-3 text-center text-xs font-semibold leading-9 text-white hover:bg-white/[0.16]"
                >
                  Open
                </a>
              )}
              {editable && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => onRemove?.(item.id)}
                  className="ytmq-press inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-accent-500/15 hover:text-accent-300 disabled:opacity-40"
                  aria-label={`Remove ${item.title}`}
                  title="Remove from the queue"
                >
                  {isBusy ? (
                    <span className="ytmq-spinner h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-4 w-4" aria-hidden>
                      <path d="M5 5l10 10M15 5 5 15" />
                    </svg>
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
