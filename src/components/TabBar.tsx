import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { shareUrl } from '../lib/room'

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

function CopiedCheck() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className="ytmq-check h-3.5 w-3.5"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.79 6.8-6.79a1 1 0 0 1 1.4 0Z"
        clipRule="evenodd"
      />
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
  const link = shareUrl(roomId)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState<'link' | 'code' | null>(null)

  useEffect(() => {
    let cancelled = false
    void QRCode.toDataURL(link, { margin: 2, width: 200 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [link])

  async function copy(kind: 'link' | 'code') {
    await navigator.clipboard.writeText(kind === 'link' ? link : code)
    setCopied(kind)
    onCopied?.(kind === 'link' ? 'Link copied' : 'Code copied')
    window.setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div
      role="dialog"
      aria-label="Lobby share options"
      className="ytmq-anim-pop absolute bottom-full left-1/2 mb-3 w-[17rem] -translate-x-1/2 rounded-3xl border border-white/10 bg-zinc-950/85 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-2xl backdrop-saturate-150"
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
          <p className="font-mono text-2xl tracking-widest text-zinc-100">
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

  // Each tab gets a counter; incrementing it remounts the animation wrapper,
  // which restarts the CSS entrance animation for that icon.
  const [activationKeys, setActivationKeys] = useState<Record<string, number>>({})

  const handleChange = (id: RoomTab) => {
    setActivationKeys((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }))
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
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-[calc(1rem+env(safe-area-inset-bottom))]"
      aria-label="Room navigation"
    >
      <div ref={dockRef} className="ytmq-dock pointer-events-auto relative">
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

        <nav className="ytmq-dock-nav relative flex transform-gpu items-center gap-0.5 rounded-full border border-white/10 bg-zinc-950/70 p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-2xl backdrop-saturate-150">
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
            const animKey = activationKeys[tab.id] ?? 0
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  tabRefs.current[tab.id] = el
                }}
                type="button"
                onClick={() => handleChange(tab.id)}
                className={`group relative z-10 flex min-h-12 w-[3.75rem] flex-col items-center justify-center gap-0.5 rounded-full px-1 text-[11px] font-medium transition-colors ${
                  isActive ? 'text-violet-300' : 'text-zinc-500 hover:text-zinc-200'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="relative">
                  {/* Remount this span on each activation to replay the CSS animation */}
                  <span
                    key={animKey}
                    className={`inline-block${animKey > 0 ? ` ytmq-tab-icon-anim-${tab.id}` : ''}`}
                  >
                    <Icon
                      className={`h-5 w-5 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-active:scale-90 ${
                        isActive ? 'scale-[1.6]' : ''
                      }`}
                    />
                  </span>
                  {tab.id === 'queue' && queueCount > 0 && (
                    <span
                      key={queueCount}
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
            className={`group flex min-h-12 items-center gap-2 rounded-full py-1 pl-2.5 pr-3 transition-colors ${
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
              <span className="font-mono text-sm font-semibold tracking-widest text-zinc-100">
                {code}
              </span>
            </span>
          </button>
        </nav>
      </div>
    </div>
  )
}
