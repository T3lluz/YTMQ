import { supabase } from './supabase'

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
  const { data, error } = await supabase
    .from('participants')
    .select('client_id, nickname, last_seen, kicked')
    .eq('room_id', roomId)
    .eq('kicked', false)
    .order('last_seen', { ascending: false })
  if (error) throw error
  return (data ?? []) as Participant[]
}

export async function touchParticipant(
  roomId: string,
  clientId: string,
  nickname: string,
): Promise<PresenceStatus> {
  const { data, error } = await supabase.rpc('touch_participant', {
    p_room_id: roomId,
    p_client_id: clientId,
    p_nickname: nickname,
  })
  if (error) throw error
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
  const { data, error } = await supabase.rpc('kick_participant', {
    p_room_id: roomId,
    p_host_token: hostToken,
    p_client_id: clientId,
  })
  if (error) throw error
  return data === true
}

export async function leaveParticipant(
  roomId: string,
  clientId: string,
): Promise<void> {
  try {
    await supabase.rpc('leave_participant', {
      p_room_id: roomId,
      p_client_id: clientId,
    })
  } catch {
    /* best-effort on leave */
  }
}
