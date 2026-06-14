/**
 * Stable per-device identity for a room, persisted in localStorage so a guest
 * keeps the same participant identity across reloads. This is what lets the
 * host kick someone and have the kick survive a refresh.
 */
function clientIdKey(roomId: string) {
  return `ytmq_client_${roomId}`
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `c_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

export function getClientId(roomId: string): string {
  const key = clientIdKey(roomId)
  let id: string | null = null
  try {
    id = localStorage.getItem(key)
    if (!id) {
      id = randomId()
      localStorage.setItem(key, id)
    }
  } catch {
    // localStorage unavailable (private mode): fall back to a volatile id.
    id = id || randomId()
  }
  return id
}
