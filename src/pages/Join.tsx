import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { YtmqLogo } from '../components/YtmqLogo'
import { lastNickname, rememberNickname, setNickname } from '../lib/nickname'
import { rememberLobby } from '../lib/recentLobbies'
import { joinLobby, roomPath } from '../lib/room'

const field =
  'min-h-12 w-full rounded-xl border border-white/10 bg-neutral-900 px-4 text-base text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-white/40'

export function Join() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [code, setCode] = useState(() => (params.get('code') ?? '').toUpperCase().slice(0, 12))
  const [nickname, setNicknameInput] = useState(lastNickname)
  const [password, setPassword] = useState('')
  const [needsPassword, setNeedsPassword] = useState(false)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmedCode = code.trim()
    const trimmedNickname = nickname.trim()
    if (!trimmedCode) {
      setError('Enter the lobby code')
      return
    }
    if (!trimmedNickname) {
      setError('Pick a name so people know who added what')
      return
    }
    if (needsPassword && !password.trim()) {
      setError('Enter the lobby password')
      return
    }

    setError(null)
    setJoining(true)
    try {
      const result = await joinLobby(trimmedCode, needsPassword ? password : undefined)

      if (result.status === 'ok') {
        setNickname(result.room.room_id, trimmedNickname)
        rememberNickname(trimmedNickname)
        rememberLobby(result.room.room_id, result.room.code, false)
        if (needsPassword) {
          sessionStorage.setItem(`ytmq_access_${result.room.room_id}`, '1')
        }
        navigate(roomPath(result.room.room_id))
        return
      }

      if (result.status === 'password') {
        setNeedsPassword(true)
        setError(password ? 'That password is not right' : null)
        return
      }

      if (result.status === 'locked') {
        setError('The host locked this lobby, so nobody new can join right now.')
        return
      }

      setError('No lobby with that code. It may have ended (lobbies last 24 hours).')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not join the lobby')
    } finally {
      setJoining(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-10 pt-6 sm:px-6">
      <Link
        to="/"
        className="ytmq-press inline-flex w-fit items-center gap-1.5 rounded-full py-1 pr-3 text-sm font-medium text-neutral-400 transition-colors hover:text-white"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
          <path d="M16 10H4" />
          <path d="m9 5-5 5 5 5" />
        </svg>
        Home
      </Link>

      <div className="flex flex-1 flex-col justify-center py-10">
        <header className="ytmq-anim-fade-up">
          <YtmqLogo size={56} className="-ml-1 h-14 w-14" />
          <h1 className="mt-5 text-3xl font-extrabold tracking-[-0.03em] text-white">Join a lobby</h1>
          <p className="mt-2 text-neutral-400">
            The host has the code on their screen, under the QR.
          </p>
        </header>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="ytmq-anim-fade-up mt-8 flex flex-col gap-4"
          style={{ animationDelay: '80ms' }}
        >
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-neutral-300">Lobby code</span>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\s/g, '').toUpperCase())}
              placeholder="4F9K2A"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              autoFocus={!code}
              maxLength={12}
              className={`${field} font-mono text-xl font-medium tracking-[0.3em] uppercase placeholder:tracking-[0.3em]`}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-neutral-300">Your name</span>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNicknameInput(e.target.value)}
              placeholder="Shown next to the songs you add"
              autoComplete="nickname"
              autoFocus={Boolean(code) && !nickname}
              maxLength={32}
              className={field}
            />
          </label>
          {needsPassword && (
            <label className="ytmq-anim-fade-up block space-y-1.5">
              <span className="text-sm font-medium text-neutral-300">Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="The host set one for this lobby"
                autoFocus
                maxLength={64}
                className={field}
              />
            </label>
          )}

          {error && (
            <p className="ytmq-anim-fade rounded-xl bg-accent-500/10 px-4 py-3 text-sm text-accent-200" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={joining}
            className="ytmq-press mt-2 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-accent-600 px-4 text-base font-semibold text-white hover:bg-accent-500 disabled:opacity-60"
          >
            {joining && <span className="ytmq-spinner h-4 w-4" aria-hidden />}
            {joining ? 'Joining…' : 'Join'}
          </button>
        </form>

        <p className="ytmq-anim-fade-up mt-8 text-sm text-neutral-500" style={{ animationDelay: '140ms' }}>
          Scanning the QR does the same thing. No account, nothing to install.{' '}
          <Link to="/docs/guests" className="text-neutral-300 underline decoration-neutral-700 underline-offset-4 hover:text-white">
            How it works for guests
          </Link>
        </p>
      </div>
    </main>
  )
}
