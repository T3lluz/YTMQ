import { useAnimatedList } from '../hooks/useAnimatedList'
import type { PresenceParticipant } from '../hooks/useRoomPresence'

// Flat, muted tones; the name carries the identity, not a gradient.
const AVATAR_COLORS = [
  'bg-[#3b4a6b] text-[#c9d6f5]',
  'bg-[#4a3b2a] text-[#f2d2a9]',
  'bg-[#2f4d3f] text-[#bfe8d2]',
  'bg-[#553040] text-[#f5c6d6]',
  'bg-[#3d3a5c] text-[#d5d1f7]',
  'bg-[#4d4a2a] text-[#ece5a8]',
]

function avatarColor(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function initials(nickname: string) {
  const trimmed = nickname.trim()
  if (!trimmed) return '?'
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function KickIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4"
      aria-hidden
    >
      <path d="M10 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
      <path d="M3 17a6 6 0 0 1 9.5-4.86l-7.36 7.36A5.98 5.98 0 0 1 3 17Z" opacity="0.6" />
      <path
        fillRule="evenodd"
        d="M14.3 12.3a1 1 0 0 1 1.4 0l1.3 1.3 1.3-1.3a1 1 0 1 1 1.4 1.4L18.4 15l1.3 1.3a1 1 0 0 1-1.4 1.4L17 16.4l-1.3 1.3a1 1 0 0 1-1.4-1.4l1.3-1.3-1.3-1.3a1 1 0 0 1 0-1.4Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

type ParticipantListProps = {
  participants: PresenceParticipant[]
  busyId?: string | null
  onKick?: (clientId: string, nickname: string) => void
  emptyHint?: string
}

export function ParticipantList({
  participants,
  busyId,
  onKick,
  emptyHint = 'No one has joined yet. Share the code to invite people.',
}: ParticipantListProps) {
  const entries = useAnimatedList(participants, (p) => p.client_id, 280)

  if (participants.length === 0) {
    return (
      <p className="ytmq-anim-fade rounded-2xl bg-white/[0.03] px-4 py-6 text-center text-sm text-neutral-500">
        {emptyHint}
      </p>
    )
  }

  return (
    <ul className="flex flex-col">
      {entries.map(({ key, item, leaving }) => (
        <li
          key={key}
          className={`flex min-h-14 items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-white/[0.05] ${
            leaving ? 'ytmq-leaving' : 'ytmq-anim-row'
          }`}
        >
          <Avatar participant={item} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-white">
              {item.nickname || 'Guest'}
              {item.isSelf && <span className="ml-1.5 text-xs font-normal text-neutral-500">you</span>}
            </p>
            <p className="text-[13px] text-neutral-400">{item.online ? 'Here now' : 'Away'}</p>
          </div>
          {onKick && !item.isSelf && (
            <button
              type="button"
              disabled={busyId === item.client_id}
              onClick={() => onKick(item.client_id, item.nickname)}
              className="ytmq-press inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-neutral-300 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)] hover:text-accent-300 hover:shadow-[inset_0_0_0_1px_rgba(245,73,47,0.5)] disabled:opacity-40"
              aria-label={`Remove ${item.nickname || 'guest'}`}
            >
              {busyId === item.client_id ? <span className="ytmq-spinner h-3.5 w-3.5" aria-hidden /> : <KickIcon />}
              Remove
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

export function Avatar({
  participant,
  size = 'md',
}: {
  participant: Pick<PresenceParticipant, 'client_id' | 'nickname' | 'online'>
  size?: 'sm' | 'md'
}) {
  const dim = size === 'sm' ? 'h-7 w-7 text-[10px]' : 'h-10 w-10 text-xs'
  return (
    <div className="relative shrink-0">
      <span className={`flex items-center justify-center rounded-full font-bold ${dim} ${avatarColor(participant.client_id)}`}>
        {initials(participant.nickname)}
      </span>
      {size === 'md' && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#121212] ${
            participant.online ? 'bg-emerald-400' : 'bg-neutral-600'
          }`}
          title={participant.online ? 'Online' : 'Away'}
        />
      )}
    </div>
  )
}

/** Up to four faces in a row, then "+3". */
export function AvatarStack({ participants, max = 4 }: { participants: PresenceParticipant[]; max?: number }) {
  const online = participants.filter((p) => p.online)
  const shown = online.slice(0, max)
  return (
    <span className="flex items-center">
      {shown.map((p, i) => (
        <span key={p.client_id} className={`rounded-full ring-2 ring-[#121212] ${i > 0 ? '-ml-2' : ''}`}>
          <Avatar participant={p} size="sm" />
        </span>
      ))}
      {online.length > max && (
        <span className="-ml-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-neutral-700 px-1.5 text-[10px] font-bold text-white ring-2 ring-[#121212]">
          +{online.length - max}
        </span>
      )}
    </span>
  )
}
