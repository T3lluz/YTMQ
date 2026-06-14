import { useAnimatedList } from '../hooks/useAnimatedList'
import type { PresenceParticipant } from '../hooks/useRoomPresence'

const AVATAR_COLORS = [
  'from-violet-500 to-fuchsia-600',
  'from-sky-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-cyan-500 to-blue-600',
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
      <p className="ytmq-anim-fade rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 px-4 py-6 text-center text-sm text-zinc-500">
        {emptyHint}
      </p>
    )
  }

  return (
    <ul className="flex flex-col">
      {entries.map(({ key, item, leaving }) => (
        <li
          key={key}
          className={`mb-2 flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/70 p-2.5 ${
            leaving ? 'ytmq-leaving' : 'ytmq-anim-row'
          }`}
        >
          <div className="relative shrink-0">
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br ${avatarColor(
                item.client_id,
              )} text-xs font-bold text-white`}
            >
              {initials(item.nickname)}
            </span>
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-zinc-900 ${
                item.online ? 'bg-emerald-400' : 'bg-zinc-600'
              }`}
              title={item.online ? 'Online' : 'Away'}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {item.nickname || 'Guest'}
              {item.isSelf && (
                <span className="ml-1.5 text-xs font-normal text-zinc-500">
                  (you)
                </span>
              )}
            </p>
            <p className="text-xs text-zinc-500">
              {item.online ? 'Listening now' : 'Away'}
            </p>
          </div>
          {onKick && !item.isSelf && (
            <button
              type="button"
              disabled={busyId === item.client_id}
              onClick={() => onKick(item.client_id, item.nickname)}
              className="ytmq-press inline-flex items-center gap-1.5 rounded-lg border border-red-900/60 px-2.5 py-1.5 text-xs font-medium text-red-300 hover:border-red-700 hover:bg-red-950/50 disabled:opacity-40"
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
      className={`inline-flex items-center gap-1.5 rounded-full border border-zinc-700/70 bg-zinc-900/70 px-2.5 py-1 text-xs font-medium text-zinc-300 backdrop-blur ${className}`}
      aria-label={`${count} listening`}
    >
      <span className="relative flex h-2 w-2">
        {count > 0 && (
          <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-emerald-400/70" />
        )}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${
            count > 0 ? 'bg-emerald-400' : 'bg-zinc-600'
          }`}
        />
      </span>
      {count} {count === 1 ? 'listening' : 'listening'}
    </span>
  )
}
