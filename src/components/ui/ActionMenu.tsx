import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useIsDesktop } from '../../hooks/useMediaQuery'

export type MenuItem = {
  label: string
  icon?: ReactNode
  onSelect: () => void
  disabled?: boolean
  /** Shown under the label, e.g. why it is disabled. */
  hint?: string
  tone?: 'default' | 'danger'
}

export type MenuHeader = {
  title: string
  subtitle?: string
  art?: string
  round?: boolean
}

type MenuProps = {
  anchor: DOMRect | null
  header?: MenuHeader
  items: MenuItem[]
  onClose: () => void
}

/**
 * Actions for one thing (a song, an album). A popover next to what was
 * clicked on a desktop, a sheet from the bottom on a phone.
 */
export function ActionMenu({ open, ...props }: MenuProps & { open: boolean }) {
  // Mounted only while open, so every opening starts fresh.
  return open ? <MenuSurface {...props} /> : null
}

/** Place the popover by its anchor, keeping it on screen. */
function placePopover(panel: HTMLDivElement | null, anchor: DOMRect | null) {
  if (!panel || !anchor) return
  const w = panel.offsetWidth
  const h = panel.offsetHeight
  let left = anchor.right - w
  let top = anchor.bottom + 6
  if (left < 8) left = Math.max(8, anchor.left)
  if (left + w > window.innerWidth - 8) left = window.innerWidth - 8 - w
  if (top + h > window.innerHeight - 8) top = Math.max(8, anchor.top - h - 6)
  panel.style.left = `${left}px`
  panel.style.top = `${top}px`
  panel.style.visibility = 'visible'
}

function MenuSurface({ anchor, header, items, onClose }: MenuProps) {
  const desktop = useIsDesktop()
  const [leaving, setLeaving] = useState(false)

  const close = () => {
    if (desktop) {
      onClose()
      return
    }
    setLeaving(true)
    window.setTimeout(onClose, 220)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const list = (
    <ul className="flex flex-col py-1.5">
      {items.map((item) => (
        <li key={item.label}>
          <button
            type="button"
            disabled={item.disabled}
            onClick={() => {
              item.onSelect()
              close()
            }}
            className={`flex w-full items-center gap-3.5 px-4 text-left transition-colors disabled:opacity-40 ${
              desktop ? 'min-h-10 rounded-lg hover:bg-white/[0.08]' : 'min-h-[52px] active:bg-white/[0.06]'
            } ${item.tone === 'danger' ? 'text-accent-300' : 'text-white'}`}
          >
            {item.icon && <span className="flex h-5 w-5 shrink-0 items-center justify-center text-neutral-300">{item.icon}</span>}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold sm:text-sm">{item.label}</span>
              {item.hint && <span className="block truncate text-xs text-neutral-500">{item.hint}</span>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )

  const head = header && (
    <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 pb-3 pt-1">
      {header.art && (
        <img
          src={header.art}
          alt=""
          className={`h-12 w-12 shrink-0 bg-neutral-800 object-cover ${header.round ? 'rounded-full' : 'rounded-lg'}`}
        />
      )}
      <div className="min-w-0">
        <p className="truncate font-bold text-white">{header.title}</p>
        {header.subtitle && <p className="truncate text-sm text-neutral-400">{header.subtitle}</p>}
      </div>
    </div>
  )

  if (desktop) {
    return createPortal(
      <div className="fixed inset-0 z-[70]" onPointerDown={(e) => e.target === e.currentTarget && close()}>
        <div
          ref={(el) => placePopover(el, anchor)}
          role="menu"
          className="ytmq-anim-pop fixed left-0 top-0 w-[17rem] rounded-2xl bg-[#232323] p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.6)] ring-1 ring-white/[0.06]"
          style={{ visibility: 'hidden' }}
        >
          {header && <div className="pt-2">{head}</div>}
          {list}
        </div>
      </div>,
      document.body,
    )
  }

  return createPortal(
    <div
      className={`fixed inset-0 z-[70] flex items-end bg-black/60 ${leaving ? 'ytmq-sheet-backdrop-out' : 'ytmq-sheet-backdrop'}`}
      onPointerDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        role="menu"
        className={`w-full rounded-t-[28px] bg-[#1c1c1c] pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 ${
          leaving ? 'ytmq-sheet-out' : 'ytmq-sheet-in'
        }`}
      >
        <span aria-hidden className="mx-auto mb-3 block h-1 w-9 rounded-full bg-white/20" />
        {head}
        {list}
      </div>
    </div>,
    document.body,
  )
}
