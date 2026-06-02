/**
 * Runs on https://music.youtube.com — bundled (no external script imports).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type BridgeParams = {
  roomId: string
  sb: string
  key: string
  since: string
}

type QueueRow = {
  id: string
  video_id: string
  title: string
  created_at: string
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
    selectedItemIndex?: number
  }
}

/** Zustand store on #queue (queue.store.store at runtime). */
type InnerQueueStore = {
  getState: () => QueueStoreState
}

type QueueStore = {
  store: {
    store: InnerQueueStore
  }
}

type QueueElement = HTMLElement & {
  dispatch: (action: { type: string; payload?: unknown }) => void
  queue?: QueueStore
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
  const since =
    inline?.since ?? fromQuery.get('since') ?? new Date().toISOString()

  if (!roomId || !sb || !key) return null
  return { roomId, sb, key, since }
}

function isInPlaybackSession(createdAt: string, playbackSince: string): boolean {
  return new Date(createdAt).getTime() >= new Date(playbackSince).getTime()
}

function getQueueElement(): QueueElement | null {
  return document.querySelector('#queue')
}

function getYtmApp(): YtmApp | null {
  return document.querySelector('ytmusic-app')
}

function getInnerStore(): InnerQueueStore | null {
  const outer = getQueueElement()?.queue?.store as
    | { store?: InnerQueueStore; getState?: () => QueueStoreState }
    | undefined
  if (!outer) return null
  if (outer.store?.getState) return outer.store
  if (typeof outer.getState === 'function') return outer as InnerQueueStore
  return null
}

function countDomQueueItems(): number {
  return document.querySelectorAll('ytmusic-player-queue-item').length
}

function saveSession(params: BridgeParams) {
  try {
    localStorage.setItem(
      'ytmq_session',
      JSON.stringify({ ...params, at: Date.now() }),
    )
  } catch {
    /* private mode */
  }
}

function notifyHostConnected(roomId: string) {
  const params = readParams()
  if (params) saveSession(params)

  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: 'ytmq:connected', roomId }, '*')
    }
  } catch {
    /* cross-origin */
  }
}

async function waitForQueueApi(maxMs = 20000): Promise<boolean> {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    if (getInnerStore() && getYtmApp()?.networkManager) return true
    await new Promise((r) => window.setTimeout(r, 250))
  }
  return Boolean(getInnerStore() && getYtmApp()?.networkManager)
}

function queueItemsIncludeVideo(items: unknown[], videoId: string): boolean {
  try {
    return JSON.stringify(items).includes(`"${videoId}"`)
  } catch {
    return false
  }
}

async function waitForQueueToInclude(
  innerStore: InnerQueueStore | null,
  videoId: string,
  beforeStoreCount: number,
  beforeDomCount: number,
): Promise<boolean> {
  const deadline = Date.now() + 2000
  while (Date.now() < deadline) {
    if (innerStore) {
      const state = innerStore.getState().queue
      if (
        state.items.length > beforeStoreCount ||
        queueItemsIncludeVideo(state.items, videoId)
      ) {
        return true
      }
    }
    if (countDomQueueItems() > beforeDomCount) return true
    await new Promise((r) => window.setTimeout(r, 80))
  }
  return false
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

/** Opens the queue panel so #queue store initializes on a fresh session. */
function nudgeQueueUi(): void {
  const selectors = [
    'ytmusic-player-bar button[aria-label*="Queue"]',
    'ytmusic-player-bar button[aria-label*="queue"]',
    'tp-yt-paper-icon-button[aria-label*="Queue"]',
    'tp-yt-paper-icon-button[aria-label*="queue"]',
  ]
  for (const selector of selectors) {
    const btn = document.querySelector(selector) as HTMLElement | null
    if (btn) {
      btn.click()
      return
    }
  }
}

function playNextInsertIndex(state: QueueStoreState['queue']): number {
  const selected = state.selectedItemIndex
  if (typeof selected === 'number' && selected >= 0) {
    return selected + 1
  }
  return state.items.length > 0 ? 1 : 0
}

async function addVideoViaStoreApi(videoId: string): Promise<boolean> {
  const queueEl = getQueueElement()
  const app = getYtmApp()
  const innerStore = getInnerStore()

  if (!innerStore || !app?.networkManager || !queueEl) return false

  const state = innerStore.getState().queue
  if (!state.queueContextParams) {
    log('Queue context not ready — open the queue panel or play a track first')
    return false
  }

  try {
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

    const beforeCount = state.items.length
    const index = playNextInsertIndex(state)

    if (typeof queueEl.dispatch !== 'function') {
      throw new Error('Queue dispatch not available')
    }

    queueEl.dispatch({
      type: 'ADD_ITEMS',
      payload: {
        nextQueueItemId: state.nextQueueItemId,
        index,
        items,
        shuffleEnabled: false,
        shouldAssignIds: true,
      },
    })

    return waitForQueueToInclude(
      innerStore,
      videoId,
      beforeCount,
      countDomQueueItems(),
    )
  } catch (err) {
    log('Queue store add failed', err)
    return false
  }
}

async function dispatchQueueAddLegacy(videoId: string): Promise<boolean> {
  const playerBar = document.querySelector('ytmusic-player-bar')
  if (!playerBar) return false

  const innerStore = getInnerStore()
  const beforeStoreCount = innerStore?.getState().queue.items.length ?? 0
  const beforeDomCount = countDomQueueItems()

  const queueTarget = {
    videoId,
    onEmptyQueue: { autoFillType: 'AUTO_FILL_TYPE_WATCH' as const },
  }

  const endpoint = {
    queueAddEndpoint: {
      queueTarget,
      queueInsertPosition: 'INSERT_AFTER_CURRENT_VIDEO' as const,
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

  return waitForQueueToInclude(
    innerStore,
    videoId,
    beforeStoreCount,
    beforeDomCount,
  )
}

async function addVideoPlayNext(videoId: string): Promise<boolean> {
  if (!location.hostname.includes('music.youtube.com')) {
    log('Open music.youtube.com — play next only works there.')
    return false
  }

  await waitForQueueApi(12000)

  if (!getInnerStore()) {
    nudgeQueueUi()
    await new Promise((r) => window.setTimeout(r, 600))
    await waitForQueueApi(5000)
  }

  if (await dispatchQueueAddLegacy(videoId)) return true

  return addVideoViaStoreApi(videoId)
}

async function addVideoPlayNextWithRetry(
  videoId: string,
  attempts = 6,
): Promise<boolean> {
  for (let i = 0; i < attempts; i += 1) {
    if (await addVideoPlayNext(videoId)) return true
    await waitForQueueApi(3000)
    await new Promise((r) => window.setTimeout(r, 400 * (i + 1)))
  }
  return false
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

  const { roomId, sb, key, since: playbackSince } = params

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
  const pendingRows: QueueRow[] = []
  const supabase: SupabaseClient = createClient(sb, key)

  async function processPending() {
    while (pendingRows.length > 0) {
      const row = pendingRows[pendingRows.length - 1]!
      if (syncedIds.has(row.id)) {
        pendingRows.pop()
        continue
      }
      const ok = await addVideoPlayNextWithRetry(row.video_id, 3)
      if (!ok) return
      syncedIds.add(row.id)
      pendingRows.pop()
      showToast(`Play next: ${row.title || 'track'}`)
      log('Play next (retry)', row.video_id, row.title)
    }
  }

  async function enqueueToYtm(row: QueueRow) {
    if (syncedIds.has(row.id)) return
    const ok = await addVideoPlayNextWithRetry(row.video_id)
    if (ok) {
      syncedIds.add(row.id)
      showToast(`Play next: ${row.title || 'track'}`)
      log('Play next', row.video_id, row.title)
      return
    }
    if (!pendingRows.some((p) => p.id === row.id)) {
      pendingRows.push(row)
      log('Queued for retry when YT Music is ready', row.video_id)
      showToast(
        'Could not add yet — open the queue panel on YouTube Music, then retry',
      )
    }
    void processPending()
  }

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
    .select('id, video_id, title, created_at')
    .eq('room_id', roomId)
    .order('position', { ascending: true })

  if (loadError) {
    console.error('[YTMQ] Could not load queue', loadError.message)
    return
  }

  const existingRows = (initial ?? []) as QueueRow[]

  function markSyncedIfAlreadyInYtm(row: QueueRow): boolean {
    const innerStore = getInnerStore()
    if (
      innerStore &&
      queueItemsIncludeVideo(innerStore.getState().queue.items, row.video_id)
    ) {
      syncedIds.add(row.id)
      return true
    }
    return false
  }

  async function syncExistingQueue() {
    const sessionRows = existingRows.filter((row) =>
      isInPlaybackSession(row.created_at, playbackSince),
    )

    for (const row of existingRows) {
      if (!isInPlaybackSession(row.created_at, playbackSince)) {
        syncedIds.add(row.id)
      }
    }

    if (sessionRows.length === 0) return

    log(
      'Syncing this session’s queue to YouTube Music…',
      sessionRows.length,
      'track(s)',
    )
    for (const row of [...sessionRows].reverse()) {
      if (syncedIds.has(row.id) || markSyncedIfAlreadyInYtm(row)) continue
      await enqueueToYtm(row)
    }
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
        const row = payload.new as QueueRow | undefined
        if (!row?.id || !row?.video_id) return
        const createdAt = row.created_at ?? new Date().toISOString()
        if (!isInPlaybackSession(createdAt, playbackSince)) return
        void enqueueToYtm({ ...row, created_at: createdAt })
      },
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        showToast('YTMQ connected')
        log('Subscribed to room', roomId)
        notifyHostConnected(roomId)
        void waitForQueueApi(25000).then(async () => {
          await syncExistingQueue()
          await processPending()
        })
      }
    })

  window.setInterval(() => {
    if (pendingRows.length > 0) void processPending()
  }, 3000)

  window.__YTMQ_BRIDGE__ = {
    roomId,
    syncedIds,
    addVideoPlayNext,
    async syncAll() {
      const { data, error } = await supabase
        .from('queue_items')
        .select('id, video_id, title, created_at')
        .eq('room_id', roomId)
        .order('position', { ascending: true })

      if (error) {
        log('Sync failed', error.message)
        return 0
      }

      let added = 0
      for (const row of [...((data ?? []) as QueueRow[])].reverse()) {
        if (!isInPlaybackSession(row.created_at, playbackSince)) continue
        if (syncedIds.has(row.id) || markSyncedIfAlreadyInYtm(row)) continue
        if (await addVideoPlayNextWithRetry(row.video_id)) {
          syncedIds.add(row.id)
          added += 1
        }
      }
      showToast(`YTMQ: synced ${added} track(s) as play next`)
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

  log('Bridge ready. Call __YTMQ_BRIDGE__.syncAll() to push the full queue as play next.')
}

void runBridge()
