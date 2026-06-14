import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { NicknamePrompt } from '../components/NicknamePrompt'
import { SearchTab } from '../components/SearchTab'
import { QueueList } from '../components/QueueList'
import { NowPlaying } from '../components/NowPlaying'
import { SharePanel } from '../components/SharePanel'
import { TabBar, type RoomTab } from '../components/TabBar'
import { ToastStack } from '../components/ToastStack'
import { ListenersBadge, ParticipantList } from '../components/ParticipantList'
import { HostAdminPanel } from '../components/HostAdminPanel'
import { useQueue } from '../hooks/useQueue'
import { useToast } from '../hooks/useToast'
import { useRoomSettings } from '../hooks/useRoomSettings'
import { useRoomPresence } from '../hooks/useRoomPresence'
import { getClientId } from '../lib/clientId'
import { getNickname, setNickname } from '../lib/nickname'
import {
  fetchRoom,
  getHostToken,
  verifyRoomPassword,
  type RoomInfo,
} from '../lib/room'

function CenteredScreen({ children }: { children: React.ReactNode }) {
  return (
    <main className="ytmq-anim-pop mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 p-6 text-center">
      {children}
    </main>
  )
}

function RoomUnavailable({ message }: { message: string }) {
  return (
    <CenteredScreen>
      <p className="text-red-400">{message}</p>
      <Link
        to="/"
        className="ytmq-press text-violet-400 underline underline-offset-2"
      >
        Back home
      </Link>
    </CenteredScreen>
  )
}

function PasswordGate({
  code,
  onUnlock,
}: {
  code: string
  onUnlock: (password: string) => Promise<boolean>
}) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const value = password.trim()
    if (!value) {
      setError('Enter the password')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const ok = await onUnlock(value)
      if (!ok) setError('Wrong password')
    } catch {
      setError('Could not verify password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <CenteredScreen>
      <form onSubmit={submit} className="ytmq-anim-pop w-full max-w-sm space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-lg shadow-violet-900/40">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-7 w-7 text-white" aria-hidden>
            <path
              fillRule="evenodd"
              d="M10 1.5A3.5 3.5 0 0 0 6.5 5v2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-.5V5A3.5 3.5 0 0 0 10 1.5Zm2 5.5V5a2 2 0 1 0-4 0v2h4Z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Password required</h1>
          <p className="text-sm text-zinc-400">
            Lobby <span className="font-mono">{code}</span> is protected by the
            host.
          </p>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter password"
          autoFocus
          className="min-h-12 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-center outline-none transition-colors focus:border-violet-500"
        />
        {error && (
          <p className="ytmq-anim-fade text-sm text-red-400" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="ytmq-press inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-violet-500 to-violet-700 px-4 text-lg font-medium text-white shadow-lg shadow-violet-900/30 hover:brightness-110 disabled:opacity-60"
        >
          {busy && <span className="ytmq-spinner h-4 w-4" aria-hidden />}
          {busy ? 'Checking…' : 'Enter'}
        </button>
        <Link
          to="/"
          className="block text-sm text-zinc-500 underline underline-offset-2 hover:text-zinc-300"
        >
          Back home
        </Link>
      </form>
    </CenteredScreen>
  )
}

export function Room() {
  const { roomId } = useParams<{ roomId: string }>()
  const [room, setRoom] = useState<RoomInfo | null>(null)
  const [roomLoading, setRoomLoading] = useState(true)
  const [roomError, setRoomError] = useState<string | null>(null)
  const [tab, setTab] = useState<RoomTab>('search')
  const [accessGranted, setAccessGranted] = useState(false)
  const [nickname, setNicknameState] = useState(() =>
    roomId ? getNickname(roomId) : '',
  )
  const [needsNickname, setNeedsNickname] = useState(() =>
    roomId ? !getNickname(roomId) : false,
  )
  const { toasts, showToast, dismiss } = useToast()

  const clientId = useMemo(
    () => (roomId ? getClientId(roomId) : ''),
    [roomId],
  )

  const hostToken = roomId ? getHostToken(roomId) : null
  const isHost = Boolean(hostToken)

  const settings = useRoomSettings(roomId ?? '', room ?? undefined)

  const { participants, onlineCount, status } = useRoomPresence(roomId ?? '', {
    clientId,
    nickname,
    heartbeat: (accessGranted || isHost) && !roomError,
  })

  const { items, loading, error, busyId, addTrack, removeItem } = useQueue(
    roomId ?? '',
  )

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

        const alreadyOk =
          sessionStorage.getItem(`ytmq_access_${roomId}`) === '1'
        setAccessGranted(!info.has_password || alreadyOk)
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

  // Password gate (direct-link access) — the host owns the room, so skip it.
  if (settings.has_password && !accessGranted && !isHost) {
    return (
      <PasswordGate
        code={room.code}
        onUnlock={async (password) => {
          const ok = await verifyRoomPassword(activeRoomId, password)
          if (ok) {
            sessionStorage.setItem(`ytmq_access_${activeRoomId}`, '1')
            setAccessGranted(true)
          }
          return ok
        }}
      />
    )
  }

  if (status === 'kicked') {
    return (
      <CenteredScreen>
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/15 text-2xl">
          👋
        </div>
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Removed from the lobby</h1>
          <p className="text-sm text-zinc-400">
            The host removed you from this session.
          </p>
        </div>
        <Link
          to="/"
          className="ytmq-press text-violet-400 underline underline-offset-2"
        >
          Back home
        </Link>
      </CenteredScreen>
    )
  }

  if (status === 'locked' && !isHost) {
    return (
      <CenteredScreen>
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 text-2xl">
          🔒
        </div>
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Lobby is locked</h1>
          <p className="text-sm text-zinc-400">
            The host has stopped new people from joining.
          </p>
        </div>
        <Link
          to="/"
          className="ytmq-press text-violet-400 underline underline-offset-2"
        >
          Back home
        </Link>
      </CenteredScreen>
    )
  }

  function saveNickname(value: string) {
    setNicknameState(value)
    setNickname(activeRoomId, value)
  }

  function completeNickname(value: string) {
    saveNickname(value)
    setNeedsNickname(false)
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col p-4 pb-[calc(6rem+env(safe-area-inset-bottom))]">
      {needsNickname && <NicknamePrompt onSubmit={completeNickname} />}

      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs font-medium text-zinc-500">
          Lobby <span className="font-mono text-zinc-300">{room.code}</span>
          {isHost && (
            <span className="rounded-full border border-violet-500/40 bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-200">
              Host
            </span>
          )}
        </span>
        <ListenersBadge count={onlineCount} />
      </div>

      <div className="mb-4">
        <NowPlaying
          roomId={roomId}
          compact
          canControl={isHost || settings.allow_guest_controls}
        />
      </div>

      {tab === 'search' && (
        <div className="ytmq-tab-panel flex flex-1 flex-col">
          <SearchTab
            roomId={roomId}
            nickname={nickname}
            canAdd={settings.allow_guest_add}
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
          {!settings.allow_guest_remove && !isHost && (
            <p className="text-xs text-zinc-500">
              The host has disabled removing tracks.
            </p>
          )}
          <QueueList
            items={items}
            loading={loading}
            busyId={busyId}
            editable={isHost || settings.allow_guest_remove}
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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                In this room
              </h3>
              <span className="text-xs text-zinc-500">{onlineCount} online</span>
            </div>
            <ParticipantList
              participants={participants}
              emptyHint="You're the first one here. Share the code below!"
            />
          </div>

          <SharePanel
            roomId={roomId}
            code={room.code}
            onCopied={(msg) => showToast(msg, 'info')}
          />
        </section>
      )}

      {tab === 'admin' && isHost && hostToken && (
        <section className="ytmq-tab-panel flex flex-1 flex-col">
          <HostAdminPanel
            roomId={roomId}
            hostToken={hostToken}
            settings={settings}
            participants={participants}
            onlineCount={onlineCount}
            onToast={showToast}
          />
        </section>
      )}

      <TabBar
        active={tab}
        onChange={setTab}
        queueCount={items.length}
        showAdmin={isHost}
      />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </main>
  )
}
