import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { sendPlaybackControl, sendPlaybackSeek, sendPlaybackVolume } from '../lib/bridgeChannel'
import type { PlaybackAction } from '../lib/playback'
import type { ShuffleState } from '../components/PlaybackControls'
import { useNowPlaying } from './useNowPlaying'
import { usePlaybackPosition } from './usePlaybackPosition'

/**
 * Everything a player surface needs (the rail, the phone's mini player, the
 * lyrics screen): what plays, where it is, and controls that go to the
 * room's active player only.
 */
export function usePlayer(roomId: string, canControl: boolean) {
  const { nowPlaying, connected, stale } = useNowPlaying(roomId)
  const isPlaying = nowPlaying?.state === 'playing'
  const live = Boolean(isPlaying && !stale && nowPlaying)
  const position = usePlaybackPosition(nowPlaying ?? null, live)
  const [pendingAction, setPendingAction] = useState<PlaybackAction | null>(null)
  const timer = useRef<number | null>(null)
  // Shuffle shows the press at once, until the player has had time to report.
  const [shuffleOverride, setShuffleOverride] = useState<'off' | 'on' | 'smart' | null>(null)
  const overrideTimer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
      if (overrideTimer.current !== null) window.clearTimeout(overrideTimer.current)
    },
    [],
  )

  const control = useCallback(
    (action: PlaybackAction, extra: { state?: boolean } = {}) => {
      if (!roomId) return
      sendPlaybackControl(roomId, action, extra)
      setPendingAction(action)
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setPendingAction(null), 700)
    },
    [roomId],
  )

  const seek = useCallback((seconds: number) => roomId && sendPlaybackSeek(roomId, seconds), [roomId])
  const setVolume = useCallback((level: number) => roomId && sendPlaybackVolume(roomId, level), [roomId])

  const source = nowPlaying?.source ?? 'ytm'
  const reported: 'off' | 'on' | 'smart' = nowPlaying?.smartShuffle ? 'smart' : nowPlaying?.shuffle ? 'on' : 'off'
  const mode = shuffleOverride ?? reported
  const shuffle = useMemo<ShuffleState>(
    () => (source === 'spotify' ? { kind: 'cycle', mode } : { kind: 'action' }),
    [source, mode],
  )

  const toggleShuffle = useCallback(() => {
    if (shuffle.kind === 'action') {
      control('shuffle')
      return
    }
    const next = shuffle.mode === 'off' ? 'on' : shuffle.mode === 'on' ? 'smart' : 'off'
    setShuffleOverride(next)
    if (overrideTimer.current !== null) window.clearTimeout(overrideTimer.current)
    overrideTimer.current = window.setTimeout(() => setShuffleOverride(null), 3000)
    if (next === 'on') control('shuffle', { state: true })
    else if (next === 'smart') control('smart_shuffle', { state: true })
    else control('shuffle', { state: false })
  }, [shuffle, control])

  const controlsEnabled = canControl && connected && !stale

  return {
    nowPlaying,
    connected,
    stale,
    live,
    isPlaying,
    position,
    pendingAction,
    control,
    seek,
    setVolume,
    shuffle,
    toggleShuffle,
    controlsEnabled,
  }
}
