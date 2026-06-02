import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createLobby, hostPath, setHostToken } from '../lib/room'

export function Home() {
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    setError(null)
    setCreating(true)
    try {
      const { room_id, host_token } = await createLobby()
      setHostToken(room_id, host_token)
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
      <div className="flex flex-col gap-3">
        <button
          type="button"
          disabled={creating}
          onClick={() => void handleCreate()}
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
      </div>
      {error && (
        <p className="text-center text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </main>
  )
}
