import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  fetchParticipants,
  isOnline,
  leaveParticipant,
  touchParticipant,
  type Participant,
  type PresenceStatus,
} from '../lib/participants'

const HEARTBEAT_MS = 20_000
const TICK_MS = 15_000

export type PresenceParticipant = Participant & { online: boolean; isSelf: boolean }

type Options = {
  clientId?: string
  nickname?: string
  /** When true, register this client as a participant and heartbeat. */
  heartbeat?: boolean
}

export type RoomPresence = {
  participants: PresenceParticipant[]
  onlineCount: number
  status: PresenceStatus
}

/**
 * Tracks who is in the room (live, via Realtime) and — when `heartbeat` is on —
 * registers this client as a participant, keeping it alive and detecting if the
 * host kicks them or the room becomes locked/inactive.
 */
export function useRoomPresence(
  roomId: string,
  { clientId, nickname = '', heartbeat = false }: Options = {},
): RoomPresence {
  const [participants, setParticipants] = useState<Participant[]>([])
  const [status, setStatus] = useState<PresenceStatus>('ok')
  const [now, setNow] = useState(() => Date.now())

  const nicknameRef = useRef(nickname)
  useEffect(() => {
    nicknameRef.current = nickname
  })

  // Re-evaluate "online" on a timer so people who stop heart­beating fade out.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS)
    return () => window.clearInterval(id)
  }, [])

  // Live participant list.
  useEffect(() => {
    if (!roomId) return
    let cancelled = false

    void fetchParticipants(roomId)
      .then((rows) => {
        if (!cancelled) setParticipants(rows)
      })
      .catch(() => {})

    const channel = supabase
      .channel(`participants:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'participants',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as
            | (Participant & { kicked?: boolean })
            | null
          if (!row?.client_id) return

          // Detect being kicked ourselves.
          if (
            heartbeat &&
            clientId &&
            row.client_id === clientId &&
            (payload.new as { kicked?: boolean } | null)?.kicked === true
          ) {
            setStatus('kicked')
          }

          setParticipants((prev) => {
            const next = prev.filter((p) => p.client_id !== row.client_id)
            if (
              payload.eventType !== 'DELETE' &&
              (payload.new as { kicked?: boolean } | null)?.kicked !== true
            ) {
              next.push(payload.new as Participant)
            }
            return next
          })
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [roomId, heartbeat, clientId])

  // Heartbeat (join + keep-alive).
  useEffect(() => {
    if (!heartbeat || !roomId || !clientId) return
    let cancelled = false

    const beat = () => {
      void touchParticipant(roomId, clientId, nicknameRef.current)
        .then((s) => {
          if (!cancelled && s !== 'ok') setStatus(s)
          else if (!cancelled) setStatus('ok')
        })
        .catch(() => {})
    }

    beat()
    const interval = window.setInterval(beat, HEARTBEAT_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') beat()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      void leaveParticipant(roomId, clientId)
    }
  }, [heartbeat, roomId, clientId])

  // Re-heartbeat promptly when the nickname changes.
  useEffect(() => {
    if (!heartbeat || !roomId || !clientId) return
    void touchParticipant(roomId, clientId, nickname).catch(() => {})
  }, [nickname, heartbeat, roomId, clientId])

  const enriched = useMemo<PresenceParticipant[]>(() => {
    return participants
      .map((p) => ({
        ...p,
        online: isOnline(p.last_seen, now),
        isSelf: Boolean(clientId) && p.client_id === clientId,
      }))
      .sort((a, b) => {
        if (a.online !== b.online) return a.online ? -1 : 1
        return a.nickname.localeCompare(b.nickname)
      })
  }, [participants, now, clientId])

  const onlineCount = useMemo(
    () => enriched.filter((p) => p.online).length,
    [enriched],
  )

  return { participants: enriched, onlineCount, status }
}
