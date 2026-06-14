import { useState } from 'react'

type NicknamePromptProps = {
  onSubmit: (nickname: string) => void
}

export function NicknamePrompt({ onSubmit }: NicknamePromptProps) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) {
      setError('Enter a nickname')
      return
    }
    setError(null)
    onSubmit(trimmed)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="nickname-prompt-title"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-xl"
      >
        <header className="space-y-1">
          <h2 id="nickname-prompt-title" className="text-xl font-semibold">
            Choose a nickname
          </h2>
          <p className="text-sm text-zinc-400">
            Your name will appear on tracks you add to the queue.
          </p>
        </header>

        <label className="block space-y-1">
          <span className="text-sm text-zinc-500">Nickname</span>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Your name on the queue"
            autoComplete="nickname"
            autoFocus
            maxLength={32}
            className="min-h-12 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 outline-none focus:border-violet-500"
          />
        </label>

        {error && (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="min-h-12 w-full rounded-xl bg-violet-600 px-4 text-lg font-medium text-white active:bg-violet-700"
        >
          Continue
        </button>
      </form>
    </div>
  )
}
