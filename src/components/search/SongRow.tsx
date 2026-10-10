import type { MouseEvent, ReactNode } from 'react'
import type { ArtistRef } from '../../lib/catalog'
import { formatDuration } from '../../lib/catalog'
import { ExplicitBadge, SparkleIcon } from '../ui/icons'

/**
 * One song in any list (search, an album, the queue, the history): art or a
 * number, the title with its explicit mark, every artist (each one a link),
 * the album on wide screens, the length, then the row's own buttons.
 * Columns line up between rows because every row uses the same grid; the
 * list sets the `@container` the breakpoints read.
 */
export function SongRow({
  art,
  index,
  title,
  explicit = false,
  smart = false,
  artists,
  onArtist,
  album,
  onAlbum,
  extra,
  duration,
  actions,
  onClick,
  onDoubleClick,
  active = false,
  className = '',
}: {
  art?: string
  /** A track number instead of art (album pages). */
  index?: number
  title: string
  explicit?: boolean
  smart?: boolean
  artists: ArtistRef[] | string
  onArtist?: (artist: ArtistRef) => void
  album?: string | null
  onAlbum?: () => void
  /** A short note after the artists ("added by Mia"). */
  extra?: ReactNode
  duration?: number | null
  actions?: ReactNode
  onClick?: (e: MouseEvent<HTMLDivElement>) => void
  onDoubleClick?: () => void
  active?: boolean
  className?: string
}) {
  const artistList: ArtistRef[] =
    typeof artists === 'string' ? (artists ? [{ id: null, name: artists }] : []) : artists

  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={`ytmq-song-row group/row grid min-h-14 items-center gap-3 rounded-xl px-2 py-1.5 transition-colors ${
        onClick ? 'cursor-pointer' : ''
      } ${active ? 'bg-white/[0.08]' : 'hover:bg-white/[0.06]'} ${className}`}
    >
      {index != null ? (
        <span className="w-6 text-center text-sm font-semibold tabular-nums text-neutral-500">{index}</span>
      ) : (
        <img
          src={art}
          alt=""
          loading="lazy"
          className="h-11 w-11 shrink-0 rounded-md bg-neutral-800 object-cover"
        />
      )}

      <div className="min-w-0">
        <p className={`flex min-w-0 items-center gap-1.5 font-semibold ${active ? 'text-accent-400' : 'text-white'}`}>
          <span className="truncate">{title}</span>
        </p>
        <p className="flex min-w-0 items-center gap-1.5 text-[13px] text-neutral-400">
          {explicit && <ExplicitBadge />}
          {smart && (
            <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-accent-300" title="Picked by smart shuffle">
              <SparkleIcon className="h-3 w-3" />
            </span>
          )}
          <span className="truncate">
            {artistList.map((artist, i) => (
              <span key={`${artist.name}-${i}`}>
                {i > 0 && ', '}
                {artist.id && onArtist ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onArtist(artist)
                    }}
                    className="hover:text-white hover:underline"
                  >
                    {artist.name}
                  </button>
                ) : (
                  artist.name
                )}
              </span>
            ))}
            {extra && <span className="text-neutral-500"> · {extra}</span>}
          </span>
        </p>
      </div>

      <div className="ytmq-song-album min-w-0 text-[13px] text-neutral-400">
        {album &&
          (onAlbum ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onAlbum()
              }}
              className="block max-w-full truncate text-left hover:text-white hover:underline"
            >
              {album}
            </button>
          ) : (
            <span className="block truncate">{album}</span>
          ))}
      </div>

      <span className="ytmq-song-duration w-10 text-right text-[13px] tabular-nums text-neutral-400">
        {formatDuration(duration)}
      </span>

      <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
        {actions}
      </div>
    </div>
  )
}

/** Header over a song list on wide screens: # / Title / Album / ⏱. */
export function SongListHeader({ numbered = false }: { numbered?: boolean }) {
  return (
    <div className="ytmq-song-row ytmq-song-head grid items-center gap-3 border-b border-white/[0.07] px-2 pb-2 text-xs font-semibold text-neutral-500">
      <span className={numbered ? 'w-6 text-center' : 'w-11'}>{numbered ? '#' : ''}</span>
      <span>Title</span>
      <span className="ytmq-song-album">Album</span>
      <span className="ytmq-song-duration w-10 text-right">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ml-auto h-4 w-4" aria-label="Length">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" strokeLinecap="round" />
        </svg>
      </span>
      <span />
    </div>
  )
}
