import { ytmq } from './api'

export type Participant = {
  client_id: string
  nickname: string
  last_seen: string
  kicked?: boolean
}

export type PresenceStatus = 'ok' | 'kicked' | 'locked' | 'inactive'

/** How recently a participant must have heartbeat to count as "online". */
export const ONLINE_WINDOW_MS = 45_000

export function isOnline(lastSeen: string, now: number = Date.now()): boolean {
  const ts = new Date(lastSeen).getTime()
  if (!Number.isFinite(ts)) return false
  return now - ts <= ONLINE_WINDOW_MS
}

export async function fetchParticipants(roomId: string): Promise<Participant[]> {
  return ytmq.get<Participant[]>(`/rooms/${encodeURIComponent(roomId)}/participants`)
}

export async function touchParticipant(
  roomId: string,
  clientId: string,
  nickname: string,
): Promise<PresenceStatus> {
  const data = await ytmq.rpc('touch_participant', {
    p_room_id: roomId,
    p_client_id: clientId,
    p_nickname: nickname,
  })
  const status = data as string
  if (status === 'kicked' || status === 'locked' || status === 'inactive') {
    return status
  }
  return 'ok'
}

export async function kickParticipant(
  roomId: string,
  hostToken: string,
  clientId: string,
): Promise<boolean> {
  const data = await ytmq.rpc('kick_participant', {
    p_room_id: roomId,
    p_host_token: hostToken,
    p_client_id: clientId,
  })
  return data === true
}

/** Kick every participant whose display name matches (case-insensitive). Returns how many were removed. */
export async function kickByNickname(
  roomId: string,
  hostToken: string,
  nickname: string,
): Promise<number> {
  const data = await ytmq.rpc('kick_by_nickname', {
    p_room_id: roomId,
    p_host_token: hostToken,
    p_nickname: nickname,
  })
  return typeof data === 'number' ? data : 0
}

export async function leaveParticipant(
  roomId: string,
  clientId: string,
): Promise<void> {
  try {
    await ytmq.rpc('leave_participant', {
      p_room_id: roomId,
      p_client_id: clientId,
    })
  } catch {
    /* best-effort on leave */
  }
}
