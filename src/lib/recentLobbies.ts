/**
 * Lobbies this device was in lately, so the home page can offer a way back
 * after the tab was closed. Only ids and codes; nothing a server needs.
 */

export type RecentLobby = {
  roomId: string
  code: string
  host: boolean
  at: number
}

const KEY = 'ytmq_recent_lobbies'
const MAX = 5
const MAX_AGE_MS = 24 * 60 * 60 * 1000

function read(): RecentLobby[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as RecentLobby[]
    if (!Array.isArray(list)) return []
    return list.filter(
      (l) => l && typeof l.roomId === 'string' && Date.now() - l.at < MAX_AGE_MS,
    )
  } catch {
    return []
  }
}

function write(list: RecentLobby[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
  } catch {
    /* private mode */
  }
}

export function rememberLobby(roomId: string, code: string, host: boolean) {
  const rest = read().filter((l) => l.roomId !== roomId)
  const prev = read().find((l) => l.roomId === roomId)
  write([{ roomId, code, host: host || Boolean(prev?.host), at: Date.now() }, ...rest])
}

export function recentLobbies(): RecentLobby[] {
  return read()
}

export function forgetLobby(roomId: string) {
  write(read().filter((l) => l.roomId !== roomId))
}
