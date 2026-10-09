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
          className={`mb-1 flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/[0.04] ${
            leaving ? 'ytmq-leaving' : 'ytmq-anim-row'
          }`}
        >
          <div className="relative shrink-0">
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-full ${avatarColor(
                item.client_id,
              )} text-xs font-bold`}
            >
              {initials(item.nickname)}
            </span>
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-neutral-950 ${
                item.online ? 'bg-emerald-400' : 'bg-neutral-600'
              }`}
              title={item.online ? 'Online' : 'Away'}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {item.nickname || 'Guest'}
              {item.isSelf && (
                <span className="ml-1.5 text-xs font-normal text-neutral-500">
                  (you)
                </span>
              )}
            </p>
            <p className="text-xs text-neutral-500">
              {item.online ? 'Listening now' : 'Away'}
            </p>
          </div>
          {onKick && !item.isSelf && (
            <button
              type="button"
              disabled={busyId === item.client_id}
              onClick={() => onKick(item.client_id, item.nickname)}
              className="ytmq-press inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-neutral-300 hover:bg-accent-500/15 hover:text-accent-300 disabled:opacity-40"
              aria-label={`Remove ${item.nickname || 'guest'}`}
            >
              {busyId === item.client_id ? (
                <span className="ytmq-spinner h-3.5 w-3.5" aria-hidden />
              ) : (
                <KickIcon />
              )}
              Kick
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

type ListenersBadgeProps = {
  count: number
  className?: string
}

export function ListenersBadge({ count, className = '' }: ListenersBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1 text-xs font-semibold text-neutral-300 ${className}`}
      aria-label={`${count} listening`}
    >
      <span className="relative flex h-2 w-2">
        {count > 0 && (
          <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-emerald-400/70" />
        )}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${
            count > 0 ? 'bg-emerald-400' : 'bg-neutral-600'
          }`}
        />
      </span>
      {count} listening
    </span>
  )
}
