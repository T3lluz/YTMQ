import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { YtmqLogo } from '../components/YtmqLogo'
import { setNickname } from '../lib/nickname'
import { createLobby, roomPath, setHostToken } from '../lib/room'

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
      navigate(roomPath(room_id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not create lobby')
    } finally {
      setCreating(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 p-6">
      <header className="ytmq-anim-fade-up space-y-3 text-center">
        <div className="ytmq-anim-pop" style={{ animationDelay: '80ms' }}>
          <YtmqLogo className="mx-auto h-16 w-16 rounded-2xl shadow-lg shadow-violet-900/40" />
        </div>
        <h1 className="bg-gradient-to-br from-white to-zinc-400 bg-clip-text text-4xl font-bold tracking-tight text-transparent">
          YTMQ
        </h1>
        <p className="text-zinc-400">Shared queue for YouTube Music</p>
      </header>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void handleCreate()
        }}
        className="ytmq-anim-fade-up flex flex-col gap-3"
        style={{ animationDelay: '120ms' }}
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
            className="min-h-12 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 outline-none transition-colors focus:border-violet-500"
          />
        </label>
        <button
          type="submit"
          disabled={creating}
          className="ytmq-press inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-violet-500 to-violet-700 px-4 text-lg font-medium text-white shadow-lg shadow-violet-900/30 hover:brightness-110 disabled:opacity-60"
        >
          {creating && <span className="ytmq-spinner h-4 w-4" aria-hidden />}
          {creating ? 'Creating…' : 'Create lobby'}
        </button>
        <Link
          to="/join"
          className="ytmq-press flex min-h-12 items-center justify-center rounded-xl border border-zinc-700 px-4 text-lg font-medium text-zinc-100 hover:border-zinc-600 hover:bg-zinc-900"
        >
          Join with code
        </Link>
      </form>
      {error && (
        <p className="ytmq-anim-fade text-center text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </main>
  )
}
