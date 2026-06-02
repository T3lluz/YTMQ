import { supabase } from './supabase'

export type CreateRoomResult = {
  room_id: string
  code: string
  host_token: string
}

export type RoomInfo = {
  room_id: string
  code: string
  created_at?: string
  expires_at?: string
}

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

export async function joinLobby(code: string): Promise<RoomInfo> {
  const { data, error } = await supabase.rpc('join_room', {
    p_code: code.trim(),
  })
  if (error) throw error
  if (!data || typeof data !== 'object') {
    throw new Error('Lobby not found or expired')
  }
  const result = data as RoomInfo
  if (!result.room_id) {
    throw new Error('Lobby not found or expired')
  }
  return result
}

export async function fetchRoom(roomId: string): Promise<RoomInfo | null> {
  const { data, error } = await supabase.rpc('get_room', { p_room_id: roomId })
  if (error) throw error
  if (!data) return null
  return data as RoomInfo
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
