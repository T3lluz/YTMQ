import { useEffect, useState } from 'react'

/**
 * Reactive CSS media-query match. Returns `false` during SSR / before the
 * first effect runs, then tracks `matchMedia` changes for the given query.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/** True on viewports wide enough for the desktop, fullscreen lyrics layout. */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 768px)')
}
