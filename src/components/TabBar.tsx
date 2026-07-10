import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CopiedCheck } from './CopiedCheck'
import { useLobbyShare } from '../hooks/useLobbyShare'

export type RoomTab = 'search' | 'queue' | 'lyrics' | 'room' | 'admin'

type TabBarProps = {
  active: RoomTab
  onChange: (tab: RoomTab) => void
  queueCount: number
  /** Show the host-only Admin tab. */
  showAdmin?: boolean
  /** Room id — used to build the shareable link + QR. */
  roomId: string
  /** Human-friendly lobby code shown in the dock. */
  code: string
  /** Surface copy confirmations as toasts. */
  onCopied?: (message: string) => void
}

function SearchIcon({ className }: { className?: string }) {
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
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

function QueueIcon({ className }: { className?: string }) {
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
      <path d="M3 6h13M3 12h9M3 18h9" />
      <g className="ytmq-icon-queue-arrow">
        <path d="M18 12v8" />
        <path d="M21.5 15.5 18 12l-3.5 3.5" />
      </g>
    </svg>
  )
}

function LyricsIcon({ className }: { className?: string }) {
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
      <path d="M4 6h9" />
      <path d="M4 12h6" />
      <path d="M4 18h5" />
      <g className="ytmq-icon-lyrics-note">
        <circle cx="17" cy="15" r="3" />
        <path d="M20 15V5l-3 1" />
      </g>
    </svg>
  )
}

function RoomIcon({ className }: { className?: string }) {
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
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <g className="ytmq-icon-room-peeker">
        <path d="M16 6.2a3 3 0 0 1 0 5.6" />
        <path d="M17.5 19a5.5 5.5 0 0 0-2.7-4.7" />
      </g>
    </svg>
  )
}

function AdminIcon({ className }: { className?: string }) {
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
      <path d="M12 3 4.5 6v5c0 4.4 3.1 7.6 7.5 9 4.4-1.4 7.5-4.6 7.5-9V6L12 3Z" />
      <path className="ytmq-icon-admin-check" pathLength={1} d="m9 11.5 2 2 4-4" />
      <path className="ytmq-icon-admin-ex-1" pathLength={1} d="M9 9.5 15 13.5" />
      <path className="ytmq-icon-admin-ex-2" pathLength={1} d="M15 9.5 9 13.5" />
    </svg>
  )
}

function QrIcon({ className }: { className?: string }) {
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
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M14 14h3v3M21 14v.01M14 21h.01M17 21h4v-4" />
    </svg>
  )
}

type TabDef = {
  id: RoomTab
  label: string
  Icon: (props: { className?: string }) => React.ReactElement
}

const baseTabs: TabDef[] = [
  { id: 'search', label: 'Search', Icon: SearchIcon },
  { id: 'queue', label: 'Queue', Icon: QueueIcon },
  { id: 'lyrics', label: 'Lyrics', Icon: LyricsIcon },
  { id: 'room', label: 'Room', Icon: RoomIcon },
]

const adminTab: TabDef = { id: 'admin', label: 'Admin', Icon: AdminIcon }

/** Popover anchored above the dock with the lobby QR, code, and copy actions. */
function LobbyShareCard({
  roomId,
  code,
  onClose,
  onCopied,
}: {
  roomId: string
  code: string
  onClose: () => void
  onCopied?: (message: string) => void
}) {
  const { qrDataUrl, copied, copy } = useLobbyShare(roomId, code, {
    qrWidth: 200,
    onCopied,
  })

  return (
    <div
      role="dialog"
      aria-label="Lobby share options"
      className="ytmq-anim-pop absolute bottom-full left-1/2 mb-3 w-[min(17rem,calc(100vw-1.5rem))] max-w-[17rem] -translate-x-1/2 rounded-3xl border border-white/10 bg-zinc-950/85 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-2xl backdrop-saturate-150"
    >
      <div className="flex flex-col items-center gap-3">
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt={`QR code for lobby ${code}`}
            className="rounded-2xl bg-white p-2"
            width={176}
            height={176}
          />
        ) : (
          <div
            className="ytmq-skeleton rounded-2xl"
            style={{ width: 176, height: 176 }}
            aria-label="Generating QR code"
          />
        )}

        <div className="text-center">
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Lobby code
          </p>
          <p className="font-mono text-xl tracking-widest text-zinc-100 sm:text-2xl">
            {code}
          </p>
        </div>

        <div className="grid w-full grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void copy('code')}
            className="ytmq-press inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-zinc-700 px-3 text-sm font-medium text-zinc-100 hover:border-zinc-600 hover:bg-zinc-900"
          >
            {copied === 'code' && <CopiedCheck />}
            {copied === 'code' ? 'Copied!' : 'Copy code'}
          </button>
          <button
            type="button"
            onClick={() => void copy('link')}
            className="ytmq-press inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-3 text-sm font-medium text-white hover:bg-violet-500"
          >
            {copied === 'link' && <CopiedCheck />}
            {copied === 'link' ? 'Copied!' : 'Copy link'}
          </button>
        </div>
      </div>

      {/* Little pointer notch toward the dock */}
      <span
        aria-hidden
        className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 rounded-[3px] border-b border-r border-white/10 bg-zinc-950/85"
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-3 top-3 rounded-full p-1 text-zinc-500 transition-colors hover:text-zinc-200"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
        </svg>
      </button>
    </div>
  )
}

export function TabBar({
  active,
  onChange,
  queueCount,
  showAdmin,
  roomId,
  code,
  onCopied,
}: TabBarProps) {
  const tabs = showAdmin ? [...baseTabs, adminTab] : baseTabs
  const [shareOpen, setShareOpen] = useState(false)

  const iconWrapRefs = useRef<Partial<Record<RoomTab, HTMLSpanElement | null>>>(
    {},
  )

  const replayIconAnimation = (id: RoomTab) => {
    const el = iconWrapRefs.current[id]
    if (!el) return
    const cls = `ytmq-tab-icon-anim-${id}`
    el.classList.remove(cls)
    void el.offsetWidth
    el.classList.add(cls)
  }

  const handleChange = (id: RoomTab) => {
    replayIconAnimation(id)
    onChange(id)
  }

  const dockRef = useRef<HTMLDivElement | null>(null)

  // Sliding highlight pill that animates between the active tab.
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [indicator, setIndicator] = useState<{
    left: number
    top: number
    width: number
    height: number
  } | null>(null)
  // Suppress the slide transition for the very first placement.
  const [indicatorReady, setIndicatorReady] = useState(false)

  useLayoutEffect(() => {
    const measure = () => {
      const el = tabRefs.current[active]
      if (!el) return
      setIndicator({
        left: el.offsetLeft,
        top: el.offsetTop,
        width: el.offsetWidth,
        height: el.offsetHeight,
      })
    }
    measure()
    // Flip on the transition after the initial position is committed.
    const raf = requestAnimationFrame(() => setIndicatorReady(true))
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', measure)
    }
  }, [active, tabs.length])

  // Close the share popover on outside click / Escape.
  useEffect(() => {
    if (!shareOpen) return
    const onPointer = (e: PointerEvent) => {
      if (!dockRef.current?.contains(e.target as Node)) setShareOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShareOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [shareOpen])

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center overflow-visible px-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-3 sm:pb-[calc(1rem+env(safe-area-inset-bottom))]"
      aria-label="Room navigation"
    >
      <div ref={dockRef} className="ytmq-dock pointer-events-auto relative max-w-full">
        {/* Soft glow that lifts the dock off the content behind it */}
        <div
          aria-hidden
          className="absolute -inset-x-6 -bottom-6 -top-3 -z-10 rounded-full bg-zinc-950/40 blur-2xl"
        />

        {shareOpen && (
          <LobbyShareCard
            roomId={roomId}
            code={code}
            onClose={() => setShareOpen(false)}
            onCopied={onCopied}
          />
        )}

        <nav className="ytmq-dock-nav relative flex max-w-full transform-gpu items-center gap-0.5 overflow-visible rounded-full border border-white/10 bg-zinc-950/70 p-1 shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-2xl backdrop-saturate-150 ytmq-hide-scrollbar sm:p-1.5">
          {indicator && (
            <span
              aria-hidden
              className={`pointer-events-none absolute rounded-full bg-white/10 ${
                indicatorReady
                  ? 'transition-[left,top,width,height] duration-300 ease-[cubic-bezier(0.4,1.1,0.5,1)]'
                  : ''
              }`}
              style={{
                left: indicator.left,
                top: indicator.top,
                width: indicator.width,
                height: indicator.height,
              }}
            />
          )}
          {tabs.map((tab) => {
            const isActive = active === tab.id
            const { Icon } = tab
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  tabRefs.current[tab.id] = el
                }}
                type="button"
                onClick={() => handleChange(tab.id)}
                className={`group relative z-10 flex min-h-11 w-[3.1rem] shrink-0 flex-col items-center justify-center gap-0.5 overflow-visible rounded-full px-0.5 text-[10px] font-medium transition-colors sm:min-h-12 sm:w-[3.75rem] sm:px-1 sm:text-[11px] ${
                  isActive ? 'text-violet-300' : 'text-zinc-500 hover:text-zinc-200'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="relative overflow-visible py-1">
                  <span
                    ref={(el) => {
                      iconWrapRefs.current[tab.id] = el
                    }}
                    className="ytmq-tab-icon-wrap inline-flex items-center justify-center p-0.5"
                  >
                    <Icon
                      className={`h-5 w-5 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-active:scale-90 ${
                        isActive ? 'scale-[1.6]' : ''
                      }`}
                    />
                  </span>
                  {tab.id === 'queue' && queueCount > 0 && (
                    <span
                      className="ytmq-anim-pop absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-500 px-1 text-[10px] font-bold leading-none text-white"
                    >
                      {queueCount > 99 ? '99+' : queueCount}
                    </span>
                  )}
                </span>
                <span
                  className={`grid transition-[grid-template-rows,opacity,transform] duration-300 ease-out ${
                    isActive
                      ? 'grid-rows-[0fr] translate-y-1 opacity-0'
                      : 'grid-rows-[1fr] translate-y-0 opacity-100'
                  }`}
                >
                  <span className="overflow-hidden">{tab.label}</span>
                </span>
              </button>
            )
          })}

          {/* Divider */}
          <span aria-hidden className="mx-1 h-8 w-px bg-white/10" />

          {/* Lobby code + QR */}
          <button
            type="button"
            onClick={() => setShareOpen((v) => !v)}
            aria-expanded={shareOpen}
            aria-label={`Lobby ${code} — show QR and share`}
            className={`group flex min-h-11 shrink-0 items-center gap-1.5 rounded-full py-1 pl-2 pr-2.5 transition-colors sm:min-h-12 sm:gap-2 sm:pl-2.5 sm:pr-3 ${
              shareOpen
                ? 'bg-white/10 text-zinc-100'
                : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'
            }`}
          >
            <QrIcon className="h-5 w-5 shrink-0 transition-transform duration-100 group-active:scale-90" />
            <span className="flex flex-col items-start leading-tight">
              <span className="text-[9px] font-medium uppercase tracking-wide text-zinc-500">
                Lobby
              </span>
              <span className="max-w-[4.5rem] truncate font-mono text-xs font-semibold tracking-widest text-zinc-100 sm:max-w-none sm:text-sm">
                {code}
              </span>
            </span>
          </button>
        </nav>
      </div>
    </div>
  )
}
