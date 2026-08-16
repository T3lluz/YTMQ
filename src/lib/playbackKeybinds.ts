import { PREV_RESTART_SECONDS, type PlaybackAction } from './playback'

export type PlaybackKeyCommand =
  | { action: 'toggle' | 'next' | 'prev' }
  | { action: 'seek'; position: number }

type KeyLike = {
  key: string
  code?: string
  repeat?: boolean
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
}

/** True when the event target is a field that should keep its own typing keys. */
export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return Boolean(
    target.closest('input, textarea, select, [contenteditable="true"]'),
  )
}

/**
 * Maps a keydown to play/pause, next, or previous. Ignores key-repeat and
 * modifier chords so page shortcuts (e.g. Ctrl+Left) stay intact.
 */
export function playbackActionFromKey(
  event: KeyLike,
): Extract<PlaybackAction, 'toggle' | 'next' | 'prev'> | null {
  if (event.repeat) return null
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return null
  }

  if (event.key === ' ' || event.code === 'Space' || event.key === 'Spacebar') {
    return 'toggle'
  }
  if (event.key === 'ArrowRight') return 'next'
  if (event.key === 'ArrowLeft') return 'prev'
  return null
}

/**
 * Previous-track rule used by both the room keybinds and the YT Music bridge:
 * past the threshold, first press seeks to 0; otherwise go to the prior song.
 */
export function resolvePrevCommand(currentTime: number): PlaybackKeyCommand {
  if (currentTime >= PREV_RESTART_SECONDS) {
    return { action: 'seek', position: 0 }
  }
  return { action: 'prev' }
}

/** Turns a mapped key into the control the bridge should run. */
export function commandForPlaybackKey(
  action: Extract<PlaybackAction, 'toggle' | 'next' | 'prev'>,
  currentTime: number,
): PlaybackKeyCommand {
  if (action === 'prev') return resolvePrevCommand(currentTime)
  return { action }
}

type BindPlaybackKeybindsOptions = {
  getEnabled: () => boolean
  getPosition: () => number
  sendCommand: (command: PlaybackKeyCommand) => void
}

/**
 * Document-level transport keys. Returns an unsubscribe function.
 * Space = play/pause, Right = next, Left = restart-or-previous.
 */
export function bindPlaybackKeybinds({
  getEnabled,
  getPosition,
  sendCommand,
}: BindPlaybackKeybindsOptions): () => void {
  const onKey = (event: KeyboardEvent) => {
    if (!getEnabled()) return
    if (event.defaultPrevented) return
    if (isEditableKeyboardTarget(event.target)) return

    const action = playbackActionFromKey(event)
    if (!action) return

    event.preventDefault()
    sendCommand(commandForPlaybackKey(action, getPosition()))
  }

  document.addEventListener('keydown', onKey)
  return () => document.removeEventListener('keydown', onKey)
}
