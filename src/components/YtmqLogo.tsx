import { useId } from 'react'

type YtmqLogoProps = {
  className?: string
  size?: number
}

export function YtmqLogo({ className, size = 64 }: YtmqLogoProps) {
  const uid = useId()
  const id = (name: string) => `ytmq-${uid}-${name}`

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="YTMQ"
    >
      <defs>
        {/* Deep, rich dark violet background gradient */}
        <linearGradient id={id('bg')} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0A0712" />
          <stop offset="1" stopColor="#140D24" />
        </linearGradient>

        {/* Frosted glass background gradient (subtle white tint) */}
        <linearGradient id={id('glass-bg')} x1="12" y1="12" x2="52" y2="52" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" stopOpacity={0.16} />
          <stop offset="1" stopColor="#ffffff" stopOpacity={0.03} />
        </linearGradient>

        {/* Glass border highlight gradient for 3D refraction effect */}
        <linearGradient id={id('glass-border')} x1="12" y1="12" x2="52" y2="52" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" stopOpacity={0.45} />
          <stop offset="0.3" stopColor="#ffffff" stopOpacity={0.1} />
          <stop offset="0.7" stopColor="#ffffff" stopOpacity={0.05} />
          <stop offset="1" stopColor="#ffffff" stopOpacity={0.25} />
        </linearGradient>

        {/* Moderate blur for background liquid blobs */}
        <filter id={id('blur-normal')} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" />
        </filter>

        {/* Heavy blur for realistic frosted glass refraction */}
        <filter id={id('blur-frosted')} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="11" />
        </filter>

        {/* Soft drop shadow for the glass plate */}
        <filter id={id('glass-shadow')} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="4" stdDeviation="4.5" floodColor="#000000" floodOpacity={0.55} />
        </filter>

        {/* Intense glow for participant dots */}
        <filter id={id('dot-glow')} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Clip path for the frosted glass squircle */}
        <clipPath id={id('glass-clip')}>
          <rect x="12" y="12" width="40" height="40" rx="12" />
        </clipPath>
      </defs>

      {/* Base Canvas */}
      <rect width="64" height="64" rx="16" fill={`url(#${id('bg')})`} />

      {/* 1. BACKGROUND LIQUID BLOBS (Unblurred outside glass) */}
      <g>
        {/* Cyan/Spotify-ish neon blob (top right) */}
        <circle cx="45" cy="19" r="14" fill="#00F5A0" opacity={0.55} filter={`url(#${id('blur-normal')})`} />
        {/* Hot Pink/YouTube-ish neon blob (bottom left) */}
        <circle cx="19" cy="45" r="16" fill="#FF0055" opacity={0.65} filter={`url(#${id('blur-normal')})`} />
        {/* Party Purple neon blob (center) */}
        <circle cx="32" cy="32" r="13" fill="#7C3AED" opacity={0.75} filter={`url(#${id('blur-normal')})`} />
      </g>

      {/* 2. GLASS LAYER GROUP (Clipped to glass squircle) */}
      <g clipPath={`url(#${id('glass-clip')})`}>
        {/* Base glass backing */}
        <rect x="12" y="12" width="40" height="40" rx="12" fill="#ffffff" fillOpacity={0.04} />

        {/* Refracted/Frosted Blobs (Highly blurred inside the glass) */}
        <circle cx="45" cy="19" r="14" fill="#00F5A0" opacity={0.4} filter={`url(#${id('blur-frosted')})`} />
        {/* Hot Pink/YouTube-ish neon blob (bottom left) */}
        <circle cx="19" cy="45" r="16" fill="#FF0055" opacity={0.45} filter={`url(#${id('blur-frosted')})`} />
        {/* Party Purple neon blob (center) */}
        <circle cx="32" cy="32" r="13" fill="#7C3AED" opacity={0.5} filter={`url(#${id('blur-frosted')})`} />

        {/* Frosted overlay tint */}
        <rect x="12" y="12" width="40" height="40" rx="12" fill={`url(#${id('glass-bg')})`} />
      </g>

      {/* 3. GLASS PLATE EDGE & SHADOW */}
      <rect
        x="12"
        y="12"
        width="40"
        height="40"
        rx="12"
        fill="none"
        stroke={`url(#${id('glass-border')})`}
        strokeWidth="1.2"
        filter={`url(#${id('glass-shadow')})`}
      />

      {/* 4. GLASS CONTENT (Sleek play button, Jam waves, glowing dots) */}
      {/* Concentric Spotify Jam/vinyl waves */}
      <circle
        cx="32"
        cy="32"
        r="13"
        stroke="#ffffff"
        strokeOpacity={0.32}
        strokeWidth="1.2"
        strokeDasharray="14 7"
        transform="rotate(-15 32 32)"
      />
      <circle
        cx="32"
        cy="32"
        r="16.5"
        stroke="#ffffff"
        strokeOpacity={0.18}
        strokeWidth="1.2"
        strokeDasharray="28 10"
        transform="rotate(35 32 32)"
      />

      {/* Premium, visually centered Play Triangle */}
      <path d="M28.5 24.5 L28.5 39.5 L38.5 32 Z" fill="#ffffff" />

      {/* Glowing participant dots (Party / Shared Queue) */}
      <circle cx="47" cy="21" r="2.2" fill="#00F5A0" filter={`url(#${id('dot-glow')})`} />
      <circle cx="17" cy="43" r="2" fill="#FF0055" filter={`url(#${id('dot-glow')})`} />
      <circle cx="43" cy="44" r="1.6" fill="#FFB800" filter={`url(#${id('dot-glow')})`} />
    </svg>
  )
}
