import {
  artAt,
  artistNames,
  trackToQueueInput,
  type CatalogTrack,
} from '../../lib/catalog'
import { rememberSearch } from '../../lib/searchStore'
import { ytMusicWatchUrl } from '../../lib/queue'
import { ActionMenu, type MenuItem } from '../ui/ActionMenu'
import { useActionMenu } from '../ui/useActionMenu'
import {
  AddToQueueIcon,
  AlbumIcon,
  CheckCircleIcon,
  MoreIcon,
  PersonIcon,
  PlayNextIcon,
  PlusCircleIcon,
} from '../ui/icons'
import { useIsDesktop } from '../../hooks/useMediaQuery'
import { albumView, artistView, useSearchNav } from './context'
import { SongListHeader, SongRow } from './SongRow'

/** The round "+" Spotify uses, here for Add to queue; a check once added. */
export function AddButton({ track, size = 'md' }: { track: CatalogTrack; size?: 'md' | 'lg' }) {
  const { adder, nickname } = useSearchNav()
  const busy = adder.pending.has(track.videoId)
  const done = adder.added.has(track.videoId)
  const dim = size === 'lg' ? 'h-12 w-12' : 'h-10 w-10'
  const icon = size === 'lg' ? 'h-7 w-7' : 'h-[22px] w-[22px]'
  return (
    <button
      type="button"
      disabled={!adder.canAdd || busy}
      onClick={(e) => {
        e.stopPropagation()
        rememberSearch({ kind: 'item', item: track })
        void adder.add(trackToQueueInput(track, nickname, 'queue'))
      }}
      aria-label={done ? `Added ${track.title}` : `Add ${track.title} to the queue`}
      title={adder.canAdd ? 'Add to queue' : 'The host turned off adding songs'}
      className={`ytmq-press inline-flex shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${dim} ${
        done ? 'text-accent-400' : 'text-neutral-400 hover:text-white'
      }`}
    >
      {busy ? (
        <span className="ytmq-spinner h-4 w-4" aria-hidden />
      ) : done ? (
        <CheckCircleIcon className={`ytmq-check ${icon}`} />
      ) : (
        <PlusCircleIcon className={icon} />
      )}
    </button>
  )
}

function useTrackMenuItems() {
  const { adder, nickname, open } = useSearchNav()
  return (track: CatalogTrack): MenuItem[] => {
    const items: MenuItem[] = [
      {
        label: 'Play next',
        icon: <PlayNextIcon className="h-5 w-5" />,
        disabled: !adder.canAdd,
        hint: adder.canAdd ? undefined : 'The host turned off adding songs',
        onSelect: () => {
          rememberSearch({ kind: 'item', item: track })
          void adder.add(trackToQueueInput(track, nickname, 'play_next'))
        },
      },
      {
        label: 'Add to queue',
        icon: <AddToQueueIcon className="h-5 w-5" />,
        disabled: !adder.canAdd,
        onSelect: () => {
          rememberSearch({ kind: 'item', item: track })
          void adder.add(trackToQueueInput(track, nickname, 'queue'))
        },
      },
    ]
    for (const artist of track.artists.slice(0, 3)) {
      const view = artistView(artist)
      if (view) items.push({ label: `Go to ${artist.name}`, icon: <PersonIcon className="h-5 w-5" />, onSelect: () => open(view) })
    }
    const album = track.album ? albumView(track.album) : null
    if (album) items.push({ label: 'Go to album', icon: <AlbumIcon className="h-5 w-5" />, onSelect: () => open(album) })
    items.push({
      label: 'Open in YouTube Music',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
          <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
        </svg>
      ),
      onSelect: () => window.open(ytMusicWatchUrl(track.videoId), '_blank', 'noopener'),
    })
    return items
  }
}

/**
 * Songs from the catalog. Tap a row on a phone for its actions; on a
 * desktop the "+" adds and "⋯" opens the rest, and a double click adds.
 */
export function TrackList({
  tracks,
  numbered = false,
  showAlbum = true,
  header = false,
  hideArtistId,
}: {
  tracks: CatalogTrack[]
  numbered?: boolean
  showAlbum?: boolean
  header?: boolean
  /** On an artist's page, their own name is left out of each row. */
  hideArtistId?: string
}) {
  const { adder, nickname, open } = useSearchNav()
  const menu = useActionMenu<CatalogTrack>()
  const menuItems = useTrackMenuItems()
  const desktop = useIsDesktop()

  return (
    <div className="ytmq-song-list">
      {header && <SongListHeader numbered={numbered} />}
      <div className={header ? 'mt-1' : ''}>
        {tracks.map((track, i) => {
          const artists =
            hideArtistId && track.artists.length > 1
              ? track.artists.filter((a) => a.id !== hideArtistId)
              : track.artists
          return (
            <SongRow
              key={`${track.videoId}-${i}`}
              index={numbered ? i + 1 : undefined}
              art={artAt(track.thumbnail, 120)}
              title={track.title}
              explicit={track.explicit}
              artists={artists}
              onArtist={(a) => {
                const view = artistView(a)
                if (view) open(view)
              }}
              album={showAlbum ? track.album?.name : null}
              onAlbum={track.album?.id ? () => open(albumView(track.album!)!) : undefined}
              duration={track.duration}
              active={menu.target?.videoId === track.videoId}
              onClick={(e) => {
                if (desktop) return
                menu.open(track, e.currentTarget)
              }}
              onDoubleClick={() => {
                if (!desktop) return
                void adder.add(trackToQueueInput(track, nickname, 'queue'))
              }}
              actions={
                <>
                  <AddButton track={track} />
                  <button
                    type="button"
                    onClick={(e) => menu.open(track, e.currentTarget)}
                    aria-label={`More for ${track.title}`}
                    title="More"
                    className="ytmq-press inline-flex h-10 w-8 items-center justify-center rounded-full text-neutral-400 hover:text-white"
                  >
                    <MoreIcon className="h-5 w-5" />
                  </button>
                </>
              }
            />
          )
        })}
      </div>
      <ActionMenu
        open={menu.target !== null}
        anchor={menu.anchor}
        header={
          menu.target
            ? {
                title: menu.target.title,
                subtitle: artistNames(menu.target.artists),
                art: artAt(menu.target.thumbnail, 120),
              }
            : undefined
        }
        items={menu.target ? menuItems(menu.target) : []}
        onClose={menu.close}
      />
    </div>
  )
}
