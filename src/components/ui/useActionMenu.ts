import { useState } from 'react'

/** State for an ActionMenu opened from a button. */
export function useActionMenu<T>() {
  const [state, setState] = useState<{ target: T; anchor: DOMRect } | null>(null)
  return {
    target: state?.target ?? null,
    anchor: state?.anchor ?? null,
    open: (target: T, el: Element) => setState({ target, anchor: el.getBoundingClientRect() }),
    close: () => setState(null),
  }
}
