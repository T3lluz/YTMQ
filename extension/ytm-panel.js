/**
 * YTMQ floating panel on music.youtube.com — lives in the extension content
 * script with a closed shadow root on documentElement so YouTube Music cannot
 * strip it when it rebuilds <body>.
 */
;(function () {
  var HOST_ID = 'ytmq-ext-host'
  var BRIDGE_SOURCE = 'ytmq-bridge'
  var PANEL_SOURCE = 'ytmq-panel-ui'
  var YTMQ_SITE = 'https://t3lluz.github.io/YTMQ'

  var host = null
  var shadow = null
  var root = null
  var expanded = false
  var lastState = null
  var keepAliveTimer = 0

  var LOGO =
    '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><defs><linearGradient id="g" x1="6" y1="4" x2="26" y2="28"><stop stop-color="#8B5CF6"/><stop offset="1" stop-color="#D946EF"/></linearGradient></defs><rect width="32" height="32" rx="8" fill="url(#g)"/><rect x="6" y="7" width="20" height="6.5" rx="3.25" fill="#fff" fill-opacity="0.96"/><path fill="#7C3AED" d="M10.2 9.1v3.3l3.1-1.65z"/><rect x="6" y="15.5" width="20" height="4.5" rx="2.25" fill="#fff" fill-opacity="0.42"/><rect x="6" y="21.5" width="13.5" height="4.5" rx="2.25" fill="#fff" fill-opacity="0.24"/></svg>'

  function icon(paths) {
    return (
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      paths +
      '</svg>'
    )
  }

  function css() {
    return (
      ':host{all:initial}' +
      '#wrap{position:fixed;right:20px;bottom:96px;z-index:2147483646;pointer-events:none;font:13px/1.4 system-ui,sans-serif;color:#fafafa;max-width:min(360px,calc(100vw - 24px))}' +
      '#panel{pointer-events:auto;animation:ypIn .42s cubic-bezier(.22,1.3,.36,1) both}' +
      '@keyframes ypIn{from{opacity:0;transform:translateY(14px) scale(.92)}to{opacity:1;transform:none}}' +
      '.shell{border-radius:999px;border:1px solid rgba(139,92,246,.4);background:linear-gradient(145deg,rgba(24,24,27,.96),rgba(39,39,42,.94));box-shadow:0 16px 48px rgba(0,0,0,.55);overflow:hidden;transition:border-radius .36s ease,max-height .4s ease,width .36s ease;max-height:48px;width:max-content;max-width:min(360px,calc(100vw - 24px))}' +
      '.shell.open{border-radius:18px;max-height:min(78vh,560px);width:min(360px,calc(100vw - 24px))}' +
      '.pill{display:flex;align-items:center;gap:8px;width:100%;border:0;background:transparent;color:inherit;cursor:pointer;padding:6px 12px 6px 6px;text-align:left;font:inherit}' +
      '.logo{width:32px;height:32px;border-radius:10px;overflow:hidden;flex:none}' +
      '.logo svg{display:block;width:100%;height:100%}' +
      '.pill-title{font-size:13px;font-weight:700;color:#e9d5ff}' +
      '.pill-sub{font-size:10px;color:#a1a1aa;max-width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.chev{color:#a78bfa;transition:transform .3s ease;flex:none}' +
      '.shell.open .chev{transform:rotate(180deg)}' +
      '.body{display:grid;grid-template-rows:0fr;opacity:0;transition:grid-template-rows .4s ease,opacity .28s ease}' +
      '.shell.open .body{grid-template-rows:1fr;opacity:1}' +
      '.inner{overflow:hidden;padding:0 12px 12px}' +
      '.sec{border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.22);padding:10px 12px;margin-bottom:8px}' +
      '.lbl{font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#a78bfa;margin-bottom:6px}' +
      '.row{display:flex;align-items:center;justify-content:space-between;gap:8px}' +
      '.badge{display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:600;padding:2px 8px;border-radius:999px;background:rgba(34,197,94,.15);color:#86efac;border:1px solid rgba(34,197,94,.25)}' +
      '.badge.off{background:rgba(113,113,122,.2);color:#d4d4d8;border-color:rgba(113,113,122,.35)}' +
      '.dot{width:6px;height:6px;border-radius:50%;background:currentColor}' +
      '.code{font-family:ui-monospace,Menlo,monospace;font-size:18px;font-weight:700;letter-spacing:.16em}' +
      '.meta{font-size:11px;color:#a1a1aa;margin-top:2px}' +
      '.stats{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}' +
      '.stat{text-align:center;padding:6px;border-radius:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06)}' +
      '.stat strong{display:block;font-size:15px;color:#e9d5ff}' +
      '.stat span{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#71717a}' +
      '.title{font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.artist{font-size:12px;color:#a1a1aa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}' +
      '.prog{margin-top:8px;height:4px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden}' +
      '.prog>i{display:block;height:100%;background:linear-gradient(90deg,#8b5cf6,#d946ef);width:0%;transition:width .35s linear}' +
      '.times{display:flex;justify-content:space-between;margin-top:4px;font-size:10px;color:#71717a;font-variant-numeric:tabular-nums}' +
      '.ctlrow{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:10px}' +
      '.ctl{width:36px;height:36px;border-radius:999px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.06);color:#fafafa;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0}' +
      '.ctl.pri{width:42px;height:42px;border:0;background:linear-gradient(135deg,#7c3aed,#c026d3)}' +
      '.acts{display:grid;grid-template-columns:1fr 1fr;gap:6px}' +
      '.btn{border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);color:#f4f4f5;border-radius:10px;padding:8px;font-size:11px;font-weight:600;cursor:pointer}' +
      '.btn.acc{background:rgba(139,92,246,.22);border-color:rgba(167,139,250,.4);color:#ede9fe}' +
      '.upnext{margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.06);font-size:11px;color:#a1a1aa}' +
      '.upnext b{display:block;color:#e4e4e7;font-size:12px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}' +
      '.wait{opacity:.55;pointer-events:none}'
    )
  }

  function html() {
    return (
      '<div id="panel">' +
      '<div class="shell" id="shell">' +
      '<button type="button" class="pill" id="toggle">' +
      '<span class="logo">' +
      LOGO +
      '</span>' +
      '<span style="min-width:0;flex:1"><span class="pill-title">YTMQ</span><br><span class="pill-sub" id="pill-sub">Waiting for lobby…</span></span>' +
      '<span class="chev">' +
      icon('<path d="m6 9 6 6 6-6"/>') +
      '</span>' +
      '</button>' +
      '<div class="body"><div class="inner">' +
      '<div class="sec"><div class="row"><span class="lbl" style="margin:0">Lobby</span><span class="badge off" id="badge"><span class="dot"></span><span id="badge-t">Offline</span></span></div>' +
      '<div class="code" id="code">····</div><div class="meta" id="meta">Room</div>' +
      '<div class="stats"><div class="stat"><strong id="q">0</strong><span>In queue</span></div><div class="stat"><strong id="p">0</strong><span>Participants</span></div></div></div>' +
      '<div class="sec" id="np-sec"><div class="lbl">Now playing</div><div class="title" id="np-t">—</div><div class="artist" id="np-a">—</div>' +
      '<div class="prog"><i id="prog"></i></div><div class="times"><span id="t0">0:00</span><span id="t1">0:00</span></div>' +
      '<div class="ctlrow">' +
      '<button type="button" class="ctl" data-a="prev" aria-label="Previous">' +
      icon('<path d="m15 18-6-6 6-6"/><path d="M5 6v12"/>') +
      '</button>' +
      '<button type="button" class="ctl pri" data-a="toggle" aria-label="Play">' +
      icon('<path d="M8 5v14l11-7z"/>') +
      '</button>' +
      '<button type="button" class="ctl" data-a="next" aria-label="Next">' +
      icon('<path d="m9 18 6-6-6-6"/><path d="M19 6v12"/>') +
      '</button></div>' +
      '<div class="upnext" id="upnext"><span>Up next</span><b>—</b></div></div>' +
      '<div class="sec"><div class="lbl">Quick actions</div><div class="acts">' +
      '<button type="button" class="btn acc" data-a="open-app">Open YTMQ</button>' +
      '<button type="button" class="btn" data-a="focus-app">Switch to YTMQ</button>' +
      '<button type="button" class="btn" data-a="copy-link">Copy room link</button>' +
      '<button type="button" class="btn" data-a="collapse">Collapse</button>' +
      '</div></div></div></div></div></div>'
    )
  }

  function fmt(sec) {
    if (!isFinite(sec) || sec < 0) return '0:00'
    var t = Math.floor(sec)
    var m = Math.floor(t / 60)
    var s = t % 60
    return m + ':' + (s < 10 ? '0' : '') + s
  }

  function shortId(id) {
    return id && id.length > 8 ? id.slice(0, 8) + '…' : id || ''
  }

  function postAction(action) {
    window.postMessage({ source: PANEL_SOURCE, type: 'panel-action', action: action }, '*')
  }

  function q(sel) {
    return shadow ? shadow.querySelector(sel) : null
  }

  function setExpanded(on) {
    expanded = on
    var shell = q('#shell')
    if (shell) shell.classList.toggle('open', on)
  }

  function applyState(st) {
    if (!st || st.destroy) {
      if (host) host.style.display = 'none'
      return
    }
    lastState = st
    if (host) host.style.display = 'block'

    var linked = Boolean(st.roomId)
    var live = Boolean(st.connected)
    var np = st.nowPlaying || {}

    var badge = q('#badge')
    var badgeT = q('#badge-t')
    if (badge) badge.classList.toggle('off', !live)
    if (badgeT) badgeT.textContent = live ? 'Live' : linked ? 'Connecting…' : 'Offline'

    var pillSub = q('#pill-sub')
    if (pillSub) {
      pillSub.textContent = live
        ? st.roomCode
          ? 'Lobby ' + st.roomCode
          : 'Lobby linked'
        : linked
          ? 'Connecting…'
          : 'Waiting for lobby…'
    }

    var code = q('#code')
    if (code) code.textContent = st.roomCode || shortId(st.roomId) || '····'
    var meta = q('#meta')
    if (meta) meta.textContent = st.roomId ? 'Room ' + shortId(st.roomId) : 'Open YTMQ as host'

    var qEl = q('#q')
    var pEl = q('#p')
    if (qEl) qEl.textContent = String(st.queueCount != null ? st.queueCount : 0)
    if (pEl) pEl.textContent = String(st.participantCount != null ? st.participantCount : 0)

    var npSec = q('#np-sec')
    if (npSec) npSec.classList.toggle('wait', !live)

    var t = q('#np-t')
    var a = q('#np-a')
    if (t) t.textContent = np.title || 'Nothing playing'
    if (a) a.textContent = np.artist || '—'

    var pct = 0
    if (np.duration > 0) pct = Math.min(100, Math.max(0, (np.currentTime / np.duration) * 100))
    var prog = q('#prog')
    if (prog) prog.style.width = pct + '%'
    var t0 = q('#t0')
    var t1 = q('#t1')
    if (t0) t0.textContent = fmt(np.currentTime || 0)
    if (t1) t1.textContent = fmt(np.duration || 0)

    var up = q('#upnext')
  if (up) {
      var nx = st.nextSong
      up.innerHTML = nx
        ? '<span>Up next on YT Music</span><b>' + (nx.title || '—') + (nx.artist ? ' · ' + nx.artist : '') + '</b>'
        : '<span>Up next</span><b>—</b>'
    }
  }

  function bind() {
    q('#toggle').addEventListener('click', function () {
      setExpanded(!expanded)
    })
    shadow.querySelectorAll('[data-a]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var action = btn.getAttribute('data-a')
        if (action === 'collapse') {
          setExpanded(false)
          return
        }
        if (action === 'open-app' || action === 'focus-app') {
          try {
            chrome.runtime.sendMessage({
              type: action === 'focus-app' ? 'ytmq-focus-app' : 'ytmq-open-app',
              roomId: (lastState && lastState.roomId) || '',
            })
          } catch (e) {
            postAction(action)
          }
          return
        }
        postAction(action)
      })
    })
  }

  function ensureHost() {
    var parent = document.documentElement
    if (!parent) return

    if (!host || !parent.contains(host)) {
      if (!host) {
        host = document.createElement('div')
        host.id = HOST_ID
        host.style.cssText =
          'all: initial !important; position: fixed !important; inset: 0 !important; z-index: 2147483646 !important; pointer-events: none !important;'
        shadow = host.attachShadow({ mode: 'closed' })
        var style = document.createElement('style')
        style.textContent = css()
        shadow.appendChild(style)
        var wrap = document.createElement('div')
        wrap.innerHTML = html()
        root = wrap.firstElementChild
        shadow.appendChild(root)
        bind()
        try {
          document.documentElement.dataset.ytmqPanel = '1'
        } catch (e) {
          /* ignore */
        }
      }
      parent.appendChild(host)
    }
  }

  window.addEventListener('message', function (event) {
    if (event.source !== window) return
    var data = event.data
    if (!data || data.source !== BRIDGE_SOURCE || data.type !== 'panel-state') return
    ensureHost()
    applyState(data.payload)
  })

  document.addEventListener(
    'yt-navigate-finish',
    function () {
      ensureHost()
      if (lastState) applyState(lastState)
    },
    true,
  )

  window.addEventListener('pageshow', ensureHost)
  ensureHost()
  keepAliveTimer = window.setInterval(ensureHost, 1500)

  try {
    chrome.storage.local.get('ytmq_session', function (data) {
      var session = data && data.ytmq_session
      if (!session || !session.roomId) return
      ensureHost()
      applyState({
        roomId: session.roomId,
        connected: false,
        queueCount: 0,
        participantCount: 0,
      })
    })
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local' || !changes.ytmq_session) return
      var session = changes.ytmq_session.newValue
      if (!session || !session.roomId) {
        applyState({ destroy: true })
        return
      }
      ensureHost()
      applyState({
        roomId: session.roomId,
        connected: false,
        queueCount: 0,
        participantCount: 0,
      })
    })
  } catch (e) {
    /* ignore */
  }
})()
