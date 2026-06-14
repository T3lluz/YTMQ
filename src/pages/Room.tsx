import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { NicknamePrompt } from '../components/NicknamePrompt'
import { SearchTab } from '../components/SearchTab'
import { QueueList } from '../components/QueueList'
import { NowPlaying } from '../components/NowPlaying'
import { SharePanel } from '../components/SharePanel'
import { TabBar, type RoomTab } from '../components/TabBar'
import { ToastStack } from '../components/ToastStack'
import { useQueue } from '../hooks/useQueue'
import { useToast } from '../hooks/useToast'
import { getNickname, setNickname } from '../lib/nickname'
import { fetchRoom, type RoomInfo } from '../lib/room'

function RoomUnavailable({ message }: { message: string }) {
  return (
    <main className="ytmq-anim-pop mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 p-6 text-center">
      <p className="text-red-400">{message}</p>
      <Link
        to="/"
        className="ytmq-press text-violet-400 underline underline-offset-2"
      >
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
  const [nickname, setNicknameState] = useState(() =>
    roomId ? getNickname(roomId) : '',
  )
  const [needsNickname, setNeedsNickname] = useState(() =>
    roomId ? !getNickname(roomId) : false,
  )
  const { toasts, showToast, dismiss } = useToast()

  const {
    items,
    loading,
    error,
    busyId,
    addTrack,
    removeItem,
  } = useQueue(roomId ?? '')

  const lastError = useRef<string | null>(null)
  useEffect(() => {
    if (error && error !== lastError.current) {
      showToast(error, 'error')
    }
    lastError.current = error
  }, [error, showToast])

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
        const stored = getNickname(roomId)
        setNicknameState(stored)
        setNeedsNickname(!stored)
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
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-3 p-6">
        <span className="ytmq-spinner h-7 w-7 text-violet-400" aria-hidden />
        <p className="ytmq-anim-fade text-zinc-400">Loading lobby…</p>
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

  function completeNickname(value: string) {
    saveNickname(value)
    setNeedsNickname(false)
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col p-4 pb-24">
      {needsNickname && (
        <NicknamePrompt onSubmit={completeNickname} />
      )}
      <div className="mb-4">
        <NowPlaying roomId={roomId} compact />
      </div>

      {tab === 'search' && (
        <div className="ytmq-tab-panel flex flex-1 flex-col">
          <SearchTab
            roomId={roomId}
            nickname={nickname}
            onAdd={async (track, mode) => {
              await addTrack(track, mode)
            }}
            onAdded={(title, mode) =>
              showToast(
                mode === 'queue'
                  ? `Added to queue: “${title}”`
                  : `Playing next: “${title}”`,
                'success',
              )
            }
          />
        </div>
      )}

      {tab === 'queue' && (
        <section className="ytmq-tab-panel flex flex-1 flex-col gap-3">
          <h2 className="text-lg font-semibold">Queue</h2>
          <QueueList
            items={items}
            loading={loading}
            busyId={busyId}
            editable
            onRemove={(id) => {
              const target = items.find((item) => item.id === id)
              void removeItem(id)
              showToast(
                target ? `Removed “${target.title}”` : 'Removed from queue',
                'info',
              )
            }}
          />
        </section>
      )}

      {tab === 'room' && (
        <section className="ytmq-tab-panel flex flex-1 flex-col gap-4">
          <h2 className="text-lg font-semibold">Room</h2>
          <p className="text-sm text-zinc-400">
            Share this lobby so friends can add tracks to the queue.
          </p>

          <label className="block space-y-1">
            <span className="text-sm text-zinc-500">Nickname</span>
            <input
              type="text"
              value={nickname}
              onChange={(e) => saveNickname(e.target.value)}
              placeholder="Your name on the queue"
              maxLength={32}
              className="min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 outline-none transition-colors focus:border-violet-500"
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
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </main>
  )
}
