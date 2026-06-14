import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { DEFAULT_ROOM_SETTINGS, type RoomSettings } from '../lib/room'

function settingsKey(s: RoomSettings): string {
  return [
    s.locked,
    s.has_password,
    s.allow_guest_add,
    s.allow_guest_remove,
    s.allow_guest_controls,
  ].join('|')
}

/**
 * Live room settings. Seeds from the value loaded with the room, then keeps it
 * in sync via Realtime so guests react instantly when the host toggles a
 * permission, locks the room, or sets a password.
 */
export function useRoomSettings(
  roomId: string,
  initial?: RoomSettings,
): RoomSettings {
  const [settings, setSettings] = useState<RoomSettings>(
    initial ?? DEFAULT_ROOM_SETTINGS,
  )

  // Seed/refresh from the value loaded with the room when it first arrives or
  // changes (React's "adjust state during render" pattern). Realtime updates
  // take over from there.
  const initialKey = initial ? settingsKey(initial) : ''
  const [seededKey, setSeededKey] = useState(initialKey)
  if (initial && initialKey !== seededKey) {
    setSeededKey(initialKey)
    setSettings(initial)
  }

  useEffect(() => {
    if (!roomId) return

    const channel = supabase
      .channel(`room_settings:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_settings',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const row = payload.new as Partial<RoomSettings> | null
          if (!row) return
          setSettings({
            locked: row.locked === true,
            has_password: row.has_password === true,
            allow_guest_add: row.allow_guest_add !== false,
            allow_guest_remove: row.allow_guest_remove !== false,
            allow_guest_controls: row.allow_guest_controls !== false,
          })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [roomId])

  return settings
}
