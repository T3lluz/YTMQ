export type LobbyApiResult = {
  room_id: string
  code: string
  host_token: string
}

/** The YTMQ API the e2e tests create lobbies on (the dev server proxies the app to it). */
export function getApiUrl() {
  return (process.env.YTMQ_TEST_API ?? 'http://localhost:8787/ytmq/api').replace(/\/$/, '')
}

export async function createLobbyViaApi(): Promise<LobbyApiResult> {
  const res = await fetch(`${getApiUrl()}/rpc/create_room`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })

  const data = (await res.json()) as LobbyApiResult
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `create_room failed (${res.status})`)
  }
  if (!data.room_id || !data.code || !data.host_token) {
    throw new Error('create_room returned invalid payload')
  }
  return data
}
