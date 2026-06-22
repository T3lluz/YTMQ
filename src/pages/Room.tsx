import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { NicknamePrompt } from '../components/NicknamePrompt'
import { SearchTab } from '../components/SearchTab'
import { QueueList } from '../components/QueueList'
import { NowPlaying } from '../components/NowPlaying'
import { NowPlayingSidebar } from '../components/NowPlayingSidebar'
import { LyricsView } from '../components/LyricsView'
import { RecentlyPlayed } from '../components/RecentlyPlayed'
import { SharePanel } from '../components/SharePanel'
import { TabBar, type RoomTab } from '../components/TabBar'
import { TabSlider } from '../components/TabSlider'
import { ToastStack } from '../components/ToastStack'
import { ListenersBadge, ParticipantList } from '../components/ParticipantList'
import { HostAdminPanel } from '../components/HostAdminPanel'
import { YtMusicConnect } from '../components/YtMusicConnect'
import { useQueue } from '../hooks/useQueue'
import { useIsDesktop } from '../hooks/useMediaQuery'
import { useToast } from '../hooks/useToast'
import { useRoomSettings } from '../hooks/useRoomSettings'
import { useRoomPresence } from '../hooks/useRoomPresence'
import { getClientId } from '../lib/clientId'
import { getNickname, setNickname } from '../lib/nickname'
import type { AddTrackInput, QueueInsertMode } from '../lib/queue'
import { clearPlaybackSession } from '../lib/playbackSession'
import {
  endLobby,
  fetchRoom,
  getHostToken,
  verifyRoomPassword,
  type RoomInfo,
} from '../lib/room'

// Left-to-right order of the dock tabs. Used to decide which way a panel should
// slide in: tapping a tab further right slides in from the right, and vice
// versa. Kept in sync with the tab order in `TabBar`.
const TAB_ORDER: RoomTab[] = ['search', 'queue', 'lyrics', 'room', 'admin']

// Desktop now-playing rail sizing. The user can drag the rail wider/narrower
// within these bounds; the choice (and the collapsed flag) persists globally so
// it survives tab switches and reloads.
const SIDEBAR_MIN = 264
const SIDEBAR_MAX = 480
const SIDEBAR_DEFAULT = 360
const SIDEBAR_COLLAPSED_KEY = 'ytmq_sidebar_collapsed'
const SIDEBAR_WIDTH_KEY = 'ytmq_sidebar_width'

function clampSidebarWidth(value: number) {
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, value))
}

function loadSidebarCollapsed() {
  if (typeof localStorage === 'undefined') return false
  return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
}

function loadSidebarWidth() {
  if (typeof localStorage === 'undefined') return SIDEBAR_DEFAULT
  const stored = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY))
  return Number.isFinite(stored) && stored > 0
    ? clampSidebarWidth(stored)
    : SIDEBAR_DEFAULT
}

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

function CollapseSidebarIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
      <path d="m16 9-3 3 3 3" />
    </svg>
  )
}

function OpenSidebarIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
      <path d="m13 9 3 3-3 3" />
    </svg>
  )
}

export function Room() {
  const navigate = useNavigate()
  const { roomId } = useParams<{ roomId: string }>()
  const [room, setRoom] = useState<RoomInfo | null>(null)
  const [roomLoading, setRoomLoading] = useState(true)
  const [roomError, setRoomError] = useState<string | null>(null)
  const [tab, setTab] = useState<RoomTab>('search')
  const [tabDir, setTabDir] = useState<'fwd' | 'back'>('fwd')

  const changeTab = (next: RoomTab) => {
    if (next === tab) return
    const from = TAB_ORDER.indexOf(tab)
    const to = TAB_ORDER.indexOf(next)
    setTabDir(to >= from ? 'fwd' : 'back')
    setTab(next)
  }
  const [ending, setEnding] = useState(false)
  const [accessGranted, setAccessGranted] = useState(false)
  const [nickname, setNicknameState] = useState(() =>
    roomId ? getNickname(roomId) : '',
  )
  const [needsNickname, setNeedsNickname] = useState(() =>
    roomId ? !getNickname(roomId) : false,
  )
  const { toasts, showToast, dismiss } = useToast()
  const isDesktop = useIsDesktop()

  // Collapsible / resizable now-playing rail (desktop only). State is local so it
  // persists across tab switches while the room stays mounted, and mirrored to
  // localStorage so it survives reloads too.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(loadSidebarCollapsed)
  const [sidebarWidth, setSidebarWidth] = useState(loadSidebarWidth)
  const [resizingSidebar, setResizingSidebar] = useState(false)

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? '1' : '0')
  }, [sidebarCollapsed])

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth))
  }, [sidebarWidth])

  const startSidebarResize = (e: React.PointerEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = sidebarWidth
    setResizingSidebar(true)
    const onMove = (ev: PointerEvent) => {
      setSidebarWidth(clampSidebarWidth(startWidth + (ev.clientX - startX)))
    }
    const onUp = () => {
      setResizingSidebar(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // On desktop the Lyrics screen is a fullscreen overlay that slides in over the
  // whole page, so the sidebar + tab content stay mounted underneath as the
  // "base". `baseTab` is the tab the slider shows there: the live tab normally,
  // or the last non-lyrics tab we were on while the lyrics overlay is up.
  const lastBaseTab = useRef<RoomTab>(tab === 'lyrics' ? 'search' : tab)
  if (tab !== 'lyrics') lastBaseTab.current = tab
  const baseTab: RoomTab =
    isDesktop && tab === 'lyrics' ? lastBaseTab.current : tab

  // Lyrics overlay lifecycle. It's kept mounted through its slide-out so leaving
  // animates too. Phases: `in` (sliding in) → `shown` (settled, no transform so
  // the backdrop blur / GPU layer cost is released) → `out` (sliding away) →
  // unmount. `dir` carries the travel direction for the animation.
  const [lyricsOverlay, setLyricsOverlay] = useState<{
    phase: 'hidden' | 'in' | 'shown' | 'out'
    dir: 'fwd' | 'back'
  }>({ phase: 'hidden', dir: 'fwd' })

  useEffect(() => {
    if (isDesktop && tab === 'lyrics') {
      setLyricsOverlay((prev) =>
        prev.phase === 'shown' ? prev : { phase: 'in', dir: tabDir },
      )
    } else {
      setLyricsOverlay((prev) =>
        prev.phase === 'in' || prev.phase === 'shown'
          ? { phase: 'out', dir: tabDir }
          : prev,
      )
    }
  }, [tab, isDesktop, tabDir])

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

  function handleEndLobby() {
    if (!hostToken) return
    if (
      !window.confirm(
        'End this lobby? The queue will be deleted for everyone.',
      )
    ) {
      return
    }
    setEnding(true)
    void endLobby(activeRoomId, hostToken)
      .then((ok) => {
        if (!ok) {
          showToast('Could not end lobby', 'error')
          return
        }
        sessionStorage.removeItem(`ytmq_host_${activeRoomId}`)
        sessionStorage.removeItem(`ytmq_ytm_connected_${activeRoomId}`)
        clearPlaybackSession(activeRoomId)
        navigate('/')
      })
      .catch((err: unknown) => {
        showToast(
          err instanceof Error ? err.message : 'Could not end lobby',
          'error',
        )
      })
      .finally(() => setEnding(false))
  }

  // Desktop always shows the now-playing sidebar as the page base; Lyrics rides
  // on top as a fullscreen overlay. Mobile keeps Lyrics inline as a tall panel.
  const showSidebar = isDesktop
  const lyricsPanelHeight = !isDesktop && tab === 'lyrics'
  const canControl = isHost || settings.allow_guest_controls

  // Desktop is a fixed-height app shell: the page itself never scrolls; each tab
  // owns its own internal scroll regions and lays content out to fill the space.
  // Mobile keeps the original scrolling page.
  const onAdd = async (track: AddTrackInput, mode: QueueInsertMode) => {
    await addTrack(track, mode)
  }
  const onAdded = (title: string, mode: QueueInsertMode) =>
    showToast(
      mode === 'queue'
        ? `Added to queue: “${title}”`
        : `Playing next: “${title}”`,
      'success',
    )

  // Scrollable body inside a desktop tab column; the extra bottom padding keeps
  // the last item clear of the floating dock.
  const deskScroll = 'min-h-0 flex-1 overflow-y-auto pb-28'

  // The content for a single tab. Rendered through <TabSlider/> so switching
  // tabs pushes the whole panel offscreen. On desktop Lyrics is handled by the
  // overlay instead, so this only renders it inline (mobile).
  const renderPanel = (panelTab: RoomTab) => {
    switch (panelTab) {
      case 'search':
        return (
          <div
            className={`ytmq-tab-panel flex flex-1 flex-col ${
              showSidebar ? 'min-h-0' : ''
            }`}
          >
            <SearchTab
              fillHeight={showSidebar}
              nickname={nickname}
              canAdd={settings.allow_guest_add}
              onAdd={onAdd}
              onAdded={onAdded}
            />
          </div>
        )

      case 'queue':
        return showSidebar ? (
          <section className="ytmq-tab-panel flex min-h-0 flex-1 flex-col gap-5 lg:grid lg:grid-cols-2 lg:grid-rows-1">
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">Queue</h2>
                <span className="text-xs text-zinc-500">
                  {items.length} {items.length === 1 ? 'track' : 'tracks'}
                </span>
              </div>
              {!settings.allow_guest_remove && !isHost && (
                <p className="mb-2 shrink-0 text-xs text-zinc-500">
                  The host has disabled removing tracks.
                </p>
              )}
              <div className={`${deskScroll} pr-1`}>
                <QueueList
                  items={items}
                  loading={loading}
                  busyId={busyId}
                  editable={isHost || settings.allow_guest_remove}
                  onRemove={(id) => {
                    const target = items.find((item) => item.id === id)
                    void removeItem(id)
                    showToast(
                      target
                        ? `Removed “${target.title}”`
                        : 'Removed from queue',
                      'info',
                    )
                  }}
                />
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              <h2 className="mb-3 shrink-0 text-lg font-semibold">History</h2>
              <div className={`${deskScroll} pr-1`}>
                <RecentlyPlayed
                  roomId={roomId}
                  nickname={nickname}
                  canAdd={settings.allow_guest_add}
                  onAdd={onAdd}
                  onAdded={onAdded}
                />
              </div>
            </div>
          </section>
        ) : (
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

            <RecentlyPlayed
              roomId={roomId}
              nickname={nickname}
              canAdd={settings.allow_guest_add}
              onAdd={onAdd}
              onAdded={onAdded}
            />
          </section>
        )

      case 'lyrics':
        return (
          <LyricsView
            roomId={roomId}
            fullscreen={false}
            queueItems={items}
            canControl={canControl}
          />
        )

      case 'room':
        return showSidebar ? (
          <section className="ytmq-tab-panel flex min-h-0 flex-1 flex-col">
            <h2 className="mb-4 shrink-0 text-lg font-semibold">Room</h2>
            <div className={`${deskScroll} pr-1`}>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="space-y-5">
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
                      <span className="text-xs text-zinc-500">
                        {onlineCount} online
                      </span>
                    </div>
                    <ParticipantList
                      participants={participants}
                      emptyHint="You're the first one here. Share the code below!"
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
                  <SharePanel
                    roomId={roomId}
                    code={room.code}
                    onCopied={(msg) => showToast(msg, 'info')}
                  />
                </div>
              </div>
            </div>
          </section>
        ) : (
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
                <span className="text-xs text-zinc-500">
                  {onlineCount} online
                </span>
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
        )

      case 'admin':
        if (!isHost || !hostToken) return null
        return showSidebar ? (
          <section className="ytmq-tab-panel grid min-h-0 flex-1 grid-cols-1 grid-rows-2 gap-6 lg:grid-cols-2 lg:grid-rows-1">
            <div className={`${deskScroll} flex flex-col gap-6 pr-1`}>
              <YtMusicConnect roomId={roomId} />
              <HostAdminPanel
                section="controls"
                roomId={roomId}
                hostToken={hostToken}
                settings={settings}
                participants={participants}
                onlineCount={onlineCount}
                onToast={showToast}
              />

              <button
                type="button"
                disabled={ending}
                onClick={handleEndLobby}
                className="ytmq-press inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-500/40 px-4 text-sm font-medium text-red-300 hover:bg-red-500/10 disabled:opacity-60"
              >
                {ending && <span className="ytmq-spinner h-4 w-4" aria-hidden />}
                {ending ? 'Ending…' : 'End lobby & delete queue'}
              </button>
            </div>

            <div className={`${deskScroll} flex flex-col gap-6 pr-1`}>
              <HostAdminPanel
                section="people"
                roomId={roomId}
                hostToken={hostToken}
                settings={settings}
                participants={participants}
                onlineCount={onlineCount}
                onToast={showToast}
              />
            </div>
          </section>
        ) : (
          <section className="ytmq-tab-panel flex flex-1 flex-col gap-6">
            <YtMusicConnect roomId={roomId} />

            <HostAdminPanel
              roomId={roomId}
              hostToken={hostToken}
              settings={settings}
              participants={participants}
              onlineCount={onlineCount}
              onToast={showToast}
            />

            <button
              type="button"
              disabled={ending}
              onClick={handleEndLobby}
              className="ytmq-press inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-500/40 px-4 text-sm font-medium text-red-300 hover:bg-red-500/10 disabled:opacity-60"
            >
              {ending && <span className="ytmq-spinner h-4 w-4" aria-hidden />}
              {ending ? 'Ending…' : 'End lobby & delete queue'}
            </button>
          </section>
        )

      default:
        return null
    }
  }

  return (
    <main
      className={
        showSidebar
          ? 'h-dvh overflow-hidden'
          : `pb-[calc(6rem+env(safe-area-inset-bottom))] ${
              lyricsPanelHeight ? 'h-dvh' : 'min-h-dvh'
            }`
      }
    >
      {needsNickname && <NicknamePrompt onSubmit={completeNickname} />}

      <div
        className={
          showSidebar
            ? 'flex h-full w-full items-stretch px-4 py-4 lg:px-6'
            : `mx-auto flex w-full max-w-lg flex-col px-4 ${
                lyricsPanelHeight ? 'h-full' : ''
              }`
        }
      >
        {/* Spotify-style now-playing rail — every tab except Lyrics on desktop.
            Collapses to zero width with a smooth slide, and the right edge can be
            dragged to resize it. */}
        {showSidebar && (
          <div
            className="relative hidden h-full shrink-0 overflow-hidden md:block"
            style={{
              width: sidebarCollapsed ? 0 : sidebarWidth,
              marginRight: sidebarCollapsed ? 0 : '1.5rem',
              transition: resizingSidebar
                ? 'none'
                : 'width 380ms var(--ease-out-soft), margin-right 380ms var(--ease-out-soft)',
            }}
          >
            <div
              className="h-full"
              style={{
                width: sidebarWidth,
                opacity: sidebarCollapsed ? 0 : 1,
                transform: sidebarCollapsed ? 'translateX(-24px)' : 'translateX(0)',
                transition: resizingSidebar
                  ? 'none'
                  : 'opacity 260ms ease, transform 380ms var(--ease-out-soft)',
              }}
            >
              <NowPlayingSidebar
                roomId={roomId}
                className="h-full"
                canControl={canControl}
              />
            </div>

            <button
              type="button"
              onClick={() => setSidebarCollapsed(true)}
              aria-label="Hide now playing panel"
              title="Hide panel"
              className="ytmq-press absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-zinc-950/60 text-zinc-300 backdrop-blur-md hover:bg-zinc-900/80 hover:text-white"
            >
              <CollapseSidebarIcon className="h-5 w-5" />
            </button>

            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize now playing panel"
              onPointerDown={startSidebarResize}
              className="ytmq-resize-handle group absolute inset-y-0 right-0 z-10 flex w-3 cursor-col-resize items-center justify-center"
            >
              <span className="h-12 w-1 rounded-full bg-white/15 transition-colors group-hover:bg-violet-400/70" />
            </div>
          </div>
        )}

        <div
          className={
            showSidebar
              ? 'flex h-full min-h-0 w-full min-w-0 flex-1 flex-col'
              : `flex w-full flex-col pt-4 ${lyricsPanelHeight ? 'h-full' : ''}`
          }
        >
          <div className="mb-3 flex shrink-0 items-center justify-end gap-2">
            {isHost && (
              <span className="rounded-full border border-violet-500/40 bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-200">
                Host
              </span>
            )}
            <ListenersBadge count={onlineCount} />
          </div>

          {/* On desktop the sidebar carries now-playing, so the compact card is
              only needed on mobile / the lyrics tab. */}
          {!showSidebar && (
            <div className="mb-4">
              <NowPlaying roomId={roomId} compact canControl={canControl} />
            </div>
          )}

          <TabSlider
            activeKey={baseTab}
            direction={tabDir}
            fill={showSidebar || lyricsPanelHeight}
            className="w-full flex-1"
          >
            {showSidebar ? (
              // The slider viewport stays full-page width so a tab push travels
              // edge-to-edge instead of being clipped. When the rail is hidden we
              // re-center the resting content in a max-width column inside the
              // (full-width) sliding panel.
              <div
                className={`flex min-h-0 w-full flex-1 flex-col ${
                  sidebarCollapsed ? 'mx-auto max-w-4xl' : ''
                }`}
              >
                {renderPanel(baseTab)}
              </div>
            ) : (
              renderPanel(baseTab)
            )}
          </TabSlider>
        </div>
      </div>

      {/* Top-left button to bring the now-playing rail back. Hidden on the
          Lyrics tab, where the immersive overlay owns the whole screen. */}
      {showSidebar && sidebarCollapsed && tab !== 'lyrics' && (
        <button
          type="button"
          onClick={() => setSidebarCollapsed(false)}
          aria-label="Show now playing panel"
          title="Show panel"
          className="ytmq-anim-fade ytmq-press fixed left-4 top-4 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-zinc-950/60 text-zinc-300 shadow-lg shadow-black/30 backdrop-blur-md hover:bg-zinc-900/80 hover:text-white lg:left-6"
        >
          <OpenSidebarIcon className="h-5 w-5" />
        </button>
      )}

      {/* Desktop Lyrics: a fullscreen overlay that slides the whole page. */}
      {lyricsOverlay.phase !== 'hidden' && (
        <div
          className={`fixed inset-0 z-40 ${
            lyricsOverlay.phase === 'in'
              ? `ytmq-slide-in-${lyricsOverlay.dir}`
              : lyricsOverlay.phase === 'out'
                ? `ytmq-slide-out-${lyricsOverlay.dir}`
                : ''
          }`}
          onAnimationEnd={(e) => {
            if (e.target !== e.currentTarget) return
            setLyricsOverlay((prev) => {
              if (prev.phase === 'in') return { ...prev, phase: 'shown' }
              if (prev.phase === 'out') return { ...prev, phase: 'hidden' }
              return prev
            })
          }}
        >
          <LyricsView
            roomId={roomId}
            fullscreen
            queueItems={items}
            canControl={canControl}
          />
        </div>
      )}

      <TabBar
        active={tab}
        onChange={changeTab}
        queueCount={items.length}
        showAdmin={isHost}
        roomId={roomId}
        code={room.code}
        onCopied={(msg) => showToast(msg, 'info')}
      />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </main>
  )
}
