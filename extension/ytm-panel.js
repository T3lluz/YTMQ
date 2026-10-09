/**
 * The YTMQ overlay on music.youtube.com: a pill above the player bar that
 * opens into the panel. It is about this YouTube Music tab: the shared queue
 * flowing into it, songs that did not make it in yet, what YouTube Music
 * plays when the queue runs dry. (The toolbar popup, popup.js, is the
 * lobby-wide view that also covers Spotify.)
 *
 * Lives in a closed shadow root on documentElement, so YouTube Music cannot
 * strip it when it rebuilds <body>. The panel body is the shared view from
 * ui.js. State arrives from the bridge (src/bridge/panelBridge.ts) as
 * postMessage 'panel-state'; actions go back as 'panel-action'.
 *
 * The pill can be dragged anywhere (it snaps to the nearer side) so it stays
 * out of the way of YouTube Music's own queue and controls. Double-click it
 * to put it back.
 */
;(function () {
  var UI = window.YTMQUI
  if (!UI) return

  var HOST_ID = 'ytmq-ext-host'
  var LEGACY_HOST_ID = 'ytmq-ytm-panel'
  var PANEL_REV = '6'
  var PANEL_GAP = 12
  var EDGE = 20
  var BRIDGE_SOURCE = 'ytmq-bridge'
  var PANEL_SOURCE = 'ytmq-panel-ui'
  var OPEN_KEY = 'ytmq_panel_open'
  var POS_KEY = 'ytmq_panel_pos'
  var FONT_LINK_ID = 'ytmq-panel-font'

  var host = null
  var shadow = null
  var view = null
  var els = {}
  var expanded = false
  var lastState = null
  var lastUpdate = null
  var pos = readPos()
  var drag = null

  function css() {
    var ease = 'cubic-bezier(.22,1,.36,1)'
    return [
      ':host{all:initial}',
      UI.css(),
      '#wrap{position:fixed;width:0;height:0;z-index:2147483647}',
      '#pill,#panel{position:absolute;bottom:0}',
      '#wrap.right #pill,#wrap.right #panel{right:0}',
      '#wrap.left #pill,#wrap.left #panel{left:0}',

      // Pill.
      '#pill{display:flex;align-items:center;gap:10px;height:44px;padding:0 12px 0 6px;border-radius:999px;white-space:nowrap;' +
        'cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none;' +
        'transition:opacity .2s ease,transform .35s ' + ease + ',border-color .2s,box-shadow .2s;transform-origin:bottom right;' +
        'animation:ytmq-pill-in .45s ' + ease + ' backwards}',
      '#wrap.left #pill{transform-origin:bottom left}',
      '#pill:hover{border-color:rgba(var(--ac),.5);box-shadow:0 18px 50px rgba(0,0,0,.55),0 0 0 4px rgba(var(--ac),.12)}',
      '#pill.dragging{cursor:grabbing;transition:none;box-shadow:0 24px 60px rgba(0,0,0,.6),0 0 0 4px rgba(var(--ac),.2)}',
      '#pill>*{position:relative}',
      '#pill .logo{width:32px;height:32px}',
      '#pill .logo svg{border-radius:9px}',
      '.pill-code{font-size:15px;font-weight:700;letter-spacing:.14em;color:#fafafa}',
      '.pill-hint{font-size:13px;font-weight:500;color:#a1a1aa}',
      '.pill-stat{display:inline-flex;align-items:center;gap:5px;font-size:13px;font-weight:600;color:#d4d4d8;font-variant-numeric:tabular-nums}',
      '.pill-stat svg{color:rgb(var(--ac-light))}',
      '.pill-stat b{font-weight:600;display:inline-block}',
      '.pill-sep{width:1px;height:18px;background:rgba(255,255,255,.12)}',
      '.pill-eq{display:none}',
      '.playing .pill-eq{display:inline-flex;color:rgb(var(--ac-light))}',
      '.pill-flag{display:none;width:8px;height:8px;border-radius:50%}',
      '.has-pending .pill-flag{display:block;background:#fbbf24}',
      '.pill-new{display:none;font-size:9px;font-weight:800;letter-spacing:.08em;padding:2px 6px;border-radius:999px;background:#8b5cf6;color:#fff}',
      '.has-update .pill-new{display:inline-block}',
      '.pill-chev{display:inline-flex;color:#a1a1aa;transition:color .15s,transform .2s}',
      '#pill:hover .pill-chev{color:#fafafa;transform:translateY(-1px)}',
      '#wrap.open #pill{opacity:0;transform:scale(.85) translateY(6px);pointer-events:none}',

      // Panel: grows out of the pill's corner.
      '#panel{width:min(352px,calc(100vw - 24px));max-height:var(--max-h,560px);border-radius:22px;overflow:hidden;' +
        'display:flex;flex-direction:column;opacity:0;visibility:hidden;pointer-events:none;' +
        'transform:translateY(14px) scale(.94);transform-origin:bottom right;' +
        'transition:opacity .18s ease,transform .3s ' + ease + ',visibility 0s linear .3s}',
      '#wrap.left #panel{transform-origin:bottom left}',
      '#wrap.open #panel{opacity:1;visibility:visible;pointer-events:auto;transform:none;' +
        'transition:opacity .22s ease,transform .42s ' + ease + ',visibility 0s}',

      '@keyframes ytmq-pill-in{from{opacity:0;transform:translateY(12px) scale(.9)}to{opacity:1;transform:none}}',
    ].join('')
  }

  function pillHtml() {
    return (
      '<button type="button" id="pill" class="surface ytmq-ui" aria-expanded="false" title="YTMQ (drag to move, double-click to reset)">' +
      '<span class="logo">' + UI.logo() + '<span class="status"></span></span>' +
      '<span class="pill-hint" data-p="hint">Connecting…</span>' +
      '<span class="pill-code mono" data-p="code" hidden></span>' +
      '<span class="pill-sep" data-p="sep" hidden></span>' +
      '<span class="pill-eq eq" aria-hidden="true"><i></i><i></i><i></i></span>' +
      '<span class="pill-stat" data-p="q" hidden title="Songs in the shared queue">' + UI.icon('queue', 15) + '<b></b></span>' +
      '<span class="pill-stat" data-p="p" hidden title="People listening">' + UI.icon('people', 15) + '<b></b></span>' +
      '<span class="pill-flag" title="Some songs are not in YouTube Music yet"></span>' +
      '<span class="pill-new" title="Extension update available">NEW</span>' +
      '<span class="pill-chev">' + UI.icon('chevronUp', 16) + '</span>' +
      '</button>'
    )
  }

  // --- helpers ------------------------------------------------------------

  function readPos() {
    try {
      var p = JSON.parse(localStorage.getItem(POS_KEY) || 'null')
      if (p && (p.side === 'left' || p.side === 'right') && isFinite(p.x) && isFinite(p.lift)) return p
    } catch (e) {
      /* ignore */
    }
    return { side: 'right', x: EDGE, lift: 0 }
  }

  function savePos() {
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(pos))
    } catch (e) {
      /* ignore */
    }
  }

  function sendRuntime(message, cb) {
    try {
      chrome.runtime.sendMessage(message, function (res) {
        void chrome.runtime.lastError
        if (cb) cb(res)
      })
    } catch (e) {
      /* extension reloaded under us */
    }
  }

  function postAction(action, extra) {
    var msg = { source: PANEL_SOURCE, type: 'panel-action', action: action }
    if (extra) for (var k in extra) msg[k] = extra[k]
    window.postMessage(msg, '*')
  }

  function phaseOf(st) {
    if (!st || !st.roomId) return 'unlinked'
    if (st.roomActive === false) return 'ended'
    if (!st.connected) return 'connecting'
    return 'live'
  }

  // --- position -----------------------------------------------------------

  function playerBarOffset() {
    try {
      var bar = document.querySelector('ytmusic-player-bar')
      var rect = bar && bar.getBoundingClientRect()
      if (rect && rect.height > 0 && rect.top < window.innerHeight) {
        return Math.ceil(window.innerHeight - rect.top) + PANEL_GAP
      }
    } catch (e) {
      /* ignore */
    }
    return 84
  }

  function updatePosition() {
    var wrap = els.wrap
    if (!wrap || drag) return
    var base = playerBarOffset()
    var maxLift = Math.max(0, window.innerHeight - base - 60)
    var lift = Math.max(0, Math.min(pos.lift, maxLift))
    var x = Math.max(8, Math.min(pos.x, window.innerWidth - 80))
    var bottom = base + lift
    wrap.classList.toggle('left', pos.side === 'left')
    wrap.classList.toggle('right', pos.side !== 'left')
    wrap.style.top = ''
    wrap.style.bottom = bottom + 'px'
    wrap.style.left = pos.side === 'left' ? x + 'px' : ''
    wrap.style.right = pos.side === 'left' ? '' : x + 'px'
    // The panel grows up from the pill. When the pill sits high, there is not
    // much room above it, so the panel slides down until it fits.
    var want = Math.min(560, window.innerHeight - 32)
    var above = window.innerHeight - bottom - 16
    var drop = Math.max(0, Math.min(want - above, bottom - 16))
    els.panel.style.bottom = -drop + 'px'
    els.panel.style.setProperty('--max-h', Math.min(640, above + drop) + 'px')
  }

  // --- open / close ---------------------------------------------------------

  function setExpanded(on, persist) {
    expanded = on
    els.wrap.classList.toggle('open', on)
    els.pill.setAttribute('aria-expanded', on ? 'true' : 'false')
    if (persist !== false) {
      try {
        localStorage.setItem(OPEN_KEY, on ? '1' : '0')
      } catch (e) {
        /* ignore */
      }
    }
    updatePosition()
  }

  // --- drag -----------------------------------------------------------------

  function bindDrag() {
    var pill = els.pill
    pill.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return
      var rect = pill.getBoundingClientRect()
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: e.clientX - rect.left, dy: e.clientY - rect.top, w: rect.width, h: rect.height, moved: false }
      // Capture now: a quick first move would otherwise leave the pill before
      // it ever sees a pointermove.
      try {
        pill.setPointerCapture(e.pointerId)
      } catch (err) {
        /* ignore */
      }
    })
    pill.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) return
      if (!drag.moved) {
        drag.moved = true
        pill.classList.add('dragging')
      }
      var left = Math.max(4, Math.min(window.innerWidth - drag.w - 4, e.clientX - drag.dx))
      var top = Math.max(4, Math.min(window.innerHeight - drag.h - 4, e.clientY - drag.dy))
      // While dragging, anchor the wrap at the pill's bottom-left corner.
      var wrap = els.wrap
      wrap.classList.remove('right')
      wrap.classList.add('left')
      wrap.style.right = ''
      wrap.style.bottom = ''
      wrap.style.left = left + 'px'
      wrap.style.top = top + drag.h + 'px'
    })
    function swallow(ev) {
      ev.stopPropagation()
      ev.preventDefault()
    }
    function end(e) {
      if (!drag || e.pointerId !== drag.id) return
      var wasDrag = drag.moved
      if (wasDrag) {
        var rect = pill.getBoundingClientRect()
        var side = rect.left + rect.width / 2 < window.innerWidth / 2 ? 'left' : 'right'
        var base = playerBarOffset()
        pos = {
          side: side,
          x: Math.round(side === 'left' ? rect.left : window.innerWidth - rect.right),
          lift: Math.max(0, Math.round(window.innerHeight - rect.bottom - base)),
        }
        savePos()
        pill.classList.remove('dragging')
        // Swallow the click that follows a drag.
        pill.addEventListener('click', swallow, { capture: true, once: true })
      }
      drag = null
      updatePosition()
    }
    pill.addEventListener('pointerup', end)
    pill.addEventListener('pointercancel', end)
    pill.addEventListener('dblclick', function () {
      pos = { side: 'right', x: EDGE, lift: 0 }
      savePos()
      updatePosition()
    })
  }

  // --- rendering ------------------------------------------------------------

  function setPillNumber(node, value) {
    var b = node.querySelector('b')
    var text = String(value)
    if (b.textContent === text) return
    var had = b.textContent !== ''
    b.textContent = text
    if (had) {
      b.classList.remove('bump')
      void b.offsetWidth
      b.classList.add('bump')
    }
  }

  function renderPill(st, phase) {
    var p = els.p
    var live = phase === 'live'
    var code = (st && st.roomCode) || ''
    els.pill.classList.toggle('is-live', live)
    els.pill.classList.toggle('is-connecting', phase === 'connecting')
    els.pill.classList.toggle('is-ended', phase === 'ended')
    p.hint.hidden = live && Boolean(code)
    p.hint.textContent =
      phase === 'ended' ? 'Lobby ended' : phase === 'connecting' ? 'Connecting…' : live ? 'Lobby linked' : 'Not linked'
    p.code.hidden = !(live && code)
    p.code.textContent = code
    p.sep.hidden = !live
    p.q.hidden = !live
    p.p.hidden = !live
    var queued = st && typeof st.queueCount === 'number' ? st.queueCount : 0
    var listening = st && typeof st.listeningCount === 'number' ? st.listeningCount : 0
    if (live) {
      setPillNumber(p.q, queued)
      setPillNumber(p.p, listening)
    }
    var np = st && st.nowPlaying
    els.pill.classList.toggle('playing', Boolean(live && np && np.state === 'playing'))
    els.pill.classList.toggle('has-pending', Boolean(st && st.pendingCount > 0))
    els.pill.setAttribute(
      'aria-label',
      'YTMQ' + (code ? ', lobby ' + code : '') + ', ' + UI.plural(queued, 'song', 'songs') + ' queued, ' + listening + ' listening',
    )
    if (st && Array.isArray(st.accent) && st.accent.length === 3) {
      var c = st.accent.map(function (v) { return Math.max(0, Math.min(255, Math.round(Number(v) || 0))) })
      var light = c.map(function (v) { return Math.round(v + (255 - v) * 0.45) })
      els.pill.style.setProperty('--ac', c.join(' '))
      els.pill.style.setProperty('--ac-light', light.join(' '))
    }
  }

  function applyState(st) {
    if (!st || st.destroy) {
      lastState = null
      if (host) host.style.setProperty('display', 'none')
      return
    }
    lastState = st
    if (!host) return
    host.style.removeProperty('display')
    var phase = phaseOf(st)
    renderPill(st, phase)
    var copy = {}
    for (var k in st) copy[k] = st[k]
    copy.phase = phase
    view.apply(copy)
  }

  function applyUpdate(update) {
    lastUpdate = update && update.available ? update : null
    if (!view) return
    els.pill.classList.toggle('has-update', Boolean(lastUpdate))
    view.applyUpdate(lastUpdate)
  }

  // --- actions --------------------------------------------------------------

  function onAction(action, extra) {
    var roomId = (lastState && lastState.roomId) || ''
    switch (action) {
      case 'close':
        setExpanded(false)
        els.pill.focus()
        return
      case 'open-app':
        sendRuntime({ type: 'ytmq-focus-app', roomId: roomId })
        return
      case 'open-url':
        sendRuntime({ type: 'ytmq-open-url', url: extra && extra.url })
        return
      case 'update-download':
        sendRuntime({ type: 'ytmq-download-update' })
        return
      case 'update-reload':
        sendRuntime({ type: 'ytmq-reload-extension' })
        return
      case 'disconnect':
        sendRuntime({ type: 'ytmq-disconnect' })
        return
      case 'remove':
        postAction('remove', { id: extra && extra.id })
        return
      default:
        // copy-link, toggle, prev, next, retry-sync: the bridge does these.
        postAction(action)
    }
  }

  // --- mount ----------------------------------------------------------------

  /** @font-face does not work inside shadow roots, so the font goes on the page. */
  function ensureFont() {
    if (document.getElementById(FONT_LINK_ID) || !document.head) return
    var link = document.createElement('link')
    link.id = FONT_LINK_ID
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&display=swap'
    document.head.appendChild(link)
  }

  function destroyStaleHosts() {
    var legacy = document.getElementById(LEGACY_HOST_ID)
    if (legacy) legacy.remove()
    var stale = document.getElementById(HOST_ID)
    if (stale && (!host || stale !== host || stale.dataset.ytmqRev !== PANEL_REV)) {
      stale.remove()
      if (view) view.destroy()
      host = null
      shadow = null
      view = null
    }
  }

  function mountHost() {
    host = document.createElement('div')
    host.id = HOST_ID
    host.dataset.ytmqRev = PANEL_REV
    host.style.cssText =
      'position:fixed!important;right:0!important;bottom:0!important;width:0!important;height:0!important;' +
      'z-index:2147483646!important;overflow:visible!important;background:transparent!important;' +
      'border:0!important;margin:0!important;padding:0!important'
    // Hidden until there is a lobby to show.
    host.style.setProperty('display', 'none')
    shadow = host.attachShadow({ mode: 'closed' })
    var style = document.createElement('style')
    style.textContent = css()
    shadow.appendChild(style)

    var wrap = document.createElement('div')
    wrap.id = 'wrap'
    wrap.className = 'right'
    wrap.innerHTML = pillHtml()
    var panel = document.createElement('section')
    panel.id = 'panel'
    panel.setAttribute('role', 'dialog')
    panel.setAttribute('aria-label', 'YTMQ')
    wrap.appendChild(panel)
    shadow.appendChild(wrap)

    els = { wrap: wrap, pill: wrap.querySelector('#pill'), panel: panel, p: {} }
    wrap.querySelectorAll('[data-p]').forEach(function (node) {
      els.p[node.getAttribute('data-p')] = node
    })
    view = UI.createView(panel, { mode: 'overlay', onAction: onAction })

    els.pill.addEventListener('click', function () {
      setExpanded(true)
    })
    bindDrag()
    shadow.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && expanded) {
        e.stopPropagation()
        setExpanded(false)
        els.pill.focus()
        return
      }
      // Keep YouTube Music's shortcuts (space, j/k...) from firing while a
      // YTMQ button has focus.
      if (e.key === ' ' || e.key === 'Enter') e.stopPropagation()
    })

    var open = false
    try {
      open = localStorage.getItem(OPEN_KEY) === '1'
    } catch (e) {
      /* ignore */
    }
    setExpanded(open, false)
    try {
      document.documentElement.dataset.ytmqPanel = PANEL_REV
    } catch (e) {
      /* ignore */
    }
  }

  function ensureHost() {
    var parent = document.documentElement
    if (!parent) return
    destroyStaleHosts()
    if (!host || !parent.contains(host)) {
      if (!host) {
        mountHost()
        if (lastState) applyState(lastState)
        applyUpdate(lastUpdate)
      }
      parent.appendChild(host)
    }
    ensureFont()
  }

  window.addEventListener('message', function (event) {
    if (event.source !== window) return
    var data = event.data
    if (!data || data.source !== BRIDGE_SOURCE || data.type !== 'panel-state') return
    ensureHost()
    applyState(data.payload)
  })

  // The popup reads this tab's state and drives the bridge through here.
  try {
    chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
      if (!message) return false
      if (message.type === 'ytmq-panel-snapshot') {
        sendResponse(
          lastState
            ? {
                roomId: lastState.roomId,
                connected: Boolean(lastState.connected),
                roomActive: lastState.roomActive !== false,
                pendingCount: lastState.pendingCount || 0,
                nowPlaying: lastState.nowPlaying || null,
                roomCode: lastState.roomCode || '',
                qr: lastState.qr || null,
                accent: lastState.accent || null,
              }
            : null,
        )
        return false
      }
      if (message.type === 'ytmq-panel-action') {
        postAction(message.action, message.id ? { id: message.id } : null)
        sendResponse({ ok: Boolean(lastState && lastState.connected) })
        return false
      }
      return false
    })
  } catch (e) {
    /* ignore */
  }

  document.addEventListener(
    'yt-navigate-finish',
    function () {
      ensureHost()
      updatePosition()
    },
    true,
  )
  window.addEventListener('pageshow', ensureHost)
  window.addEventListener('resize', updatePosition)
  destroyStaleHosts()
  ensureHost()
  updatePosition()
  window.setInterval(function () {
    ensureHost()
    updatePosition()
  }, 1500)

  try {
    var showStored = function (session) {
      if (!session || !session.roomId) {
        applyState({ destroy: true })
        return
      }
      ensureHost()
      if (!lastState || !lastState.connected) {
        applyState({ roomId: session.roomId, connected: false })
      }
    }
    chrome.storage.local.get(['ytmq_session', 'ytmq_update'], function (data) {
      if (data && data.ytmq_session) showStored(data.ytmq_session)
      applyUpdate(data && data.ytmq_update)
    })
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local') return
      if (changes.ytmq_session) showStored(changes.ytmq_session.newValue)
      if (changes.ytmq_update) applyUpdate(changes.ytmq_update.newValue)
    })
    // Throttled in the background; this just makes sure a check happens.
    sendRuntime({ type: 'ytmq-check-update' })
  } catch (e) {
    /* ignore */
  }
})()
