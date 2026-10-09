import { useState } from 'react'
import { lastNickname, rememberNickname } from '../lib/nickname'

type NicknamePromptProps = {
  onSubmit: (nickname: string) => void
}

export function NicknamePrompt({ onSubmit }: NicknamePromptProps) {
  const [value, setValue] = useState(lastNickname)
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) {
      setError('Enter a nickname')
      return
    }
    setError(null)
    rememberNickname(trimmed)
    onSubmit(trimmed)
  }

  return (
    <div
      className="ytmq-anim-fade fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="nickname-prompt-title"
    >
      <form
        onSubmit={handleSubmit}
        className="ytmq-anim-fade-up w-full max-w-sm space-y-5 rounded-[28px] border border-white/10 bg-neutral-900 p-6 shadow-2xl shadow-black/60"
      >
        <header className="space-y-1">
          <h2 id="nickname-prompt-title" className="text-2xl font-extrabold tracking-[-0.02em] text-white">
            What should we call you?
          </h2>
          <p className="text-sm text-neutral-400">
            Your name shows next to the songs you add, so people know who to thank.
          </p>
        </header>

        <label className="block space-y-1">
          <span className="sr-only">Your name</span>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Your name"
            autoComplete="nickname"
            autoFocus
            maxLength={32}
            className="min-h-12 w-full rounded-xl border border-white/10 bg-neutral-950 px-4 text-base outline-none transition-colors placeholder:text-neutral-600 focus:border-white/40"
          />
        </label>

        {error && (
          <p className="ytmq-anim-fade text-sm text-accent-300" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="ytmq-press min-h-12 w-full rounded-full bg-accent-600 px-4 text-base font-semibold text-white hover:bg-accent-500"
        >
          Start adding songs
        </button>
      </form>
    </div>
  )
}
