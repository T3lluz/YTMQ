import { useEffect, useState } from 'react'

/**
 * The Firefox build of the extension (scripts/pack-extension.mjs and
 * scripts/sign-firefox.mjs publish ytmq-firefox.json next to the app).
 */
export type FirefoxExtension = {
  version: string
  /** The signed .xpi, installable with one click. Null until Mozilla signed one. */
  xpiUrl: string | null
  /** Unsigned build, for Firefox editions that allow those. */
  unsignedUrl: string
}

const BASE = import.meta.env.BASE_URL

/** Firefox and its forks (LibreWolf, Zen, Floorp, Waterfox) all say Firefox. */
export function isFirefox(): boolean {
  return typeof navigator !== 'undefined' && /\bFirefox\//.test(navigator.userAgent)
}

export function useFirefoxExtension(enabled = true): FirefoxExtension | null {
  const [info, setInfo] = useState<FirefoxExtension | null>(null)
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    fetch(`${BASE}ytmq-firefox.json`, { cache: 'no-cache' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { version?: string; xpi?: string | null; unsigned?: string } | null) => {
        if (cancelled || !data?.version) return
        const v = `?v=${encodeURIComponent(data.version)}`
        setInfo({
          version: data.version,
          xpiUrl: data.xpi ? `${BASE}${data.xpi}${v}` : null,
          unsignedUrl: `${BASE}${data.unsigned ?? 'ytmq-firefox-unsigned.xpi'}${v}`,
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [enabled])
  return info
}
