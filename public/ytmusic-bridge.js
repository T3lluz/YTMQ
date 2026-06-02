/**
 * YTMQ ↔ YouTube Music bridge (runs on https://music.youtube.com)
 *
 * Load from the YTMQ host page via bookmarklet or DevTools console.
 * Subscribes to the shared Supabase queue and adds tracks to the local YT Music queue.
 */
;(async function ytmqBridge() {
  const inline = window.__YTMQ_BRIDGE_PARAMS__
  const scriptUrl = document.currentScript?.src ?? ''
  const fromQuery = new URLSearchParams(
    scriptUrl.includes('?') ? scriptUrl.split('?')[1] : window.location.search,
  )

  const roomId = inline?.roomId ?? fromQuery.get('roomId')
  const supabaseUrl = inline?.sb ?? fromQuery.get('sb')
  const supabaseKey = inline?.key ?? fromQuery.get('key')

  const log = (msg, ...rest) => console.log('[YTMQ]', msg, ...rest)

  if (!roomId || !supabaseUrl || !supabaseKey) {
    console.error(
      '[YTMQ] Missing roomId, sb, or key query params. Connect from the YTMQ host page.',
    )
    return
  }

  if (!location.hostname.includes('music.youtube.com')) {
    console.error('[YTMQ] Open music.youtube.com and run this script there.')
    return
  }

  if (window.__YTMQ_BRIDGE__) {
    log('Bridge already running for room', window.__YTMQ_BRIDGE__.roomId)
    return
  }

  /** @type {Set<string>} */
  const syncedIds = new Set()

  function addVideoToQueue(videoId) {
    const playerBar = document.querySelector('ytmusic-player-bar')
    if (!playerBar) {
      log(
        'Player bar not found — start playing any song on YouTube Music, then retry.',
      )
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

  function showToast(message) {
    const existing = document.getElementById('ytmq-bridge-toast')
    if (existing) existing.remove()

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

  let supabase
  try {
    const { createClient } = await import(
      'https://esm.sh/@supabase/supabase-js@2.49.1'
    )
    supabase = createClient(supabaseUrl, supabaseKey)
  } catch (err) {
    console.error('[YTMQ] Could not load Supabase client', err)
    return
  }

  const { data: initial, error: loadError } = await supabase
    .from('queue_items')
    .select('id, video_id, title')
    .eq('room_id', roomId)
    .order('position', { ascending: true })

  if (loadError) {
    console.error('[YTMQ] Could not load queue', loadError.message)
    return
  }

  for (const row of initial ?? []) {
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
        const row = payload.new
        if (!row?.id || !row?.video_id) return
        if (syncedIds.has(row.id)) return
        syncedIds.add(row.id)

        const ok = addVideoToQueue(row.video_id)
        if (ok) {
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
      for (const row of data ?? []) {
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
})()
