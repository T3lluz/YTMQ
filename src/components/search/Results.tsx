import {
  searchAll,
  searchFiltered,
  type CatalogAlbum,
  type CatalogArtist,
  type CatalogPlaylist,
  type CatalogTrack,
  type SearchFilter,
} from '../../lib/catalog'
import { setSearchState } from '../../lib/searchStore'
import { EmptyState, Section, SectionAction } from '../ui/Section'
import { SearchIcon } from '../ui/icons'
import { MediaCard, Shelf, TopResultCard } from './Cards'
import { TrackList } from './TrackRows'
import { useLoad } from './useLoad'

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-1">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="ytmq-anim-fade flex items-center gap-3 px-2 py-1.5" style={{ animationDelay: `${i * 40}ms` }}>
          <div className="ytmq-skeleton h-11 w-11 shrink-0 rounded-md" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="ytmq-skeleton h-3.5 rounded-full" style={{ width: `${70 - (i % 3) * 12}%` }} />
            <div className="ytmq-skeleton h-3 w-2/5 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

function CardSkeletons({ count = 6, round = false }: { count?: number; round?: boolean }) {
  return (
    <div className="flex gap-1 overflow-hidden">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="w-[9.5rem] shrink-0 p-2 sm:w-44 sm:p-3">
          <div className={`ytmq-skeleton aspect-square w-full ${round ? 'rounded-full' : 'rounded-xl'}`} />
          <div className="ytmq-skeleton mt-3 h-3.5 w-3/4 rounded-full" />
          <div className="ytmq-skeleton mt-2 h-3 w-1/2 rounded-full" />
        </div>
      ))}
    </div>
  )
}

function Failed({ message }: { message: string }) {
  return (
    <EmptyState
      icon={<SearchIcon className="h-6 w-6" />}
      title="Search is not answering"
      hint={`${message}. Try again in a moment.`}
    />
  )
}

function NothingFound({ query }: { query: string }) {
  return (
    <EmptyState
      icon={<SearchIcon className="h-6 w-6" />}
      title={`Nothing found for “${query}”`}
      hint="Check the spelling, or try fewer words, or just the artist."
    />
  )
}

function AllResults({ query }: { query: string }) {
  const { data, error, loading } = useLoad(`all:${query}`, () => searchAll(query))
  if (error) return <Failed message={error} />
  if (loading || !data) {
    return (
      <div className="flex flex-col gap-8">
        <div className="ytmq-results-top grid gap-6">
          <div className="ytmq-skeleton min-h-[13.5rem] rounded-2xl" />
          <ListSkeleton rows={4} />
        </div>
        <CardSkeletons round />
      </div>
    )
  }
  const empty =
    !data.top && !data.tracks.length && !data.artists.length && !data.albums.length && !data.playlists.length
  if (empty) return <NothingFound query={query} />

  const songs = data.tracks.filter((t) => !(data.top?.kind === 'track' && t.videoId === data.top.videoId)).slice(0, 4)
  const more = (filter: SearchFilter) => <SectionAction onClick={() => setSearchState({ filter })}>Show all</SectionAction>

  return (
    <div className="ytmq-anim-fade flex flex-col gap-9">
      <div className="ytmq-results-top grid gap-6">
        {data.top && (
          <Section title="Top result" className="flex flex-col">
            <TopResultCard item={data.top} />
          </Section>
        )}
        {songs.length > 0 && (
          <Section title="Songs" action={more('songs')}>
            <TrackList tracks={songs} showAlbum={false} />
          </Section>
        )}
      </div>
      {data.artists.length > 0 && (
        <Section title="Artists" action={more('artists')}>
          <Shelf>
            {data.artists.slice(0, 10).map((a) => (
              <MediaCard key={a.id} item={a} />
            ))}
          </Shelf>
        </Section>
      )}
      {data.albums.length > 0 && (
        <Section title="Albums" action={more('albums')}>
          <Shelf>
            {data.albums.slice(0, 10).map((a) => (
              <MediaCard key={a.id} item={a} />
            ))}
          </Shelf>
        </Section>
      )}
      {data.playlists.length > 0 && (
        <Section title="Playlists" action={more('playlists')}>
          <Shelf>
            {data.playlists.slice(0, 10).map((p) => (
              <MediaCard key={p.id} item={p} />
            ))}
          </Shelf>
        </Section>
      )}
      {data.videos.length > 0 && (
        <Section title="Videos" action={more('videos')}>
          <TrackList tracks={data.videos.slice(0, 4)} showAlbum={false} />
        </Section>
      )}
    </div>
  )
}

function CardGrid({ items }: { items: (CatalogArtist | CatalogAlbum | CatalogPlaylist)[] }) {
  return (
    <div className="-mx-2 grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] sm:-mx-3 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
      {items.map((item) => (
        <div key={item.id} className="[&>button]:w-full">
          <MediaCard item={item} />
        </div>
      ))}
    </div>
  )
}

function FilteredResults({ query, filter }: { query: string; filter: Exclude<SearchFilter, 'all'> }) {
  const { data, error, loading } = useLoad(`${filter}:${query}`, () => searchFiltered(query, filter))
  if (error) return <Failed message={error} />
  if (loading || !data) {
    return filter === 'songs' || filter === 'videos' ? <ListSkeleton rows={10} /> : <CardSkeletons count={6} round={filter === 'artists'} />
  }
  if (data.length === 0) return <NothingFound query={query} />
  if (filter === 'songs' || filter === 'videos') {
    return (
      <div className="ytmq-anim-fade">
        <TrackList tracks={data as CatalogTrack[]} header={filter === 'songs'} showAlbum={filter === 'songs'} />
      </div>
    )
  }
  return (
    <div className="ytmq-anim-fade">
      <CardGrid items={data as (CatalogArtist | CatalogAlbum | CatalogPlaylist)[]} />
    </div>
  )
}

export function SearchResults({ query, filter }: { query: string; filter: SearchFilter }) {
  return filter === 'all' ? <AllResults query={query} /> : <FilteredResults query={query} filter={filter} />
}
