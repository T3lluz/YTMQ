/**
 * Mount fixed overlays on music.youtube.com the same way bridge toasts do:
 * append to document.body once it exists, then keep the node alive across
 * YouTube Music SPA navigations that rebuild the page shell.
 */

export type OverlayMountHandle = {
  /** Re-attach if YouTube Music removed the node from the DOM. */
  ensure: () => void
  destroy: () => void
}

function appendToBody(element: HTMLElement): boolean {
  const body = document.body
  if (!body) return false
  if (element.parentNode !== body) body.appendChild(element)
  return true
}

export function mountOverlayOnBody(element: HTMLElement): OverlayMountHandle {
  let destroyed = false

  const ensure = () => {
    if (destroyed) return
    appendToBody(element)
  }

  const onNavigate = () => ensure()
  const onPageShow = () => ensure()
  const onReady = () => ensure()

  if (!appendToBody(element)) {
    const observer = new MutationObserver(() => {
      if (appendToBody(element)) observer.disconnect()
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })
    document.addEventListener('DOMContentLoaded', onReady, { once: true })
    window.setTimeout(() => observer.disconnect(), 15_000)
  }

  document.addEventListener('yt-navigate-finish', onNavigate, true)
  window.addEventListener('pageshow', onPageShow)

  return {
    ensure,
    destroy() {
      if (destroyed) return
      destroyed = true
      document.removeEventListener('yt-navigate-finish', onNavigate, true)
      window.removeEventListener('pageshow', onPageShow)
      element.remove()
    },
  }
}

export function appendStyleToHead(id: string, css: string): void {
  if (document.getElementById(id)) return
  const style = document.createElement('style')
  style.id = id
  style.textContent = css
  const parent = document.head ?? document.documentElement
  parent.appendChild(style)
}
