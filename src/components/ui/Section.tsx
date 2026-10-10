import type { ReactNode } from 'react'

/** A titled block of a page: the title on the left, an optional action on the right. */
export function Section({
  title,
  action,
  children,
  className = '',
}: {
  title: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`min-w-0 ${className}`}>
      <div className="mb-3 flex min-h-8 items-end justify-between gap-3">
        <h2 className="truncate text-xl font-extrabold tracking-[-0.02em] text-white">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** "Show all" style link at a section's right. */
export function SectionAction({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 text-[13px] font-bold text-neutral-400 transition-colors hover:text-white hover:underline"
    >
      {children}
    </button>
  )
}

/** The empty state every list uses: an icon tile, a line, a hint. */
export function EmptyState({
  icon,
  title,
  hint,
  action,
  className = '',
}: {
  icon: ReactNode
  title: string
  hint?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={`ytmq-anim-fade flex flex-col items-center justify-center gap-3 px-6 py-12 text-center ${className}`}>
      <span className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-white/[0.06] text-neutral-400">
        {icon}
      </span>
      <div className="space-y-1">
        <p className="text-base font-bold text-white">{title}</p>
        {hint && <p className="mx-auto max-w-xs text-sm text-neutral-400">{hint}</p>}
      </div>
      {action}
    </div>
  )
}
