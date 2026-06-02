import { useCallback, useState } from 'react'

export type ToastMessage = {
  id: number
  text: string
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const showToast = useCallback((text: string) => {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, text }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id))
    }, 2800)
  }, [])

  return { toasts, showToast }
}
