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
      "@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700&display=swap');" +
      ':host{all:initial}' +
      '*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}' +
      '#wrap{position:fixed;right:16px;bottom:calc(80px + env(safe-area-inset-bottom,0px));z-index:2147483647;pointer-events:none;padding:16px;max-width:min(360px,calc(100vw - 32px));transform-origin:bottom right}' +
      '#panel{pointer-events:auto;font-family:Montserrat,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:13px;line-height:1.45;color:#f4f4f5;-webkit-font-smoothing:antialiased;animation:ypIn .45s cubic-bezier(.16,1,.3,1) both}' +
      '@keyframes ypIn{from{opacity:0;transform:translateY(16px) scale(.96)}to{opacity:1;transform:none}}' +
      '.shell{position:relative;border-radius:9999px;border:1px solid rgba(255,255,255,.1);background:rgba(9,9,11,.72);backdrop-filter:blur(24px) saturate(150%);-webkit-backdrop-filter:blur(24px) saturate(150%);box-shadow:0 12px 40px rgba(0,0,0,.5);overflow:hidden;transition:border-radius .35s cubic-bezier(.16,1,.3,1),box-shadow .35s ease,width .35s cubic-bezier(.16,1,.3,1),max-height .4s cubic-bezier(.16,1,.3,1);width:fit-content;max-width:min(340px,calc(100vw - 64px))}' +
      '.shell::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:radial-gradient(12rem 8rem at 100% 0%,rgba(139,92,246,.12),transparent 70%);opacity:.9}' +
      '.shell.open{border-radius:1.5rem;width:min(340px,calc(100vw - 64px));max-height:min(calc(100dvh - 112px),440px);display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.55)}' +
      '.pill{position:relative;z-index:1;display:inline-flex;align-items:center;gap:8px;width:auto;max-width:100%;border:0;background:transparent;color:inherit;cursor:pointer;padding:6px 10px 6px 6px;text-align:left;font:inherit;flex-shrink:0;transition:background .15s ease}' +
      '.shell.open .pill{display:flex;width:100%;gap:10px;padding:7px 12px 7px 7px}' +
      '.pill:hover{background:rgba(255,255,255,.05)}' +
      '.logo{width:34px;height:34px;border-radius:10px;overflow:hidden;flex:none;box-shadow:0 4px 12px rgba(124,58,237,.35)}' +
      '.logo svg{display:block;width:100%;height:100%}' +
      '.pill-text{flex:0 1 auto;display:flex;flex-direction:column;gap:2px}' +
      '.shell.open .pill-text{flex:1;min-width:0}' +
      '.pill-title{font-size:13px;font-weight:700;color:#f4f4f5;letter-spacing:.02em;white-space:nowrap}' +
      '.pill-sub{font-size:10px;font-weight:500;color:#a1a1aa;max-width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.shell:not(.open) .pill-sub{display:none}' +
      '.chev{color:#a1a1aa;transition:transform .3s cubic-bezier(.16,1,.3,1),color .2s ease;flex:none;display:flex}' +
      '.pill:hover .chev{color:#c4b5fd}' +
      '.shell.open .chev{transform:rotate(180deg)}' +
      '.drawer{display:none}' +
      '.shell.open .drawer{display:block;flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:2px 12px 14px;scrollbar-width:thin;scrollbar-color:rgba(113,113,122,.4) transparent}' +
      '.drawer::-webkit-scrollbar{width:6px}' +
      '.drawer::-webkit-scrollbar-thumb{background:rgba(113,113,122,.35);border-radius:999px}' +
      '.drawer-inner{display:flex;flex-direction:column;gap:10px;padding-bottom:2px}' +
      '.sec{position:relative;border-radius:1rem;border:1px solid #27272a;background:rgba(24,24,27,.55);padding:12px}' +
      '.lbl{font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#71717a;margin:0 0 8px}' +
      '.row{display:flex;align-items:center;justify-content:space-between;gap:8px}' +
      '.badge{display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:600;padding:2px 8px;border-radius:999px;background:rgba(34,197,94,.15);color:#86efac;border:1px solid rgba(34,197,94,.28)}' +
      '.badge.off{background:rgba(39,39,42,.8);color:#a1a1aa;border-color:#3f3f46}' +
      '.dot{width:6px;height:6px;border-radius:50%;background:currentColor}' +
      '.badge:not(.off) .dot{box-shadow:0 0 6px rgba(134,239,172,.8)}' +
      '.code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:1.25rem;font-weight:700;letter-spacing:.2em;color:#fafafa}' +
      '.meta{font-size:11px;color:#71717a;margin-top:4px}' +
      '.stats{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}' +
      '.stat{padding:10px 8px;border-radius:.75rem;border:1px solid #27272a;background:rgba(9,9,11,.45);text-align:center}' +
      '.stat strong{display:block;font-size:1.125rem;font-weight:700;color:#e9d5ff;line-height:1.2}' +
      '.stat span{display:block;margin-top:3px;font-size:9px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#71717a}' +
      '.title{font-size:14px;font-weight:600;color:#fafafa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.artist{font-size:12px;font-weight:500;color:#a1a1aa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}' +
      '.prog{margin-top:10px;height:4px;border-radius:999px;background:#27272a;overflow:hidden}' +
      '.prog>i{display:block;height:100%;width:0%;border-radius:inherit;background:linear-gradient(90deg,#7c3aed,#a78bfa);transition:width .35s linear}' +
      '.times{display:flex;justify-content:space-between;margin-top:4px;font-size:10px;font-weight:500;color:#71717a;font-variant-numeric:tabular-nums}' +
      '.ctlrow{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:12px}' +
      '.ctl{width:36px;height:36px;border-radius:999px;border:1px solid #3f3f46;background:rgba(39,39,42,.9);color:#e4e4e7;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0;transition:transform .1s ease,background .15s ease,border-color .15s ease}' +
      '.ctl:hover{background:#3f3f46;border-color:#52525b;color:#fafafa}' +
      '.ctl:active{transform:scale(.9)}' +
      '.ctl.pri{width:42px;height:42px;border:0;background:#7c3aed;color:#fff;box-shadow:0 4px 14px rgba(124,58,237,.4)}' +
      '.ctl.pri:hover{background:#8b5cf6}' +
      '.acts{display:grid;grid-template-columns:1fr 1fr;gap:8px}' +
      '.btn{border:1px solid #3f3f46;background:rgba(39,39,42,.85);color:#e4e4e7;border-radius:.75rem;padding:9px 10px;font-family:inherit;font-size:11px;font-weight:600;cursor:pointer;transition:background .15s ease,border-color .15s ease,transform .1s ease}' +
      '.btn:hover{background:#3f3f46;border-color:#52525b;color:#fafafa}' +
      '.btn:active{transform:scale(.97)}' +
      '.btn.acc{background:#7c3aed;border-color:#7c3aed;color:#fff}' +
      '.btn.acc:hover{background:#8b5cf6;border-color:#8b5cf6}' +
      '.upnext{margin-top:10px;padding-top:10px;border-top:1px solid #27272a}' +
      '.upnext .up-lbl{display:block;font-size:9px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#71717a;margin-bottom:4px}' +
      '.upnext b{display:block;font-size:12px;font-weight:600;color:#d4d4d8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.wait .ctl{opacity:.45;pointer-events:none}' +
      '.ctl.pri .ico-play,.ctl.pri .ico-pause{display:inline-flex;align-items:center;justify-content:center}'
    )
  }

  function html() {
    return (
      '<div id="wrap">' +
      '<div id="panel">' +
      '<div class="shell" id="shell">' +
      '<button type="button" class="pill" id="toggle" aria-expanded="false">' +
      '<span class="logo">' +
      LOGO +
      '</span>' +
      '<span class="pill-text"><span class="pill-title">YTMQ</span><span class="pill-sub" id="pill-sub">Waiting for lobby…</span></span>' +
      '<span class="chev" aria-hidden="true">' +
      icon('<path d="m6 15 6-6 6 6"/>') +
      '</span>' +
      '</button>' +
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
