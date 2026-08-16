import { useEffect, useRef } from 'react'
import { sendPlaybackControl, sendPlaybackSeek } from '../lib/bridgeChannel'
import {
  bindPlaybackKeybinds,
  type PlaybackKeyCommand,
} from '../lib/playbackKeybinds'
import { useNowPlaying } from './useNowPlaying'
import { usePlaybackPosition } from './usePlaybackPosition'

type UsePlaybackKeybindsOptions = {
  roomId: string
  /** Host, or guest when the lobby allows playback controls. */
  enabled: boolean
  /** Override used by tests so the hook can run without a live bridge. */
  sendCommand?: (command: PlaybackKeyCommand) => void
  /** Override used by tests to supply a fixed playback position. */
  getPosition?: () => number
}

function dispatchCommand(roomId: string, command: PlaybackKeyCommand): void {
  if (!roomId) return
  if (command.action === 'seek') {
    sendPlaybackSeek(roomId, command.position)
    return
  }
  sendPlaybackControl(roomId, command.action)
}

/**
 * Room-wide transport keys:
 * - Space toggles play / pause
 * - Right arrow skips to the next track
 * - Left arrow restarts the current song after 3s, or goes to the previous
 *   song when pressed again (or in the first 3 seconds)
 */
export function usePlaybackKeybinds({
  roomId,
  enabled,
  sendCommand,
  getPosition,
}: UsePlaybackKeybindsOptions): void {
  const { nowPlaying, stale } = useNowPlaying(roomId)
  const isPlaying = nowPlaying?.state === 'playing'
  const live = Boolean(isPlaying && !stale && nowPlaying)
  const position = usePlaybackPosition(nowPlaying, live)

  const enabledRef = useRef(enabled)
  const sendRef = useRef(sendCommand)
  const positionOverrideRef = useRef(getPosition)
  const positionRef = useRef(position)

  useEffect(() => {
    enabledRef.current = enabled
    sendRef.current = sendCommand
    positionOverrideRef.current = getPosition
    positionRef.current = position
  }, [enabled, sendCommand, getPosition, position])

  useEffect(() => {
    if (!roomId) return

    return bindPlaybackKeybinds({
      getEnabled: () => enabledRef.current,
      getPosition: () => positionOverrideRef.current?.() ?? positionRef.current,
      sendCommand: (command) => {
        if (sendRef.current) {
          sendRef.current(command)
          return
        }
        dispatchCommand(roomId, command)
      },
    })
  }, [roomId])
}
