/**
 * Material 3 switch: a check in the thumb when on, a cross when off. The
 * thumb slides on a spring, swells while pressed, and the icons turn into
 * each other. Styles in index.css (.ytmq-switch).
 */
export function Switch({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
  /** For screen readers when no visible label is tied to it. */
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="ytmq-switch"
    >
      <span className="ytmq-switch-thumb" aria-hidden>
        <svg viewBox="0 0 16 16" className="ytmq-switch-check">
          <path d="M3.5 8.4 6.6 11.3 12.5 5" />
        </svg>
        <svg viewBox="0 0 16 16" className="ytmq-switch-cross">
          <path d="M4.6 4.6 11.4 11.4M11.4 4.6 4.6 11.4" />
        </svg>
      </span>
    </button>
  )
}
