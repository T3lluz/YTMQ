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
      ':host{all:initial;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
      '#wrap{position:fixed;right:20px;bottom:calc(88px + env(safe-area-inset-bottom,0px));z-index:2147483647;pointer-events:none;padding:12px;max-width:min(380px,calc(100vw - 40px));transform-origin:bottom right}' +
      '#panel{pointer-events:auto;color:#fafafa;font-size:13px;line-height:1.45;animation:ypIn .5s cubic-bezier(.22,1.25,.36,1) both}' +
      '@keyframes ypIn{from{opacity:0;transform:translateY(20px) scale(.94)}to{opacity:1;transform:translateY(0) scale(1)}}' +
      '@keyframes ypPulse{0%,100%{box-shadow:0 0 0 0 rgba(139,92,246,.35)}50%{box-shadow:0 0 0 8px rgba(139,92,246,0)}}' +
      '.shell{border-radius:999px;border:1px solid rgba(167,139,250,.45);background:rgba(9,9,11,.94);backdrop-filter:blur(20px) saturate(160%);-webkit-backdrop-filter:blur(20px) saturate(160%);box-shadow:0 20px 50px rgba(0,0,0,.65),0 0 0 1px rgba(255,255,255,.06);overflow:hidden;transition:border-radius .38s cubic-bezier(.22,1.2,.36,1),max-height .45s cubic-bezier(.22,1.2,.36,1),width .38s cubic-bezier(.22,1.2,.36,1),box-shadow .38s ease;max-height:52px;width:max-content;max-width:min(360px,calc(100vw - 56px))}' +
      '.shell.open{border-radius:20px;max-height:min(75vh,520px);width:min(360px,calc(100vw - 56px));box-shadow:0 24px 64px rgba(0,0,0,.7),0 0 0 1px rgba(167,139,250,.25)}' +
      '.pill{display:flex;align-items:center;gap:10px;width:100%;border:0;background:transparent;color:inherit;cursor:pointer;padding:8px 14px 8px 8px;text-align:left;font:inherit;transition:background .15s ease}' +
      '.pill:hover{background:rgba(255,255,255,.04)}' +
      '.logo{width:36px;height:36px;border-radius:11px;overflow:hidden;flex:none;animation:ypPulse 3s ease-in-out infinite}' +
      '.logo svg{display:block;width:100%;height:100%}' +
      '.pill-text{min-width:0;flex:1;display:flex;flex-direction:column;gap:1px}' +
      '.pill-title{font-size:14px;font-weight:700;color:#f5f3ff;letter-spacing:.01em}' +
      '.pill-sub{font-size:11px;color:#d4d4d8;max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.chev{color:#c4b5fd;transition:transform .35s cubic-bezier(.22,1.2,.36,1);flex:none;display:flex}' +
      '.shell.open .chev{transform:rotate(180deg)}' +
      '.body{display:grid;grid-template-rows:0fr;opacity:0;transition:grid-template-rows .45s cubic-bezier(.22,1.2,.36,1),opacity .3s ease}' +
      '.shell.open .body{grid-template-rows:1fr;opacity:1}' +
      '.inner{overflow:hidden;padding:4px 14px 14px;min-height:0}' +
      '.sec{border-radius:14px;border:1px solid #3f3f46;background:#27272a;padding:12px 14px;margin-bottom:10px}' +
      '.sec:last-child{margin-bottom:0}' +
      '.lbl{font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#c4b5fd;margin-bottom:8px}' +
      '.row{display:flex;align-items:center;justify-content:space-between;gap:10px}' +
      '.badge{display:inline-flex;align-items:center;gap:6px;font-size:10px;font-weight:700;padding:3px 10px;border-radius:999px;background:rgba(34,197,94,.2);color:#bbf7d0;border:1px solid rgba(74,222,128,.45)}' +
      '.badge.off{background:#3f3f46;color:#e4e4e7;border-color:#52525b}' +
      '.dot{width:7px;height:7px;border-radius:50%;background:currentColor;box-shadow:0 0 6px currentColor}' +
      '.code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:20px;font-weight:700;letter-spacing:.18em;color:#ffffff;margin-top:2px}' +
      '.meta{font-size:11px;color:#d4d4d8;margin-top:4px}' +
      '.stats{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}' +
      '.stat{text-align:center;padding:10px 8px;border-radius:12px;background:#18181b;border:1px solid #3f3f46}' +
      '.stat strong{display:block;font-size:18px;font-weight:700;color:#f5f3ff;line-height:1.2}' +
      '.stat span{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#a1a1aa;margin-top:4px;display:block}' +
      '.title{font-size:15px;font-weight:600;color:#ffffff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.artist{font-size:12px;color:#d4d4d8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:3px}' +
      '.prog{margin-top:10px;height:5px;border-radius:999px;background:#3f3f46;overflow:hidden}' +
      '.prog>i{display:block;height:100%;background:linear-gradient(90deg,#7c3aed,#d946ef);width:0%;transition:width .4s linear;border-radius:inherit}' +
      '.times{display:flex;justify-content:space-between;margin-top:5px;font-size:11px;color:#a1a1aa;font-variant-numeric:tabular-nums}' +
      '.ctlrow{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:12px}' +
      '.ctl{width:38px;height:38px;border-radius:999px;border:1px solid #52525b;background:#3f3f46;color:#fafafa;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0;transition:transform .12s ease,background .15s ease,border-color .15s ease}' +
      '.ctl:hover{background:#52525b;border-color:#71717a}' +
      '.ctl:active{transform:scale(.92)}' +
      '.ctl.pri{width:44px;height:44px;border:0;background:linear-gradient(135deg,#7c3aed,#c026d3);box-shadow:0 4px 16px rgba(124,58,237,.45)}' +
      '.ctl.pri:hover{background:linear-gradient(135deg,#8b5cf6,#d946ef)}' +
      '.acts{display:grid;grid-template-columns:1fr 1fr;gap:8px}' +
      '.btn{border:1px solid #52525b;background:#3f3f46;color:#f4f4f5;border-radius:11px;padding:9px 10px;font-size:11px;font-weight:600;cursor:pointer;transition:background .15s ease,border-color .15s ease,transform .1s ease}' +
      '.btn:hover{background:#52525b;border-color:#71717a}' +
      '.btn:active{transform:scale(.97)}' +
      '.btn.acc{background:rgba(124,58,237,.35);border-color:rgba(167,139,250,.55);color:#f5f3ff}' +
      '.btn.acc:hover{background:rgba(124,58,237,.5)}' +
      '.upnext{margin-top:10px;padding-top:10px;border-top:1px solid #3f3f46;font-size:11px;color:#a1a1aa}' +
      '.upnext span{display:block;text-transform:uppercase;letter-spacing:.08em;font-size:9px;font-weight:700;color:#c4b5fd;margin-bottom:4px}' +
      '.upnext b{display:block;color:#f4f4f5;font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.wait{opacity:.65}' +
      '.wait .ctl{pointer-events:none}'
    )
  }

  function html() {
    return (
      '<div id="wrap">' +
      '<div id="panel">' +
      '<div class="shell" id="shell">' +
      '<button type="button" class="pill" id="toggle">' +
      '<span class="logo">' +
      LOGO +
      '</span>' +
      '<span class="pill-text"><span class="pill-title">YTMQ</span><span class="pill-sub" id="pill-sub">Waiting for lobby…</span></span>' +
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
      '</div></div></div></div></div></div></div>'
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
          'all:initial!important;position:fixed!important;inset:0!important;z-index:2147483646!important;pointer-events:none!important;overflow:visible!important;background:transparent!important'
        shadow = host.attachShadow({ mode: 'closed' })
        var style = document.createElement('style')
        style.textContent = css()
        shadow.appendChild(style)
        var mount = document.createElement('div')
        mount.innerHTML = html()
        root = mount.firstElementChild
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
