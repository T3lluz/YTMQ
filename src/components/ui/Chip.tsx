import type { ReactNode } from 'react'

/** Filter chips: Spotify's row under the search field. */
export function ChipRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="ytmq-hide-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-0.5">
      {children}
    </div>
  )
}

export function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={`ytmq-press inline-flex h-8 shrink-0 items-center rounded-full px-3.5 text-[13px] font-semibold transition-colors ${
        selected ? 'bg-white text-neutral-950' : 'bg-white/[0.08] text-white hover:bg-white/[0.14]'
      }`}
    >
      {children}
    </button>
  )
}
