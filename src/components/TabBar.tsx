export type RoomTab = 'search' | 'queue' | 'room'

type TabBarProps = {
  active: RoomTab
  onChange: (tab: RoomTab) => void
  queueCount: number
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

const tabs: {
  id: RoomTab
  label: string
  Icon: (props: { className?: string }) => React.ReactElement
}[] = [
  { id: 'search', label: 'Search', Icon: SearchIcon },
  { id: 'queue', label: 'Queue', Icon: QueueIcon },
  { id: 'room', label: 'Room', Icon: RoomIcon },
]

export function TabBar({ active, onChange, queueCount }: TabBarProps) {
  const activeIndex = tabs.findIndex((tab) => tab.id === active)

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-800 bg-zinc-950/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
      aria-label="Room navigation"
    >
      <div className="relative mx-auto grid max-w-lg grid-cols-3">
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
