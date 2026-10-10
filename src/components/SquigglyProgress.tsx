import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { formatPlaybackTime } from '../lib/playback'

/**
 * Track progress drawn the way Android's media player does it (SystemUI's
 * SquigglyProgress): the played part is a travelling sine wave while music
 * plays and eases flat when it pauses; the rest is a flat line at 30%. The
 * wave tapers into the playhead over one and a half wavelengths so the join
 * is smooth. A pill-shaped playhead marks the spot.
 *
 * On hover (pointer devices) the line thickens, the playhead grows, and a
 * time bubble follows the pointer. Dragging scrubs; the bar holds the target
 * until the player reports a newer position.
 */

type Size = 'sm' | 'md' | 'lg'

const GEOMETRY: Record<Size, { wave: number; amp: number; stroke: number; thumbH: number; height: number }> = {
  sm: { wave: 16, amp: 2, stroke: 3, thumbH: 12, height: 16 },
  md: { wave: 20, amp: 2.6, stroke: 3.5, thumbH: 16, height: 20 },
  lg: { wave: 24, amp: 3, stroke: 4, thumbH: 20, height: 24 },
}

// Pixels per second the wave travels, like SystemUI's phaseSpeed.
const PHASE_SPEED = 18
const TRANSITION_PERIODS = 1.5
// SystemUI: 800 ms in on play, 550 ms out on pause.
const GROW_MS = 800
const SHRINK_MS = 550

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

type Props = {
  /** Seconds into the track as last reported. */
  position: number
  duration?: number
  playing: boolean
  /** Epoch ms of the last player report; a newer one releases a scrub target. */
  updatedAt?: number
  canSeek?: boolean
  onSeek?: (seconds: number) => void
  /** Clears a held scrub target when the track changes. */
  trackKey?: string
  size?: Size
  /** Elapsed / remaining labels under the bar. */
  times?: 'none' | 'elapsed-total' | 'elapsed-remaining'
  className?: string
}

export function SquigglyProgress({
  position,
  duration,
  playing,
  updatedAt,
  canSeek = false,
  onSeek,
  trackKey,
  size = 'md',
  times = 'elapsed-total',
  className = '',
}: Props) {
  const g = GEOMETRY[size]
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const waveRef = useRef<SVGPathElement | null>(null)
  const restRef = useRef<SVGLineElement | null>(null)
  const clipRef = useRef<SVGRectElement | null>(null)
  const thumbRef = useRef<HTMLSpanElement | null>(null)
  const [width, setWidth] = useState(0)
  const [hoverX, setHoverX] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const [pending, setPending] = useState<{ value: number; key?: string } | null>(null)
  const sentAt = useRef(0)

  const hasDuration = duration != null && duration > 0
  // A scrub target for another track never applies.
  const held = pending && pending.key === trackKey ? pending.value : null

  // Everything the animation loop reads, kept off React state so drawing
  // never re-renders the component.
  const live = useRef({ position, playing, duration, held, width })
  useLayoutEffect(() => {
    live.current = { position, playing, duration, held, width }
  })

  useEffect(() => {
    if (held == null || dragging) return
    if (updatedAt != null && updatedAt > sentAt.current) setPending(null)
  }, [updatedAt, held, dragging])

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const reduceMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  // The drawing loop: phase, wave height and playhead, 60 fps while it moves.
  useEffect(() => {
    let frame = 0
    let phase = 0
    let last = performance.now()
    let height = live.current.playing && !reduceMotion ? 1 : 0
    let from = height
    let target = height
    let animStart = last

    const currentSeconds = () => {
      const s = live.current
      if (s.held != null) return s.held
      // Callers pass an already-interpolated position (usePlaybackPosition).
      let p = s.position
      if (s.duration && s.duration > 0) p = Math.min(Math.max(p, 0), s.duration)
      return p
    }

    const draw = (now: number) => {
      const s = live.current
      const w = s.width
      const dt = (now - last) / 1000
      last = now

      const want = s.playing && s.held == null && !reduceMotion ? 1 : 0
      if (want !== target) {
        from = height
        target = want
        animStart = now + (want === 1 ? 60 : 0)
      }
      const span = target === 1 ? GROW_MS : SHRINK_MS
      const t = Math.min(1, Math.max(0, (now - animStart) / span))
      height = from + (target - from) * easeOut(t)

      if (height > 0.001) phase = (phase + dt * PHASE_SPEED) % g.wave

      const ratio = s.duration && s.duration > 0 ? currentSeconds() / s.duration : 0
      const px = Math.max(0, Math.min(w, w * ratio))
      const mid = g.height / 2
      const amp = g.amp * height

      // Half-wavelength cubic segments, alternating sign, as in SystemUI.
      const half = g.wave / 2
      let x = -phase - half
      let sign = 1
      const ampAt = (xx: number) => {
        const len = TRANSITION_PERIODS * g.wave
        const k = Math.min(1, Math.max(0, (px + len / 2 - xx) / len))
        return amp * k
      }
      let y = mid - ampAt(x) * sign
      let d = `M${x.toFixed(2)} ${y.toFixed(2)}`
      while (x < px + g.wave) {
        sign = -sign
        const nx = x + half
        const mx = x + half / 2
        const ny = mid - ampAt(nx) * sign
        d += `C${mx.toFixed(2)} ${y.toFixed(2)} ${mx.toFixed(2)} ${ny.toFixed(2)} ${nx.toFixed(2)} ${ny.toFixed(2)}`
        x = nx
        y = ny
      }
      waveRef.current?.setAttribute('d', d)
      clipRef.current?.setAttribute('width', String(px))
      restRef.current?.setAttribute('x1', String(Math.min(w, px + 2)))
      if (thumbRef.current) thumbRef.current.style.transform = `translateX(${px}px)`

      const settled = t >= 1 && height < 0.001 && !s.playing
      if (!settled || s.held != null) frame = requestAnimationFrame(draw)
      else frame = 0
    }

    frame = requestAnimationFrame(draw)
    const kick = () => {
      if (!frame) {
        last = performance.now()
        frame = requestAnimationFrame(draw)
      }
    }
    window.addEventListener('ytmq-progress-kick', kick)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('ytmq-progress-kick', kick)
    }
  }, [g, reduceMotion])

  // A paused bar sleeps; wake it whenever its inputs change.
  useEffect(() => {
    window.dispatchEvent(new Event('ytmq-progress-kick'))
  }, [position, playing, duration, held, width])

  const secondsAt = (clientX: number) => {
    const el = wrapRef.current
    if (!el || !hasDuration || !duration) return null
    const r = el.getBoundingClientRect()
    if (r.width <= 0) return null
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * duration
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!canSeek) return
    const v = secondsAt(e.clientX)
    if (v == null) return
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setDragging(true)
    setPending({ value: v, key: trackKey })
    sentAt.current = Number.POSITIVE_INFINITY
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const r = wrapRef.current?.getBoundingClientRect()
    if (r && e.pointerType === 'mouse') setHoverX(Math.min(r.width, Math.max(0, e.clientX - r.left)))
    if (!dragging) return
    const v = secondsAt(e.clientX)
    if (v != null) setPending({ value: v, key: trackKey })
  }
  const endDrag = (e: React.PointerEvent) => {
    if (!dragging) return
    const v = secondsAt(e.clientX) ?? held
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    setDragging(false)
    if (v != null && onSeek) {
      setPending({ value: v, key: trackKey })
      onSeek(v)
      sentAt.current = Date.now()
    }
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!canSeek || !hasDuration || !duration || !onSeek) return
    const step = e.key === 'ArrowRight' ? 5 : e.key === 'ArrowLeft' ? -5 : 0
    if (!step) return
    // Arrows on the bar seek; they must not also skip the song.
    e.preventDefault()
    e.stopPropagation()
    const v = Math.min(duration, Math.max(0, (held ?? position) + step))
    setPending({ value: v, key: trackKey })
    onSeek(v)
    sentAt.current = Date.now()
  }

  const shown = held ?? position
  const hoverSeconds = hoverX != null && hasDuration && duration && width > 0 ? (hoverX / width) * duration : null
  const active = dragging || hoverX != null

  return (
    <div className={`ytmq-squiggle ${active && canSeek ? 'is-active' : ''} ${className}`}>
      <div
        ref={wrapRef}
        className={`relative ${canSeek ? 'cursor-pointer touch-none' : ''}`}
        style={{ height: g.height }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => setHoverX(null)}
        onKeyDown={onKeyDown}
        tabIndex={canSeek ? 0 : -1}
        role={canSeek ? 'slider' : 'progressbar'}
        aria-label={canSeek ? 'Seek' : 'Track progress'}
        aria-valuemin={0}
        aria-valuemax={hasDuration ? Math.floor(duration!) : undefined}
        aria-valuenow={Math.floor(shown)}
        aria-valuetext={formatPlaybackTime(shown)}
      >
        <svg width="100%" height={g.height} className="absolute inset-0 overflow-visible" aria-hidden>
          <defs>
            <clipPath id={`sq-${size}-${trackKey ?? 'x'}-${width | 0}`}>
              <rect ref={clipRef} x={-g.stroke} y={-g.height} height={g.height * 3} width={0} />
            </clipPath>
          </defs>
          <line
            ref={restRef}
            x1={0}
            x2={width}
            y1={g.height / 2}
            y2={g.height / 2}
            className="ytmq-squiggle-rest"
            style={{ strokeWidth: g.stroke }}
            strokeLinecap="round"
          />
          <path
            ref={waveRef}
            className="ytmq-squiggle-wave"
            fill="none"
            strokeLinecap="round"
            style={{ strokeWidth: g.stroke }}
            clipPath={`url(#sq-${size}-${trackKey ?? 'x'}-${width | 0})`}
          />
        </svg>
        <span
          ref={thumbRef}
          aria-hidden
          className="ytmq-squiggle-thumb pointer-events-none absolute left-0 top-1/2"
          style={{ height: g.thumbH, marginTop: -g.thumbH / 2 }}
        />
        {canSeek && hoverSeconds != null && !dragging && (
          <span
            aria-hidden
            className="ytmq-squiggle-tip pointer-events-none absolute bottom-full mb-2 -translate-x-1/2 rounded-md bg-neutral-950/90 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white"
            style={{ left: hoverX! }}
          >
            {formatPlaybackTime(hoverSeconds)}
          </span>
        )}
        {dragging && held != null && (
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-full mb-2 -translate-x-1/2 rounded-md bg-white px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-neutral-950"
            style={{ left: hasDuration && duration ? (held / duration) * width : 0 }}
          >
            {formatPlaybackTime(held)}
          </span>
        )}
      </div>
      {times !== 'none' && (
        <div className="ytmq-squiggle-times mt-1 flex justify-between text-[11px] font-medium tabular-nums">
          <span>{formatPlaybackTime(shown)}</span>
          <span>
            {!hasDuration
              ? '--:--'
              : times === 'elapsed-remaining'
                ? `-${formatPlaybackTime(Math.max(0, duration! - shown))}`
                : formatPlaybackTime(duration!)}
          </span>
        </div>
      )}
    </div>
  )
}
