import { useEffect, useState, type ReactNode } from 'react'
import type { PresenceParticipant } from '../../hooks/useRoomPresence'
import type { ToastVariant } from '../../hooks/useToast'
import { kickByNickname, kickParticipant } from '../../lib/participants'
import { getActiveSource, subscribeSources } from '../../lib/playbackChannel'
import type { NowPlayingSource } from '../../lib/playback'
import { setRoomPassword, setRoomSettings, type RoomSettings } from '../../lib/room'
import type { SpotifyPlayerStatus } from '../../lib/spotifyPlayer'
import { ParticipantList } from '../ParticipantList'
import { SharePanel } from '../SharePanel'
import { SpotifyConnect } from '../SpotifyConnect'
import { YtMusicConnect } from '../YtMusicConnect'
import { Button } from '../ui/Button'
import { LockIcon } from '../ui/icons'
import { Section } from '../ui/Section'
import { Switch } from '../ui/Switch'
import { PanelHeader, PanelTitle } from './Panel'

type Toggleable = Pick<RoomSettings, 'locked' | 'allow_guest_add' | 'allow_guest_remove' | 'allow_guest_controls'>

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white/[0.04] ${className}`}>{children}</div>
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
    <label className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3.5">
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold text-white">{title}</span>
        <span className="block text-[13px] leading-snug text-neutral-400">{description}</span>
      </span>
      <Switch checked={checked} disabled={disabled} onChange={onChange} label={title} />
    </label>
  )
}

function useActiveSource(roomId: string) {
  const [source, setSource] = useState<NowPlayingSource | undefined>(() => getActiveSource(roomId))
  useEffect(() => subscribeSources(() => setSource(getActiveSource(roomId))), [roomId])
  return source
}

/** The host's tab: players, sharing, what guests may do, a password, people. */
export function AdminTab({
  roomId,
  code,
  hostToken,
  settings,
  participants,
  onlineCount,
  ending,
  spotifyStatus,
  onToast,
  onEndLobby,
}: {
  roomId: string
  code: string
  hostToken: string
  settings: RoomSettings
  participants: PresenceParticipant[]
  onlineCount: number
  ending: boolean
  spotifyStatus: SpotifyPlayerStatus
  onToast: (message: string, variant?: ToastVariant) => void
  onEndLobby: () => void
}) {
  const active = useActiveSource(roomId)
  const [saving, setSaving] = useState(false)
  const [kickBusyId, setKickBusyId] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  // Toggles flip at once; the server's echo settles them.
  const settingsKey = [settings.locked, settings.allow_guest_add, settings.allow_guest_remove, settings.allow_guest_controls].join('|')
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

  async function apply(patch: Partial<Toggleable>, label: string) {
    const next: Toggleable = { ...draft, ...patch }
    const before = draft
    setDraft(next)
    setSaving(true)
    try {
      const ok = await setRoomSettings(roomId, hostToken, next)
      if (!ok) throw new Error('Not authorised')
      onToast(label, 'success')
    } catch (err) {
      setDraft(before)
      onToast(err instanceof Error ? err.message : 'Could not update settings', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function savePassword(value: string) {
    setSavingPassword(true)
    try {
      const ok = await setRoomPassword(roomId, hostToken, value)
      if (!ok) throw new Error('Not authorised')
      setPassword('')
      onToast(value ? 'Password set. Guests need it to join.' : 'Password removed', value ? 'success' : 'info')
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not change the password', 'error')
    } finally {
      setSavingPassword(false)
    }
  }

  async function kick(clientId: string, nickname: string) {
    setKickBusyId(clientId)
    try {
      const name = nickname.trim()
      if (name) {
        // By name, so every device using it goes.
        const removed = await kickByNickname(roomId, hostToken, name)
        if (removed <= 0) throw new Error('Not authorised')
        onToast(removed > 1 ? `Removed ${name} (${removed})` : `Removed ${name}`, 'info')
      } else {
        const ok = await kickParticipant(roomId, hostToken, clientId)
        if (!ok) throw new Error('Not authorised')
        onToast('Removed guest', 'info')
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not remove them', 'error')
    } finally {
      setKickBusyId(null)
    }
  }

  return (
    <div className="ytmq-tab-panel flex flex-col pb-4">
      <PanelHeader>
        <PanelTitle meta={draft.locked ? 'Locked' : undefined}>Host</PanelTitle>
      </PanelHeader>

      <div className="ytmq-admin-grid grid gap-8 pt-2">
        <div className="flex min-w-0 flex-col gap-8">
          <Section title="Players">
            <div className="flex flex-col gap-3">
              <YtMusicConnect roomId={roomId} active={active === 'ytm'} />
              <SpotifyConnect roomId={roomId} playerStatus={spotifyStatus} active={active === 'spotify'} />
            </div>
            <p className="mt-3 px-1 text-[13px] leading-relaxed text-neutral-500">
              With both linked, the one playing is the lobby&apos;s player: controls and the queue go there.
            </p>
          </Section>

          <Section title="Guests can">
            <Card className="divide-y divide-white/[0.06]">
              <SettingRow
                title="Add songs"
                description="Play next and Add to queue. You always can."
                checked={draft.allow_guest_add}
                disabled={saving}
                onChange={(v) => void apply({ allow_guest_add: v }, v ? 'Guests can add songs' : 'Adding is off for guests')}
              />
              <SettingRow
                title="Remove songs"
                description="Take any song out of the queue."
                checked={draft.allow_guest_remove}
                disabled={saving}
                onChange={(v) => void apply({ allow_guest_remove: v }, v ? 'Guests can remove songs' : 'Removing is off for guests')}
              />
              <SettingRow
                title="Control playback"
                description="Play, pause, skip, seek and shuffle from their phones."
                checked={draft.allow_guest_controls}
                disabled={saving}
                onChange={(v) => void apply({ allow_guest_controls: v }, v ? 'Guests can control playback' : 'Controls are host only')}
              />
            </Card>
          </Section>

          <Section title="Who can join">
            <Card className="divide-y divide-white/[0.06]">
              <SettingRow
                title="Lock the lobby"
                description="Nobody new gets in. People already here stay."
                checked={draft.locked}
                disabled={saving}
                onChange={(v) => void apply({ locked: v }, v ? 'Lobby locked' : 'Lobby unlocked')}
              />
              <form
                className="flex flex-col gap-3 px-4 py-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (password.trim()) void savePassword(password.trim())
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold text-white">Password</span>
                    <span className="block text-[13px] text-neutral-400">
                      {settings.has_password ? 'On. Guests type it once to get in.' : 'Optional. Without one, the code is enough.'}
                    </span>
                  </span>
                  {settings.has_password && (
                    <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 text-[11px] font-bold text-emerald-300">
                      <LockIcon className="h-3 w-3" /> On
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
                    className="ytmq-input h-10 min-w-0 flex-1"
                  />
                  <Button type="submit" variant="primary" loading={savingPassword} disabled={!password.trim()}>
                    Save
                  </Button>
                  {settings.has_password && (
                    <Button variant="ghost" disabled={savingPassword} onClick={() => void savePassword('')}>
                      Remove
                    </Button>
                  )}
                </div>
              </form>
            </Card>
          </Section>
        </div>

        <div className="flex min-w-0 flex-col gap-8">
          <Section title="Invite">
            <Card className="p-5">
              <SharePanel roomId={roomId} code={code} onCopied={(m) => onToast(m, 'info')} layout="row" />
            </Card>
          </Section>

          <Section
            title="People"
            action={<span className="text-[13px] font-semibold text-neutral-500">{onlineCount} here · {participants.length} joined</span>}
          >
            <ParticipantList participants={participants} busyId={kickBusyId} onKick={(id, name) => void kick(id, name)} />
          </Section>

          <Section title="End the lobby">
            <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-neutral-400">
                Deletes the queue and sends everyone out. The extension unlinks YouTube Music.
              </p>
              <Button variant="danger" loading={ending} onClick={onEndLobby}>
                End lobby
              </Button>
            </Card>
          </Section>
        </div>
      </div>
    </div>
  )
}
