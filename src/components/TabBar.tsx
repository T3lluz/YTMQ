export type RoomTab = 'search' | 'queue' | 'room'

type TabBarProps = {
  active: RoomTab
  onChange: (tab: RoomTab) => void
  queueCount: number
}

const tabs: { id: RoomTab; label: string }[] = [
  { id: 'search', label: 'Search' },
  { id: 'queue', label: 'Queue' },
  { id: 'room', label: 'Room' },
]

export function TabBar({ active, onChange, queueCount }: TabBarProps) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur"
      aria-label="Room navigation"
    >
      <div className="mx-auto grid max-w-lg grid-cols-3">
        {tabs.map((tab) => {
          const isActive = active === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`min-h-14 px-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'text-violet-400'
                  : 'text-zinc-400 active:text-zinc-200'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              {tab.label}
              {tab.id === 'queue' && queueCount > 0 && (
                <span className="ml-1 text-xs text-zinc-500">({queueCount})</span>
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
