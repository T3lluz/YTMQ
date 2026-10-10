import { useState } from 'react'
import {
  artAt,
  fetchAlbumPage,
  fetchArtistPage,
  fetchMood,
  fetchPlaylistPage,
  trackToQueueInput,
  type CatalogTrack,
} from '../../lib/catalog'
import type { SearchView } from '../../lib/searchStore'
import { Button } from '../ui/Button'
import { Chip, ChipRow } from '../ui/Chip'
import { AddToQueueIcon, ExplicitBadge, MusicNoteIcon, PlayNextIcon } from '../ui/icons'
import { EmptyState, Section, SectionAction } from '../ui/Section'
import { MediaCard, Shelf } from './Cards'
import { artistView, useSearchNav } from './context'
import { ListSkeleton } from './Results'
import { TrackList } from './TrackRows'
import { useLoad } from './useLoad'

function PageError({ message }: { message: string }) {
  return <EmptyState icon={<MusicNoteIcon className="h-6 w-6" />} title="Could not open this" hint={message} />
}

/** Add a set of songs; the host may have turned adding off. */
function AddAllButtons({ tracks, label }: { tracks: CatalogTrack[]; label: string }) {
  const { adder, nickname } = useSearchNav()
  const [busy, setBusy] = useState<'play_next' | 'queue' | null>(null)
  const playable = tracks.slice(0, 50)
  const run = async (mode: 'play_next' | 'queue') => {
    setBusy(mode)
    try {
      await adder.addMany(playable.map((t) => trackToQueueInput(t, nickname, mode)))
    } finally {
      setBusy(null)
    }
  }
  if (playable.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="accent"
        icon={<PlayNextIcon className="h-[18px] w-[18px]" />}
        disabled={!adder.canAdd || busy !== null}
        loading={busy === 'play_next'}
        onClick={() => void run('play_next')}
        title={`Play ${label} next`}
      >
        Play next
      </Button>
      <Button
        variant="tonal"
        icon={<AddToQueueIcon className="h-[18px] w-[18px]" />}
        disabled={!adder.canAdd || busy !== null}
        loading={busy === 'queue'}
        onClick={() => void run('queue')}
      >
        Add {playable.length === 1 ? 'song' : `all ${playable.length}`}
      </Button>
    </div>
  )
}

function HeaderSkeleton({ round = false }: { round?: boolean }) {
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
      <div className={`ytmq-skeleton h-44 w-44 shrink-0 ${round ? 'rounded-full' : 'rounded-2xl'}`} />
      <div className="flex flex-1 flex-col gap-3">
        <div className="ytmq-skeleton h-3 w-20 rounded-full" />
        <div className="ytmq-skeleton h-10 w-3/4 rounded-xl" />
        <div className="ytmq-skeleton h-3 w-1/3 rounded-full" />
      </div>
    </div>
  )
}

export function ArtistView({ view }: { view: Extract<SearchView, { kind: 'artist' }> }) {
  const { data, error } = useLoad(`artist:${view.id}`, () => fetchArtistPage(view.id))
  const [showAll, setShowAll] = useState(false)
  const [disc, setDisc] = useState<'albums' | 'singles'>('albums')
  const all = useLoad(showAll && data?.allTracksId ? `all:${data.allTracksId}` : null, () =>
    fetchPlaylistPage(data!.allTracksId!),
  )

  if (error) return <PageError message={error} />
  const name = data?.name ?? view.name ?? ''
  const banner = data?.banner || ''
  const popular = showAll && all.data ? all.data.tracks.slice(0, 30) : (data?.topTracks ?? []).slice(0, 5)
  const discography = disc === 'albums' ? (data?.albums ?? []) : (data?.singles ?? [])

  return (
    <div className="flex flex-col gap-9">
      <header className="ytmq-artist-hero relative -mx-4 overflow-hidden px-4 pb-6 pt-28 md:-mx-6 md:px-6 sm:pt-36">
        {banner ? (
          <img src={banner} alt="" className="absolute inset-0 h-full w-full object-cover object-[center_25%]" />
        ) : (
          view.thumbnail && <img src={artAt(view.thumbnail, 544)} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl" />
        )}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/30 to-[var(--panel-bg)]" />
        <div className="relative">
          <h1 className="text-[2.6rem] font-extrabold leading-[0.95] tracking-[-0.04em] text-white drop-shadow-[0_2px_18px_rgba(0,0,0,0.45)] sm:text-6xl xl:text-7xl">
            {name || <span className="ytmq-skeleton inline-block h-12 w-64 rounded-xl" />}
          </h1>
          <p className="mt-3 text-sm font-semibold text-white/80">
            {data ? [data.audience, data.subscribers ? `${data.subscribers} subscribers` : null].filter(Boolean).join(' · ') : ' '}
          </p>
        </div>
      </header>

      {!data ? (
        <ListSkeleton rows={5} />
      ) : (
        <>
          <Section title="Popular" action={<AddAllButtons tracks={popular} label={`${name}'s popular songs`} />}>
            {showAll && all.loading ? <ListSkeleton rows={8} /> : <TrackList tracks={popular} numbered hideArtistId={data.id} />}
            {data.allTracksId && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="mt-2 px-2 text-[13px] font-bold text-neutral-400 hover:text-white"
              >
                {showAll ? 'Show less' : 'See more'}
              </button>
            )}
          </Section>

          {(data.albums.length > 0 || data.singles.length > 0) && (
            <Section title="Discography">
              <div className="mb-3">
                <ChipRow label="Discography">
                  {data.albums.length > 0 && (
                    <Chip selected={disc === 'albums'} onClick={() => setDisc('albums')}>
                      Albums
                    </Chip>
                  )}
                  {data.singles.length > 0 && (
                    <Chip selected={disc === 'singles' || data.albums.length === 0} onClick={() => setDisc('singles')}>
                      Singles and EPs
                    </Chip>
                  )}
                </ChipRow>
              </div>
              <Shelf>
                {(discography.length ? discography : data.singles).map((album) => (
                  <MediaCard key={album.id} item={album} subtitle={[album.year, album.albumType].filter(Boolean).join(' · ')} />
                ))}
              </Shelf>
            </Section>
          )}

          {data.related.length > 0 && (
            <Section title="Fans also like">
              <Shelf>
                {data.related.map((artist) => (
                  <MediaCard key={artist.id} item={artist} />
                ))}
              </Shelf>
            </Section>
          )}

          {data.featuredOn.length > 0 && (
            <Section title={`Featuring ${name}`}>
              <Shelf>
                {data.featuredOn.map((p) => (
                  <MediaCard key={p.id} item={p} />
                ))}
              </Shelf>
            </Section>
          )}

          {data.videos.length > 0 && (
            <Section title="Music videos">
              <TrackList tracks={data.videos.slice(0, 6)} showAlbum={false} />
            </Section>
          )}

          {data.description && (
            <Section title="About">
              <p className="max-w-3xl whitespace-pre-line rounded-2xl bg-white/[0.04] p-5 text-sm leading-relaxed text-neutral-300">
                {data.description}
              </p>
            </Section>
          )}
        </>
      )}

      {data && data.related.length === 0 && data.topTracks.length === 0 && (
        <EmptyState icon={<MusicNoteIcon className="h-6 w-6" />} title="Nothing here yet" hint="YouTube Music has no songs listed for this artist." />
      )}
    </div>
  )
}

export function CollectionView({ view }: { view: Extract<SearchView, { kind: 'album' | 'playlist' }> }) {
  const { open } = useSearchNav()
  const album = useLoad(view.kind === 'album' ? `album:${view.id}` : null, () => fetchAlbumPage(view.id))
  const playlist = useLoad(view.kind === 'playlist' ? `playlist:${view.id}` : null, () => fetchPlaylistPage(view.id))
  const error = album.error ?? playlist.error
  if (error) return <PageError message={error} />

  const a = album.data
  const p = playlist.data
  const loaded = view.kind === 'album' ? a : p
  const title = a?.title ?? p?.title ?? view.title ?? ''
  const art = a?.thumbnail ?? p?.thumbnail ?? view.thumbnail ?? ''
  const tracks = a?.tracks ?? p?.tracks ?? []

  return (
    <div className="flex flex-col gap-8">
      {!loaded && !title ? (
        <HeaderSkeleton />
      ) : (
        <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:gap-6">
          {art ? (
            <img
              src={artAt(art, 544)}
              alt=""
              className="mx-auto h-48 w-48 shrink-0 rounded-2xl bg-neutral-800 object-cover shadow-[0_18px_50px_rgba(0,0,0,0.55)] sm:mx-0 sm:h-52 sm:w-52 xl:h-60 xl:w-60"
            />
          ) : (
            <div className="ytmq-skeleton mx-auto h-48 w-48 shrink-0 rounded-2xl sm:mx-0 sm:h-52 sm:w-52" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-neutral-400">
              {view.kind === 'album' ? (a?.albumType ?? 'Album') : 'Playlist'}
            </p>
            <h1 className="mt-1.5 line-clamp-3 text-[2rem] font-extrabold leading-[1.02] tracking-[-0.035em] text-white sm:text-5xl">
              {title}
            </h1>
            <p className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-neutral-300">
              {a?.explicit && <ExplicitBadge />}
              {a &&
                a.artists.map((artist, i) => (
                  <span key={`${artist.name}-${i}`} className="font-bold text-white">
                    {i > 0 && <span className="font-normal text-neutral-400">, </span>}
                    {artist.id ? (
                      <button
                        type="button"
                        onClick={() => {
                          const v = artistView(artist)
                          if (v) open(v)
                        }}
                        className="hover:underline"
                      >
                        {artist.name}
                      </button>
                    ) : (
                      artist.name
                    )}
                  </span>
                ))}
              {p?.owner && <span className="font-bold text-white">{p.owner}</span>}
              {[a?.year, a?.summary ?? p?.summary].filter(Boolean).map((part) => (
                <span key={part} className="text-neutral-400">
                  · {part}
                </span>
              ))}
            </p>
            <div className="mt-5">
              <AddAllButtons tracks={tracks} label={title} />
            </div>
          </div>
        </header>
      )}

      {!loaded ? (
        <ListSkeleton rows={8} />
      ) : tracks.length === 0 ? (
        <EmptyState icon={<MusicNoteIcon className="h-6 w-6" />} title="No songs here" />
      ) : view.kind === 'album' ? (
        <TrackList tracks={tracks} numbered header showAlbum={false} hideArtistId={a?.artists[0]?.id ?? undefined} />
      ) : (
        <TrackList tracks={tracks} header />
      )}

      {a && a.otherVersions.length > 0 && (
        <Section title="Other versions">
          <Shelf>
            {a.otherVersions.map((v) => (
              <MediaCard key={v.id} item={v} />
            ))}
          </Shelf>
        </Section>
      )}
      {a?.description && (
        <p className="max-w-3xl whitespace-pre-line text-sm leading-relaxed text-neutral-400">{a.description}</p>
      )}
    </div>
  )
}

export function MoodView({ view }: { view: Extract<SearchView, { kind: 'mood' }> }) {
  const { data, error } = useLoad(`mood:${view.params}`, () => fetchMood(view.params))
  const [open, setOpen] = useState<Record<string, boolean>>({})
  if (error) return <PageError message={error} />
  return (
    <div className="flex flex-col gap-8">
      <header
        className="relative -mx-4 overflow-hidden px-4 pb-6 pt-20 md:-mx-6 md:px-6 sm:pt-24"
        style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${view.color ?? '#555'} 55%, #0a0a0a), var(--panel-bg))` }}
      >
        <h1 className="text-5xl font-extrabold tracking-[-0.04em] text-white sm:text-6xl">{data?.title ?? view.title}</h1>
      </header>
      {!data ? (
        <ListSkeleton rows={6} />
      ) : (
        data.sections.map((section) => {
          const expanded = open[section.title]
          return (
            <Section
              key={section.title}
              title={section.title}
              action={
                section.playlists.length > 6 ? (
                  <SectionAction onClick={() => setOpen((o) => ({ ...o, [section.title]: !expanded }))}>
                    {expanded ? 'Show less' : 'Show all'}
                  </SectionAction>
                ) : undefined
              }
            >
              {expanded ? (
                <div className="-mx-2 grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] sm:-mx-3 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
                  {section.playlists.map((p) => (
                    <div key={p.id} className="[&>button]:w-full">
                      <MediaCard item={p} />
                    </div>
                  ))}
                </div>
              ) : (
                <Shelf>
                  {section.playlists.map((p) => (
                    <MediaCard key={p.id} item={p} />
                  ))}
                </Shelf>
              )}
            </Section>
          )
        })
      )}
    </div>
  )
}
