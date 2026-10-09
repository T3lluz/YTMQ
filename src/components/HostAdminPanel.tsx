import { useState } from 'react'
import {
  setRoomPassword,
  setRoomSettings,
  type RoomSettings,
} from '../lib/room'
import type { ToastVariant } from '../hooks/useToast'
import type { PresenceParticipant } from '../hooks/useRoomPresence'
import { kickByNickname, kickParticipant } from '../lib/participants'
import { ParticipantList } from './ParticipantList'

type Toggleable = Pick<
  RoomSettings,
  'locked' | 'allow_guest_add' | 'allow_guest_remove' | 'allow_guest_controls'
>

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        checked ? 'bg-accent-600' : 'bg-white/15'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ease-out ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

function SettingRow({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string
  description: string
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-neutral-100">{title}</p>
        <p className="text-xs text-neutral-500">{description}</p>
      </div>
      <Toggle checked={checked} disabled={disabled} onChange={onChange} />
    </div>
  )
}

type HostAdminPanelProps = {
  roomId: string
  hostToken: string
  settings: RoomSettings
  participants: PresenceParticipant[]
  onlineCount: number
  onToast: (message: string, variant?: ToastVariant) => void
  /**
   * Which slice to render. Desktop splits the panel across two columns
   * (`controls` + `people`); mobile renders everything (`all`).
   */
  section?: 'all' | 'controls' | 'people'
}

export function HostAdminPanel({
  roomId,
  hostToken,
  settings,
  participants,
  onlineCount,
  onToast,
  section = 'all',
}: HostAdminPanelProps) {
  const [saving, setSaving] = useState(false)
  const [kickBusyId, setKickBusyId] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  // Optimistic mirror so toggles feel instant even before Realtime echoes back.
  // Re-sync from live settings using the "adjust state during render" pattern.
  const settingsKey = [
    settings.locked,
    settings.allow_guest_add,
    settings.allow_guest_remove,
    settings.allow_guest_controls,
  ].join('|')
  const [draft, setDraft] = useState<Toggleable>(settings)
  const [syncedKey, setSyncedKey] = useState(settingsKey)
  if (settingsKey !== syncedKey) {
    setSyncedKey(settingsKey)
    setDraft({
      locked: settings.locked,
      allow_guest_add: settings.allow_guest_add,
      allow_guest_remove: settings.allow_guest_remove,
      allow_guest_controls: settings.allow_guest_controls,
    })
  }

  async function applySettings(patch: Partial<Toggleable>, label: string) {
    const next: Toggleable = { ...draft, ...patch }
    setDraft(next)
    setSaving(true)
    try {
      const ok = await setRoomSettings(roomId, hostToken, next)
      if (!ok) throw new Error('Not authorised')
      onToast(label, 'success')
    } catch (err) {
      setDraft(draft)
      onToast(
        err instanceof Error ? err.message : 'Could not update settings',
        'error',
      )
    } finally {
      setSaving(false)
    }
  }

  async function savePassword() {
    const value = password.trim()
    if (!value) return
    setSavingPassword(true)
    try {
      const ok = await setRoomPassword(roomId, hostToken, value)
      if (!ok) throw new Error('Not authorised')
      setPassword('')
      onToast('Password set. Guests need it to join.', 'success')
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : 'Could not set password',
        'error',
      )
    } finally {
      setSavingPassword(false)
    }
  }

  async function clearPassword() {
    setSavingPassword(true)
    try {
      const ok = await setRoomPassword(roomId, hostToken, '')
      if (!ok) throw new Error('Not authorised')
      setPassword('')
      onToast('Password removed', 'info')
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : 'Could not remove password',
        'error',
      )
    } finally {
      setSavingPassword(false)
    }
  }

  async function handleKick(clientId: string, nickname: string) {
    setKickBusyId(clientId)
    try {
      const name = nickname.trim()
      if (name) {
        // Kick by display name so every device using that name is removed.
        const removed = await kickByNickname(roomId, hostToken, name)
        if (removed <= 0) throw new Error('Not authorised')
        onToast(
          removed > 1 ? `Removed ${name} (${removed})` : `Removed ${name}`,
          'info',
        )
      } else {
        const ok = await kickParticipant(roomId, hostToken, clientId)
        if (!ok) throw new Error('Not authorised')
        onToast('Removed guest', 'info')
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not kick', 'error')
    } finally {
      setKickBusyId(null)
    }
  }

  const showControls = section !== 'people'
  const showPeople = section !== 'controls'

  return (
    <section className="space-y-4">
      {showControls && (
        <>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Lobby settings</h2>
        {draft.locked && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-200">
            <LockIcon /> Locked
          </span>
        )}
      </div>

      {/* Session controls */}
      <div className="rounded-2xl bg-white/[0.04] px-4 divide-y divide-white/[0.06]">
        <SettingRow
          title="Lock the lobby"
          description="Nobody new can join. People already in stay."
          checked={draft.locked}
          disabled={saving}
          onChange={(v) =>
            applySettings(
              { locked: v },
              v ? 'Lobby locked' : 'Lobby unlocked',
            )
          }
        />
        <SettingRow
          title="Guests can add songs"
          description="Play next and Add to queue. You can always add."
          checked={draft.allow_guest_add}
          disabled={saving}
          onChange={(v) =>
            applySettings(
              { allow_guest_add: v },
              v ? 'Guests can add songs' : 'Adding disabled for guests',
            )
          }
        />
        <SettingRow
          title="Guests can remove songs"
          description="Anyone can take a song out of the queue."
          checked={draft.allow_guest_remove}
          disabled={saving}
          onChange={(v) =>
            applySettings(
              { allow_guest_remove: v },
              v ? 'Guests can remove songs' : 'Removing disabled for guests',
            )
          }
        />
        <SettingRow
          title="Guests can control playback"
          description="Play, pause, skip and seek from guests' phones."
          checked={draft.allow_guest_controls}
          disabled={saving}
          onChange={(v) =>
            applySettings(
              { allow_guest_controls: v },
              v ? 'Guests can control playback' : 'Playback controls host-only',
            )
          }
        />
      </div>

      {/* Password */}
      <div className="space-y-3 rounded-2xl bg-white/[0.04] p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-neutral-100">Password</p>
            <p className="text-xs text-neutral-500">
              {settings.has_password
                ? 'Guests need it to join.'
                : 'Optional. Without one, the code is enough.'}
            </p>
          </div>
          {settings.has_password && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-200">
              <LockIcon /> On
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={settings.has_password ? 'New password' : 'Set a password'}
            maxLength={64}
            className="min-h-11 min-w-0 flex-1 rounded-full border border-white/10 bg-neutral-950 px-4 text-sm outline-none transition-colors placeholder:text-neutral-600 focus:border-white/40"
          />
          <button
            type="button"
            disabled={savingPassword || !password.trim()}
            onClick={() => void savePassword()}
            className="ytmq-press inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white px-5 text-sm font-bold text-neutral-950 hover:bg-neutral-200 disabled:opacity-40"
          >
            {savingPassword && <span className="ytmq-spinner h-4 w-4" aria-hidden />}
            Save
          </button>
        </div>
        {settings.has_password && (
          <button
            type="button"
            disabled={savingPassword}
            onClick={() => void clearPassword()}
            className="ytmq-press text-xs font-medium text-neutral-400 underline underline-offset-2 hover:text-neutral-200 disabled:opacity-50"
          >
            Remove password
          </button>
        )}
      </div>
        </>
      )}

      {/* Participants */}
      {showPeople && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">People</h2>
            <span className="text-xs text-neutral-500">
              {onlineCount} online · {participants.length} joined
            </span>
          </div>
          <ParticipantList
            participants={participants}
            busyId={kickBusyId}
            onKick={(clientId, nickname) => void handleKick(clientId, nickname)}
          />
        </div>
      )}
    </section>
  )
}

function LockIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden>
      <path
        fillRule="evenodd"
        d="M10 1.5A3.5 3.5 0 0 0 6.5 5v2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-.5V5A3.5 3.5 0 0 0 10 1.5Zm2 5.5V5a2 2 0 1 0-4 0v2h4Z"
        clipRule="evenodd"
      />
    </svg>
  )
}
