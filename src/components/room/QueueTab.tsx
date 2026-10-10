import { useState } from 'react'
import { useAnimatedList } from '../../hooks/useAnimatedList'
import { useNowPlaying } from '../../hooks/useNowPlaying'
import { useRecentlyPlayed } from '../../hooks/useRecentlyPlayed'
import type { QueueAdder } from '../../hooks/useQueueAdder'
import { artAt, matchTrack, trackToQueueInput } from '../../lib/catalog'
import { isYoutubeVideoId, SOURCE_LABEL } from '../../lib/playback'
import {
  defaultArtistThumbnail,
  defaultThumbnail,
  hqThumbnail,
  nowPlayingArtwork,
  type QueueItem,
} from '../../lib/queue'
import { clearRecentlyPlayed, formatPlayedAgo, type PlayedTrack } from '../../lib/recentlyPlayed'
import { SongRow } from '../search/SongRow'
import { SourceBadge } from '../ui/brands'
import { Button } from '../ui/Button'
import { CheckCircleIcon, CloseIcon, HistoryIcon, PlusCircleIcon, QueueListIcon, SearchIcon } from '../ui/icons'
import { EmptyState, Section, SectionAction } from '../ui/Section'
import { PanelHeader, PanelTitle } from './Panel'

function AddedBy({ item }: { item: QueueItem }) {
  if (item.meta?.smart) return <span className="text-accent-300">Smart shuffle</span>
  if (!item.added_by) return null
  return <>added by {item.added_by}</>
}

function UpNextList({
  items,
  loading,
  busyId,
  editable,
  onRemove,
}: {
  items: QueueItem[]
  loading: boolean
  busyId: string | null
  editable: boolean
  onRemove: (id: string) => void
}) {
  const entries = useAnimatedList(items, (item) => item.id)
  if (loading) {
    return (
      <div className="flex flex-col gap-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 px-2 py-1.5">
            <div className="ytmq-skeleton h-11 w-11 rounded-md" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="ytmq-skeleton h-3.5 w-1/2 rounded-full" />
              <div className="ytmq-skeleton h-3 w-1/3 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="ytmq-song-list">
      {entries.map(({ key, item, leaving }) => (
        <div key={key} className={leaving ? 'ytmq-leaving' : 'ytmq-anim-row'}>
          <SongRow
            art={item.thumbnail_url || defaultThumbnail(item.video_id)}
            title={item.title}
            explicit={item.meta?.explicit}
            smart={item.meta?.smart}
            artists={item.meta?.artists?.length ? item.meta.artists : item.channel_title || 'Unknown artist'}
            album={item.meta?.album}
            extra={<AddedBy item={item} />}
            duration={item.meta?.duration}
            actions={
              editable ? (
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => onRemove(item.id)}
                  aria-label={`Remove ${item.title}`}
                  title="Remove from the queue"
                  className="ytmq-press inline-flex h-10 w-10 items-center justify-center rounded-full text-neutral-400 hover:bg-white/[0.08] hover:text-white disabled:opacity-40"
                >
                  {busyId === item.id ? <span className="ytmq-spinner h-4 w-4" aria-hidden /> : <CloseIcon className="h-[18px] w-[18px]" />}
                </button>
              ) : (
                <span className="w-2" />
              )
            }
          />
        </div>
      ))}
    </div>
  )
}

function HistoryList({
  roomId,
  adder,
  nickname,
  currentId,
}: {
  roomId: string
  adder: QueueAdder
  nickname: string
  /** The song playing now, left out until it has played. */
  currentId?: string
}) {
  const all = useRecentlyPlayed(roomId)
  const items = all[0]?.videoId === currentId ? all.slice(1) : all
  const [matching, setMatching] = useState<string | null>(null)
  const [missing, setMissing] = useState<Set<string>>(new Set())
  const [matched, setMatched] = useState<Map<string, string>>(new Map())

  // Spotify songs have no YouTube id; find the same song on YouTube Music.
  async function addAgain(track: PlayedTrack) {
    if (isYoutubeVideoId(track.videoId)) {
      await adder.add({
        video_id: track.videoId,
        title: track.title,
        channel_title: track.artist,
        thumbnail_url: track.thumbnailUrl || defaultThumbnail(track.videoId),
        added_by: nickname,
        insert_mode: 'queue',
      })
      return
    }
    setMatching(track.videoId)
    try {
      const match = await matchTrack(track.title, track.artist)
      if (!match) {
        setMissing((prev) => new Set(prev).add(track.videoId))
        return
      }
      setMatched((prev) => new Map(prev).set(track.videoId, match.videoId))
      await adder.add({ ...trackToQueueInput(match, nickname, 'queue'), thumbnail_url: track.thumbnailUrl || artAt(match.thumbnail, 226) })
    } catch {
      setMissing((prev) => new Set(prev).add(track.videoId))
    } finally {
      setMatching(null)
    }
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<HistoryIcon className="h-6 w-6" />}
        title="Nothing played yet"
        hint="Songs collect here as they play, so anyone can queue one again."
        className="!py-8"
      />
    )
  }

  return (
    <div className="ytmq-song-list">
      {items.map((track) => {
        const thumb =
          track.thumbnailUrl ||
          (isYoutubeVideoId(track.videoId) ? defaultThumbnail(track.videoId) : defaultArtistThumbnail(track.title))
        const done = adder.added.has(track.videoId) || adder.added.has(matched.get(track.videoId) ?? '')
        const busy = matching === track.videoId || adder.pending.has(track.videoId)
        const notFound = missing.has(track.videoId)
        return (
          <SongRow
            key={`${track.videoId}:${track.playedAt}`}
            art={thumb}
            title={track.title}
            artists={track.artist || 'Unknown artist'}
            extra={formatPlayedAgo(track.playedAt)}
            actions={
              <button
                type="button"
                disabled={!adder.canAdd || busy || notFound}
                onClick={() => void addAgain(track)}
                aria-label={notFound ? 'Not on YouTube Music' : `Queue ${track.title} again`}
                title={notFound ? 'Not found on YouTube Music' : adder.canAdd ? 'Add to queue again' : 'The host turned off adding songs'}
                className={`ytmq-press inline-flex h-10 w-10 items-center justify-center rounded-full disabled:opacity-40 ${
                  done ? 'text-accent-400' : 'text-neutral-400 hover:text-white'
                }`}
              >
                {busy ? (
                  <span className="ytmq-spinner h-4 w-4" aria-hidden />
                ) : done ? (
                  <CheckCircleIcon className="ytmq-check h-[22px] w-[22px]" />
                ) : (
                  <PlusCircleIcon className="h-[22px] w-[22px]" />
                )}
              </button>
            }
          />
        )
      })}
    </div>
  )
}

/**
 * The Queue tab, in Spotify's order: what plays now, the shared queue (who
 * added what), what the player does after it, and what already played.
 */
export function QueueTab({
  roomId,
  nickname,
  items,
  loading,
  busyId,
  editable,
  adder,
  onRemove,
  onSearch,
}: {
  roomId: string
  nickname: string
  items: QueueItem[]
  loading: boolean
  busyId: string | null
  editable: boolean
  adder: QueueAdder
  onRemove: (id: string) => void
  onSearch: () => void
}) {
  const { nowPlaying, stale } = useNowPlaying(roomId)
  const history = useRecentlyPlayed(roomId).filter((t, i) => !(i === 0 && t.videoId === nowPlaying?.videoId))
  const source = nowPlaying?.source ?? 'ytm'
  const next = nowPlaying?.nextUp
  const nextIsShared = next && items.some((item) => item.video_id === next.videoId)

  return (
    <div className="ytmq-tab-panel flex flex-col pb-4">
      <PanelHeader>
        <PanelTitle meta={items.length > 0 ? `${items.length} ${items.length === 1 ? 'song' : 'songs'}` : undefined}>
          Queue
        </PanelTitle>
      </PanelHeader>
      <div className="flex flex-col gap-9 pt-2">

      {nowPlaying && (
        <Section title="Now playing" action={<SourceBadge source={source} />}>
          <div className="ytmq-song-list">
            <SongRow
              art={nowPlayingArtwork(nowPlaying)}
              title={nowPlaying.title}
              artists={nowPlaying.artist}
              duration={nowPlaying.duration}
              active={!stale && nowPlaying.state === 'playing'}
              extra={stale ? 'not reporting' : nowPlaying.state === 'playing' ? undefined : 'paused'}
            />
          </div>
        </Section>
      )}

      <Section title="Next in queue">
        {!loading && items.length === 0 ? (
          <EmptyState
            icon={<QueueListIcon className="h-6 w-6" />}
            title="The queue is empty"
            hint="Songs anyone adds show up here in order, for everyone."
            action={
              <Button variant="primary" size="md" icon={<SearchIcon className="h-[18px] w-[18px]" />} onClick={onSearch}>
                Find songs
              </Button>
            }
            className="rounded-2xl bg-white/[0.03] !py-10"
          />
        ) : (
          <>
            {!editable && items.length > 0 && (
              <p className="mb-2 px-2 text-xs text-neutral-500">Only the host can take songs out right now.</p>
            )}
            <UpNextList items={items} loading={loading} busyId={busyId} editable={editable} onRemove={onRemove} />
          </>
        )}
      </Section>

      {next && !nextIsShared && next.videoId !== nowPlaying?.videoId && (
        <Section title={`Then on ${SOURCE_LABEL[source]}`}>
          <div className="ytmq-song-list">
            <SongRow
              art={next.thumbnailUrl || (isYoutubeVideoId(next.videoId) ? hqThumbnail(next.videoId) : defaultArtistThumbnail(next.title))}
              title={next.title}
              artists={next.artist}
              extra="from the player"
            />
          </div>
        </Section>
      )}

      <Section
        title="Played"
        action={history.length > 0 ? <SectionAction onClick={() => clearRecentlyPlayed(roomId)}>Clear</SectionAction> : undefined}
      >
        <HistoryList roomId={roomId} adder={adder} nickname={nickname} currentId={nowPlaying?.videoId} />
      </Section>
      </div>
    </div>
  )
}
