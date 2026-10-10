import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SiteFooter, SiteHeader } from '../components/site/SiteChrome'
import { QueuePreview } from '../components/site/QueuePreview'
import { CodeInput } from '../components/CodeInput'
import { Button } from '../components/ui/Button'
import { buttonClass } from '../components/ui/buttonStyles'
import { ArrowRightIcon, MusicNoteIcon, SearchIcon, SmartShuffleIcon } from '../components/ui/icons'
import { SpotifyIcon, YouTubeMusicIcon } from '../components/ui/brands'
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

function Feature({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-[24px] bg-[#121212] p-6">
      <span className="ytmq-cookie-tile flex h-14 w-14 items-center justify-center bg-white/[0.07] text-white">{icon}</span>
      <div>
        <h3 className="text-lg font-extrabold tracking-[-0.02em] text-white">{title}</h3>
        <p className="mt-1.5 text-[15px] leading-relaxed text-neutral-400">{children}</p>
      </div>
    </div>
  )
}

export function Home() {
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [shake, setShake] = useState(0)
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
    if (clean.length < CODE_LENGTH) {
      setError('Codes are 6 letters and numbers, like 4F9K2A')
      setShake((n) => n + 1)
      return
    }
    navigate(`/join?code=${encodeURIComponent(clean)}`)
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-4 pb-16 pt-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] lg:gap-16 lg:pt-14">
        <section className="min-w-0">
          <p className="ytmq-anim-fade-up inline-flex h-8 items-center gap-2 rounded-full bg-white/[0.06] pl-1.5 pr-3.5 text-[13px] font-semibold text-neutral-200">
            <YouTubeMusicIcon className="h-5 w-5" />
            <SpotifyIcon className="-ml-3 h-5 w-5 ring-2 ring-[#1a1a1a] rounded-full" />
            One queue for YouTube Music or Spotify
          </p>
          <h1
            className="ytmq-anim-fade-up mt-5 text-[2.9rem] font-extrabold leading-[0.98] tracking-[-0.045em] text-white sm:text-[4.4rem]"
            style={{ animationDelay: '40ms' }}
          >
            Everyone picks.
            <br />
            <span className="text-accent-500">One queue</span> plays.
          </h1>
          <p
            className="ytmq-anim-fade-up mt-5 max-w-xl text-lg leading-relaxed text-neutral-400"
            style={{ animationDelay: '80ms' }}
          >
            Friends search and add songs from their phones. The host&apos;s player takes them in order, with
            lyrics and controls on every screen. Nobody signs up for anything.
          </p>

          <form
            onSubmit={handleJoin}
            className="ytmq-anim-fade-up mt-9 max-w-md rounded-[28px] bg-[#121212] p-5"
            style={{ animationDelay: '120ms' }}
          >
            <label htmlFor="home-code" className="text-[13px] font-bold uppercase tracking-[0.12em] text-neutral-500">
              Join with a code
            </label>
            <div className="mt-3">
              <CodeInput
                key={shake}
                id="home-code"
                value={code}
                onChange={(v) => {
                  setCode(v)
                  setError(null)
                }}
                invalid={shake > 0}
              />
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="min-w-0 text-[13px] text-neutral-500">Or scan the QR on the host&apos;s screen.</span>
              <Button type="submit" variant="accent" size="lg" disabled={code.length < CODE_LENGTH}>
                Join
                <ArrowRightIcon className="h-[18px] w-[18px]" />
              </Button>
            </div>
          </form>

          <div className="ytmq-anim-fade-up mt-6 flex max-w-md flex-wrap items-center gap-3" style={{ animationDelay: '160ms' }}>
            <Button variant="primary" size="lg" loading={creating} onClick={() => void handleCreate()}>
              {creating ? 'Starting…' : 'Host a lobby'}
            </Button>
            <Link to="/docs/install" className={buttonClass('ghost', 'lg')}>
              First time? Set up in two minutes
            </Link>
          </div>

          {error && (
            <p className="ytmq-anim-fade mt-4 text-sm text-accent-300" role="alert">
              {error}
            </p>
          )}

          {recent.length > 0 && (
            <section className="ytmq-anim-fade-up mt-10 max-w-md" aria-label="Your lobbies">
              <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-neutral-500">Jump back in</h2>
              <ul className="mt-3 flex flex-col gap-1">
                {recent.map((lobby) => (
                  <li key={lobby.roomId}>
                    <Link
                      to={roomPath(lobby.roomId)}
                      className="group flex h-14 items-center gap-3 rounded-2xl bg-white/[0.04] px-4 transition-colors hover:bg-white/[0.08]"
                    >
                      <span className="font-mono text-base font-semibold tracking-[0.2em] text-white">{lobby.code}</span>
                      <span
                        className={`inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-bold ${
                          lobby.host ? 'bg-accent-500/15 text-accent-300' : 'bg-white/[0.07] text-neutral-300'
                        }`}
                      >
                        {lobby.host ? 'You host' : 'Guest'}
                      </span>
                      <ArrowRightIcon className="ml-auto h-4 w-4 text-neutral-500 transition-transform group-hover:translate-x-0.5 group-hover:text-white" />
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

      <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Feature icon={<SearchIcon className="h-6 w-6" />} title="Search that finds it">
            Songs with every artist on them, albums, artist pages and playlists, ranked the way you expect.
          </Feature>
          <Feature
            icon={
              <span className="flex">
                <YouTubeMusicIcon className="h-6 w-6" />
                <SpotifyIcon className="-ml-2 h-6 w-6" />
              </span>
            }
            title="Your player, either one"
          >
            The queue plays on YouTube Music or Spotify, whichever the host has going.
          </Feature>
          <Feature icon={<MusicNoteIcon className="h-6 w-6" />} title="Lyrics, word by word">
            Synced lyrics on every phone, lit up word by word for songs that have the timing.
          </Feature>
          <Feature icon={<SmartShuffleIcon className="h-6 w-6" />} title="Smart shuffle">
            When the queue runs low, YTMQ slips in songs like the one playing. Anyone can take them out.
          </Feature>
        </div>
      </section>

      <section className="border-t border-white/[0.06]">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-3">
          {[
            {
              n: '1',
              title: 'Host opens a lobby',
              text: 'On the computer that plays the music. The YTMQ extension links YouTube Music; Spotify is a login.',
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
              title: 'The queue plays',
              text: 'Play next or add to the end. The host’s player follows the shared queue as it changes.',
              to: '/docs/how-it-works',
            },
          ].map((step) => (
            <Link key={step.n} to={step.to} className="group flex gap-4">
              <span className="ytmq-cookie-tile flex h-12 w-12 shrink-0 items-center justify-center bg-accent-600 text-lg font-extrabold text-white">
                {step.n}
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-extrabold tracking-[-0.02em] text-white">{step.title}</span>
                <span className="mt-1 block text-[15px] leading-relaxed text-neutral-400">{step.text}</span>
                <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-neutral-300 transition-colors group-hover:text-white">
                  Read more <ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}
