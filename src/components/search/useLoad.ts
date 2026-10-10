import { useEffect, useState } from 'react'

/** Load something keyed; a new key drops the old answer. */
export function useLoad<T>(key: string | null, load: () => Promise<T>) {
  const [state, setState] = useState<{ key: string | null; data: T | null; error: string | null }>({
    key: null,
    data: null,
    error: null,
  })

  useEffect(() => {
    if (!key) return
    let cancelled = false
    load()
      .then((data) => {
        if (!cancelled) setState({ key, data, error: null })
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ key, data: null, error: err instanceof Error ? err.message : 'Something went wrong' })
      })
    return () => {
      cancelled = true
    }
    // `load` is a fresh closure every render; the key says when it changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const current = state.key === key
  return {
    data: current ? state.data : null,
    error: current ? state.error : null,
    loading: Boolean(key) && !current,
  }
}
