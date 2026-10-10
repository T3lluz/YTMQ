import { useContext, type ReactNode } from 'react'
import { RoomChromeContext } from './chrome'

/**
 * The sticky bar at the top of a tab's panel. Every tab uses it, so titles,
 * the search field and the lobby chip sit on the same line everywhere.
 */
export function PanelHeader({ children, className = '' }: { children: ReactNode; className?: string }) {
  const { leading, trailing } = useContext(RoomChromeContext)
  return (
    <div className="ytmq-panel-header sticky top-0 z-30 -mx-4 mb-1 flex min-h-16 items-start gap-3 px-4 py-3 md:-mx-6 md:px-6">
      {leading && <div className="flex h-12 shrink-0 items-center">{leading}</div>}
      <div className={`flex min-h-12 min-w-0 flex-1 items-center gap-3 ${className}`}>{children}</div>
      {trailing && <div className="flex h-12 shrink-0 items-center gap-2">{trailing}</div>}
    </div>
  )
}

/** A tab's title in its header. */
export function PanelTitle({ children, meta }: { children: ReactNode; meta?: ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2.5">
      <h1 className="truncate text-2xl font-extrabold tracking-[-0.03em] text-white">{children}</h1>
      {meta && <span className="shrink-0 text-sm font-semibold text-neutral-500">{meta}</span>}
    </div>
  )
}
