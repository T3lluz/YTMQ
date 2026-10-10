import { useEffect, useRef, useState } from 'react'
import { VolumeIcon } from './icons'

/**
 * Horizontal volume for the host: speaker (tap to mute), a slider that
 * thickens under the pointer, and the level. It moves optimistically and
 * holds the dragged level until the player reports a newer one.
 */
export function VolumeBar({
  volume,
  onVolume,
  updatedAt,
  className = '',
  showValue = true,
}: {
  volume: number | undefined
  onVolume: (volume: number) => void
  /** Bumps when the player reports; clears the optimistic level. */
  updatedAt?: number
  className?: string
  showValue?: boolean
}) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const [pending, setPending] = useState<number | null>(null)
  const sentAt = useRef(0)
  const lastSend = useRef(0)
  const lastAudible = useRef(60)

  useEffect(() => {
    if (pending == null || dragging) return
    if (updatedAt != null && updatedAt > sentAt.current + 400) setPending(null)
  }, [updatedAt, pending, dragging])

  const level = Math.min(100, Math.max(0, pending ?? volume ?? 0))
  const muted = level <= 0
  const known = volume != null || pending != null

  useEffect(() => {
    if (level > 0) lastAudible.current = level
  }, [level])

  const send = (next: number, force = false) => {
    const now = Date.now()
    if (!force && now - lastSend.current < 70) return
    lastSend.current = now
    sentAt.current = now
    onVolume(Math.round(next))
  }

  const fromX = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return null
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * 100
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const next = fromX(e.clientX)
    if (next == null) return
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setDragging(true)
    setPending(next)
    send(next, true)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    const next = fromX(e.clientX)
    if (next == null) return
    setPending(next)
    send(next)
  }
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    setDragging(false)
    const next = fromX(e.clientX) ?? pending
    if (next != null) {
      setPending(next)
      send(next, true)
    }
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 5
    let next: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = level + step
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = level - step
    if (next == null) return
    e.preventDefault()
    const clamped = Math.min(100, Math.max(0, next))
    setPending(clamped)
    send(clamped, true)
  }

  const toggleMute = () => {
    const next = muted ? (lastAudible.current > 5 ? lastAudible.current : 50) : 0
    setPending(next)
    send(next, true)
  }

  return (
    <div className={`ytmq-volbar flex items-center gap-2.5 ${dragging ? 'is-dragging' : ''} ${className}`}>
      <button
        type="button"
        onClick={toggleMute}
        aria-label={muted ? 'Unmute' : 'Mute'}
        title={muted ? 'Unmute' : 'Mute'}
        className="ytmq-press inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/85 hover:bg-white/10 hover:text-white"
      >
        <VolumeIcon level={level} muted={muted} />
      </button>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Volume"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(level)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        className="group relative flex h-7 min-w-0 flex-1 cursor-pointer touch-none items-center"
      >
        <div ref={trackRef} className="ytmq-volbar-track relative w-full overflow-hidden rounded-full">
          <div
            className="ytmq-volbar-fill absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${known ? level : 0}%` }}
          />
        </div>
        <span
          aria-hidden
          className="ytmq-volbar-thumb pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow"
          style={{ left: `${known ? level : 0}%` }}
        />
      </div>
      {showValue && (
        <span className="w-7 shrink-0 text-right text-xs font-semibold tabular-nums text-white/60">
          {known ? Math.round(level) : '–'}
        </span>
      )}
    </div>
  )
}
