import type { ToastMessage } from '../hooks/useToast'

type ToastStackProps = {
  toasts: ToastMessage[]
}

export function ToastStack({ toasts }: ToastStackProps) {
  if (toasts.length === 0) return null

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <p
          key={toast.id}
          className="rounded-full bg-zinc-800 px-4 py-2 text-sm text-zinc-100 shadow-lg ring-1 ring-zinc-700"
        >
          {toast.text}
        </p>
      ))}
    </div>
  )
}
