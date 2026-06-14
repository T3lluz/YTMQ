import {
  defaultThumbnail,
  ytMusicWatchUrl,
  type QueueInsertMode,
  type QueueItem,
} from '../lib/queue'

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

function MetaLine({
  mode,
  addedBy,
}: {
  mode: QueueInsertMode
  addedBy?: string
}) {
  return (
    <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-zinc-500">
      <InsertModeBadge mode={mode} />
      {addedBy && (
        <span className="min-w-0 truncate">Added by {addedBy}</span>
      )}
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
  if (loading) {
    return <p className="py-8 text-center text-zinc-500">Loading queue…</p>
  }

  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-zinc-500">
        Queue is empty. Use Search to add tracks.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item, index) => {
        const thumb =
          item.thumbnail_url || defaultThumbnail(item.video_id)
        const isBusy = busyId === item.id

        return (
          <li
            key={item.id}
            className="flex gap-3 rounded-xl border border-zinc-800 bg-zinc-900/80 p-3"
          >
            <span className="flex w-6 shrink-0 items-center justify-center text-sm text-zinc-500">
              {index + 1}
            </span>
            <img
              src={thumb}
              alt=""
              className="h-14 w-14 shrink-0 rounded-lg object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{item.title}</p>
              <p className="truncate text-sm text-zinc-400">
                {item.channel_title || 'Unknown artist'}
              </p>
              <MetaLine
                mode={item.insert_mode ?? 'play_next'}
                addedBy={item.added_by}
              />
            </div>
            <div className="flex shrink-0 flex-col gap-1">
              {showYtMusicLink && (
                <a
                  href={ytMusicWatchUrl(item.video_id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-9 rounded-lg bg-violet-600 px-3 text-center text-xs font-medium leading-9 text-white active:bg-violet-700"
                >
                  Open
                </a>
              )}
              {editable && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => onRemove?.(item.id)}
                  className="min-h-9 rounded-lg border border-red-900/60 px-3 text-sm text-red-400 active:bg-red-950 disabled:opacity-40"
                  aria-label="Remove"
                >
                  Remove
                </button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
