import type { AddTrackInput, QueueInsertMode } from '../lib/queue'
import type { QueueItem } from '../lib/queue'
import type { PresenceParticipant } from '../hooks/useRoomPresence'
import type { ToastVariant } from '../hooks/useToast'
import { SharePanel } from './SharePanel'
import { QueueList } from './QueueList'
import { RecentlyPlayed } from './RecentlyPlayed'
import { ParticipantList } from './ParticipantList'
import { YtMusicConnect } from './YtMusicConnect'
import { SpotifyConnect } from './SpotifyConnect'
import { HostAdminPanel } from './HostAdminPanel'
import type { RoomSettings } from '../lib/room'
import type { SpotifyPlayerStatus } from '../lib/spotifyPlayer'

type QueueTabProps = {
  roomId: string
  nickname: string
  items: QueueItem[]
  loading: boolean
  busyId: string | null
  editable: boolean
  allowGuestAdd: boolean
  deskScroll?: string
  onRemove: (id: string) => void
  onAdd: (track: AddTrackInput, mode: QueueInsertMode) => Promise<void>
  onAdded: (title: string, mode: QueueInsertMode) => void
  showGuestRemoveHint: boolean
}

export function QueueTabContent({
  roomId,
  nickname,
  items,
  loading,
  busyId,
  editable,
  allowGuestAdd,
  deskScroll,
  onRemove,
  onAdd,
  onAdded,
  showGuestRemoveHint,
}: QueueTabProps) {
  const queueList = (
    <>
      {showGuestRemoveHint && (
        <p className={`${deskScroll ? 'mb-2 shrink-0' : ''} text-xs text-neutral-500`}>
          The host has disabled removing tracks.
        </p>
      )}
      <QueueList
        items={items}
        loading={loading}
        busyId={busyId}
        editable={editable}
        onRemove={onRemove}
      />
    </>
  )

  const history = (
    <RecentlyPlayed
      roomId={roomId}
      nickname={nickname}
      canAdd={allowGuestAdd}
      onAdd={onAdd}
      onAdded={onAdded}
    />
  )

  if (deskScroll) {
    return (
      <section className="ytmq-tab-panel flex min-h-0 flex-1 flex-col gap-5 lg:grid lg:grid-cols-2 lg:grid-rows-1">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-white">Up next</h2>
            <span className="text-xs font-semibold text-neutral-500">
              {items.length} {items.length === 1 ? 'track' : 'tracks'}
            </span>
          </div>
          <div className={`${deskScroll} pr-1`}>{queueList}</div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className={`${deskScroll} pr-1`}>{history}</div>
        </div>
      </section>
    )
  }

  return (
    <section className="ytmq-tab-panel flex flex-1 flex-col gap-3">
      <h2 className="text-lg font-bold text-white">Up next</h2>
      {queueList}
      {history}
    </section>
  )
}

type RoomMembersProps = {
  nickname: string
  onNicknameChange: (value: string) => void
  participants: PresenceParticipant[]
  onlineCount: number
}

function RoomMembersSection({
  nickname,
  onNicknameChange,
  participants,
  onlineCount,
}: RoomMembersProps) {
  return (
    <>
      <label className="block space-y-1">
        <span className="text-sm font-medium text-neutral-300">Your name</span>
        <input
          type="text"
          value={nickname}
          onChange={(e) => onNicknameChange(e.target.value)}
          placeholder="Your name on the queue"
          maxLength={32}
          className="min-h-11 w-full rounded-xl border border-white/10 bg-neutral-900 px-4 outline-none transition-colors placeholder:text-neutral-600 focus:border-white/40"
        />
      </label>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-bold text-white">In this lobby</h3>
          <span className="shrink-0 text-xs text-neutral-500">{onlineCount} online</span>
        </div>
        <ParticipantList
          participants={participants}
          emptyHint="Just you so far. Share the code or the QR to bring people in."
        />
      </div>
    </>
  )
}

type RoomTabProps = RoomMembersProps & {
  roomId: string
  code: string
  deskScroll?: string
  onCopied: (message: string) => void
}

export function RoomTabContent({
  roomId,
  code,
  deskScroll,
  onCopied,
  ...members
}: RoomTabProps) {
  if (deskScroll) {
    return (
      <section className="ytmq-tab-panel flex min-h-0 flex-1 flex-col">
        <h2 className="mb-4 shrink-0 text-2xl font-extrabold tracking-[-0.02em] text-white">Room</h2>
        <div className={`${deskScroll} pr-1`}>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="min-w-0 space-y-5">
              <RoomMembersSection {...members} />
            </div>
            <div className="min-w-0 rounded-3xl bg-white/[0.04] p-6">
              <SharePanel roomId={roomId} code={code} onCopied={onCopied} />
            </div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="ytmq-tab-panel flex flex-1 flex-col gap-4">
      <h2 className="text-2xl font-extrabold tracking-[-0.02em] text-white">Room</h2>
      <RoomMembersSection {...members} />
      <SharePanel roomId={roomId} code={code} onCopied={onCopied} />
    </section>
  )
}

type AdminTabProps = {
  roomId: string
  hostToken: string
  settings: RoomSettings
  participants: PresenceParticipant[]
  onlineCount: number
  ending: boolean
  deskScroll?: string
  spotifyStatus: SpotifyPlayerStatus
  onToast: (message: string, variant?: ToastVariant) => void
  onEndLobby: () => void
}

export function AdminTabContent({
  roomId,
  hostToken,
  settings,
  participants,
  onlineCount,
  ending,
  deskScroll,
  spotifyStatus,
  onToast,
  onEndLobby,
}: AdminTabProps) {
  const endButton = (
    <button
      type="button"
      disabled={ending}
      onClick={onEndLobby}
      className="ytmq-press inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-accent-500/40 px-5 text-sm font-semibold text-accent-300 hover:bg-accent-500/10 disabled:opacity-60"
    >
      {ending && <span className="ytmq-spinner h-4 w-4" aria-hidden />}
      {ending ? 'Ending…' : 'End the lobby for everyone'}
    </button>
  )

  if (deskScroll) {
    return (
      <section className="ytmq-tab-panel grid min-h-0 flex-1 grid-cols-1 grid-rows-2 gap-6 lg:grid-cols-2 lg:grid-rows-1">
        <div className={`${deskScroll} flex flex-col gap-6 pr-1`}>
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-white">Players</h2>
            <YtMusicConnect roomId={roomId} />
            <SpotifyConnect roomId={roomId} playerStatus={spotifyStatus} />
          </div>
          <HostAdminPanel
            section="controls"
            roomId={roomId}
            hostToken={hostToken}
            settings={settings}
            participants={participants}
            onlineCount={onlineCount}
            onToast={onToast}
          />
          {endButton}
        </div>

        <div className={`${deskScroll} flex flex-col gap-6 pr-1`}>
          <HostAdminPanel
            section="people"
            roomId={roomId}
            hostToken={hostToken}
            settings={settings}
            participants={participants}
            onlineCount={onlineCount}
            onToast={onToast}
          />
        </div>
      </section>
    )
  }

  return (
    <section className="ytmq-tab-panel flex flex-1 flex-col gap-6">
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-white">Players</h2>
        <YtMusicConnect roomId={roomId} />
        <SpotifyConnect roomId={roomId} playerStatus={spotifyStatus} />
      </div>
      <HostAdminPanel
        roomId={roomId}
        hostToken={hostToken}
        settings={settings}
        participants={participants}
        onlineCount={onlineCount}
        onToast={onToast}
      />
      {endButton}
    </section>
  )
}
