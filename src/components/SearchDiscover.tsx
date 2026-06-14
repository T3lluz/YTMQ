import { useEffect, useState } from 'react'
import {
  countryLabel,
  fetchDiscover,
  fetchMoodCategoryTracks,
  fetchPlaylistTracks,
  type ChartPlaylist,
  type DiscoverFeed,
  type MoodCategory,
  type SearchResultItem,
} from '../lib/search'

type CuratedSource =
  | { kind: 'chart'; playlist: ChartPlaylist }
  | { kind: 'mood'; category: MoodCategory; section: string }

type SearchDiscoverProps = {
  renderSongRow: (item: SearchResultItem, rank?: number) => React.ReactNode
}

export function SearchDiscover({ renderSongRow }: SearchDiscoverProps) {
  const [country, setCountry] = useState('ZZ')
  const [feedState, setFeedState] = useState<{
    country: string
    feed: DiscoverFeed | null
    error: string | null
  }>({ country: '', feed: null, error: null })
  const [curated, setCurated] = useState<CuratedSource | null>(null)
  const [curatedState, setCuratedState] = useState<{
    key: string
    tracks: SearchResultItem[]
    loading: boolean
  }>({ key: '', tracks: [], loading: false })

  useEffect(() => {
    let cancelled = false

    void fetchDiscover(country)
      .then((feed) => {
        if (!cancelled) {
          setFeedState({ country, feed, error: null })
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setFeedState({
            country,
            feed: null,
            error: err instanceof Error ? err.message : 'Could not load picks',
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [country])

  useEffect(() => {
    if (!curated) return

    const key =
      curated.kind === 'chart'
        ? `chart:${curated.playlist.browseId}`
        : `mood:${curated.category.params}`

    let cancelled = false

    const load =
      curated.kind === 'chart'
        ? fetchPlaylistTracks(curated.playlist.browseId).then((tracks) => ({
            tracks,
          }))
        : fetchMoodCategoryTracks(curated.category.params)

    void load
      .then((result) => {
        if (!cancelled) {
          setCuratedState({ key, tracks: result.tracks, loading: false })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCuratedState({ key, tracks: [], loading: false })
        }
      })

    const pending = window.setTimeout(() => {
      if (!cancelled) {
        setCuratedState({ key, tracks: [], loading: true })
      }
    }, 0)

    return () => {
      cancelled = true
      window.clearTimeout(pending)
    }
  }, [curated])

  const discoverReady = feedState.country === country
  const discover = discoverReady ? feedState.feed : null
  const error = discoverReady ? feedState.error : null
  const loading = !discoverReady && !error

  const curatedKey = curated
    ? curated.kind === 'chart'
      ? `chart:${curated.playlist.browseId}`
      : `mood:${curated.category.params}`
    : ''
  const curatedTracks =
    curated && curatedState.key === curatedKey ? curatedState.tracks : []
  const curatedLoading =
    Boolean(curated) &&
    (curatedState.key !== curatedKey || curatedState.loading)

  if (loading) {
    return <p className="py-8 text-center text-zinc-500">Loading picks…</p>
  }

  if (error || !discover) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">
        {error ?? 'Discovery unavailable — try searching above'}
      </p>
    )
  }

  const countryOptions = discover.countries.length
    ? discover.countries
    : [discover.country, 'ZZ']

  const curatedTitle =
    curated?.kind === 'chart'
      ? curated.playlist.title
      : curated?.kind === 'mood'
        ? `${curated.section}: ${curated.category.title}`
        : null

  const hasContent =
    discover.trending.length > 0 ||
    discover.charts.length > 0 ||
    discover.moods.some((section) => section.categories.length > 0)

  return (
    <div className="flex flex-col gap-5 pb-4">
      {!hasContent && (
        <p className="py-6 text-center text-sm text-zinc-500">
          Nothing to show yet. Try searching above, or redeploy the search edge
          function for charts and moods in production.
        </p>
      )}
      {discover.trending.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Trending now
          </h3>
          <ul className="flex flex-col gap-1.5">
            {discover.trending.map((item, index) => renderSongRow(item, index + 1))}
          </ul>
        </section>
      )}

      {discover.charts.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Charts
            </h3>
            <label className="flex items-center gap-1.5 text-xs text-zinc-400">
              <span className="sr-only">Chart region</span>
              <select
                value={country}
                onChange={(e) => {
                  setCurated(null)
                  setCountry(e.target.value)
                }}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 outline-none focus:border-violet-500"
              >
                {[...new Set([country, ...countryOptions])].map((code) => (
                  <option key={code} value={code}>
                    {countryLabel(code)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            {discover.charts.map((playlist) => {
              const active =
                curated?.kind === 'chart' &&
                curated.playlist.browseId === playlist.browseId
              return (
                <button
                  key={playlist.browseId}
                  type="button"
                  onClick={() =>
                    setCurated(
                      active ? null : { kind: 'chart', playlist },
                    )
                  }
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? 'border-violet-500 bg-violet-600 text-white'
                      : 'border-zinc-700 bg-zinc-900/80 text-zinc-300 hover:border-zinc-500'
                  }`}
                >
                  {playlist.title}
                </button>
              )
            })}
          </div>
        </section>
      )}

      {discover.moods.map((section) => (
        <section key={section.title} className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {section.title}
          </h3>
          <div className="flex flex-wrap gap-2">
            {section.categories.map((category) => {
              const active =
                curated?.kind === 'mood' &&
                curated.category.params === category.params
              return (
                <button
                  key={category.params}
                  type="button"
                  onClick={() =>
                    setCurated(
                      active
                        ? null
                        : {
                            kind: 'mood',
                            category,
                            section: section.title,
                          },
                    )
                  }
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? 'border-violet-500 bg-violet-600 text-white'
                      : 'border-zinc-700 bg-zinc-900/80 text-zinc-300 hover:border-zinc-500'
                  }`}
                >
                  {category.title}
                </button>
              )
            })}
          </div>
        </section>
      ))}

      {curatedTitle && (
        <section className="space-y-2 border-t border-zinc-800 pt-4">
          <h3 className="truncate text-sm font-semibold text-zinc-300">
            {curatedTitle}
          </h3>
          {curatedLoading ? (
            <p className="py-4 text-center text-sm text-zinc-500">Loading…</p>
          ) : curatedTracks.length === 0 ? (
            <p className="py-4 text-center text-sm text-zinc-500">
              No tracks found
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {curatedTracks.map((item, index) => renderSongRow(item, index + 1))}
            </ul>
          )}
        </section>
      )}

      <p className="text-center text-[11px] text-zinc-600">
        Powered by YouTube Music charts &amp; moods
      </p>
    </div>
  )
}
