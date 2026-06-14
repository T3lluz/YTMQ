import { supabase } from './supabase'

export type CreateRoomResult = {
  room_id: string
  code: string
  host_token: string
}

export type RoomSettings = {
  locked: boolean
  has_password: boolean
  allow_guest_add: boolean
  allow_guest_remove: boolean
  allow_guest_controls: boolean
}

export type RoomInfo = {
  room_id: string
  code: string
  created_at?: string
  expires_at?: string
} & RoomSettings

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  locked: false,
  has_password: false,
  allow_guest_add: true,
  allow_guest_remove: true,
  allow_guest_controls: true,
}

function pickSettings(data: Record<string, unknown>): RoomSettings {
  return {
    locked: data.locked === true,
    has_password: data.has_password === true,
    allow_guest_add: data.allow_guest_add !== false,
    allow_guest_remove: data.allow_guest_remove !== false,
    allow_guest_controls: data.allow_guest_controls !== false,
  }
}

export type JoinResult =
  | { status: 'ok'; room: { room_id: string; code: string } }
  | { status: 'not_found' }
  | { status: 'locked' }
  | { status: 'password' }

function hostTokenKey(roomId: string) {
  return `ytmq_host_${roomId}`
}

export function setHostToken(roomId: string, token: string) {
  sessionStorage.setItem(hostTokenKey(roomId), token)
}

export function getHostToken(roomId: string): string | null {
  return sessionStorage.getItem(hostTokenKey(roomId))
}

export async function createLobby(): Promise<CreateRoomResult> {
  const { data, error } = await supabase.rpc('create_room')
  if (error) throw error
  if (!data || typeof data !== 'object') {
    throw new Error('Failed to create lobby')
  }
  const result = data as CreateRoomResult
  if (!result.room_id || !result.code || !result.host_token) {
    throw new Error('Invalid create_room response')
  }
  return result
}

export async function joinLobby(
  code: string,
  password?: string,
): Promise<JoinResult> {
  const { data, error } = await supabase.rpc('join_room', {
    p_code: code.trim(),
    p_password: password ?? null,
  })
  if (error) throw error
  if (!data || typeof data !== 'object') {
    return { status: 'not_found' }
  }
  const result = data as Record<string, unknown>
  if (result.error === 'locked') return { status: 'locked' }
  if (result.error === 'password') return { status: 'password' }
  if (typeof result.room_id === 'string' && typeof result.code === 'string') {
    return { status: 'ok', room: { room_id: result.room_id, code: result.code } }
  }
  return { status: 'not_found' }
}

export async function fetchRoom(roomId: string): Promise<RoomInfo | null> {
  const { data, error } = await supabase.rpc('get_room', { p_room_id: roomId })
  if (error) throw error
  if (!data || typeof data !== 'object') return null
  const obj = data as Record<string, unknown>
  if (typeof obj.room_id !== 'string') return null
  return {
    room_id: obj.room_id,
    code: typeof obj.code === 'string' ? obj.code : '',
    created_at: obj.created_at as string | undefined,
    expires_at: obj.expires_at as string | undefined,
    ...pickSettings(obj),
  }
}

export async function verifyRoomPassword(
  roomId: string,
  password: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('verify_room_password', {
    p_room_id: roomId,
    p_password: password,
  })
  if (error) throw error
  return data === true
}

export async function setRoomSettings(
  roomId: string,
  hostToken: string,
  settings: {
    locked: boolean
    allow_guest_add: boolean
    allow_guest_remove: boolean
    allow_guest_controls: boolean
  },
): Promise<boolean> {
  const { data, error } = await supabase.rpc('set_room_settings', {
    p_room_id: roomId,
    p_host_token: hostToken,
    p_locked: settings.locked,
    p_allow_guest_add: settings.allow_guest_add,
    p_allow_guest_remove: settings.allow_guest_remove,
    p_allow_guest_controls: settings.allow_guest_controls,
  })
  if (error) throw error
  return data === true
}

export async function setRoomPassword(
  roomId: string,
  hostToken: string,
  password: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('set_room_password', {
    p_room_id: roomId,
    p_host_token: hostToken,
    p_password: password,
  })
  if (error) throw error
  return data === true
}

export function roomPath(roomId: string) {
  return `/room/${roomId}`
}

export function hostPath(roomId: string) {
  return `/host/${roomId}`
}

export function shareUrl(roomId: string) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  return `${window.location.origin}${base}${roomPath(roomId)}`
}

export async function endLobby(roomId: string, hostToken: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('end_room', {
    p_room_id: roomId,
    p_host_token: hostToken,
  })
  if (error) throw error
  return data === true
}
