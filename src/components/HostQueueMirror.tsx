import { useMemo, useState } from 'react'
import { QueueList } from './QueueList'
import { type QueueItem } from '../lib/queue'
import {
  isTrackInPlaybackSession,
  playbackSinceKey,
} from '../lib/playbackSession'

type HostQueueMirrorProps = {
  roomId: string
  items: QueueItem[]
  loading: boolean
  error?: string | null
  onToast?: (message: string) => void
}

/**
 * Host-only view of the queue scoped to the current playback session, with a
 * shortcut to copy every video id (e.g. to paste into YouTube Music).
 *
 * Queue data is passed in from the parent's `useQueue` rather than opening a
 * second realtime subscription on the same room channel.
 */
export function HostQueueMirror({
  roomId,
  items,
  loading,
  error,
  onToast,
}: HostQueueMirrorProps) {
  const [copiedIds, setCopiedIds] = useState(false)

  const playbackSince = sessionStorage.getItem(playbackSinceKey(roomId))
  const sessionItems = useMemo(() => {
    if (!playbackSince) return items
    return items.filter((item) =>
      isTrackInPlaybackSession(item.created_at, playbackSince),
    )
  }, [items, playbackSince])

  async function copyAllVideoIds() {
    const ids = sessionItems.map((item) => item.video_id).join('\n')
    if (!ids) return
    await navigator.clipboard.writeText(ids)
    setCopiedIds(true)
    onToast?.(`Copied ${sessionItems.length} video IDs`)
    window.setTimeout(() => setCopiedIds(false), 2000)
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Queue mirror
        </h3>
        {sessionItems.length > 0 && (
          <button
            type="button"
            onClick={() => void copyAllVideoIds()}
            className="ytmq-press shrink-0 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-medium hover:border-zinc-600 hover:bg-zinc-900"
          >
            {copiedIds ? 'Copied!' : 'Copy video IDs'}
          </button>
        )}
      </div>
      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
      {!playbackSince && items.length > 0 && (
        <p className="text-xs text-zinc-500">
          Connect YouTube Music to start this session’s queue. Older lobby
          tracks stay in the database until you end the lobby.
        </p>
      )}
      <QueueList items={sessionItems} loading={loading} showYtMusicLink />
    </section>
  )
}
