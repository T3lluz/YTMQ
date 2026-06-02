import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { QueueList } from '../components/QueueList'
import { SharePanel } from '../components/SharePanel'
import { YtMusicConnect } from '../components/YtMusicConnect'
import { useQueue } from '../hooks/useQueue'
import {
  fetchRoom,
  getHostToken,
  type RoomInfo,
} from '../lib/room'

function HostUnavailable({ message }: { message: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 p-6 text-center">
      <p className="text-red-400">{message}</p>
      <Link to="/" className="text-violet-400 underline">
        Back home
      </Link>
    </main>
  )
}

function HostQueueMirror({ roomId }: { roomId: string }) {
  const { items, loading, error } = useQueue(roomId)
  const [copiedIds, setCopiedIds] = useState(false)

  async function copyAllVideoIds() {
    const ids = items.map((item) => item.video_id).join('\n')
    if (!ids) return
    await navigator.clipboard.writeText(ids)
    setCopiedIds(true)
    window.setTimeout(() => setCopiedIds(false), 2000)
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Queue mirror</h2>
        {items.length > 0 && (
          <button
            type="button"
            onClick={() => void copyAllVideoIds()}
            className="shrink-0 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-medium active:bg-zinc-900"
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
      <QueueList items={items} loading={loading} showYtMusicLink />
    </section>
  )
}

export function Host() {
  const { roomId } = useParams<{ roomId: string }>()
  const hostToken = roomId ? getHostToken(roomId) : null
  const [room, setRoom] = useState<RoomInfo | null>(null)
  const [loading, setLoading] = useState(Boolean(roomId && hostToken))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!roomId || !hostToken) return

    let cancelled = false

    fetchRoom(roomId)
      .then((info) => {
        if (cancelled) return
        if (!info) {
          setError('Lobby not found or expired')
          return
        }
        setRoom(info)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Could not load lobby')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [roomId, hostToken])

  if (!roomId) {
    return <HostUnavailable message="Missing room id" />
  }

  if (!hostToken) {
    return (
      <HostUnavailable message="Host session missing — create a new lobby from home" />
    )
  }

  if (loading) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg items-center justify-center p-6">
        <p className="text-zinc-400">Loading host view…</p>
      </main>
    )
  }

  if (error || !room) {
    return <HostUnavailable message={error ?? 'Lobby unavailable'} />
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 p-6">
      <header className="space-y-1">
        <p className="text-sm font-medium text-violet-400">Host</p>
        <h1 className="text-2xl font-semibold">Lobby {room.code}</h1>
        <p className="text-sm text-zinc-400">
          Share the lobby, connect YouTube Music once, then let guests build the
          queue.
        </p>
      </header>

      <SharePanel roomId={roomId} code={room.code} />

      <YtMusicConnect roomId={roomId} />

      <HostQueueMirror key={roomId} roomId={roomId} />

      <Link
        to={`/room/${roomId}`}
        className="text-center text-sm text-zinc-400 underline"
      >
        Open guest view
      </Link>
    </main>
  )
}
