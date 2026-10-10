import { artAt, fetchBrowseHome, itemSubtitle, type CatalogItem } from '../../lib/catalog'
import {
  clearRecentSearches,
  forgetSearch,
  rememberSearch,
  setSearchState,
  useRecentSearches,
  type RecentEntry,
} from '../../lib/searchStore'
import { Section, SectionAction } from '../ui/Section'
import { ClockIcon, CloseIcon } from '../ui/icons'
import { MediaCard, Shelf } from './Cards'
import { albumView, artistView, playlistView, useSearchNav } from './context'
import { ListSkeleton } from './Results'
import { TrackList } from './TrackRows'
import { useLoad } from './useLoad'

function RecentRow({ entry }: { entry: RecentEntry }) {
  const { open } = useSearchNav()
  const isQuery = entry.kind === 'query'
  const item = entry.kind === 'item' ? entry.item : null
  const title = isQuery ? entry.q : item!.kind === 'artist' ? item!.name : item!.title
  const go = () => {
    if (isQuery) {
      rememberSearch(entry)
      setSearchState({ query: entry.q, filter: 'all', stack: [] })
      return
    }
    const it = item as CatalogItem
    if (it.kind === 'track') {
      setSearchState({ query: `${it.title} ${it.artists[0]?.name ?? ''}`.trim(), filter: 'all', stack: [] })
      return
    }
    const view = it.kind === 'artist' ? artistView(it) : it.kind === 'album' ? albumView(it) : playlistView(it)
    if (view) open(view)
  }
  return (
    <div className="group flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-white/[0.06]">
      <button type="button" onClick={go} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        {isQuery ? (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-neutral-400">
            <ClockIcon className="h-5 w-5" />
          </span>
        ) : (
          <img
            src={artAt(item!.thumbnail, 120)}
            alt=""
            className={`h-11 w-11 shrink-0 bg-neutral-800 object-cover ${item!.kind === 'artist' ? 'rounded-full' : 'rounded-md'}`}
          />
        )}
        <span className="min-w-0">
          <span className="block truncate font-semibold text-white">{title}</span>
          <span className="block truncate text-[13px] text-neutral-400">{isQuery ? 'Search' : itemSubtitle(item!)}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => forgetSearch(entry)}
        aria-label={`Remove ${title} from recent searches`}
        className="ytmq-press inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-white/[0.08] hover:text-white"
      >
        <CloseIcon className="h-4 w-4" />
      </button>
    </div>
  )
}

/** YouTube Music's tile colours are bright; darken them for white text. */
function tileColor(hex: string) {
  return `color-mix(in srgb, ${hex} 62%, #0a0a0a)`
}

/** What Search shows before anything is typed: recent searches, then browsing. */
export function SearchBrowse() {
  const recent = useRecentSearches()
  const { open } = useSearchNav()
  const { data, error } = useLoad('browse', fetchBrowseHome)

  return (
    <div className="ytmq-anim-fade flex flex-col gap-9">
      {recent.length > 0 && (
        <Section title="Recent searches" action={<SectionAction onClick={clearRecentSearches}>Clear</SectionAction>}>
          <div className="grid gap-x-4 lg:grid-cols-2">
            {recent.slice(0, 8).map((entry, i) => (
              <RecentRow key={i} entry={entry} />
            ))}
          </div>
        </Section>
      )}

      {!data && !error && (
        <Section title="Trending now">
          <ListSkeleton rows={5} />
        </Section>
      )}

      {data && data.trending.length > 0 && (
        <Section title="Trending now">
          <div className="grid gap-x-6 @4xl:grid-cols-2">
            <TrackList tracks={data.trending.slice(0, 5)} showAlbum={false} />
            <TrackList tracks={data.trending.slice(5, 10)} showAlbum={false} />
          </div>
        </Section>
      )}

      {data && data.newReleases.length > 0 && (
        <Section title="New albums and singles">
          <Shelf>
            {data.newReleases.map((album) => (
              <MediaCard key={album.id} item={album} />
            ))}
          </Shelf>
        </Section>
      )}

      {data?.moods.map((group) => (
        <Section key={group.title} title={group.title === 'Moods & moments' ? 'Moods and moments' : group.title}>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
            {group.tiles.map((tile, i) => (
              <button
                key={tile.params}
                type="button"
                onClick={() => open({ kind: 'mood', params: tile.params, title: tile.title, color: tile.color })}
                className="ytmq-press ytmq-mood-tile relative h-[5.5rem] overflow-hidden rounded-2xl p-3.5 text-left"
                style={{ backgroundColor: tileColor(tile.color), ['--tile-turn' as string]: `${(i % 5) * 17 - 30}deg` }}
              >
                <span className="relative z-10 text-[15px] font-extrabold leading-tight tracking-[-0.01em] text-white">
                  {tile.title}
                </span>
                <span aria-hidden className="ytmq-mood-cookie" style={{ backgroundColor: tile.color }} />
              </button>
            ))}
          </div>
        </Section>
      ))}
    </div>
  )
}
