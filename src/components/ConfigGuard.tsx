import type { ReactNode } from 'react'
import { isSupabaseConfigured } from '../lib/supabase'

export function ConfigGuard({ children }: { children: ReactNode }) {
  if (isSupabaseConfigured) {
    return children
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">YTMQ</h1>
      <p className="text-zinc-400">
        This deployment is missing Supabase environment variables. The app cannot
        connect to the database.
      </p>
      <p className="text-sm text-zinc-500">
        For GitHub Pages, add repository secrets{' '}
        <code className="text-violet-300">VITE_SUPABASE_URL</code> and{' '}
        <code className="text-violet-300">VITE_SUPABASE_ANON_KEY</code>, then
        re-run the deploy workflow.
      </p>
    </main>
  )
}
