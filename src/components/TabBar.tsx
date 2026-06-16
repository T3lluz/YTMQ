export type RoomTab = 'search' | 'queue' | 'lyrics' | 'room' | 'admin'

type TabBarProps = {
  active: RoomTab
  onChange: (tab: RoomTab) => void
  queueCount: number
  /** Show the host-only Admin tab. */
  showAdmin?: boolean
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
      <path d="M18 12v8" />
      <path d="M21.5 15.5 18 12l-3.5 3.5" />
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
      <circle cx="17" cy="15" r="3" />
      <path d="M20 15V5l-3 1" />
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
      <path d="M16 6.2a3 3 0 0 1 0 5.6" />
      <path d="M17.5 19a5.5 5.5 0 0 0-2.7-4.7" />
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
      <path d="m9 11.5 2 2 4-4" />
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

const gridColsByCount: Record<number, string> = {
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
}

export function TabBar({ active, onChange, queueCount, showAdmin }: TabBarProps) {
  const tabs = showAdmin ? [...baseTabs, adminTab] : baseTabs
  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === active),
  )
  const gridColsClass = gridColsByCount[tabs.length] ?? 'grid-cols-4'

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-zinc-950/65 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(0,0,0,0.35)] backdrop-blur-2xl backdrop-saturate-150"
      aria-label="Room navigation"
    >
      <div className={`relative mx-auto grid max-w-lg ${gridColsClass}`}>
        {/* Sliding active indicator */}
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 h-0.5 rounded-full bg-violet-400 shadow-[0_0_12px_rgba(167,139,250,0.7)] transition-transform duration-300 ease-out"
          style={{
            width: `${100 / tabs.length}%`,
            transform: `translateX(${activeIndex * 100}%)`,
          }}
        />
        {tabs.map((tab) => {
          const isActive = active === tab.id
          const { Icon } = tab
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`group flex min-h-14 flex-col items-center justify-center gap-1 px-2 text-xs font-medium transition-colors ${
                isActive ? 'text-violet-400' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="relative">
                <Icon
                  className={`h-5 w-5 transition-transform duration-300 ease-out ${
                    isActive ? '-translate-y-0.5 scale-110' : 'group-active:scale-90'
                  }`}
                />
                {tab.id === 'queue' && queueCount > 0 && (
                  <span
                    key={queueCount}
                    className="ytmq-anim-pop absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-500 px-1 text-[10px] font-bold leading-none text-white"
                  >
                    {queueCount > 99 ? '99+' : queueCount}
                  </span>
                )}
              </span>
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
