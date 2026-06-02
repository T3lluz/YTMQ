/**
 * Runs on https://music.youtube.com — bundled (no external script imports).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type BridgeParams = {
  roomId: string
  sb: string
  key: string
}

type QueueRow = {
  id: string
  video_id: string
  title: string
}

type NowPlayingPayload = {
  videoId: string
  title: string
  artist: string
  updatedAt: number
}

type QueueStoreState = {
  queue: {
    queueContextParams: string
    items: unknown[]
    nextQueueItemId: number
  }
}

type QueueDispatch = {
  dispatch: (action: {
    type: string
    payload?: unknown
  }) => void
  store: {
    store: {
      getState: () => QueueStoreState
    }
  }
}

type QueueElement = HTMLElement & {
  queue?: QueueDispatch
}

type YtmApp = HTMLElement & {
  networkManager?: {
    fetch: <TResponse, TBody>(path: string, body: TBody) => Promise<TResponse>
  }
}

type PlayerBar = HTMLElement & {
  playerApi?: {
    getVideoData?: () => { video_id?: string }
  }
}

type GetQueueResponse = {
  queueDatas?: { content?: unknown }[]
}

function log(msg: string, ...rest: unknown[]) {
  console.log('[YTMQ]', msg, ...rest)
}

function readParams(): BridgeParams | null {
  const inline = window.__YTMQ_BRIDGE_PARAMS__
  const current = document.currentScript
  const scriptUrl =
    current instanceof HTMLScriptElement ? (current.src ?? '') : ''
  const fromQuery = new URLSearchParams(
    scriptUrl.includes('?') ? scriptUrl.split('?')[1]! : window.location.search,
  )

  const roomId = inline?.roomId ?? fromQuery.get('roomId')
  const sb = inline?.sb ?? fromQuery.get('sb')
  const key = inline?.key ?? fromQuery.get('key')

  if (!roomId || !sb || !key) return null
  return { roomId, sb, key }
}

function getQueueElement(): QueueElement | null {
  return document.querySelector('#queue')
}

function getYtmApp(): YtmApp | null {
  return document.querySelector('ytmusic-app')
}

function readNowPlaying(): NowPlayingPayload | null {
  const bar = document.querySelector('ytmusic-player-bar') as PlayerBar | null
  const title =
    bar?.querySelector('.title')?.textContent?.trim() ??
    bar?.querySelector('[title]')?.textContent?.trim() ??
    ''
  const artist =
    bar?.querySelector('.byline')?.textContent?.trim() ??
    bar?.querySelector('.subtitle')?.textContent?.trim() ??
    ''

  let videoId = new URLSearchParams(location.search).get('v') ?? ''
  if (!videoId) {
    videoId = bar?.playerApi?.getVideoData?.()?.video_id ?? ''
  }

  if (!videoId && !title) return null

  return {
    videoId,
    title: title || 'Unknown track',
    artist,
    updatedAt: Date.now(),
  }
}

function dispatchQueueAddLegacy(videoId: string): boolean {
  const playerBar = document.querySelector('ytmusic-player-bar')
  if (!playerBar) return false

  const queueTarget = {
    videoId,
    onEmptyQueue: { autoFillType: 'AUTO_FILL_TYPE_WATCH' as const },
  }

  const endpoint = {
    queueAddEndpoint: {
      queueTarget,
      queueInsertPosition: 'INSERT_AT_END' as const,
    },
  }

  const detail = {
    actionName: 'yt-service-request',
    args: [playerBar, endpoint],
    optionalAction: false,
    returnValue: [] as unknown[],
  }

  for (const target of [
    getYtmApp(),
    playerBar,
    document.querySelector('ytmusic-player'),
  ]) {
    if (!target) continue
    target.dispatchEvent(
      new CustomEvent('yt-action', {
        bubbles: true,
        cancelable: false,
        composed: true,
        detail,
      }),
    )
  }

  return true
}

async function addVideoToQueue(videoId: string): Promise<boolean> {
  if (!location.hostname.includes('music.youtube.com')) {
    log('Open music.youtube.com — queue add only works there.')
    return false
  }

  const queueEl = getQueueElement()
  const app = getYtmApp()
  const innerStore = queueEl?.queue?.store?.store

  if (innerStore && app?.networkManager) {
    try {
      const state = innerStore.getState().queue
      const response = await app.networkManager.fetch<
        GetQueueResponse,
        { queueContextParams: string; videoIds: string[] }
      >('/music/get_queue', {
        queueContextParams: state.queueContextParams,
        videoIds: [videoId],
      })

      const items = (response.queueDatas ?? [])
        .map((row) => row?.content)
        .filter(Boolean)

      if (items.length === 0) {
        log('Track not in YouTube Music catalog:', videoId)
        return false
      }

      const index =
        state.items.length > 0 ? state.items.length - 1 : 0

      queueEl!.queue!.dispatch({
        type: 'ADD_ITEMS',
        payload: {
          nextQueueItemId: state.nextQueueItemId,
          index,
          items,
          shuffleEnabled: false,
          shouldAssignIds: true,
        },
      })

      return true
    } catch (err) {
      log('Queue store add failed, trying legacy event', err)
    }
  }

  if (!getQueueElement()) {
    log(
      'Queue panel not ready — play any song on YouTube Music, open the queue, then retry.',
    )
  }

  return dispatchQueueAddLegacy(videoId)
}

function showToast(message: string) {
  document.getElementById('ytmq-bridge-toast')?.remove()

  const el = document.createElement('div')
  el.id = 'ytmq-bridge-toast'
  el.textContent = message
  el.style.cssText = [
    'position:fixed',
    'bottom:88px',
    'left:50%',
    'transform:translateX(-50%)',
    'z-index:99999',
    'background:#18181b',
    'color:#fafafa',
    'padding:10px 16px',
    'border-radius:10px',
    'font:14px/1.4 system-ui,sans-serif',
    'box-shadow:0 4px 24px rgba(0,0,0,.45)',
    'border:1px solid #3f3f46',
    'max-width:90vw',
    'text-align:center',
  ].join(';')
  document.body.appendChild(el)
  window.setTimeout(() => el.remove(), 3500)
}

async function runBridge() {
  const params = readParams()
  if (!params) {
    console.error(
      '[YTMQ] Missing roomId, sb, or key. Connect from the YTMQ host page.',
    )
    return
  }

  const { roomId, sb, key } = params

  if (!location.hostname.includes('music.youtube.com')) {
    console.error('[YTMQ] Open music.youtube.com and run this script there.')
    return
  }

  const existing = window.__YTMQ_BRIDGE__ as { roomId?: string } | undefined
  if (existing?.roomId) {
    log('Bridge already running for room', existing.roomId)
    return
  }

  const syncedIds = new Set<string>()
  const supabase: SupabaseClient = createClient(sb, key)

  let lastPlaybackKey = ''

  const playbackChannel = supabase.channel(`ytmq-playback:${roomId}`)

  function publishNowPlaying() {
    const current = readNowPlaying()
    if (!current?.videoId) return

    const key = `${current.videoId}|${current.title}|${current.artist}`
    if (key === lastPlaybackKey) return
    lastPlaybackKey = key

    void playbackChannel.send({
      type: 'broadcast',
      event: 'now_playing',
      payload: current,
    })
  }

  void playbackChannel.subscribe()
  const playbackTimer = window.setInterval(publishNowPlaying, 2000)
  publishNowPlaying()

  const { data: initial, error: loadError } = await supabase
    .from('queue_items')
    .select('id, video_id, title')
    .eq('room_id', roomId)
    .order('position', { ascending: true })

  if (loadError) {
    console.error('[YTMQ] Could not load queue', loadError.message)
    return
  }

  for (const row of (initial ?? []) as QueueRow[]) {
    syncedIds.add(row.id)
  }

  const channel = supabase
    .channel(`ytmq-bridge:${roomId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'queue_items',
        filter: `room_id=eq.${roomId}`,
      },
      (payload) => {
        void (async () => {
          const row = payload.new as QueueRow | undefined
          if (!row?.id || !row?.video_id) return
          if (syncedIds.has(row.id)) return
          syncedIds.add(row.id)

          const ok = await addVideoToQueue(row.video_id)
          if (ok) {
            showToast(`Added: ${row.title || 'track'}`)
            log('Added to queue', row.video_id, row.title)
          } else {
            syncedIds.delete(row.id)
            showToast(`Could not add: ${row.title || 'track'}`)
            log('Failed to add', row.video_id, row.title)
          }
        })()
      },
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        showToast('YTMQ connected')
        log('Subscribed to room', roomId)
      }
    })

  window.__YTMQ_BRIDGE__ = {
    roomId,
    syncedIds,
    addVideoToQueue,
    async syncAll() {
      const { data, error } = await supabase
        .from('queue_items')
        .select('id, video_id, title')
        .eq('room_id', roomId)
        .order('position', { ascending: true })

      if (error) {
        log('Sync failed', error.message)
        return 0
      }

      let added = 0
      for (const row of (data ?? []) as QueueRow[]) {
        if (syncedIds.has(row.id)) continue
        if (await addVideoToQueue(row.video_id)) {
          syncedIds.add(row.id)
          added += 1
        }
      }
      showToast(`YTMQ: synced ${added} track(s) to queue`)
      return added
    },
    stop() {
      window.clearInterval(playbackTimer)
      void supabase.removeChannel(channel)
      void supabase.removeChannel(playbackChannel)
      delete window.__YTMQ_BRIDGE__
      showToast('YTMQ disconnected')
    },
  }

  log('Bridge ready. Call __YTMQ_BRIDGE__.syncAll() to push the full queue.')
}

void runBridge()
