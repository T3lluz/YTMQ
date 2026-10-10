import { useState } from 'react'
import { lastNickname, rememberNickname } from '../lib/nickname'
import { Button } from './ui/Button'
import { PersonIcon } from './ui/icons'

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
      className="ytmq-anim-fade fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="nickname-prompt-title"
    >
      <form
        onSubmit={handleSubmit}
        className="ytmq-anim-fade-up w-full max-w-sm space-y-5 rounded-[32px] bg-[#1c1c1c] p-6 shadow-2xl shadow-black/60"
      >
        <span className="ytmq-cookie-tile flex h-14 w-14 items-center justify-center bg-accent-600 text-white">
          <PersonIcon className="h-6 w-6" />
        </span>
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
            className="ytmq-input h-12 w-full text-base"
          />
        </label>

        {error && (
          <p className="ytmq-anim-fade text-sm text-accent-300" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end">
          <Button type="submit" variant="accent" size="lg">
            Start adding songs
          </Button>
        </div>
      </form>
    </div>
  )
}
