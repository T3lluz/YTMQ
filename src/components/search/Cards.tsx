import type { ReactNode } from 'react'
import {
  artAt,
  artistNames,
  itemSubtitle,
  prefetch,
  trackToQueueInput,
  type CatalogAlbum,
  type CatalogArtist,
  type CatalogItem,
  type CatalogPlaylist,
} from '../../lib/catalog'
import { rememberSearch } from '../../lib/searchStore'
import { ExplicitBadge, PlayNextIcon } from '../ui/icons'
import { Button } from '../ui/Button'
import { albumView, artistView, playlistView, useSearchNav } from './context'
import { AddButton } from './TrackRows'

/** A row of cards that scrolls sideways, like a Spotify shelf. */
export function Shelf({ children }: { children: ReactNode }) {
  return (
    <div className="ytmq-hide-scrollbar -mx-2 flex snap-x snap-mandatory gap-1 overflow-x-auto px-0 pb-1 sm:-mx-3">
      {children}
    </div>
  )
}

/** Album, single, playlist or artist: art on top, two lines under it. */
export function MediaCard({
  item,
  subtitle,
}: {
  item: CatalogAlbum | CatalogPlaylist | CatalogArtist
  subtitle?: string
}) {
  const { open } = useSearchNav()
  const round = item.kind === 'artist'
  const title = item.kind === 'artist' ? item.name : item.title
  const view = item.kind === 'artist' ? artistView(item) : item.kind === 'album' ? albumView(item) : playlistView(item)
  return (
    <button
      type="button"
      onClick={() => {
        if (!view) return
        rememberSearch({ kind: 'item', item })
        open(view)
      }}
      onPointerEnter={() => prefetch(item)}
      className="ytmq-press group w-[9.5rem] shrink-0 snap-start rounded-2xl p-2 text-left transition-colors hover:bg-white/[0.06] sm:w-44 sm:p-3"
    >
      <img
        src={artAt(item.thumbnail, 360)}
        alt=""
        loading="lazy"
        className={`aspect-square w-full bg-neutral-800 object-cover shadow-[0_8px_24px_rgba(0,0,0,0.45)] ${
          round ? 'rounded-full' : 'rounded-xl'
        }`}
      />
      <p className="mt-2.5 flex items-center gap-1.5 truncate text-sm font-bold text-white">
        <span className="truncate">{title}</span>
        {item.kind === 'album' && item.explicit && <ExplicitBadge />}
      </p>
      <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-neutral-400">{subtitle ?? itemSubtitle(item)}</p>
    </button>
  )
}

/** Spotify's big "Top result" tile. */
export function TopResultCard({ item }: { item: CatalogItem }) {
  const { open, adder, nickname } = useSearchNav()
  const round = item.kind === 'artist'
  const title = item.kind === 'artist' ? item.name : item.title

  const go = () => {
    rememberSearch({ kind: 'item', item })
    if (item.kind === 'artist') {
      const v = artistView(item)
      if (v) open(v)
    } else if (item.kind === 'album') {
      const v = albumView(item)
      if (v) open(v)
    } else if (item.kind === 'playlist') open(playlistView(item))
  }

  return (
    <div
      role={item.kind === 'track' ? undefined : 'button'}
      tabIndex={item.kind === 'track' ? undefined : 0}
      onClick={item.kind === 'track' ? undefined : go}
      onKeyDown={(e) => {
        if (item.kind !== 'track' && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          go()
        }
      }}
      onPointerEnter={() => prefetch(item)}
      className={`ytmq-anim-pop relative flex flex-1 flex-row items-center gap-4 overflow-hidden rounded-2xl bg-white/[0.05] p-4 transition-colors hover:bg-white/[0.08] md:min-h-[13.5rem] md:flex-col md:items-stretch md:justify-between md:gap-5 md:p-5 ${
        item.kind === 'track' ? '' : 'cursor-pointer'
      }`}
    >
      <img
        src={artAt(item.thumbnail, 300)}
        alt=""
        className={`h-20 w-20 shrink-0 bg-neutral-800 object-cover shadow-[0_8px_24px_rgba(0,0,0,0.5)] md:h-24 md:w-24 ${round ? 'rounded-full' : 'rounded-lg'}`}
      />
      <div className="min-w-0 flex-1 md:flex-none">
        <p className="line-clamp-2 text-xl font-extrabold leading-[1.1] tracking-[-0.03em] text-white md:text-[1.85rem]">{title}</p>
        <p className="mt-2 flex items-center gap-2 text-sm text-neutral-400">
          {item.kind === 'track' && item.explicit && <ExplicitBadge />}
          <span className="inline-flex h-6 items-center rounded-full bg-black/40 px-2.5 text-xs font-bold text-white">
            {item.kind === 'track' ? (item.video ? 'Video' : 'Song') : item.kind === 'album' ? item.albumType : item.kind === 'artist' ? 'Artist' : 'Playlist'}
          </span>
          <span className="truncate">
            {item.kind === 'track'
              ? artistNames(item.artists)
              : item.kind === 'album'
                ? artistNames(item.artists)
                : item.kind === 'artist'
                  ? item.audience
                  : item.owner}
          </span>
        </p>
      </div>
      {item.kind === 'track' && (
        <div className="md:hidden">
          <AddButton track={item} />
        </div>
      )}
      {item.kind === 'track' && (
        <div className="hidden items-center gap-2 md:flex">
          <Button
            variant="accent"
            size="md"
            icon={<PlayNextIcon className="h-[18px] w-[18px]" />}
            disabled={!adder.canAdd}
            loading={adder.pending.has(item.videoId)}
            onClick={() => {
              rememberSearch({ kind: 'item', item })
              void adder.add(trackToQueueInput(item, nickname, 'play_next'))
            }}
          >
            Play next
          </Button>
          <AddButton track={item} size="lg" />
        </div>
      )}
    </div>
  )
}
