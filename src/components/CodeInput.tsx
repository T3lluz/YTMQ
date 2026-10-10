import { useRef, useState } from 'react'

const LENGTH = 6

/**
 * A lobby code as six boxes. One real input sits over them, so typing,
 * pasting and phone keyboards behave as with any field; the boxes only
 * draw what it holds and where the next letter goes.
 */
export function CodeInput({
  value,
  onChange,
  autoFocus = false,
  invalid = false,
  id,
}: {
  value: string
  onChange: (value: string) => void
  autoFocus?: boolean
  invalid?: boolean
  id?: string
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [focused, setFocused] = useState(false)
  const chars = value.slice(0, LENGTH).split('')
  const cursor = Math.min(chars.length, LENGTH - 1)

  return (
    <div
      className={`relative grid grid-cols-6 gap-1.5 sm:gap-2 ${invalid ? 'ytmq-shake' : ''}`}
      onClick={() => inputRef.current?.focus()}
    >
      {Array.from({ length: LENGTH }).map((_, i) => {
        const filled = i < chars.length
        const active = focused && i === cursor && (chars.length < LENGTH || i === LENGTH - 1)
        return (
          <span
            key={i}
            aria-hidden
            className={`flex aspect-[4/5] items-center justify-center rounded-2xl font-mono text-2xl font-semibold uppercase text-white transition-[background-color,box-shadow,transform] duration-200 sm:text-[1.7rem] ${
              active
                ? 'bg-white/[0.11] shadow-[inset_0_0_0_2px_#fff]'
                : filled
                  ? 'bg-white/[0.09] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]'
                  : 'bg-white/[0.05] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]'
            }`}
          >
            {filled ? (
              <span key={chars[i]} className="ytmq-anim-pop">
                {chars[i]}
              </span>
            ) : active ? (
              <span className="ytmq-caret h-7 w-0.5 rounded-full bg-white" />
            ) : null}
          </span>
        )
      })}
      <input
        ref={inputRef}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, LENGTH))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoFocus={autoFocus}
        autoComplete="one-time-code"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        inputMode="text"
        maxLength={LENGTH}
        aria-label="Lobby code"
        className="absolute inset-0 h-full w-full cursor-text bg-transparent text-transparent caret-transparent opacity-0 outline-none"
      />
    </div>
  )
}
