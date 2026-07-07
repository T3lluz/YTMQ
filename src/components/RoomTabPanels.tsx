import type { AddTrackInput, QueueInsertMode } from '../lib/queue'
import type { QueueItem } from '../lib/queue'
import type { PresenceParticipant } from '../hooks/useRoomPresence'
import type { ToastVariant } from '../hooks/useToast'
import { SharePanel } from './SharePanel'
import { QueueList } from './QueueList'
import { RecentlyPlayed } from './RecentlyPlayed'
import { ParticipantList } from './ParticipantList'
import { YtMusicConnect } from './YtMusicConnect'
import { HostAdminPanel } from './HostAdminPanel'
import type { RoomSettings } from '../lib/room'

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
        <p className={`${deskScroll ? 'mb-2 shrink-0' : ''} text-xs text-zinc-500`}>
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
            <h2 className="text-lg font-semibold">Queue</h2>
            <span className="text-xs text-zinc-500">
              {items.length} {items.length === 1 ? 'track' : 'tracks'}
            </span>
          </div>
          <div className={`${deskScroll} pr-1`}>{queueList}</div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <h2 className="mb-3 shrink-0 text-lg font-semibold">History</h2>
          <div className={`${deskScroll} pr-1`}>{history}</div>
        </div>
      </section>
    )
  }

  return (
    <section className="ytmq-tab-panel flex flex-1 flex-col gap-3">
      <h2 className="text-lg font-semibold">Queue</h2>
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
        <span className="text-sm text-zinc-500">Nickname</span>
        <input
          type="text"
          value={nickname}
          onChange={(e) => onNicknameChange(e.target.value)}
          placeholder="Your name on the queue"
          maxLength={32}
          className="min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 outline-none transition-colors focus:border-violet-500"
        />
      </label>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            In this room
          </h3>
          <span className="shrink-0 text-xs text-zinc-500">{onlineCount} online</span>
        </div>
        <ParticipantList
          participants={participants}
          emptyHint="You're the first one here. Share the code below!"
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
        <h2 className="mb-4 shrink-0 text-lg font-semibold">Room</h2>
        <div className={`${deskScroll} pr-1`}>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="min-w-0 space-y-5">
              <RoomMembersSection {...members} />
            </div>
            <div className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
              <SharePanel roomId={roomId} code={code} onCopied={onCopied} />
            </div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="ytmq-tab-panel flex flex-1 flex-col gap-4">
      <h2 className="text-lg font-semibold">Room</h2>
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
  onToast,
  onEndLobby,
}: AdminTabProps) {
  const endButton = (
    <button
      type="button"
      disabled={ending}
      onClick={onEndLobby}
      className="ytmq-press inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-500/40 px-4 text-sm font-medium text-red-300 hover:bg-red-500/10 disabled:opacity-60"
    >
      {ending && <span className="ytmq-spinner h-4 w-4" aria-hidden />}
      {ending ? 'Ending…' : 'End lobby & delete queue'}
    </button>
  )

  if (deskScroll) {
    return (
      <section className="ytmq-tab-panel grid min-h-0 flex-1 grid-cols-1 grid-rows-2 gap-6 lg:grid-cols-2 lg:grid-rows-1">
        <div className={`${deskScroll} flex flex-col gap-6 pr-1`}>
          <YtMusicConnect roomId={roomId} />
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
      <YtMusicConnect roomId={roomId} />
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
