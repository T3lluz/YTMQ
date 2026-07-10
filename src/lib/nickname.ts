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
