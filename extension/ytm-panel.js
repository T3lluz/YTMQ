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
      ':host{display:block;position:fixed;inset:0;pointer-events:none;z-index:2147483646}' +
      '*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;font-synthesis:none}' +
      '#wrap{position:fixed;right:12px;bottom:calc(72px + env(safe-area-inset-bottom,0px));z-index:2147483647;pointer-events:none;max-width:min(304px,calc(100vw - 24px));transform-origin:bottom right}' +
      '#panel{pointer-events:auto;font-family:Montserrat,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:12px;line-height:1.4;color:#f4f4f5;-webkit-font-smoothing:antialiased;animation:ypIn .4s cubic-bezier(.16,1,.3,1) both}' +
      '@keyframes ypIn{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:none}}' +
      '.shell{position:relative;display:inline-flex;flex-direction:column;border-radius:9999px;border:1px solid rgba(255,255,255,.14);background:rgba(12,12,14,.82);backdrop-filter:blur(20px) saturate(160%);-webkit-backdrop-filter:blur(20px) saturate(160%);box-shadow:0 8px 32px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.06);overflow:hidden;transition:border-radius .32s cubic-bezier(.16,1,.3,1),box-shadow .32s ease,width .32s cubic-bezier(.16,1,.3,1),max-height .36s cubic-bezier(.16,1,.3,1);width:max-content;max-width:min(304px,calc(100vw - 24px))}' +
      '.shell::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:radial-gradient(10rem 6rem at 100% 0%,rgba(139,92,246,.14),transparent 72%)}' +
      '.shell.open{border-radius:18px;width:min(304px,calc(100vw - 24px));max-height:min(calc(100dvh - 100px),400px);box-shadow:0 16px 48px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.06)}' +
      '.hdr{position:relative;z-index:1;display:flex;align-items:center;gap:6px;flex-shrink:0}' +
      '.pill{display:inline-flex;align-items:center;gap:8px;min-width:0;border:0;background:transparent;color:inherit;cursor:pointer;padding:5px 8px 5px 5px;text-align:left;font:inherit;transition:background .15s ease}' +
      '.shell.open .pill{flex:1;padding:6px 4px 6px 6px}' +
      '.pill:hover{background:rgba(255,255,255,.05)}' +
      '.logo{width:28px;height:28px;border-radius:8px;overflow:hidden;flex:none;box-shadow:0 2px 8px rgba(124,58,237,.35)}' +
      '.logo svg{display:block;width:100%;height:100%}' +
      '.pill-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}' +
      '.pill-title{font-size:12px;font-weight:700;color:#fafafa;letter-spacing:.01em;white-space:nowrap;line-height:1.2}' +
      '.pill-sub{font-size:10px;font-weight:500;color:#a1a1aa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2}' +
      '.hdr-actions{display:flex;align-items:center;gap:2px;flex:none;padding-right:4px}' +
      '.chev,.close-btn{width:28px;height:28px;border:0;border-radius:999px;background:transparent;color:#a1a1aa;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0;transition:background .15s ease,color .15s ease,transform .3s cubic-bezier(.16,1,.3,1)}' +
      '.close-btn{display:none}' +
      '.chev:hover,.close-btn:hover{background:rgba(255,255,255,.08);color:#e4e4e7}' +
      '.shell.open .chev{display:none}' +
      '.shell.open .close-btn{display:inline-flex}' +
      '.drawer{display:none}' +
      '.shell.open .drawer{display:block;flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:0 10px 10px;scrollbar-width:thin;scrollbar-color:rgba(113,113,122,.35) transparent}' +
      '.drawer::-webkit-scrollbar{width:5px}' +
      '.drawer::-webkit-scrollbar-thumb{background:rgba(113,113,122,.3);border-radius:999px}' +
      '.drawer-inner{display:flex;flex-direction:column;gap:8px}' +
      '.sec{border-radius:14px;border:1px solid rgba(63,63,70,.7);background:rgba(24,24,27,.5);padding:10px}' +
      '.lbl{font-size:9px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#71717a;margin:0 0 6px}' +
      '.row{display:flex;align-items:center;justify-content:space-between;gap:6px}' +
      '.badge{display:inline-flex;align-items:center;gap:4px;font-size:9px;font-weight:600;padding:2px 7px;border-radius:999px;background:rgba(34,197,94,.14);color:#86efac;border:1px solid rgba(34,197,94,.25);white-space:nowrap}' +
      '.badge.off{background:rgba(39,39,42,.75);color:#a1a1aa;border-color:#3f3f46}' +
      '.dot{width:5px;height:5px;border-radius:50%;background:currentColor;flex:none}' +
      '.badge:not(.off) .dot{box-shadow:0 0 5px rgba(134,239,172,.75)}' +
      '.code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:1.05rem;font-weight:700;letter-spacing:.16em;color:#fafafa;line-height:1.2}' +
      '.meta{font-size:10px;color:#71717a;margin-top:3px}' +
      '.stats{display:flex;gap:6px;margin-top:8px}' +
      '.stat{flex:1;display:flex;align-items:center;justify-content:center;gap:5px;padding:5px 8px;border-radius:999px;border:1px solid #3f3f46;background:rgba(9,9,11,.5);min-width:0}' +
      '.stat strong{font-size:13px;font-weight:700;color:#e9d5ff;line-height:1;font-variant-numeric:tabular-nums}' +
      '.stat span{font-size:8px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#71717a;white-space:nowrap}' +
      '.title{font-size:13px;font-weight:600;color:#fafafa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.artist{font-size:11px;font-weight:500;color:#a1a1aa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}' +
      '.prog{margin-top:8px;height:3px;border-radius:999px;background:#27272a;overflow:hidden}' +
      '.prog>i{display:block;height:100%;width:0%;border-radius:inherit;background:linear-gradient(90deg,#7c3aed,#a78bfa);transition:width .35s linear}' +
      '.times{display:flex;justify-content:space-between;margin-top:3px;font-size:9px;font-weight:500;color:#71717a;font-variant-numeric:tabular-nums}' +
      '.ctlrow{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:8px}' +
      '.ctl{width:32px;height:32px;border-radius:999px;border:1px solid #3f3f46;background:rgba(39,39,42,.88);color:#e4e4e7;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0;transition:transform .1s ease,background .15s ease,border-color .15s ease}' +
      '.ctl:hover{background:#3f3f46;border-color:#52525b;color:#fafafa}' +
      '.ctl:active{transform:scale(.92)}' +
      '.ctl.pri{width:38px;height:38px;border:0;background:#7c3aed;color:#fff;box-shadow:0 3px 12px rgba(124,58,237,.38)}' +
      '.ctl.pri:hover{background:#8b5cf6}' +
      '.acts{display:grid;grid-template-columns:1fr 1fr;gap:6px}' +
      '.btn{border:1px solid #3f3f46;background:rgba(39,39,42,.82);color:#e4e4e7;border-radius:10px;padding:7px 8px;font-family:inherit;font-size:10px;font-weight:600;cursor:pointer;transition:background .15s ease,border-color .15s ease,transform .1s ease;line-height:1.2}' +
      '.btn:hover{background:#3f3f46;border-color:#52525b;color:#fafafa}' +
      '.btn:active{transform:scale(.97)}' +
      '.btn.acc{background:#7c3aed;border-color:#7c3aed;color:#fff}' +
      '.btn.acc:hover{background:#8b5cf6;border-color:#8b5cf6}' +
      '.upnext{margin-top:8px;padding-top:8px;border-top:1px solid #27272a}' +
      '.upnext .up-lbl{display:block;font-size:8px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:#71717a;margin-bottom:3px}' +
      '.upnext b{display:block;font-size:11px;font-weight:600;color:#d4d4d8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.wait .ctl{opacity:.4;pointer-events:none}' +
      '.ctl.pri .ico-play{display:inline-flex;align-items:center;justify-content:center}' +
      '.ctl.pri .ico-pause{display:none;align-items:center;justify-content:center}'
    )
  }

  function html() {
    return (
      '<div id="wrap">' +
      '<div id="panel">' +
      '<div class="shell" id="shell">' +
      '<div class="hdr">' +
      '<button type="button" class="pill" id="toggle" aria-expanded="false">' +
      '<span class="logo">' +
      LOGO +
      '</span>' +
      '<span class="pill-text"><span class="pill-title">YTMQ</span><span class="pill-sub" id="pill-sub">Waiting for lobby…</span></span>' +
      '</button>' +
      '<div class="hdr-actions">' +
      '<button type="button" class="chev" id="chev" aria-label="Expand panel">' +
      icon('<path d="m6 15 6-6 6 6"/>') +
      '</button>' +
      '<button type="button" class="close-btn" id="close" aria-label="Collapse panel">' +
      icon('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>') +
      '</button>' +
      '</div></div>' +
      '<div class="drawer" id="drawer"><div class="drawer-inner">' +
      '<div class="sec"><div class="row"><span class="lbl" style="margin:0">Lobby</span><span class="badge off" id="badge"><span class="dot"></span><span id="badge-t">Offline</span></span></div>' +
      '<div class="code" id="code">····</div><div class="meta" id="meta">Room</div>' +
      '<div class="stats"><div class="stat"><strong id="q">0</strong><span>In queue</span></div><div class="stat"><strong id="p">0</strong><span>Participants</span></div></div></div>' +
      '<div class="sec" id="np-sec"><div class="lbl">Now playing</div><div class="title" id="np-t">—</div><div class="artist" id="np-a">—</div>' +
      '<div class="prog"><i id="prog"></i></div><div class="times"><span id="t0">0:00</span><span id="t1">0:00</span></div>' +
      '<div class="ctlrow">' +
      '<button type="button" class="ctl" data-a="prev" aria-label="Previous">' +
      icon('<path d="m15 18-6-6 6-6"/><path d="M5 6v12"/>') +
      '</button>' +
      '<button type="button" class="ctl pri" data-a="toggle" aria-label="Play" id="ctl-play">' +
      '<span class="ico-play">' +
      icon('<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>') +
      '</span><span class="ico-pause">' +
      icon('<rect x="7" y="5" width="4" height="14" fill="currentColor" stroke="none"/><rect x="13" y="5" width="4" height="14" fill="currentColor" stroke="none"/>') +
      '</span></button>' +
      '<button type="button" class="ctl" data-a="next" aria-label="Next">' +
      icon('<path d="m9 18 6-6-6-6"/><path d="M19 6v12"/>') +
      '</button></div>' +
      '<div class="upnext" id="upnext"><span class="up-lbl">Up next</span><b>—</b></div></div>' +
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
    var toggle = q('#toggle')
    if (shell) shell.classList.toggle('open', on)
    if (toggle) toggle.setAttribute('aria-expanded', on ? 'true' : 'false')
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

    var playing = np.state === 'playing'
    var playIco = q('.ico-play')
    var pauseIco = q('.ico-pause')
    var playBtn = q('#ctl-play')
    if (playIco) playIco.style.display = playing ? 'none' : 'inline-flex'
    if (pauseIco) pauseIco.style.display = playing ? 'inline-flex' : 'none'
    if (playBtn) playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play')

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
        ? '<span class="up-lbl">Up next on YT Music</span><b>' + (nx.title || '—') + (nx.artist ? ' · ' + nx.artist : '') + '</b>'
        : '<span class="up-lbl">Up next</span><b>—</b>'
    }
  }

  function bind() {
    function togglePanel() {
      setExpanded(!expanded)
    }
    q('#toggle').addEventListener('click', togglePanel)
    q('#chev').addEventListener('click', togglePanel)
    q('#close').addEventListener('click', function () {
      setExpanded(false)
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
        var font = document.createElement('link')
        font.rel = 'stylesheet'
        font.href =
          'https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700&display=swap'
        shadow.appendChild(font)
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
