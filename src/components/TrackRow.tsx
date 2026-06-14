import type { QueueInsertMode } from '../lib/queue'

export function PlayNextIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
    >
      <path d="M3.5 4.75A.75.75 0 0 1 4.62 4.1l8.5 5.25a.75.75 0 0 1 0 1.3l-8.5 5.25a.75.75 0 0 1-1.12-.65V4.75Z" />
      <path d="M15.5 4.75a.75.75 0 0 1 1.5 0v10.5a.75.75 0 0 1-1.5 0V4.75Z" />
    </svg>
  )
}

export function AddToQueueIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 6h10" />
      <path d="M3 10h7" />
      <path d="M3 14h7" />
      <path d="M14.5 11v6" />
      <path d="M11.5 14h6" />
    </svg>
  )
}

type TrackRowProps = {
  thumbnail: string
  title: string
  subtitle?: string
  rank?: number
  meta?: string
  roundedThumb?: boolean
  pendingMode?: QueueInsertMode | null
  disabled?: boolean
  onPlayNext: () => void
  onQueue: () => void
}

export function TrackRow({
  thumbnail,
  title,
  subtitle,
  rank,
  meta,
  roundedThumb = false,
  pendingMode = null,
  disabled = false,
  onPlayNext,
  onQueue,
}: TrackRowProps) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/60 px-3 py-2.5 transition-colors hover:border-zinc-700">
      {rank != null && (
        <span className="w-5 shrink-0 text-center text-sm tabular-nums text-zinc-500">
          {rank}
        </span>
      )}
      <img
        src={thumbnail}
        alt=""
        loading="lazy"
        className={`h-12 w-12 shrink-0 object-cover ${
          roundedThumb ? 'rounded-full' : 'rounded-lg'
        }`}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{title}</p>
        {subtitle && (
          <p className="truncate text-sm text-zinc-400">{subtitle}</p>
        )}
      </div>
      {meta && (
        <span className="shrink-0 text-xs tabular-nums text-zinc-500">
          {meta}
        </span>
      )}
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          disabled={disabled}
          onClick={onPlayNext}
          aria-label="Play next"
          title="Play next"
          className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-2.5 text-xs font-medium text-white active:bg-violet-700 disabled:opacity-60"
        >
          {pendingMode === 'play_next' ? (
            <span aria-hidden="true">…</span>
          ) : (
            <PlayNextIcon />
          )}
          <span className="hidden sm:inline">Next</span>
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onQueue}
          aria-label="Add to queue"
          title="Add to queue"
          className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-violet-500/70 px-2.5 text-xs font-medium text-violet-200 active:bg-violet-500/10 disabled:opacity-60"
        >
          {pendingMode === 'queue' ? (
            <span aria-hidden="true">…</span>
          ) : (
            <AddToQueueIcon />
          )}
          <span className="hidden sm:inline">Queue</span>
        </button>
      </div>
    </li>
  )
}
