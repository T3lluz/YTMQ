import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

type Dir = 'fwd' | 'back'

type TabSliderProps = {
  /** Identifier for the currently active slide. Changing it triggers a push. */
  activeKey: string
  /** Which way the new slide should travel in from. */
  direction: Dir
  /**
   * When the parent has a bounded height and the panel should fill it (and let
   * inner regions scroll), pass `true` — this enables `min-h-0` on the flex
   * chain. When the page itself scrolls (panel grows with content), pass
   * `false` so the panel can size to its content instead of collapsing.
   */
  fill?: boolean
  /** Sizing classes for the clipping viewport (e.g. flex / width utilities). */
  className?: string
  /** Content for `activeKey`. */
  children: ReactNode
}

/**
 * Horizontal "push" transition between tab panels. When `activeKey` changes the
 * previously rendered panel is kept around and slid one full width offscreen in
 * the travel direction while the new panel slides in from the opposite edge —
 * like a PowerPoint push. Both panels are absolutely stacked inside a clipped,
 * height-locked viewport during the transition; once it finishes the incoming
 * panel returns to normal flow so scrolling and layout behave exactly as before.
 */
export function TabSlider({
  activeKey,
  direction,
  fill = false,
  className,
  children,
}: TabSliderProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  // The panel on screen, kept current so the one that leaves shows what it
  // showed last, not what it showed when it was opened.
  const [shown, setShown] = useState<{ key: string; node: ReactNode }>({ key: activeKey, node: children })
  const [outgoing, setOutgoing] = useState<{ key: string; node: ReactNode; dir: Dir } | null>(null)
  if (activeKey !== shown.key) {
    setOutgoing({ key: shown.key, node: shown.node, dir: direction })
    setShown({ key: activeKey, node: children })
  } else if (children !== shown.node) {
    setShown({ key: activeKey, node: children })
  }

  // The viewport's height as it was before a slide, so it can be held while
  // both panels are out of flow.
  const lastHeight = useRef(0)
  useEffect(() => {
    const el = viewportRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      if (!el.dataset.sliding) lastHeight.current = el.offsetHeight
    })
    ro.observe(el)
    lastHeight.current = el.offsetHeight
    return () => ro.disconnect()
  }, [])

  const sliding = outgoing !== null
  useLayoutEffect(() => {
    const el = viewportRef.current
    if (!el) return
    if (sliding) {
      el.dataset.sliding = '1'
      el.style.height = `${lastHeight.current}px`
    } else {
      delete el.dataset.sliding
      el.style.height = ''
    }
  }, [sliding])

  const minH = fill ? 'min-h-0' : ''

  return (
    <div
      ref={viewportRef}
      className={`relative isolate flex flex-col ${minH} ${className ?? ''}`}
      style={
        sliding
          ? // Both panels are out of flow during the slide; the height set
            // above holds the viewport open, and flex: none stops flex-1 from
            // collapsing it on the scrolling phone page.
            { flex: 'none', overflow: 'clip' }
          : { overflowX: 'clip' }
      }
    >
      {outgoing && (
        <div
          key={outgoing.key}
          className={`absolute inset-0 flex min-h-0 flex-col ytmq-slide-out-${outgoing.dir}`}
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget) setOutgoing(null)
          }}
        >
          {outgoing.node}
        </div>
      )}
      <div
        key={activeKey}
        className={
          sliding
            ? `absolute inset-0 flex min-h-0 flex-col ytmq-slide-in-${direction}`
            : `flex flex-1 flex-col ${minH}`
        }
      >
        {children}
      </div>
    </div>
  )
}
