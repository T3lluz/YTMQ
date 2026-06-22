import { useRef, useState, type ReactNode } from 'react'

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
  const prevKey = useRef(activeKey)
  const lastChild = useRef<ReactNode>(children)
  const [outgoing, setOutgoing] = useState<{
    key: string
    node: ReactNode
    dir: Dir
    height: number
  } | null>(null)

  // Derive the transition while rendering the new key: snapshot the panel that
  // was on screen (and its current height) so it can play its exit before
  // unmounting. Locking the height keeps the viewport from collapsing while both
  // panels are absolutely positioned.
  if (activeKey !== prevKey.current) {
    setOutgoing({
      key: prevKey.current,
      node: lastChild.current,
      dir: direction,
      height: viewportRef.current?.offsetHeight ?? 0,
    })
    prevKey.current = activeKey
  }
  lastChild.current = children

  const sliding = outgoing !== null
  const minH = fill ? 'min-h-0' : ''

  return (
    <div
      ref={viewportRef}
      className={`relative isolate flex flex-col ${minH} ${className ?? ''}`}
      style={
        sliding
          ? // During the slide both panels are absolutely positioned, so the
            // viewport has no in-flow content to size from. Lock it to the
            // measured height — and force `flex: none` so the `flex-1` class
            // (`flex-basis: 0%`) can't override this height back to 0 when an
            // ancestor isn't height-bounded (e.g. the scrolling mobile page).
            { height: outgoing.height, flex: 'none', overflow: 'clip' }
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
