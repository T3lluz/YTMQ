import { useCallback, useRef, useState } from 'react'

export type ToastVariant = 'success' | 'info' | 'error'

export type ToastMessage = {
  id: number
  text: string
  variant: ToastVariant
  leaving: boolean
}

const VISIBLE_MS = 2800
const EXIT_MS = 320

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    setToasts((prev) =>
      prev.map((toast) =>
        toast.id === id ? { ...toast, leaving: true } : toast,
      ),
    )
    const remove = setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id))
      timers.current.delete(id)
    }, EXIT_MS)
    timers.current.set(id, remove)
  }, [])

  const showToast = useCallback(
    (text: string, variant: ToastVariant = 'success') => {
      const id = Date.now() + Math.random()
      setToasts((prev) => {
        const next = [...prev, { id, text, variant, leaving: false }]
        // Keep at most 3 toasts on screen.
        return next.slice(-3)
      })
      const hide = setTimeout(() => dismiss(id), VISIBLE_MS)
      timers.current.set(id, hide)
    },
    [dismiss],
  )

  return { toasts, showToast, dismiss }
}
