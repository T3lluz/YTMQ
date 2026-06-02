import { createClient, type SupabaseClient } from '@supabase/supabase-js'

function readEnv(name: string): string {
  const value = import.meta.env[name]
  if (typeof value !== 'string') return ''
  return value.trim()
}

const supabaseUrl = readEnv('VITE_SUPABASE_URL')
const supabaseAnonKey = readEnv('VITE_SUPABASE_ANON_KEY')

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

let client: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error(
      'YTMQ: Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    )
  }
  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey)
  }
  return client
}

/** Supabase client — only call after checking {@link isSupabaseConfigured}. */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const value = getClient()[prop as keyof SupabaseClient]
    return typeof value === 'function' ? value.bind(getClient()) : value
  },
})
