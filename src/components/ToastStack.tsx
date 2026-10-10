import type { ToastMessage, ToastVariant } from '../hooks/useToast'

type ToastStackProps = {
  toasts: ToastMessage[]
  onDismiss?: (id: number) => void
}

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: 'bg-[#2a2a2a] text-white',
  info: 'bg-[#2a2a2a] text-white',
  error: 'bg-[#3a1611] text-accent-100',
}

function ToastIcon({ variant }: { variant: ToastVariant }) {
  if (variant === 'success') {
    return (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-emerald-400">
        <path
          fillRule="evenodd"
          d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.79 6.8-6.79a1 1 0 0 1 1.4 0Z"
          clipRule="evenodd"
        />
      </svg>
    )
  }
  if (variant === 'error') {
    return (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-accent-400">
        <path
          fillRule="evenodd"
          d="M10 1.8a8.2 8.2 0 1 0 0 16.4A8.2 8.2 0 0 0 10 1.8ZM9 6a1 1 0 0 1 2 0v4a1 1 0 1 1-2 0V6Zm1 9.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Z"
          clipRule="evenodd"
        />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-neutral-300">
      <path
        fillRule="evenodd"
        d="M10 1.8a8.2 8.2 0 1 0 0 16.4A8.2 8.2 0 0 0 10 1.8ZM11 6a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm-1 2.8a1 1 0 0 1 1 1V14a1 1 0 1 1-2 0V9.8a1 1 0 0 1 1-1Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  if (toasts.length === 0) return null

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-[7rem]"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => onDismiss?.(toast.id)}
          style={{
            animation: toast.leaving
              ? 'ytmq-toast-out 0.3s var(--ease-out-soft) both'
              : 'ytmq-toast-in 0.32s var(--ease-spring) both',
          }}
          className={`pointer-events-auto flex h-11 max-w-[min(26rem,calc(100vw-2rem))] items-center gap-2.5 rounded-full pl-3.5 pr-4 text-sm font-semibold shadow-[0_14px_36px_rgba(0,0,0,0.55)] ring-1 ring-white/[0.07] ${VARIANT_STYLES[toast.variant]}`}
        >
          <ToastIcon variant={toast.variant} />
          <span className="truncate">{toast.text}</span>
        </button>
      ))}
    </div>
  )
}
