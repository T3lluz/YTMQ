export type LobbyApiResult = {
  room_id: string
  code: string
  host_token: string
}

export function getSupabaseEnv() {
  const url = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error(
      'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local.',
    )
  }
  return { url, anonKey }
}

export async function createLobbyViaApi(): Promise<LobbyApiResult> {
  const { url, anonKey } = getSupabaseEnv()

  const res = await fetch(`${url}/rest/v1/rpc/create_room`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
  })

  const data = (await res.json()) as LobbyApiResult & { message?: string }
  if (!res.ok) {
    throw new Error(data.message ?? `create_room failed (${res.status})`)
  }
  if (!data.room_id || !data.code || !data.host_token) {
    throw new Error('create_room returned invalid payload')
  }
  return data
}
