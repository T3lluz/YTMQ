/**
 * The toolbar popup: the lobby as a whole, whatever is playing it. Where the
 * YouTube Music overlay (ytm-panel.js) is about one tab, this talks to the
 * YTMQ server directly, so it also follows Spotify and works with no YouTube
 * Music tab open:
 *
 *  - lobby code, QR (borrowed from the overlay when one is running), counts
 *  - now playing from YouTube Music or Spotify, with controls that reach
 *    whichever player is active (the same broadcast guests' phones use)
 *  - Sources: how YouTube Music and Spotify are doing, with what to do next
 *  - the shared queue, with remove
 *
 * Built on the same view as the overlay (ui.js).
 */
;(function () {
  var UI = window.YTMQUI
  var SPOTIFY_FRESH_MS = 15000
  var YTM_FRESH_MS = 15000
  var REFRESH_MS = 3000

  var style = document.createElement('style')
  style.textContent = UI.css()
  document.head.appendChild(style)

  var view = UI.createView(document.getElementById('view'), { mode: 'popup', onAction: onAction })

  var snap = null // from the background: session, update, ytm tabs
  var room = { active: true, code: '', queue: [], queueCount: 0, listening: 0, loaded: false }
  var playback = { np: null, at: 0, spotifyAt: 0, ytmAt: 0 }
  var accent = null
  var accentFor = ''
  var socket = null
  var refreshTimer = 0
  var refreshing = false

  function send(message) {
    return new Promise(function (resolve) {
      try {
        chrome.runtime.sendMessage(message, function (res) {
          void chrome.runtime.lastError
          resolve(res)
        })
      } catch (e) {
        resolve(null)
      }
    })
  }

  function apiBase() {
    return snap && snap.session ? snap.session.api.replace(/\/$/, '') : ''
  }

  function roomId() {
    return snap && snap.session ? snap.session.roomId : ''
  }

  function api(method, path, body) {
    return fetch(apiBase() + path, {
      method: method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status)
      return res.json()
    })
  }

  // --- the lobby ------------------------------------------------------------

  function refreshRoom() {
    if (!roomId() || refreshing) return Promise.resolve()
    refreshing = true
    var id = encodeURIComponent(roomId())
    return Promise.all([
      api('POST', '/rpc/get_room', { p_room_id: roomId() }).catch(function () { return undefined }),
      api('GET', '/rooms/' + id + '/queue').catch(function () { return null }),
      api('GET', '/rooms/' + id + '/participants').catch(function () { return null }),
    ])
      .then(function (results) {
        var info = results[0]
        if (info !== undefined) room.active = info !== null
        if (info && info.code) room.code = info.code
        if (results[1]) {
          room.queueCount = results[1].length
          room.queue = results[1].slice(0, 8)
        }
        if (results[2]) {
          var now = Date.now()
          room.listening = results[2].filter(function (p) {
            return now - new Date(p.last_seen).getTime() <= 45000
          }).length
        }
        room.loaded = true
      })
      .finally(function () {
        refreshing = false
        render()
      })
  }

  // --- realtime: now playing from any source, queue changes, controls -------

  var refs = {}

  function connect() {
    if (socket || !roomId()) return
    var url = apiBase().replace(/^http/, 'ws') + '/realtime'
    var ws = new WebSocket(url)
    socket = ws
    var id = roomId()
    refs = {
      playback: 'p',
      bridge: 'b',
      queue: 'q',
    }
    ws.onopen = function () {
      ws.send(JSON.stringify({ t: 'join', ref: refs.playback, topic: 'ytmq-playback:' + id }))
      ws.send(JSON.stringify({ t: 'join', ref: refs.bridge, topic: 'ytmq-bridge:' + id }))
      ws.send(
        JSON.stringify({
          t: 'join',
          ref: refs.queue,
          topic: 'queue:' + id,
          changes: [
            { table: 'queue_items', roomId: id },
            { table: 'participants', roomId: id },
          ],
        }),
      )
    }
    ws.onmessage = function (e) {
      var msg
      try {
        msg = JSON.parse(e.data)
      } catch (err) {
        return
      }
      if (msg.t === 'broadcast' && msg.event === 'now_playing') onNowPlaying(msg.payload)
      else if (msg.t === 'change') {
        // Participants heartbeat every 20 s; only queue changes need a quick
        // re-read, the timer covers the rest.
        if (msg.table === 'queue_items') refreshRoom()
      }
    }
    ws.onclose = function () {
      if (socket !== ws) return
      socket = null
      setTimeout(connect, 2000)
    }
  }

  function broadcast(event, payload) {
    var id = roomId()
    if (!id) return
    var topic = 'ytmq-bridge:' + id
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ t: 'broadcast', topic: topic, event: event, payload: payload }))
    } else {
      void api('POST', '/broadcast', { topic: topic, event: event, payload: payload }).catch(function () {})
    }
  }

  function onNowPlaying(p) {
    if (!p || !p.title) return
    var now = Date.now()
    if (p.source === 'spotify') playback.spotifyAt = now
    else playback.ytmAt = now
    // Like the app: while Spotify is publishing, it wins.
    if (p.source !== 'spotify' && now - playback.spotifyAt < 8000) return
    playback.np = {
      videoId: p.videoId,
      title: p.title,
      artist: p.artist || '',
      currentTime: typeof p.currentTime === 'number' ? p.currentTime : 0,
      duration: typeof p.duration === 'number' ? p.duration : 0,
      state: p.state,
      source: p.source === 'spotify' ? 'spotify' : 'ytm',
      thumbnailUrl:
        p.thumbnailUrl ||
        (/^[\w-]{11}$/.test(p.videoId || '') ? 'https://i.ytimg.com/vi/' + p.videoId + '/mqdefault.jpg' : ''),
    }
    playback.at = now
    updateAccent(playback.np.thumbnailUrl)
    render()
  }

  /** The album art's most vivid color, like the app's palette (simpler). */
  function updateAccent(url) {
    if (!url || url === accentFor) return
    accentFor = url
    var img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = function () {
      try {
        var c = document.createElement('canvas')
        c.width = c.height = 24
        var ctx = c.getContext('2d')
        ctx.drawImage(img, 0, 0, 24, 24)
        var d = ctx.getImageData(0, 0, 24, 24).data
        var best = null
        var bestScore = -1
        for (var i = 0; i < d.length; i += 4) {
          var r = d[i], g = d[i + 1], b = d[i + 2]
          var max = Math.max(r, g, b), min = Math.min(r, g, b)
          var sat = max ? (max - min) / max : 0
          var score = sat * (max / 255) * (max > 40 && max < 250 ? 1 : 0.3)
          if (score > bestScore) {
            bestScore = score
            best = [r, g, b]
          }
        }
        if (best && bestScore > 0.15 && accentFor === url) {
          accent = best
          render()
        }
      } catch (e) {
        /* tainted canvas: keep the default */
      }
    }
    img.src = url
  }

  // --- state for the view -----------------------------------------------------

  function sources() {
    var now = Date.now()
    var ytm = snap ? snap.ytm : { tabs: 0, linked: 0, connected: false, pendingCount: 0 }
    var ytmPlaying = now - playback.ytmAt < YTM_FRESH_MS
    var y
    if (!ytm.tabs) {
      y = { status: 'off', text: 'Not open yet', action: ['open-ytm', 'Open'] }
    } else if (ytm.connected) {
      y = {
        status: 'live',
        text: ytm.pendingCount
          ? UI.plural(ytm.pendingCount, 'song', 'songs') + ' waiting to sync'
          : ytmPlaying
            ? 'Linked · playing the shared queue'
            : 'Linked · guest picks play here',
        action: ['open-ytm', 'Show'],
      }
    } else {
      y = { status: 'connecting', text: 'Linking to the lobby…', action: ['open-ytm', 'Show'] }
    }
    var spotifyLive = now - playback.spotifyAt < SPOTIFY_FRESH_MS
    var s = spotifyLive
      ? { status: 'live', text: 'Following along', action: ['open-admin', 'Manage'] }
      : { status: 'off', text: 'Optional · set up in Admin', action: ['open-admin', 'Set up'] }
    return { ytm: y, spotify: s }
  }

  function render() {
    view.applyUpdate(snap && snap.update)
    if (!snap || !snap.session) {
      view.apply({ phase: 'unlinked' })
      return
    }
    if (!room.loaded) {
      view.apply({ phase: 'connecting', roomId: roomId() })
      return
    }
    if (!room.active) {
      view.apply({ phase: 'ended', roomId: roomId() })
      return
    }
    var np = playback.np
    if (np && Date.now() - playback.at > 30000) np = null
    view.apply({
      phase: 'live',
      roomId: roomId(),
      roomCode: room.code,
      roomUrl: snap.roomUrl,
      queue: room.queue,
      queueCount: room.queueCount,
      listeningCount: room.listening,
      qr: snap.ytm && snap.ytm.qr,
      accent: accent || (snap.ytm && snap.ytm.accent) || null,
      pendingCount: snap.ytm ? snap.ytm.pendingCount : 0,
      nowPlaying: np,
      sources: sources(),
    })
  }

  // --- actions ----------------------------------------------------------------

  function onAction(action, extra) {
    switch (action) {
      case 'open-app':
      case 'open-admin':
        void send({ type: 'ytmq-focus-app', roomId: roomId() })
        return
      case 'open-ytm':
        void send({ type: 'ytmq-open-ytm' })
        return
      case 'open-url':
        void send({ type: 'ytmq-open-url', url: extra && extra.url })
        return
      case 'update-download':
        void send({ type: 'ytmq-download-update' })
        return
      case 'update-reload':
        void send({ type: 'ytmq-reload-extension' })
        return
      case 'copy-link':
        if (snap && snap.roomUrl) void navigator.clipboard.writeText(snap.roomUrl).catch(function () {})
        return
      case 'toggle':
      case 'prev':
      case 'next':
        broadcast('playback_control', { action: action })
        // Show the change before the player reports back.
        if (action === 'toggle' && playback.np) {
          playback.np.state = playback.np.state === 'playing' ? 'paused' : 'playing'
          render()
        }
        return
      case 'remove':
        removeRow(extra && extra.id)
        return
      case 'retry-sync':
        void send({ type: 'ytmq-ytm-action', action: 'retry-sync', tabId: snap && snap.ytm && snap.ytm.tabId })
        return
      case 'disconnect':
        void send({ type: 'ytmq-disconnect' }).then(loadSnapshot)
        return
    }
  }

  function removeRow(id) {
    if (!id) return
    var row = null
    room.queue.forEach(function (q) {
      if (String(q.id) === String(id)) row = q
    })
    room.queue = room.queue.filter(function (q) { return String(q.id) !== String(id) })
    room.queueCount = Math.max(0, room.queueCount - 1)
    render()
    if (row) broadcast('queue_remove', { id: row.id, video_id: row.video_id, title: row.title })
    api('DELETE', '/queue/' + encodeURIComponent(id))
      .catch(function () {})
      .then(refreshRoom)
  }

  // --- lifecycle --------------------------------------------------------------

  function loadSnapshot() {
    return send({ type: 'ytmq-popup-snapshot' }).then(function (next) {
      var before = roomId()
      snap = next || { session: null, update: null, ytm: { tabs: 0 } }
      if (roomId() !== before) {
        room = { active: true, code: '', queue: [], queueCount: 0, listening: 0, loaded: false }
        playback = { np: null, at: 0, spotifyAt: 0, ytmAt: 0 }
        if (socket) {
          var old = socket
          socket = null
          old.close()
        }
      }
      if (roomId()) {
        connect()
        if (!room.loaded) void refreshRoom()
      }
      render()
    })
  }

  void loadSnapshot()
  // Opening the popup is a good moment to look for a new version.
  void send({ type: 'ytmq-check-update', force: true }).then(function (update) {
    if (snap) {
      snap.update = update
      render()
    }
  })
  refreshTimer = setInterval(function () {
    void loadSnapshot()
    void refreshRoom()
  }, REFRESH_MS)
  // Keep "Following Spotify" honest when broadcasts stop.
  setInterval(render, 5000)

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local') return
    if (changes.ytmq_session || changes.ytmq_update) void loadSnapshot()
  })

  window.addEventListener('unload', function () {
    clearInterval(refreshTimer)
    if (socket) socket.close()
  })

})()
