import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PresenceParticipant } from '../hooks/useRoomPresence'
import { useIsDesktop } from '../hooks/useMediaQuery'
import { Avatar } from './ParticipantList'
import { SharePanel } from './SharePanel'
import { CloseIcon, QrIcon } from './ui/icons'

export type RoomTab = 'search' | 'queue' | 'lyrics' | 'admin'

type TabBarProps = {
  active: RoomTab
  onChange: (tab: RoomTab) => void
  queueCount: number
  /** Show the host-only Admin tab. */
  showAdmin?: boolean
  roomId: string
  code: string
  nickname: string
  onNicknameChange?: (name: string) => void
  participants: PresenceParticipant[]
  onCopied?: (message: string) => void
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </svg>
  )
}

function QueueIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
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
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
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

function AdminIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M12 3 4.5 6v5c0 4.4 3.1 7.6 7.5 9 4.4-1.4 7.5-4.6 7.5-9V6L12 3Z" />
      <path className="ytmq-icon-admin-check" pathLength={1} d="m9 11.5 2 2 4-4" />
      <path className="ytmq-icon-admin-ex-1" pathLength={1} d="M9 9.5 15 13.5" />
      <path className="ytmq-icon-admin-ex-2" pathLength={1} d="M15 9.5 9 13.5" />
    </svg>
  )
}

type TabDef = {
  id: RoomTab
  label: string
  Icon: (props: { className?: string }) => React.ReactElement
}

const BASE_TABS: TabDef[] = [
  { id: 'search', label: 'Search', Icon: SearchIcon },
  { id: 'queue', label: 'Queue', Icon: QueueIcon },
  { id: 'lyrics', label: 'Lyrics', Icon: LyricsIcon },
]
const ADMIN_TAB: TabDef = { id: 'admin', label: 'Host', Icon: AdminIcon }

// Geometry of a tab. The open tab is padding + icon + gap + label + padding;
// the others share what is left of a fixed width, so the bar never changes
// size when you switch, only the pill slides and stretches.
const TAB_H = 48
const PAD_L = 16
const ICON = 22
const GAP = 8
const PAD_R = 18
const MIN_TAB = 48

/** The lobby's QR, code and link, your name, and who is here. */
function LobbySheet({
  roomId,
  code,
  nickname,
  onNicknameChange,
  participants,
  onCopied,
  onClose,
}: {
  roomId: string
  code: string
  nickname: string
  onNicknameChange?: (name: string) => void
  participants: PresenceParticipant[]
  onCopied?: (message: string) => void
  onClose: () => void
}) {
  const desktop = useIsDesktop()
  const [name, setName] = useState(nickname)
  const here = participants.filter((p) => p.online)

  const body = (
    <div className="flex flex-col gap-5">
      <SharePanel roomId={roomId} code={code} onCopied={onCopied} />
      {onNicknameChange && (
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-neutral-500">Your name</span>
          <input
            value={name}
            maxLength={32}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name.trim() !== nickname && onNicknameChange(name.trim())}
            onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
            className="ytmq-input h-11"
            placeholder="Your name on the queue"
          />
        </label>
      )}
      {here.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-neutral-500">Here now · {here.length}</span>
          <ul className="flex flex-wrap gap-1.5">
            {here.slice(0, 18).map((p) => (
              <li key={p.client_id} className="flex h-9 items-center gap-2 rounded-full bg-white/[0.06] pl-1 pr-3 text-[13px] font-semibold text-white">
                <Avatar participant={p} size="sm" />
                <span className="max-w-[8rem] truncate">{p.nickname || 'Guest'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )

  if (desktop) {
    return (
      <div
        role="dialog"
        aria-label="Invite people"
        className="ytmq-anim-pop absolute bottom-full right-0 mb-3 w-[22rem] max-w-[calc(100vw-2rem)] rounded-[28px] bg-[#1c1c1c] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.65)] ring-1 ring-white/[0.07]"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="ytmq-press absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 hover:bg-white/[0.08] hover:text-white"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
        {body}
      </div>
    )
  }

  return createPortal(
    <div
      className="ytmq-sheet-backdrop fixed inset-0 z-[70] flex items-end bg-black/60"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-label="Invite people"
        className="ytmq-sheet-in max-h-[88dvh] w-full overflow-y-auto rounded-t-[28px] bg-[#1c1c1c] px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-2"
      >
        <span aria-hidden className="mx-auto mb-4 block h-1 w-9 rounded-full bg-white/20" />
        {body}
      </div>
    </div>,
    document.body,
  )
}

export function TabBar({
  active,
  onChange,
  queueCount,
  showAdmin,
  roomId,
  code,
  nickname,
  onNicknameChange,
  participants,
  onCopied,
}: TabBarProps) {
  const tabs = showAdmin ? [...BASE_TABS, ADMIN_TAB] : BASE_TABS
  const [shareOpen, setShareOpen] = useState(false)
  const [labelWidths, setLabelWidths] = useState<number[] | null>(null)
  const measureRef = useRef<HTMLDivElement | null>(null)
  const dockRef = useRef<HTMLDivElement | null>(null)
  const iconRefs = useRef<Partial<Record<RoomTab, HTMLSpanElement | null>>>({})

  // Measure each label once fonts are in, and again if they change.
  useLayoutEffect(() => {
    const measure = () => {
      const spans = measureRef.current?.querySelectorAll('span')
      if (!spans) return
      setLabelWidths(Array.from(spans, (s) => Math.ceil(s.getBoundingClientRect().width)))
    }
    measure()
    void document.fonts?.ready.then(measure)
  }, [tabs.length])

  useEffect(() => {
    if (!shareOpen) return
    const onPointer = (e: PointerEvent) => {
      if (!dockRef.current?.contains(e.target as Node) && !(e.target as Element)?.closest?.('[role="dialog"]')) {
        setShareOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setShareOpen(false)
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [shareOpen])

  const activeIndex = Math.max(0, tabs.findIndex((t) => t.id === active))
  const openWidth = (i: number) => PAD_L + ICON + GAP + (labelWidths?.[i] ?? 48) + PAD_R
  const widest = Math.max(...tabs.map((_, i) => openWidth(i)))
  const total = widest + (tabs.length - 1) * MIN_TAB
  const activeWidth = openWidth(activeIndex)
  const restWidth = (total - activeWidth) / (tabs.length - 1)
  const widths = tabs.map((_, i) => (i === activeIndex ? activeWidth : restWidth))
  const lefts = widths.map((_, i) => widths.slice(0, i).reduce((a, b) => a + b, 0))

  const select = (tab: TabDef) => {
    const el = iconRefs.current[tab.id]
    if (el) {
      const cls = `ytmq-tab-icon-anim-${tab.id}`
      el.classList.remove(cls)
      void el.offsetWidth
      el.classList.add(cls)
    }
    onChange(tab.id)
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-[calc(1rem+env(safe-area-inset-bottom))]">
      {/* Off-screen copies of the labels, to size the tabs. */}
      <div ref={measureRef} aria-hidden className="ytmq-tab-label pointer-events-none invisible fixed left-0 top-0 flex">
        {tabs.map((t) => (
          <span key={t.id}>{t.label}</span>
        ))}
      </div>

      <div ref={dockRef} className="ytmq-dock pointer-events-auto relative">
        {shareOpen && (
          <LobbySheet
            roomId={roomId}
            code={code}
            nickname={nickname}
            onNicknameChange={onNicknameChange}
            participants={participants}
            onCopied={onCopied}
            onClose={() => setShareOpen(false)}
          />
        )}

        <nav aria-label="Room" className="ytmq-dock-nav flex items-center gap-1 rounded-full p-1">
          <div className="relative flex" style={{ width: total, height: TAB_H }}>
            <span
              aria-hidden
              className="ytmq-dock-pill absolute top-0 rounded-full"
              style={{ left: lefts[activeIndex], width: activeWidth, height: TAB_H }}
            />
            {tabs.map((tab, i) => {
              const isActive = i === activeIndex
              const { Icon } = tab
              const iconLeft = isActive ? PAD_L : (widths[i]! - ICON) / 2
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => select(tab)}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={tab.id === 'queue' && queueCount > 0 ? `Queue, ${queueCount} ${queueCount === 1 ? 'song' : 'songs'}` : tab.label}
                  className={`ytmq-tab group relative shrink-0 rounded-full ${isActive ? 'is-active text-white' : 'text-neutral-400 hover:text-neutral-100'}`}
                  style={{ width: widths[i], height: TAB_H }}
                >
                  <span className="ytmq-tab-icon absolute top-1/2" style={{ left: iconLeft, width: ICON, height: ICON }}>
                    <span
                      ref={(el) => {
                        iconRefs.current[tab.id] = el
                      }}
                      className="ytmq-tab-icon-wrap flex h-full w-full items-center justify-center"
                    >
                      <Icon className={`h-[22px] w-[22px] transition-colors duration-300 group-active:scale-90 ${isActive ? 'text-accent-400' : ''}`} />
                    </span>
                    {tab.id === 'queue' && queueCount > 0 && !isActive && (
                      <span
                        aria-hidden
                        className="ytmq-anim-pop absolute -right-2.5 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-[#1a1a1a]"
                      >
                        {queueCount > 99 ? '99+' : queueCount}
                      </span>
                    )}
                  </span>
                  <span
                    aria-hidden
                    className="ytmq-tab-label absolute top-1/2"
                    style={{ left: PAD_L + ICON + GAP, opacity: isActive ? 1 : 0 }}
                  >
                    {tab.label}
                  </span>
                </button>
              )
            })}
          </div>

          <span aria-hidden className="mx-1 h-7 w-px bg-white/10" />

          <button
            type="button"
            onClick={() => setShareOpen((v) => !v)}
            aria-expanded={shareOpen}
            aria-label={`Lobby ${code}: QR code and link`}
            className={`ytmq-press flex h-12 shrink-0 items-center gap-2 rounded-full px-3.5 transition-colors ${
              shareOpen ? 'bg-white/[0.12] text-white' : 'text-neutral-300 hover:bg-white/[0.06] hover:text-white'
            }`}
          >
            <QrIcon className="h-[22px] w-[22px] shrink-0" />
            <span className="hidden font-mono text-sm font-semibold tracking-[0.18em] text-white sm:inline">{code}</span>
          </button>
        </nav>
      </div>
    </div>
  )
}
