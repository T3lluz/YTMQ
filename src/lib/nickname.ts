/** The host never picks a name — they always show up as HOST. */
export const HOST_NICKNAME = 'HOST'

function nicknameKey(roomId: string) {
  return `ytmq_nickname_${roomId}`
}

export function getNickname(roomId: string): string {
  return sessionStorage.getItem(nicknameKey(roomId)) ?? ''
}

export function setNickname(roomId: string, nickname: string) {
  const trimmed = nickname.trim()
  if (trimmed) {
    sessionStorage.setItem(nicknameKey(roomId), trimmed)
  } else {
    sessionStorage.removeItem(nicknameKey(roomId))
  }
}

const LAST_NICKNAME_KEY = 'ytmq_last_nickname'

/** The name this device used last time, to fill in the next join form. */
export function lastNickname(): string {
  try {
    return localStorage.getItem(LAST_NICKNAME_KEY) ?? ''
  } catch {
    return ''
  }
}

export function rememberNickname(nickname: string) {
  const trimmed = nickname.trim()
  if (!trimmed || trimmed === HOST_NICKNAME) return
  try {
    localStorage.setItem(LAST_NICKNAME_KEY, trimmed)
  } catch {
    /* private mode */
  }
}
