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

function addVideoToQueue(videoId: string) {
  const playerBar = document.querySelector('ytmusic-player-bar')
  if (!playerBar) {
    log('Player bar not found — start playing any song, then retry.')
    return false
  }

  playerBar.dispatchEvent(
    new CustomEvent('yt-action', {
      bubbles: true,
      cancelable: false,
      composed: true,
      detail: {
        actionName: 'yt-service-request',
        args: [
          playerBar,
          {
            queueAddEndpoint: {
              queueTarget: { videoId },
              queueInsertPosition: 'INSERT_AT_END',
            },
          },
        ],
        optionalAction: false,
        returnValue: [],
      },
    }),
  )
  return true
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
        const row = payload.new as QueueRow | undefined
        if (!row?.id || !row?.video_id) return
        if (syncedIds.has(row.id)) return
        syncedIds.add(row.id)

        if (addVideoToQueue(row.video_id)) {
          showToast(`Added: ${row.title || 'track'}`)
          log('Added to queue', row.video_id, row.title)
        }
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
        if (addVideoToQueue(row.video_id)) {
          syncedIds.add(row.id)
          added += 1
        }
      }
      showToast(`YTMQ: synced ${added} track(s) to queue`)
      return added
    },
    stop() {
      void supabase.removeChannel(channel)
      delete window.__YTMQ_BRIDGE__
      showToast('YTMQ disconnected')
    },
  }

  log('Bridge ready. Call __YTMQ_BRIDGE__.syncAll() to push the full queue.')
}

void runBridge()
