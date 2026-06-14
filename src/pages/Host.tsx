import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { QueueList } from '../components/QueueList'
import { SharePanel } from '../components/SharePanel'
import { NowPlaying } from '../components/NowPlaying'
import { YtMusicConnect } from '../components/YtMusicConnect'
import { ToastStack } from '../components/ToastStack'
import { HostAdminPanel } from '../components/HostAdminPanel'
import { ListenersBadge } from '../components/ParticipantList'
import { useQueue } from '../hooks/useQueue'
import { useToast } from '../hooks/useToast'
import { useRoomSettings } from '../hooks/useRoomSettings'
import { useRoomPresence } from '../hooks/useRoomPresence'
import {
  clearPlaybackSession,
  isTrackInPlaybackSession,
  playbackSinceKey,
} from '../lib/playbackSession'
import {
  endLobby,
  fetchRoom,
  getHostToken,
  type RoomInfo,
} from '../lib/room'

function HostUnavailable({ message }: { message: string }) {
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

function HostQueueMirror({
  roomId,
  onToast,
}: {
  roomId: string
  onToast?: (message: string) => void
}) {
  const { items, loading, error } = useQueue(roomId)
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
        <h2 className="text-lg font-semibold">Queue mirror</h2>
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

export function Host() {
  const navigate = useNavigate()
  const { roomId } = useParams<{ roomId: string }>()
  const hostToken = roomId ? getHostToken(roomId) : null
  const [room, setRoom] = useState<RoomInfo | null>(null)
  const [loading, setLoading] = useState(Boolean(roomId && hostToken))
  const [error, setError] = useState<string | null>(null)
  const [ending, setEnding] = useState(false)
  const { toasts, showToast, dismiss } = useToast()
  const settings = useRoomSettings(roomId ?? '', room ?? undefined)
  const { participants, onlineCount } = useRoomPresence(roomId ?? '', {
    heartbeat: false,
  })

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
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-3 p-6">
        <span className="ytmq-spinner h-7 w-7 text-violet-400" aria-hidden />
        <p className="ytmq-anim-fade text-zinc-400">Loading host view…</p>
      </main>
    )
  }

  if (error || !room) {
    return <HostUnavailable message={error ?? 'Lobby unavailable'} />
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 p-6">
      <header className="ytmq-anim-fade-up space-y-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-violet-400">Host</p>
          <ListenersBadge count={onlineCount} />
        </div>
        <h1 className="text-2xl font-semibold">Lobby {room.code}</h1>
        <p className="text-sm text-zinc-400">
          Share the lobby, connect YouTube Music once, then let guests build the
          queue.
        </p>
      </header>

      <div className="ytmq-anim-fade-up" style={{ animationDelay: '80ms' }}>
        <SharePanel
          roomId={roomId}
          code={room.code}
          onCopied={(message) => showToast(message, 'info')}
        />
      </div>

      <div className="ytmq-anim-fade-up" style={{ animationDelay: '140ms' }}>
        <YtMusicConnect roomId={roomId} />
      </div>

      <div className="ytmq-anim-fade-up" style={{ animationDelay: '200ms' }}>
        <NowPlaying roomId={roomId} />
      </div>

      <div className="ytmq-anim-fade-up" style={{ animationDelay: '260ms' }}>
        <HostAdminPanel
          roomId={roomId}
          hostToken={hostToken}
          settings={settings}
          participants={participants}
          onlineCount={onlineCount}
          onToast={showToast}
        />
      </div>

      <div className="ytmq-anim-fade-up" style={{ animationDelay: '320ms' }}>
        <HostQueueMirror
          key={roomId}
          roomId={roomId}
          onToast={(message) => showToast(message, 'info')}
        />
      </div>

      <div
        className="ytmq-anim-fade-up flex flex-col gap-3"
        style={{ animationDelay: '380ms' }}
      >
        <Link
          to={`/room/${roomId}`}
          className="text-center text-sm text-zinc-400 underline underline-offset-2 transition-colors hover:text-zinc-200"
        >
          Open guest view
        </Link>
        <button
          type="button"
          disabled={ending}
          onClick={() => {
            if (!roomId || !hostToken) return
            if (
              !window.confirm(
                'End this lobby? The queue will be deleted for everyone.',
              )
            ) {
              return
            }
            setEnding(true)
            setError(null)
            void endLobby(roomId, hostToken)
              .then((ok) => {
                if (!ok) {
                  setError('Could not end lobby')
                  return
                }
                sessionStorage.removeItem(`ytmq_host_${roomId}`)
                sessionStorage.removeItem(`ytmq_ytm_connected_${roomId}`)
                clearPlaybackSession(roomId)
                navigate('/')
              })
              .catch((err: unknown) => {
                const message =
                  err instanceof Error ? err.message : 'Could not end lobby'
                setError(message)
                showToast(message, 'error')
              })
              .finally(() => setEnding(false))
          }}
          className="ytmq-press inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-500/40 px-4 text-sm font-medium text-red-300 hover:bg-red-500/10 disabled:opacity-60"
        >
          {ending && <span className="ytmq-spinner h-4 w-4" aria-hidden />}
          {ending ? 'Ending…' : 'End lobby & delete queue'}
        </button>
      </div>
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </main>
  )
}
