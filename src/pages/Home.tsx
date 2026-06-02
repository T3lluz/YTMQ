import { Link } from 'react-router-dom'

export function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 p-6">
      <header className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">YTMQ</h1>
        <p className="text-zinc-400">Shared queue for YouTube Music</p>
      </header>
      <div className="flex flex-col gap-3">
        <button
          type="button"
          className="min-h-12 rounded-xl bg-violet-600 px-4 text-lg font-medium text-white active:bg-violet-700"
        >
          Create lobby
        </button>
        <Link
          to="/join"
          className="flex min-h-12 items-center justify-center rounded-xl border border-zinc-700 px-4 text-lg font-medium text-zinc-100 active:bg-zinc-900"
        >
          Join with code
        </Link>
      </div>
    </main>
  )
}
