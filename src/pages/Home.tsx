import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { setNickname } from '../lib/nickname'
import { createLobby, hostPath, setHostToken } from '../lib/room'

export function Home() {
  const navigate = useNavigate()
  const [nickname, setNicknameInput] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    const trimmedNickname = nickname.trim()
    if (!trimmedNickname) {
      setError('Enter a nickname')
      return
    }

    setError(null)
    setCreating(true)
    try {
      const { room_id, host_token } = await createLobby()
      setHostToken(room_id, host_token)
      setNickname(room_id, trimmedNickname)
      navigate(hostPath(room_id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not create lobby')
    } finally {
      setCreating(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 p-6">
      <header className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">YTMQ</h1>
        <p className="text-zinc-400">Shared queue for YouTube Music</p>
      </header>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void handleCreate()
        }}
        className="flex flex-col gap-3"
      >
        <label className="block space-y-1">
          <span className="text-sm text-zinc-500">Nickname</span>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNicknameInput(e.target.value)}
            placeholder="Your name on the queue"
            autoComplete="nickname"
            maxLength={32}
            className="min-h-12 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 outline-none focus:border-violet-500"
          />
        </label>
        <button
          type="submit"
          disabled={creating}
          className="min-h-12 rounded-xl bg-violet-600 px-4 text-lg font-medium text-white active:bg-violet-700 disabled:opacity-60"
        >
          {creating ? 'Creating…' : 'Create lobby'}
        </button>
        <Link
          to="/join"
          className="flex min-h-12 items-center justify-center rounded-xl border border-zinc-700 px-4 text-lg font-medium text-zinc-100 active:bg-zinc-900"
        >
          Join with code
        </Link>
      </form>
      {error && (
        <p className="text-center text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </main>
  )
}
