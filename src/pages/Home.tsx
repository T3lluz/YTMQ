import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SiteFooter, SiteHeader } from '../components/site/SiteChrome'
import { QueuePreview } from '../components/site/QueuePreview'
import { HOST_NICKNAME, setNickname } from '../lib/nickname'
import { createLobby, fetchRoom, roomPath, setHostToken } from '../lib/room'
import { forgetLobby, recentLobbies, rememberLobby, type RecentLobby } from '../lib/recentLobbies'

const CODE_LENGTH = 6

/** Lobbies this device was in that are still running. */
function useLiveRecentLobbies() {
  const [live, setLive] = useState<RecentLobby[]>([])
  useEffect(() => {
    let cancelled = false
    const list = recentLobbies().slice(0, 3)
    void Promise.all(
      list.map((lobby) =>
        fetchRoom(lobby.roomId)
          .then((room) => {
            if (!room) forgetLobby(lobby.roomId)
            return room ? lobby : null
          })
          .catch(() => null),
      ),
    ).then((rows) => {
      if (!cancelled) setLive(rows.filter((r): r is RecentLobby => r !== null))
    })
    return () => {
      cancelled = true
    }
  }, [])
  return live
}

function ArrowRight({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M4 10h12" />
      <path d="m11 5 5 5-5 5" />
    </svg>
  )
}

export function Home() {
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const recent = useLiveRecentLobbies()

  async function handleCreate() {
    setError(null)
    setCreating(true)
    try {
      const { room_id, code: newCode, host_token } = await createLobby()
      setHostToken(room_id, host_token)
      setNickname(room_id, HOST_NICKNAME)
      rememberLobby(room_id, newCode, true)
      navigate(roomPath(room_id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not create the lobby')
    } finally {
      setCreating(false)
    }
  }

  function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    const clean = code.trim().toUpperCase()
    if (clean.length < 4) {
      setError('Codes are 6 characters, like 4F9K2A')
      return
    }
    navigate(`/join?code=${encodeURIComponent(clean)}`)
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-16 lg:pt-16">
        <section className="min-w-0">
          <p className="ytmq-anim-fade-up text-sm font-semibold text-accent-400">
            Shared queue for YouTube Music
          </p>
          <h1
            className="ytmq-anim-fade-up mt-3 text-[2.6rem] font-extrabold leading-[1.02] tracking-[-0.035em] text-white sm:text-6xl"
            style={{ animationDelay: '40ms' }}
          >
            Everyone picks.
            <br />
            One queue plays.
          </h1>
          <p
            className="ytmq-anim-fade-up mt-5 max-w-xl text-lg leading-relaxed text-neutral-400"
            style={{ animationDelay: '80ms' }}
          >
            Friends add songs from their phones and the host&apos;s YouTube Music plays them in
            order. Lyrics and controls show up on every screen. Nobody signs up for anything.
          </p>

          <form
            onSubmit={handleJoin}
            className="ytmq-anim-fade-up mt-8 max-w-md"
            style={{ animationDelay: '120ms' }}
          >
            <label htmlFor="home-code" className="text-sm font-medium text-neutral-300">
              Got a code from the host?
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="home-code"
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, CODE_LENGTH))
                }
                placeholder="4F9K2A"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                inputMode="text"
                aria-label="Lobby code"
                className="min-h-13 w-full min-w-0 rounded-full border border-white/10 bg-neutral-900 px-5 font-mono text-xl font-medium tracking-[0.3em] text-white uppercase outline-none transition-colors placeholder:tracking-[0.3em] placeholder:text-neutral-600 focus:border-white/40"
              />
              <button
                type="submit"
                className="ytmq-press inline-flex min-h-13 shrink-0 items-center gap-2 rounded-full bg-accent-600 px-6 text-base font-semibold text-white hover:bg-accent-500"
              >
                Join
                <ArrowRight />
              </button>
            </div>
          </form>

          <div
            className="ytmq-anim-fade-up mt-6 flex max-w-md flex-wrap items-center gap-x-4 gap-y-3"
            style={{ animationDelay: '160ms' }}
          >
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={creating}
              className="ytmq-press inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-neutral-950 hover:bg-neutral-200 disabled:opacity-60"
            >
              {creating && <span className="ytmq-spinner h-4 w-4" aria-hidden />}
              {creating ? 'Creating…' : 'Host a lobby'}
            </button>
            <Link
              to="/docs/install"
              className="text-sm text-neutral-400 underline decoration-neutral-700 underline-offset-4 transition-colors hover:text-white hover:decoration-neutral-400"
            >
              First time hosting? Two-minute setup
            </Link>
          </div>

          {error && (
            <p className="ytmq-anim-fade mt-4 text-sm text-accent-300" role="alert">
              {error}
            </p>
          )}

          {recent.length > 0 && (
            <section className="ytmq-anim-fade-up mt-10 max-w-md" aria-label="Your lobbies">
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
                Jump back in
              </h2>
              <ul className="mt-3 divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.08] bg-neutral-900/60">
                {recent.map((lobby) => (
                  <li key={lobby.roomId}>
                    <Link
                      to={roomPath(lobby.roomId)}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.04]"
                    >
                      <span className="font-mono text-base font-medium tracking-[0.2em] text-white">
                        {lobby.code}
                      </span>
                      <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] font-semibold text-neutral-300">
                        {lobby.host ? 'You host' : 'Guest'}
                      </span>
                      <span className="ml-auto text-neutral-500">
                        <ArrowRight />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </section>

        <div className="ytmq-anim-fade-up min-w-0" style={{ animationDelay: '140ms' }}>
          <QueuePreview />
        </div>
      </main>

      <section className="border-t border-white/[0.06] bg-neutral-950">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-3">
          {[
            {
              n: '1',
              title: 'Host opens a lobby',
              text: 'On the computer that plays the music. The YTMQ extension links that YouTube Music tab to the lobby.',
              to: '/docs/hosting',
            },
            {
              n: '2',
              title: 'Friends scan the QR',
              text: 'Or type the six-character code at t3lluz.com/ytmq. They pick a name and start searching.',
              to: '/docs/guests',
            },
            {
              n: '3',
              title: 'Songs land in YouTube Music',
              text: 'Play next or add to the end. The host’s YouTube Music queue follows the shared one in real time.',
              to: '/docs/how-it-works',
            },
          ].map((step) => (
            <Link key={step.n} to={step.to} className="group block">
              <span className="font-mono text-sm text-accent-400">0{step.n}</span>
              <h3 className="mt-2 text-lg font-bold text-white">{step.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-neutral-400">{step.text}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-neutral-300 transition-colors group-hover:text-white">
                Read more <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}
