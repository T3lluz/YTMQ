/**
 * YTMQ floating panel on music.youtube.com — lives in the extension content
 * script with a closed shadow root on documentElement so YouTube Music cannot
 * strip it when it rebuilds <body>.
 */
;(function () {
  var HOST_ID = 'ytmq-ext-host'
  var LEGACY_HOST_ID = 'ytmq-ytm-panel'
  var PANEL_REV = '4'
  var PANEL_GAP = 12
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
      '#wrap{position:fixed;right:20px;z-index:2147483647;pointer-events:none;max-width:min(320px,calc(100vw - 24px));transform-origin:bottom right;bottom:calc(112px + env(safe-area-inset-bottom,0px))}' +
      '#panel{pointer-events:auto;font-family:Montserrat,"YouTube Sans",Roboto,system-ui,-apple-system,sans-serif;font-size:13px;line-height:1.4;color:#fafafa;-webkit-font-smoothing:antialiased;animation:ypPillIn .38s cubic-bezier(.22,1,.36,1) both}' +
      '@keyframes ypPillIn{from{opacity:0;transform:translateY(12px) scale(.96)}to{opacity:1;transform:none}}' +
      '@keyframes ypPulse{0%,100%{box-shadow:0 0 0 0 rgba(139,92,246,.35)}50%{box-shadow:0 0 0 4px rgba(139,92,246,0)}}' +
      '.shell{position:relative;display:inline-flex;flex-direction:column;align-items:stretch;width:max-content;max-width:min(320px,calc(100vw - 24px));border-radius:999px;border:1px solid rgba(139,92,246,.35);box-shadow:0 16px 48px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.05);overflow:hidden;transition:border-radius .3s cubic-bezier(.4,0,.2,1),box-shadow .3s ease}' +
      '.shell.open{border-radius:18px;width:min(320px,calc(100vw - 24px));box-shadow:0 20px 56px rgba(0,0,0,.55),0 0 0 1px rgba(167,139,250,.14)}' +
      '.glass{position:absolute;inset:0;border-radius:inherit;z-index:0;pointer-events:none;background:rgba(18,18,24,.58);backdrop-filter:blur(28px) saturate(180%);-webkit-backdrop-filter:blur(28px) saturate(180%)}' +
      '.shell::after{content:"";position:absolute;inset:0;border-radius:inherit;z-index:0;pointer-events:none;background:linear-gradient(145deg,rgba(39,39,42,.55),rgba(24,24,27,.45))}' +
      '.hdr{position:relative;z-index:1;display:flex;align-items:center;gap:4px;flex-shrink:0;height:44px}' +
      '.pill{display:flex;align-items:center;gap:8px;min-width:0;flex:1;border:0;background:transparent;color:inherit;cursor:pointer;padding:6px 4px 6px 6px;text-align:left;font:inherit}' +
      '.pill:hover{background:rgba(255,255,255,.04)}' +
      '.logo{width:32px;height:32px;border-radius:10px;overflow:hidden;flex:none;animation:ypPulse 2.8s ease-in-out infinite}' +
      '.logo svg{display:block;width:100%;height:100%}' +
      '.pill-text{display:flex;flex-direction:column;min-width:0;flex:1;gap:1px}' +
      '.pill-title{font-size:13px;font-weight:700;letter-spacing:.02em;color:#e9d5ff;white-space:nowrap;line-height:1.15}' +
      '.pill-sub{font-size:10px;font-weight:500;color:#a1a1aa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:148px;line-height:1.15;transition:opacity .2s ease,margin .2s ease}' +
      '.shell.open .pill-sub{opacity:0;margin-top:-12px}' +
      '.hdr-actions{display:flex;align-items:center;flex:none;padding-right:6px}' +
      '.chev,.close-btn{width:30px;height:30px;border:0;border-radius:999px;background:transparent;color:#a78bfa;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0;transition:background .15s ease,color .15s ease,transform .32s cubic-bezier(.22,1.2,.36,1)}' +
      '.close-btn{display:none;color:#a1a1aa}' +
      '.chev:hover,.close-btn:hover{background:rgba(139,92,246,.16);color:#ede9fe}' +
      '.shell.open .chev{display:none}' +
      '.shell.open .close-btn{display:inline-flex}' +
      '.drawer{position:relative;z-index:1;display:grid;grid-template-rows:0fr;transition:grid-template-rows .32s cubic-bezier(.4,0,.2,1)}' +
      '.shell.open .drawer{grid-template-rows:1fr}' +
      '.drawer-scroll{overflow:hidden;min-height:0}' +
      '.drawer-inner{overflow-x:hidden;overflow-y:auto;max-height:min(68dvh,460px);padding:0 12px 12px;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;scrollbar-width:thin;scrollbar-color:rgba(113,113,122,.35) transparent;opacity:0;transform:translateY(-6px);transition:opacity .16s ease,transform .2s ease}' +
      '.shell.open .drawer-inner{opacity:1;transform:none;transition:opacity .24s ease .05s,transform .28s cubic-bezier(.4,0,.2,1) .05s}' +
      '.drawer-inner::-webkit-scrollbar{width:5px}' +
      '.drawer-inner::-webkit-scrollbar-thumb{background:rgba(113,113,122,.35);border-radius:999px}' +
      '.drawer-body{display:flex;flex-direction:column;gap:8px}' +
      '.sec{border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.22);padding:10px 12px}' +
      '.lbl{font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#a78bfa;margin:0 0 6px}' +
      '.row{display:flex;align-items:center;justify-content:space-between;gap:8px}' +
      '.badge{display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:600;padding:2px 8px;border-radius:999px;background:rgba(34,197,94,.15);color:#86efac;border:1px solid rgba(34,197,94,.25);white-space:nowrap}' +
      '.badge.off{background:rgba(113,113,122,.2);color:#d4d4d8;border-color:rgba(113,113,122,.35)}' +
      '.dot{width:6px;height:6px;border-radius:50%;background:currentColor;flex:none}' +
      '.code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:18px;font-weight:700;letter-spacing:.18em;color:#fafafa;line-height:1.2}' +
      '.meta{font-size:11px;color:#a1a1aa;margin-top:2px}' +
      '.stats{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px}' +
      '.stat{text-align:center;padding:6px 4px;border-radius:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06)}' +
      '.stat strong{display:block;font-size:15px;font-weight:700;color:#e9d5ff;line-height:1.1;font-variant-numeric:tabular-nums}' +
      '.stat span{display:block;margin-top:2px;font-size:9px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#71717a}' +
      '.title{font-size:14px;font-weight:600;color:#fafafa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.artist{font-size:12px;font-weight:500;color:#a1a1aa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}' +
      '.prog{margin-top:8px;height:4px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden}' +
      '.prog>i{display:block;height:100%;width:0%;border-radius:inherit;background:linear-gradient(90deg,#8b5cf6,#d946ef);transition:width .4s linear}' +
      '.times{display:flex;justify-content:space-between;margin-top:4px;font-size:10px;color:#71717a;font-variant-numeric:tabular-nums}' +
      '.ctlrow{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:8px}' +
      '.ctl{width:36px;height:36px;border-radius:999px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.06);color:#fafafa;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0;transition:background .15s ease,transform .1s ease}' +
      '.ctl:hover{background:rgba(255,255,255,.12)}' +
      '.ctl:active{transform:scale(.92)}' +
      '.ctl.pri{width:42px;height:42px;border:0;background:linear-gradient(135deg,#7c3aed,#c026d3);box-shadow:0 4px 14px rgba(124,58,237,.35)}' +
      '.ctl.pri:hover{background:linear-gradient(135deg,#8b5cf6,#d946ef)}' +
      '.acts{display:grid;grid-template-columns:1fr 1fr;gap:6px}' +
      '.btn{border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);color:#f4f4f5;border-radius:10px;padding:8px 10px;font-family:inherit;font-size:11px;font-weight:600;cursor:pointer;transition:background .15s ease,border-color .15s ease,transform .1s ease;line-height:1.2}' +
      '.btn:hover{background:rgba(139,92,246,.18);border-color:rgba(167,139,250,.35)}' +
      '.btn:active{transform:scale(.97)}' +
      '.btn.acc{background:rgba(139,92,246,.22);border-color:rgba(167,139,250,.4);color:#ede9fe}' +
      '.btn.acc:hover{background:rgba(139,92,246,.32)}' +
      '.upnext{margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.06)}' +
      '.upnext .up-lbl{display:block;font-size:9px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#71717a;margin-bottom:2px}' +
      '.upnext b{display:block;font-size:12px;font-weight:600;color:#e4e4e7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
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
      '<div class="glass" aria-hidden="true"></div>' +
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
      '<div class="drawer" id="drawer"><div class="drawer-scroll"><div class="drawer-inner"><div class="drawer-body">' +
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
      '</div></div></div></div></div></div></div></div></div>'
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

  function readPlayerBarOffset() {
    try {
      var bar = document.querySelector('ytmusic-player-bar')
      if (bar && bar.getBoundingClientRect) {
        var rect = bar.getBoundingClientRect()
        if (rect.height > 0) return Math.ceil(rect.height) + PANEL_GAP
      }
    } catch (e) {
      /* ignore */
    }
    return 112
  }

  function updatePanelPosition() {
    var wrap = q('#wrap')
    if (!wrap) return
    var offset = readPlayerBarOffset()
    wrap.style.bottom = 'calc(' + offset + 'px + env(safe-area-inset-bottom, 0px))'
  }

  function schedulePositionUpdate() {
    updatePanelPosition()
    window.requestAnimationFrame(updatePanelPosition)
  }

  function setExpanded(on) {
    expanded = on
    var shell = q('#shell')
    var toggle = q('#toggle')
    if (shell) shell.classList.toggle('open', on)
    if (toggle) toggle.setAttribute('aria-expanded', on ? 'true' : 'false')
    schedulePositionUpdate()
  }

  function q(sel) {
    return shadow ? shadow.querySelector(sel) : null
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

  function destroyStaleHosts() {
    var legacy = document.getElementById(LEGACY_HOST_ID)
    if (legacy) legacy.remove()
    var legacyStyle = document.getElementById('ytmq-ytm-panel-style')
    if (legacyStyle) legacyStyle.remove()
    var stale = document.getElementById(HOST_ID)
    if (stale && (!host || stale !== host || stale.dataset.ytmqRev !== PANEL_REV)) {
      stale.remove()
      host = null
      shadow = null
      root = null
    }
  }

  function mountHost() {
    host = document.createElement('div')
    host.id = HOST_ID
    host.dataset.ytmqRev = PANEL_REV
    host.style.cssText =
      'position:fixed!important;right:0!important;bottom:0!important;width:0!important;height:0!important;z-index:2147483646!important;pointer-events:none!important;overflow:visible!important;background:transparent!important;border:0!important;margin:0!important;padding:0!important'
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
    schedulePositionUpdate()
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
      if (!host) mountHost()
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
      schedulePositionUpdate()
      if (lastState) applyState(lastState)
    },
    true,
  )

  window.addEventListener('pageshow', ensureHost)
  window.addEventListener('resize', schedulePositionUpdate)
  destroyStaleHosts()
  ensureHost()
  schedulePositionUpdate()
  keepAliveTimer = window.setInterval(function () {
    ensureHost()
    updatePanelPosition()
  }, 1500)

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
