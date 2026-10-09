import { useId } from 'react'

/**
 * The YTMQ mark: an 8-lobe "cookie" (Material 3 Expressive shape) in a
 * sunset red, a play triangle heading a short list on top, and two rotated
 * copies trailing behind it like a spinning record. The trail is dropped at
 * small sizes, where it only muddies the edge.
 */
const COOKIE =
  'M39.2 0C39.2 1.25 38.73 2.58 38.08 3.75C37.43 4.92 36.27 6.02 35.31 7.02C34.34 8.03 33.12 8.87 32.28 9.79C31.45 10.71 30.73 11.53 30.3 12.55C29.88 13.57 29.82 14.66 29.75 15.9C29.69 17.15 29.96 18.61 29.93 20C29.9 21.4 29.95 22.99 29.58 24.27C29.21 25.56 28.6 26.83 27.72 27.72C26.83 28.6 25.56 29.21 24.27 29.58C22.99 29.95 21.4 29.9 20 29.93C18.61 29.96 17.15 29.69 15.9 29.75C14.66 29.82 13.57 29.88 12.55 30.3C11.53 30.73 10.71 31.45 9.79 32.28C8.87 33.12 8.03 34.34 7.02 35.31C6.02 36.27 4.92 37.43 3.75 38.08C2.58 38.73 1.25 39.2 0 39.2C-1.25 39.2 -2.58 38.73 -3.75 38.08C-4.92 37.43 -6.02 36.27 -7.02 35.31C-8.03 34.34 -8.87 33.12 -9.79 32.28C-10.71 31.45 -11.53 30.73 -12.55 30.3C-13.57 29.88 -14.66 29.82 -15.9 29.75C-17.15 29.69 -18.61 29.96 -20 29.93C-21.4 29.9 -22.99 29.95 -24.27 29.58C-25.56 29.21 -26.83 28.6 -27.72 27.72C-28.6 26.83 -29.21 25.56 -29.58 24.27C-29.95 22.99 -29.9 21.4 -29.93 20C-29.96 18.61 -29.69 17.15 -29.75 15.9C-29.82 14.66 -29.88 13.57 -30.3 12.55C-30.73 11.53 -31.45 10.71 -32.28 9.79C-33.12 8.87 -34.34 8.03 -35.31 7.02C-36.27 6.02 -37.43 4.92 -38.08 3.75C-38.73 2.58 -39.2 1.25 -39.2 0C-39.2 -1.25 -38.73 -2.58 -38.08 -3.75C-37.43 -4.92 -36.27 -6.02 -35.31 -7.02C-34.34 -8.03 -33.12 -8.87 -32.28 -9.79C-31.45 -10.71 -30.73 -11.53 -30.3 -12.55C-29.88 -13.57 -29.82 -14.66 -29.75 -15.9C-29.69 -17.15 -29.96 -18.61 -29.93 -20C-29.9 -21.4 -29.95 -22.99 -29.58 -24.27C-29.21 -25.56 -28.6 -26.83 -27.72 -27.72C-26.83 -28.6 -25.56 -29.21 -24.27 -29.58C-22.99 -29.95 -21.4 -29.9 -20 -29.93C-18.61 -29.96 -17.15 -29.69 -15.9 -29.75C-14.66 -29.82 -13.57 -29.88 -12.55 -30.3C-11.53 -30.73 -10.71 -31.45 -9.79 -32.28C-8.87 -33.12 -8.03 -34.34 -7.02 -35.31C-6.02 -36.27 -4.92 -37.43 -3.75 -38.08C-2.58 -38.73 -1.25 -39.2 -0 -39.2C1.25 -39.2 2.58 -38.73 3.75 -38.08C4.92 -37.43 6.02 -36.27 7.02 -35.31C8.03 -34.34 8.87 -33.12 9.79 -32.28C10.71 -31.45 11.53 -30.73 12.55 -30.3C13.57 -29.88 14.66 -29.82 15.9 -29.75C17.15 -29.69 18.61 -29.96 20 -29.93C21.4 -29.9 22.99 -29.95 24.27 -29.58C25.56 -29.21 26.83 -28.6 27.72 -27.72C28.6 -26.83 29.21 -25.56 29.58 -24.27C29.95 -22.99 29.9 -21.4 29.93 -20C29.96 -18.61 29.69 -17.15 29.75 -15.9C29.82 -14.66 29.88 -13.57 30.3 -12.55C30.73 -11.53 31.45 -10.71 32.28 -9.79C33.12 -8.87 34.34 -8.03 35.31 -7.02C36.27 -6.02 37.43 -4.92 38.08 -3.75C38.73 -2.58 39.2 -1.25 39.2 0Z'

const TRIANGLE = 'M30 32.3L30 41.7Q30 44.5 32.43 43.1L40.57 38.4Q43 37 40.57 35.6L32.43 30.9Q30 29.5 30 32.3Z'

type YtmqLogoProps = {
  className?: string
  size?: number
  /** Show the echo trail. Defaults to on from 40px up. */
  trail?: boolean
}

export function YtmqLogo({ className, size = 64, trail }: YtmqLogoProps) {
  const uid = useId().replace(/:/g, '')
  const grad = `ytmq-g-${uid}`
  const showTrail = trail ?? size >= 40
  const scale = showTrail ? 1.08 : 1.18

  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="YTMQ"
    >
      <defs>
        <linearGradient id={grad} x1="-22" y1="-36" x2="22" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF8F66" />
          <stop offset=".5" stopColor="#F5492F" />
          <stop offset="1" stopColor="#D3301F" />
        </linearGradient>
      </defs>
      <g transform={`translate(50 50) scale(${scale}) translate(-50 -50)`}>
        {showTrail && (
          <>
            <path d={COOKIE} fill={`url(#${grad})`} opacity={0.25} transform="translate(50 50) rotate(-20)" />
            <path d={COOKIE} fill={`url(#${grad})`} opacity={0.5} transform="translate(50 50) rotate(-10)" />
          </>
        )}
        <path d={COOKIE} fill={`url(#${grad})`} transform="translate(50 50)" />
        <g fill="#fff">
          <path d={TRIANGLE} />
          <rect x="47" y="33.25" width="23" height="7.5" rx="3.75" />
          <circle cx="33.75" cy="50" r="3.75" />
          <rect x="41" y="46.25" width="29" height="7.5" rx="3.75" />
          <circle cx="33.75" cy="63" r="3.75" fillOpacity={0.6} />
          <rect x="41" y="59.25" width="20" height="7.5" rx="3.75" fillOpacity={0.6} />
        </g>
      </g>
    </svg>
  )
}

/** Logo plus the wordmark, for headers. */
export function YtmqWordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <YtmqLogo size={30} className="h-[30px] w-[30px]" />
      <span className="text-[1.15rem] font-extrabold tracking-[-0.03em] text-white">YTMQ</span>
    </span>
  )
}
