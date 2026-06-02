import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { SearchTab } from '../components/SearchTab'
import { QueueList } from '../components/QueueList'
import { SharePanel } from '../components/SharePanel'
import { TabBar, type RoomTab } from '../components/TabBar'
import { ToastStack } from '../components/ToastStack'
import { useQueue } from '../hooks/useQueue'
import { useToast } from '../hooks/useToast'
import { getNickname, setNickname } from '../lib/nickname'
import { fetchRoom, type RoomInfo } from '../lib/room'

function RoomUnavailable({ message }: { message: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 p-6 text-center">
      <p className="text-red-400">{message}</p>
      <Link to="/" className="text-violet-400 underline">
        Back home
      </Link>
    </main>
  )
}

export function Room() {
  const { roomId } = useParams<{ roomId: string }>()
  const [room, setRoom] = useState<RoomInfo | null>(null)
  const [roomLoading, setRoomLoading] = useState(true)
  const [roomError, setRoomError] = useState<string | null>(null)
  const [tab, setTab] = useState<RoomTab>('search')
  const [nickname, setNicknameState] = useState('')
  const { toasts, showToast } = useToast()

  const {
    items,
    loading,
    error,
    busyId,
    addTrack,
    removeItem,
  } = useQueue(roomId ?? '')

  useEffect(() => {
    if (!roomId) return

    let cancelled = false

    fetchRoom(roomId)
      .then((info) => {
        if (cancelled) return
        if (!info) {
          setRoomError('Lobby not found or expired')
          return
        }
        setRoom(info)
        setNicknameState(getNickname(roomId))
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setRoomError(err instanceof Error ? err.message : 'Could not load lobby')
      })
      .finally(() => {
        if (!cancelled) setRoomLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [roomId])

  if (!roomId) {
    return <RoomUnavailable message="Missing room id" />
  }

  if (roomLoading) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg items-center justify-center p-6">
        <p className="text-zinc-400">Loading lobby…</p>
      </main>
    )
  }

  if (roomError || !room) {
    return <RoomUnavailable message={roomError ?? 'Lobby unavailable'} />
  }

  const activeRoomId = roomId

  function saveNickname(value: string) {
    setNicknameState(value)
    setNickname(activeRoomId, value)
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col p-4 pb-24">
      {tab === 'search' && (
        <SearchTab
          nickname={nickname}
          onAdd={async (track) => {
            await addTrack(track)
          }}
          onAdded={(title) => showToast(`Added “${title}”`)}
        />
      )}

      {tab === 'queue' && (
        <section className="flex flex-1 flex-col gap-3">
          <h2 className="text-lg font-semibold">Queue</h2>
          {error && (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}
          <QueueList
            items={items}
            loading={loading}
            busyId={busyId}
            editable
            onRemove={(id) => void removeItem(id)}
          />
        </section>
      )}

      {tab === 'room' && (
        <section className="flex flex-1 flex-col gap-4">
          <h2 className="text-lg font-semibold">Room</h2>
          <p className="text-sm text-zinc-400">
            Share this lobby so friends can add tracks to the queue.
          </p>

          <label className="block space-y-1">
            <span className="text-sm text-zinc-500">Nickname (optional)</span>
            <input
              type="text"
              value={nickname}
              onChange={(e) => saveNickname(e.target.value)}
              placeholder="Your name on the queue"
              maxLength={32}
              className="min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 outline-none focus:border-violet-500"
            />
          </label>

          <SharePanel
            roomId={roomId}
            code={room.code}
            onCopied={(msg) => showToast(msg)}
          />
        </section>
      )}

      <TabBar active={tab} onChange={setTab} queueCount={items.length} />
      <ToastStack toasts={toasts} />
    </main>
  )
}
