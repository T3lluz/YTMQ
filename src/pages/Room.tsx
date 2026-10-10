import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { NicknamePrompt } from '../components/NicknamePrompt'
import { NowPlaying } from '../components/NowPlaying'
import { NowPlayingSidebar } from '../components/NowPlayingSidebar'
import { LyricsView } from '../components/LyricsView'
import { TabBar, type RoomTab } from '../components/TabBar'
import { TabSlider } from '../components/TabSlider'
import { ToastStack } from '../components/ToastStack'
import { AvatarStack } from '../components/ParticipantList'
import { SearchPanel } from '../components/search/SearchPanel'
import { QueueTab } from '../components/room/QueueTab'
import { AdminTab } from '../components/room/AdminTab'
import { RoomChromeContext } from '../components/room/chrome'
import { YtmqLogo } from '../components/YtmqLogo'
import { IconButton } from '../components/ui/Button'
import { buttonClass } from '../components/ui/buttonStyles'
import { useQueue } from '../hooks/useQueue'
import { useQueueAdder } from '../hooks/useQueueAdder'
import { useIsDesktop } from '../hooks/useMediaQuery'
import { useToast } from '../hooks/useToast'
import { useRoomSettings } from '../hooks/useRoomSettings'
import { useRoomPresence } from '../hooks/useRoomPresence'
import { usePlaybackKeybinds } from '../hooks/usePlaybackKeybinds'
import { useSpotifyPlayer } from '../hooks/useSpotifyPlayer'
import { getClientId } from '../lib/clientId'
import { getNickname, HOST_NICKNAME, setNickname } from '../lib/nickname'
import type { AddTrackInput, QueueInsertMode } from '../lib/queue'
import { clearPlaybackSession } from '../lib/playbackSession'
import { RESTORE_TAB_KEY } from '../lib/spotifyAuth'
import {
  announceSessionClearToExtension,
  announceSessionToExtension,
} from '../lib/extensionBridge'
import {
  clearHostToken,
  endLobby,
  fetchRoom,
  getHostToken,
  verifyRoomPassword,
  type RoomInfo,
} from '../lib/room'
import { forgetLobby, rememberLobby } from '../lib/recentLobbies'

// Left-to-right order of the dock tabs. Used to decide which way a panel should
// slide in: tapping a tab further right slides in from the right, and vice
// versa. Kept in sync with the tab order in `TabBar`.
const TAB_ORDER: RoomTab[] = ['search', 'queue', 'lyrics', 'admin']

/** Old links and extension builds say room; that tab is gone. */
function asTab(value: string | null | undefined): RoomTab | null {
  if (!value) return null
  if (value === 'room') return 'queue'
  return TAB_ORDER.includes(value as RoomTab) ? (value as RoomTab) : null
}

function consumeRestoreTab(): RoomTab | null {
  // ?tab=admin from the extension's popup ("Set up" Spotify) or a shared link.
  const fromUrl = asTab(new URLSearchParams(window.location.search).get('tab'))
  if (fromUrl) {
    const url = new URL(window.location.href)
    url.searchParams.delete('tab')
    window.history.replaceState(window.history.state, '', url)
    return fromUrl
  }
  try {
    const raw = sessionStorage.getItem(RESTORE_TAB_KEY)
    if (!raw) return null
    sessionStorage.removeItem(RESTORE_TAB_KEY)
    return asTab(raw)
  } catch {
    /* private mode */
  }
  return null
}

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
    <main className="ytmq-anim-pop mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-5 p-6 text-center">
      {children}
    </main>
  )
}

function StateIcon({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'accent' }) {
  return (
    <div
      className={`ytmq-cookie-tile flex h-20 w-20 items-center justify-center ${
        tone === 'accent' ? 'bg-accent-500/20 text-accent-300' : 'bg-white/[0.07] text-neutral-300'
      }`}
    >
      {children}
    </div>
  )
}

function HomeButton() {
  return (
    <Link to="/" className={buttonClass('primary', 'md')}>
      Back to YTMQ
    </Link>
  )
}

function RoomUnavailable({ message }: { message: string }) {
  return (
    <CenteredScreen>
      <StateIcon>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7" aria-hidden>
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
          <path d="m3 3 18 18" />
        </svg>
      </StateIcon>
      <div className="space-y-1.5">
        <h1 className="text-xl font-bold text-white">{message}</h1>
        <p className="text-sm text-neutral-400">
          Lobbies close when the host ends them, or 24 hours after they started. Ask the host
          for a new code.
        </p>
      </div>
      <HomeButton />
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
        <div className="ytmq-cookie-tile mx-auto flex h-20 w-20 items-center justify-center bg-accent-500/20 text-accent-300">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-7 w-7" aria-hidden>
            <path
              fillRule="evenodd"
              d="M10 1.5A3.5 3.5 0 0 0 6.5 5v2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-.5V5A3.5 3.5 0 0 0 10 1.5Zm2 5.5V5a2 2 0 1 0-4 0v2h4Z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-white">This lobby has a password</h1>
          <p className="text-sm text-neutral-400">
            Ask the host of <span className="font-mono tracking-wider text-neutral-200">{code}</span> for it.
          </p>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          className="ytmq-input h-12 w-full text-center text-base"
        />
        {error && (
          <p className="ytmq-anim-fade text-sm text-accent-300" role="alert">
            {error}
          </p>
        )}
        <div className="flex items-center justify-center gap-2">
          <Link to="/" className={buttonClass('ghost', 'lg')}>
            Back
          </Link>
          <button type="submit" disabled={busy} className={buttonClass('accent', 'lg')}>
            {busy && <span className="ytmq-spinner h-4 w-4" aria-hidden />}
            {busy ? 'Checking…' : 'Go in'}
          </button>
        </div>
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
  const [tab, setTab] = useState<RoomTab>(() => consumeRestoreTab() ?? 'search')
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
  const [nickname, setNicknameState] = useState(() => (roomId ? getNickname(roomId) : ''))
  const [needsNickname, setNeedsNickname] = useState(() => (roomId ? !getNickname(roomId) : false))
  const { toasts, showToast, dismiss } = useToast()
  const isDesktop = useIsDesktop()

  // Collapsible, resizable now-playing rail (desktop). Remembered per browser.
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

  // On desktop Lyrics is a fullscreen overlay over the page, so the rail and
  // the last other tab stay mounted underneath it.
  const [lastBaseTab, setLastBaseTab] = useState<RoomTab>(tab === 'lyrics' ? 'search' : tab)
  if (tab !== 'lyrics' && tab !== lastBaseTab) setLastBaseTab(tab)
  const baseTab: RoomTab = isDesktop && tab === 'lyrics' ? lastBaseTab : tab

  // Lyrics overlay lifecycle: in → shown → out → hidden, so leaving animates
  // too. Worked out while rendering, when the wish for it changes.
  const overlayWanted = isDesktop && tab === 'lyrics'
  const [lyricsOverlay, setLyricsOverlay] = useState<{
    phase: 'hidden' | 'in' | 'shown' | 'out'
    dir: 'fwd' | 'back'
    wanted: boolean
  }>({ phase: 'hidden', dir: 'fwd', wanted: false })
  if (lyricsOverlay.wanted !== overlayWanted) {
    setLyricsOverlay((prev) =>
      overlayWanted
        ? { phase: prev.phase === 'shown' ? 'shown' : 'in', dir: tabDir, wanted: true }
        : {
            phase: prev.phase === 'in' || prev.phase === 'shown' ? 'out' : prev.phase,
            dir: tabDir,
            wanted: false,
          },
    )
  }

  const clientId = useMemo(() => (roomId ? getClientId(roomId) : ''), [roomId])

  const hostToken = roomId ? getHostToken(roomId) : null
  const isHost = Boolean(hostToken)

  const settings = useRoomSettings(roomId ?? '', room ?? undefined)
  const canControl = isHost || settings.allow_guest_controls
  usePlaybackKeybinds({ roomId: roomId ?? '', enabled: Boolean(roomId) && canControl })

  const { participants, onlineCount, status } = useRoomPresence(roomId ?? '', {
    clientId,
    nickname,
    heartbeat: (accessGranted || isHost) && !roomError,
  })

  const { items, loading, error, busyId, addTrack, removeItem } = useQueue(roomId ?? '')
  const { status: spotifyStatus } = useSpotifyPlayer({
    roomId: roomId ?? '',
    hostToken,
    queue: items,
    onNotice: (message) => showToast(message, 'info'),
  })

  // The host can always add; the switch in Admin is for guests.
  const canAdd = isHost || settings.allow_guest_add
  const onAdd = useCallback(
    async (track: AddTrackInput, mode: QueueInsertMode) => {
      await addTrack(hostToken ? { ...track, host_token: hostToken } : track, mode)
    },
    [addTrack, hostToken],
  )
  const onAdded = useCallback(
    (title: string, mode: QueueInsertMode, count?: number) =>
      showToast(
        count && count > 1
          ? `${mode === 'queue' ? 'Added' : 'Playing next:'} ${count} songs`
          : mode === 'queue'
            ? `Added to queue: “${title}”`
            : `Playing next: “${title}”`,
        'success',
      ),
    [showToast],
  )
  const adder = useQueueAdder({ canAdd, onAdd, onAdded })

  const lastError = useRef<string | null>(null)
  useEffect(() => {
    if (error && error !== lastError.current) showToast(error, 'error')
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
        rememberLobby(roomId, info.code, Boolean(getHostToken(roomId)))
        // Hosts are always "HOST": never prompt them for a name.
        let stored = getNickname(roomId)
        if (!stored && getHostToken(roomId)) {
          stored = HOST_NICKNAME
          setNickname(roomId, stored)
        }
        setNicknameState(stored)
        setNeedsNickname(!stored)
        const alreadyOk = sessionStorage.getItem(`ytmq_access_${roomId}`) === '1'
        setAccessGranted(!info.has_password || alreadyOk)
      })
      .catch((err: unknown) => {
        if (!cancelled) setRoomError(err instanceof Error ? err.message : 'Could not load lobby')
      })
      .finally(() => {
        if (!cancelled) setRoomLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [roomId])

  // The extension asks an open lobby to show a tab (popup → Host).
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== window) return
      const data = event.data as { source?: string; type?: string; tab?: string } | null
      if (data?.source !== 'ytmq-extension' || data.type !== 'ytmq:show-tab') return
      const next = asTab(data.tab)
      if (next) setTab(next)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // Keep the extension on this lobby whenever the host has it open.
  useEffect(() => {
    if (!roomId || !isHost || roomLoading || roomError) return
    const activeId = roomId
    announceSessionToExtension(activeId)
    function onVisible() {
      if (document.visibilityState === 'visible') announceSessionToExtension(activeId)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [roomId, isHost, roomLoading, roomError])

  if (!roomId) return <RoomUnavailable message="Missing room id" />

  if (roomLoading) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 p-6">
        <YtmqLogo size={56} className="ytmq-logo-pulse" />
        <p className="ytmq-anim-fade text-sm text-neutral-500">Opening the lobby…</p>
      </main>
    )
  }

  if (roomError || !room) return <RoomUnavailable message={roomError ?? 'Lobby unavailable'} />

  const activeRoomId = roomId

  // Password gate (direct-link access); the host owns the room, so skip it.
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
        <StateIcon tone="accent">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8" aria-hidden>
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="m17 8 5 5" />
            <path d="m22 8-5 5" />
          </svg>
        </StateIcon>
        <div className="space-y-1.5">
          <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-white">The host removed you</h1>
          <p className="text-sm text-neutral-400">You can&apos;t add songs to this lobby any more.</p>
        </div>
        <HomeButton />
      </CenteredScreen>
    )
  }

  if (status === 'locked' && !isHost) {
    return (
      <CenteredScreen>
        <StateIcon>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8" aria-hidden>
            <rect x="4" y="11" width="16" height="10" rx="2.5" />
            <path d="M8 11V7a4 4 0 1 1 8 0v4" />
          </svg>
        </StateIcon>
        <div className="space-y-1.5">
          <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-white">This lobby is locked</h1>
          <p className="text-sm text-neutral-400">The host stopped new people from joining. Ask them to unlock it.</p>
        </div>
        <HomeButton />
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
    if (!window.confirm('End this lobby? The queue will be deleted for everyone.')) return
    setEnding(true)
    void endLobby(activeRoomId, hostToken)
      .then((ok) => {
        if (!ok) {
          showToast('Could not end lobby', 'error')
          return
        }
        clearHostToken(activeRoomId)
        forgetLobby(activeRoomId)
        sessionStorage.removeItem(`ytmq_ytm_connected_${activeRoomId}`)
        clearPlaybackSession(activeRoomId)
        // Stop the extension from re-linking YouTube Music to a dead lobby.
        announceSessionClearToExtension()
        navigate('/')
      })
      .catch((err: unknown) => {
        showToast(err instanceof Error ? err.message : 'Could not end lobby', 'error')
      })
      .finally(() => setEnding(false))
  }

  const handleQueueRemove = (id: string) => {
    const target = items.find((item) => item.id === id)
    void removeItem(id)
    showToast(target ? `Removed “${target.title}”` : 'Removed from the queue', 'info')
  }

  const showSidebar = isDesktop
  const lyricsPanelHeight = !isDesktop && tab === 'lyrics'

  const renderPanel = (panelTab: RoomTab) => {
    switch (panelTab) {
      case 'search':
        return <SearchPanel nickname={nickname} adder={adder} />
      case 'queue':
        return (
          <QueueTab
            roomId={activeRoomId}
            nickname={nickname}
            items={items}
            loading={loading}
            busyId={busyId}
            editable={isHost || settings.allow_guest_remove}
            adder={adder}
            onRemove={handleQueueRemove}
            onSearch={() => changeTab('search')}
          />
        )
      case 'lyrics':
        return <LyricsView roomId={activeRoomId} fullscreen={false} queueItems={items} canControl={canControl} isHost={isHost} />
      case 'admin':
        if (!isHost || !hostToken) return null
        return (
          <AdminTab
            roomId={activeRoomId}
            code={room.code}
            hostToken={hostToken}
            settings={settings}
            participants={participants}
            onlineCount={onlineCount}
            ending={ending}
            spotifyStatus={spotifyStatus}
            onToast={showToast}
            onEndLobby={handleEndLobby}
          />
        )
      default:
        return null
    }
  }

  // Who is here, on the right of every tab's header (desktop).
  const presence = (
    <div
      className="flex h-10 items-center gap-2.5 rounded-full bg-white/[0.06] pl-1.5 pr-3.5"
      title={participants.filter((p) => p.online).map((p) => p.nickname || 'Guest').join(', ')}
    >
      <AvatarStack participants={participants} />
      <span className="text-[13px] font-semibold text-neutral-200">{onlineCount} here</span>
    </div>
  )
  const hostPill = isHost && (
    <span className="inline-flex h-10 items-center rounded-full bg-accent-500/15 px-3.5 text-[13px] font-bold text-accent-300">Host</span>
  )

  const chrome = {
    leading:
      showSidebar && sidebarCollapsed ? (
        <IconButton label="Show now playing" variant="tonal" size="lg" onClick={() => setSidebarCollapsed(false)}>
          <OpenSidebarIcon className="h-5 w-5" />
        </IconButton>
      ) : undefined,
    trailing: showSidebar ? (
      <>
        {hostPill}
        {presence}
      </>
    ) : undefined,
  }

  const content = (
    <TabSlider activeKey={baseTab} direction={tabDir} fill={showSidebar || lyricsPanelHeight} className="w-full flex-1">
      {showSidebar ? (
        <div className="ytmq-panel-scroll h-full overflow-y-auto overflow-x-hidden px-6 pb-32">
          <div className={`mx-auto w-full ${sidebarCollapsed ? 'max-w-[90rem]' : ''}`}>{renderPanel(baseTab)}</div>
        </div>
      ) : (
        <div className={`flex flex-col ${lyricsPanelHeight ? 'h-full' : ''}`}>{renderPanel(baseTab)}</div>
      )}
    </TabSlider>
  )

  return (
    <RoomChromeContext.Provider value={chrome}>
      <main
        className={
          showSidebar
            ? 'ytmq-app flex h-dvh gap-2 overflow-hidden bg-[#050505] p-2'
            : `ytmq-app ytmq-app-mobile pb-[calc(6.5rem+env(safe-area-inset-bottom))] ${lyricsPanelHeight ? 'flex h-dvh flex-col' : 'min-h-dvh'}`
        }
      >
        {needsNickname && <NicknamePrompt onSubmit={completeNickname} />}

        {showSidebar && (
          <div
            className="relative h-full shrink-0 overflow-hidden"
            style={{
              width: sidebarCollapsed ? 0 : sidebarWidth,
              marginRight: sidebarCollapsed ? -8 : 0,
              transition: resizingSidebar
                ? 'none'
                : 'width 420ms var(--ease-out-soft), margin-right 420ms var(--ease-out-soft)',
            }}
          >
            <div
              className="h-full"
              style={{
                width: sidebarWidth,
                opacity: sidebarCollapsed ? 0 : 1,
                transform: sidebarCollapsed ? 'translateX(-24px)' : 'translateX(0)',
                transition: resizingSidebar ? 'none' : 'opacity 260ms ease, transform 420ms var(--ease-out-soft)',
              }}
            >
              <NowPlayingSidebar
                roomId={activeRoomId}
                className="h-full"
                canControl={canControl}
                isHost={isHost}
                headerAction={
                  <IconButton label="Hide now playing" size="sm" variant="glass" onClick={() => setSidebarCollapsed(true)}>
                    <CollapseSidebarIcon className="h-[18px] w-[18px]" />
                  </IconButton>
                }
              />
            </div>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize now playing"
              onPointerDown={startSidebarResize}
              className="ytmq-resize-handle group absolute inset-y-0 right-0 z-10 flex w-3 cursor-col-resize items-center justify-center"
            >
              <span className="h-12 w-1 rounded-full bg-white/0 transition-colors group-hover:bg-white/40" />
            </div>
          </div>
        )}

        {showSidebar ? (
          <section className="ytmq-panel relative flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-[24px]">
            {content}
          </section>
        ) : (
          <>
            <header className="flex h-14 items-center gap-3 px-4">
              <Link to="/" aria-label="YTMQ home" className="ytmq-press -ml-1 rounded-full p-1">
                <YtmqLogo size={30} />
              </Link>
              <span className="font-mono text-[15px] font-semibold tracking-[0.18em] text-white">{room.code}</span>
              {isHost && (
                <span className="inline-flex h-6 items-center rounded-full bg-accent-500/15 px-2.5 text-[11px] font-bold text-accent-300">
                  Host
                </span>
              )}
              <span className="ml-auto flex items-center gap-2 text-[13px] font-semibold text-neutral-300">
                <AvatarStack participants={participants} max={3} />
                {onlineCount} here
              </span>
            </header>
            {tab !== 'lyrics' && (
              <div className="px-4 pb-1">
                <NowPlaying roomId={activeRoomId} canControl={canControl} isHost={isHost} onOpenLyrics={() => changeTab('lyrics')} />
              </div>
            )}
            <div className={`px-4 ${lyricsPanelHeight ? 'flex min-h-0 flex-1 flex-col pb-2' : ''}`}>{content}</div>
          </>
        )}

        {/* Desktop Lyrics: a fullscreen overlay that slides over the page. */}
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
            <LyricsView roomId={activeRoomId} fullscreen queueItems={items} canControl={canControl} isHost={isHost} />
          </div>
        )}

        <TabBar
          active={tab}
          onChange={changeTab}
          queueCount={items.length}
          showAdmin={isHost}
          roomId={activeRoomId}
          code={room.code}
          nickname={nickname}
          onNicknameChange={isHost ? undefined : saveNickname}
          participants={participants}
          onCopied={(msg) => showToast(msg, 'info')}
        />
        <ToastStack toasts={toasts} onDismiss={dismiss} />
      </main>
    </RoomChromeContext.Provider>
  )
}
