import { useId } from 'react'

export type DropTrack = {
  title: string
  artist: string
  thumbnailUrl: string
}

type LiquidDropProps = {
  /** Small caps line over the title ("Up next"). */
  label: string
  track: DropTrack
  leaving: boolean
  /** Where the drop hangs from: its parent's top edge or the screen's. */
  className?: string
  /** 0 to 1, how far the bar has emptied. */
  progress?: number
  /** Or let the bar empty by itself over this long. */
  barMs?: number
}

/**
 * A drop of liquid that gathers at the top edge, drips down and swells into a
 * card that hangs from the edge by a neck, then dips, stretches and snaps back
 * up when it leaves. The liquid is a gooey SVG filter over two plain shapes
 * (the edge and the drop); the card's text sits on top, unfiltered.
 */
export function LiquidDrop({
  label,
  track,
  leaving,
  className = 'absolute z-30',
  progress,
  barMs,
}: LiquidDropProps) {
  const filterId = `ytmq-goo-${useId().replace(/:/g, '')}`

  return (
    <div
      className={`ytmq-drop pointer-events-none inset-x-0 top-0 flex justify-center ${className} ${leaving ? 'is-leaving' : ''}`}
      aria-live="polite"
    >
      <svg aria-hidden className="absolute h-0 w-0">
        <defs>
          <filter id={filterId}>
            <feGaussianBlur in="SourceGraphic" stdDeviation="9" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" result="goo" />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>

      {/* The liquid: the top edge and the drop, melted together. */}
      <div aria-hidden className="ytmq-drop-liquid absolute inset-x-0 top-0 h-40" style={{ filter: `url(#${filterId})` }}>
        <span className="ytmq-drop-edge" />
        <span className="ytmq-drop-blob" />
      </div>

      {/* The card's contents, over the drop once it has swollen. */}
      <div className="ytmq-drop-card relative flex items-center gap-3 overflow-hidden px-3.5">
        {track.thumbnailUrl ? (
          <img
            src={track.thumbnailUrl}
            alt=""
            referrerPolicy="no-referrer"
            onError={(event) => {
              const img = event.currentTarget
              if (img.dataset.fallback === '1') return
              if (img.src.includes('/maxresdefault.jpg')) {
                img.dataset.fallback = '1'
                img.src = img.src.replace('/maxresdefault.jpg', '/mqdefault.jpg')
              }
            }}
            className="h-11 w-11 shrink-0 rounded-[10px] object-cover shadow-lg"
          />
        ) : (
          <div className="h-11 w-11 shrink-0 rounded-[10px] bg-white/10" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/60">{label}</p>
          <p className="truncate text-sm font-bold leading-tight text-white">{track.title}</p>
          {track.artist && <p className="truncate text-xs text-white/65">{track.artist}</p>}
        </div>
        <span
          aria-hidden
          className="absolute inset-x-6 bottom-1.5 h-[3px] overflow-hidden rounded-full bg-white/15"
        >
          {barMs != null ? (
            <span
              className="block h-full origin-left rounded-full bg-white/80"
              style={{ animation: `ytmq-drop-bar ${barMs}ms linear both` }}
            />
          ) : (
            <span
              className="block h-full origin-left rounded-full bg-white/80 transition-transform duration-300 ease-linear"
              style={{ transform: `scaleX(${1 - (progress ?? 0)})` }}
            />
          )}
        </span>
      </div>
    </div>
  )
}
