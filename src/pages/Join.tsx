import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { setNickname } from '../lib/nickname'
import { joinLobby, roomPath } from '../lib/room'

export function Join() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [nickname, setNicknameInput] = useState('')
  const [password, setPassword] = useState('')
  const [needsPassword, setNeedsPassword] = useState(false)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmedCode = code.trim()
    const trimmedNickname = nickname.trim()
    if (!trimmedCode) {
      setError('Enter a room code')
      return
    }
    if (!trimmedNickname) {
      setError('Enter a nickname')
      return
    }
    if (needsPassword && !password.trim()) {
      setError('Enter the lobby password')
      return
    }

    setError(null)
    setJoining(true)
    try {
      const result = await joinLobby(
        trimmedCode,
        needsPassword ? password : undefined,
      )

      if (result.status === 'ok') {
        setNickname(result.room.room_id, trimmedNickname)
        if (needsPassword) {
          sessionStorage.setItem(`ytmq_access_${result.room.room_id}`, '1')
        }
        navigate(roomPath(result.room.room_id))
        return
      }

      if (result.status === 'password') {
        setNeedsPassword(true)
        setError(password ? 'Wrong password' : null)
        return
      }

      if (result.status === 'locked') {
        setError('This lobby is locked — new people can’t join right now.')
        return
      }

      setError('Lobby not found or expired')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not join lobby')
    } finally {
      setJoining(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-6 p-4 sm:p-6">
      <header className="ytmq-anim-fade-up space-y-2">
        <Link
          to="/"
          className="ytmq-press inline-flex text-sm text-zinc-400 underline underline-offset-2 hover:text-zinc-200"
        >
          ← Back
        </Link>
        <h1 className="text-2xl font-semibold">Join lobby</h1>
        <p className="text-zinc-400">Enter the 6-character code from the host</p>
      </header>

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="ytmq-anim-fade-up flex flex-col gap-3"
        style={{ animationDelay: '100ms' }}
      >
        <label className="block space-y-1">
          <span className="text-sm text-zinc-500">Room code</span>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={12}
            className="min-h-12 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-center font-mono text-xl tracking-widest uppercase outline-none transition-colors focus:border-violet-500"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-zinc-500">Nickname</span>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNicknameInput(e.target.value)}
            placeholder="Your name on the queue"
            autoComplete="nickname"
            maxLength={32}
            className="min-h-12 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 outline-none transition-colors focus:border-violet-500"
          />
        </label>
        {needsPassword && (
          <label className="ytmq-anim-fade-up block space-y-1">
            <span className="text-sm text-zinc-500">Lobby password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Required by the host"
              autoFocus
              maxLength={64}
              className="min-h-12 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 outline-none transition-colors focus:border-violet-500"
            />
          </label>
        )}
        <button
          type="submit"
          disabled={joining}
          className="ytmq-press inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-violet-500 to-violet-700 px-4 text-lg font-medium text-white shadow-lg shadow-violet-900/30 hover:brightness-110 disabled:opacity-60"
        >
          {joining && <span className="ytmq-spinner h-4 w-4" aria-hidden />}
          {joining ? 'Joining…' : 'Join'}
        </button>
      </form>

      {error && (
        <p className="ytmq-anim-fade text-center text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </main>
  )
}
