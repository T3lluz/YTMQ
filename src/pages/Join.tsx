import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { YtmqLogo } from '../components/YtmqLogo'
import { CodeInput } from '../components/CodeInput'
import { Button } from '../components/ui/Button'
import { buttonClass } from '../components/ui/buttonStyles'
import { ChevronLeftIcon } from '../components/ui/icons'
import { lastNickname, rememberNickname, setNickname } from '../lib/nickname'
import { rememberLobby } from '../lib/recentLobbies'
import { joinLobby, roomPath } from '../lib/room'

const field = 'ytmq-input h-12 w-full'

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
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-10 pt-4 sm:px-6">
      <Link to="/" className={buttonClass('ghost', 'md', '-ml-3 w-fit')}>
        <ChevronLeftIcon className="h-[18px] w-[18px]" />
        Home
      </Link>

      <div className="flex flex-1 flex-col justify-center py-8">
        <header className="ytmq-anim-fade-up">
          <YtmqLogo size={60} className="-ml-1 h-[60px] w-[60px]" />
          <h1 className="mt-5 text-[2rem] font-extrabold leading-tight tracking-[-0.035em] text-white">Join a lobby</h1>
          <p className="mt-1.5 text-neutral-400">The host has the code on their screen, under the QR.</p>
        </header>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="ytmq-anim-fade-up mt-8 flex flex-col gap-5 rounded-[28px] bg-[#121212] p-5"
          style={{ animationDelay: '80ms' }}
        >
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-bold uppercase tracking-[0.12em] text-neutral-500">Lobby code</span>
            <CodeInput value={code} onChange={setCode} autoFocus={!code} />
          </div>
          <label className="flex flex-col gap-2">
            <span className="text-[13px] font-bold uppercase tracking-[0.12em] text-neutral-500">Your name</span>
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
            <label className="ytmq-anim-fade-up flex flex-col gap-2">
              <span className="text-[13px] font-bold uppercase tracking-[0.12em] text-neutral-500">Password</span>
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
            <p className="ytmq-anim-fade rounded-2xl bg-accent-500/10 px-4 py-3 text-sm text-accent-200" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" variant="accent" size="lg" loading={joining} className="self-end">
            {joining ? 'Joining…' : 'Join lobby'}
          </Button>
        </form>

        <p className="ytmq-anim-fade-up mt-6 px-1 text-sm text-neutral-500" style={{ animationDelay: '140ms' }}>
          Scanning the QR does the same. No account, nothing to install.{' '}
          <Link to="/docs/guests" className="font-semibold text-neutral-300 hover:text-white hover:underline">
            How it works for guests
          </Link>
        </p>
      </div>
    </main>
  )
}
