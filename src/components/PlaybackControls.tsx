import { useState } from 'react'
import type { PlaybackAction } from '../lib/playback'

type PlaybackControlsProps = {
  isPlaying: boolean
  disabled?: boolean
  onControl: (action: PlaybackAction) => void
  /** Action currently echoed back as "pending" by the parent (accent highlight). */
  pendingAction?: PlaybackAction | null
  /** Tooltip shown on the whole row (e.g. when the host limits controls). */
  title?: string
  className?: string
}

/**
 * Big, background-less Apple/iOS-style transport controls shared by the
 * now-playing sidebar and the immersive lyrics screen.
 *
 * Animations are pure CSS, no deps:
 * - Play/Pause smoothly *morphs* between the two glyphs by transitioning the
 *   SVG `d` path (two quads slide/converge from bars into a triangle).
 * - Previous/Next *bounce* in their travel direction and spring back. We bump a
 *   per-button nonce on each press and use it as a React `key` so the keyframe
 *   animation replays on every click (even rapid repeats).
 */
export function PlaybackControls({
  isPlaying,
  disabled = false,
  onControl,
  pendingAction = null,
  title,
  className = '',
}: PlaybackControlsProps) {
  const [bump, setBump] = useState({ prev: 0, next: 0, pp: 0 })

  const press = (action: PlaybackAction) => {
    onControl(action)
    if (action === 'prev') setBump((b) => ({ ...b, prev: b.prev + 1 }))
    else if (action === 'next') setBump((b) => ({ ...b, next: b.next + 1 }))
    else setBump((b) => ({ ...b, pp: b.pp + 1 }))
  }

  return (
    <div
      className={`ytmq-now-controls flex items-center justify-center gap-5 ${className}`}
      title={title}
    >
      <ControlButton
        label="Previous"
        disabled={disabled}
        active={pendingAction === 'prev'}
        onClick={() => press('prev')}
      >
        <span
          key={`prev-${bump.prev}`}
          className={`flex ${bump.prev > 0 ? 'ytmq-bounce-left' : ''}`}
        >
          <PrevIcon />
        </span>
      </ControlButton>

      <ControlButton
        label={isPlaying ? 'Pause' : 'Play'}
        primary
        disabled={disabled}
        active={pendingAction === 'play' || pendingAction === 'pause'}
        onClick={() => press(isPlaying ? 'pause' : 'play')}
      >
        <span
          key={`pp-${bump.pp}`}
          className={`flex ${bump.pp > 0 ? 'ytmq-pp-pop' : ''}`}
        >
          <PlayPauseIcon isPlaying={isPlaying} />
        </span>
      </ControlButton>

      <ControlButton
        label="Next"
        disabled={disabled}
        active={pendingAction === 'next'}
        onClick={() => press('next')}
      >
        <span
          key={`next-${bump.next}`}
          className={`flex ${bump.next > 0 ? 'ytmq-bounce-right' : ''}`}
        >
          <NextIcon />
        </span>
      </ControlButton>
    </div>
  )
}

type ControlButtonProps = {
  label: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
  primary?: boolean
  children: React.ReactNode
}

function ControlButton({
  label,
  onClick,
  disabled,
  active,
  primary,
  children,
}: ControlButtonProps) {
  const size = primary ? 'h-16 w-16' : 'h-11 w-11'
  const ring = active ? ' ytmq-now-control-active' : ''
  // Opacity is applied to the whole button (one composited layer) rather than
  // baked into the fill colour, so overlapping shapes/strokes inside the glyph
  // never stack their alpha and tint patches lighter/darker.
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`ytmq-now-control inline-flex items-center justify-center text-white opacity-75 transition hover:opacity-100 active:scale-90 disabled:opacity-40 disabled:active:scale-100 ${size}${ring}`}
    >
      {children}
    </button>
  )
}

// Play (rounded triangle) and Pause (two rounded bars) as two-quad paths with
// matching command structure ("M.. L.. L.. L.. Z" twice) so the browser can
// interpolate `d` between them for a smooth morph. The rounded SF Symbols look
// comes from a same-colour round-joined stroke; because the whole button is one
// opacity layer, the stroke never darkens where it overlaps the fill.
// Thinner base geometry — the heavy round-joined stroke supplies most of the
// mass and the generous corner radius, matching the latest chunky/rounded iOS
// transport glyphs without fusing the pause bars together.
const PLAY_D = 'M8 6 L13 9 L13 15 L8 18 Z M13 9 L18 12 L18 12 L13 15 Z'
const PAUSE_D = 'M7 5.5 L9 5.5 L9 18.5 L7 18.5 Z M15 5.5 L17 5.5 L17 18.5 L15 18.5 Z'

function PlayPauseIcon({ isPlaying }: { isPlaying: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-14 w-14">
      <path
        className="ytmq-pp-path"
        d={isPlaying ? PAUSE_D : PLAY_D}
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * SF Symbols-style skip glyphs (`backward.end.fill` / `forward.end.fill`): a
 * rounded-rect end bar plus a rounded triangle.
 */
function PrevIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-10 w-10" fill="currentColor">
      <rect
        x="5.4"
        y="6.6"
        width="2.4"
        height="10.8"
        rx="1.2"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      <path
        d="M17.6 7 L10 12 L17.6 17 Z"
        stroke="currentColor"
        strokeWidth={2.6}
        strokeLinejoin="round"
      />
    </svg>
  )
}

function NextIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-10 w-10" fill="currentColor">
      <path
        d="M6.4 7 L14 12 L6.4 17 Z"
        stroke="currentColor"
        strokeWidth={2.6}
        strokeLinejoin="round"
      />
      <rect
        x="16.2"
        y="6.6"
        width="2.4"
        height="10.8"
        rx="1.2"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
    </svg>
  )
}
