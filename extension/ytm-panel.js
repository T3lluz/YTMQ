/**
 * YTMQ panel on music.youtube.com. Lives in the extension content script in a
 * closed shadow root on documentElement, so YouTube Music cannot strip it when
 * it rebuilds <body>.
 *
 * Collapsed it is a pill above the player bar: lobby code, songs queued,
 * people listening. Open, it shows what YouTube Music can't: the shared queue
 * with who added what, the lobby code and a QR to scan, and any songs that did
 * not make it into YouTube Music yet. It is tinted from the album art, like
 * the app's now-playing sidebar.
 *
 * State arrives from the bridge (src/bridge/panelBridge.ts) as postMessage
 * 'panel-state'; actions go back as 'panel-action'. Everything that comes
 * from guests (titles, names) is set with textContent, never as markup.
 */
;(function () {
  var HOST_ID = 'ytmq-ext-host'
  var LEGACY_HOST_ID = 'ytmq-ytm-panel'
  var PANEL_REV = '5'
  var PANEL_GAP = 12
  var BRIDGE_SOURCE = 'ytmq-bridge'
  var PANEL_SOURCE = 'ytmq-panel-ui'
  var OPEN_KEY = 'ytmq_panel_open'
  var FONT_LINK_ID = 'ytmq-panel-font'
  var SVG_NS = 'http://www.w3.org/2000/svg'

  var host = null
  var shadow = null
  var els = {}
  var expanded = false
  var qrShown = false
  var lastState = null
  var lastQueueKey = ''
  var lastQrKey = ''
  // Playback is interpolated between bridge updates so the bar moves smoothly.
  var clock = { at: 0, time: 0, duration: 0, playing: false }

  /** The app's logo. Each copy needs its own gradient id: the pill's copy is
   *  hidden while the panel is open, and a hidden gradient paints nothing. */
  function logo(id) {
    return (
      '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><defs><linearGradient id="' + id +
      '" x1="6" y1="4" x2="26" y2="28"><stop stop-color="#8B5CF6"/><stop offset="1" stop-color="#D946EF"/></linearGradient></defs><rect width="32" height="32" rx="8" fill="url(#' + id +
      ')"/><rect x="6" y="7" width="20" height="6.5" rx="3.25" fill="#fff" fill-opacity="0.96"/><path fill="#7C3AED" d="M10.2 9.1v3.3l3.1-1.65z"/><rect x="6" y="15.5" width="20" height="4.5" rx="2.25" fill="#fff" fill-opacity="0.42"/><rect x="6" y="21.5" width="13.5" height="4.5" rx="2.25" fill="#fff" fill-opacity="0.24"/></svg>'
    )
  }

  var ICONS = {
    queue: '<path d="M3 6h13"/><path d="M3 12h9"/><path d="M3 18h9"/><path d="M17 11v8"/><path d="m14 16 3 3 3-3"/>',
    people: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    chevronUp: '<path d="m6 15 6-6 6 6"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3z"/><path d="M20 14v.01"/><path d="M14 20h.01"/><path d="M17 17h4v4h-4"/>',
    prev: '<path d="M19 20 9 12l10-8v16z" fill="currentColor" stroke="none"/><path d="M5 19V5"/>',
    next: '<path d="m5 4 10 8-10 8V4z" fill="currentColor" stroke="none"/><path d="M19 5v14"/>',
    play: '<path d="M7 4v16l13-8z" fill="currentColor" stroke="none"/>',
    pause: '<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/>',
    remove: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    warn: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  }

  function icon(name, size) {
    var s = size || 16
    return (
      '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s +
      '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      ICONS[name] +
      '</svg>'
    )
  }

  function css() {
    return [
      ':host{all:initial}',
      '*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;margin:0}',
      '[hidden]{display:none!important}',
      'button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer}',
      'button:focus-visible{outline:2px solid rgb(var(--ac-light));outline-offset:2px}',
      '#wrap{--ac:139 92 246;--ac-light:196 181 253;position:fixed;right:20px;bottom:84px;z-index:2147483647;' +
        'font-family:"YouTube Sans",Roboto,system-ui,-apple-system,sans-serif;font-size:13px;line-height:1.35;color:#f4f4f5;' +
        '-webkit-font-smoothing:antialiased;display:flex;flex-direction:column;align-items:flex-end}',
      '.display{font-family:Montserrat,"YouTube Sans",Roboto,system-ui,sans-serif}',
      '.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',

      // Shared glass surface, tinted by the album art.
      '.surface{position:relative;pointer-events:auto;background:rgba(12,12,15,.82);' +
        'backdrop-filter:blur(24px) saturate(170%);-webkit-backdrop-filter:blur(24px) saturate(170%);' +
        'border:1px solid rgba(255,255,255,.09);box-shadow:0 18px 50px rgba(0,0,0,.55),0 0 0 1px rgba(var(--ac),.08);' +
        'transition:box-shadow .5s ease}',
      '.surface::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;' +
        'background:radial-gradient(120% 90% at 85% 0%,rgba(var(--ac),.22),transparent 60%);transition:background .6s ease}',

      // Collapsed pill.
      '#pill{display:flex;align-items:center;gap:10px;height:44px;padding:0 14px 0 6px;border-radius:999px;' +
        'animation:in .38s cubic-bezier(.22,1,.36,1) both}',
      '#pill:hover{border-color:rgba(var(--ac),.45)}',
      '#pill>*{position:relative}',
      '.logo{position:relative;width:32px;height:32px;flex:none}',
      '.logo svg{display:block;width:100%;height:100%;border-radius:9px}',
      '.status{position:absolute;right:-2px;bottom:-2px;width:11px;height:11px;border-radius:50%;' +
        'border:2px solid #0c0c0f;background:#71717a}',
      '.live .status{background:#34d399;box-shadow:0 0 0 0 rgba(52,211,153,.5);animation:ping 2.4s ease-out infinite}',
      '.wait .status{background:#fbbf24}',
      '.pill-code{font-size:15px;font-weight:700;letter-spacing:.14em;color:#fafafa}',
      '.pill-stat{display:inline-flex;align-items:center;gap:5px;font-size:13px;font-weight:600;color:#d4d4d8;font-variant-numeric:tabular-nums}',
      '.pill-stat svg{color:rgb(var(--ac-light));opacity:.9}',
      '.pill-sep{width:1px;height:18px;background:rgba(255,255,255,.12)}',
      '.pill-hint{font-size:13px;font-weight:500;color:#a1a1aa;white-space:nowrap}',
      '.pill-warn{display:none;width:8px;height:8px;border-radius:50%;background:#fbbf24}',
      '.has-pending .pill-warn{display:block}',
      '.pill-chev{display:inline-flex;margin-left:-2px;color:#a1a1aa;transition:color .15s,transform .2s}',
      '#pill:hover .pill-chev{color:#fafafa;transform:translateY(-1px)}',
      '#wrap.open #pill{display:none}',

      // Open panel.
      '#panel{display:none;flex-direction:column;width:min(348px,calc(100vw - 24px));border-radius:20px;overflow:hidden;' +
        'max-height:var(--max-h,560px);animation:in .32s cubic-bezier(.22,1,.36,1) both}',
      '#wrap.open #panel{display:flex}',
      '#panel>*{position:relative}',
      '.head{display:flex;align-items:center;gap:10px;padding:12px 10px 4px 12px}',
      '.head .logo{width:28px;height:28px}',
      '.head-title{font-size:15px;font-weight:800;letter-spacing:.01em}',
      '.chip{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 9px;border-radius:999px;font-size:11px;font-weight:600;' +
        'background:rgba(113,113,122,.18);color:#d4d4d8;border:1px solid rgba(113,113,122,.3)}',
      '.chip i{width:6px;height:6px;border-radius:50%;background:currentColor}',
      '.live .chip.conn{background:rgba(16,185,129,.12);color:#6ee7b7;border-color:rgba(16,185,129,.3)}',
      '.wait .chip.conn{background:rgba(245,158,11,.12);color:#fcd34d;border-color:rgba(245,158,11,.3)}',
      '.spacer{flex:1}',
      '.icon-btn{width:32px;height:32px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;color:#a1a1aa;' +
        'transition:background .15s ease,color .15s ease}',
      '.icon-btn:hover{background:rgba(255,255,255,.08);color:#fafafa}',
      '.icon-btn.on{background:rgba(var(--ac),.2);color:rgb(var(--ac-light))}',

      '.scroll{overflow-y:auto;overscroll-behavior:contain;padding:0 14px 14px;scrollbar-width:thin;scrollbar-color:rgba(113,113,122,.4) transparent}',
      '.scroll::-webkit-scrollbar{width:6px}',
      '.scroll::-webkit-scrollbar-thumb{background:rgba(113,113,122,.4);border-radius:999px}',

      // Lobby: the code is the thing people need, so it is big.
      '.lobby{display:flex;align-items:center;gap:12px;padding:10px 0 14px}',
      '.lobby-text{flex:1;min-width:0}',
      '.label{font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#71717a}',
      '.code{font-size:28px;font-weight:700;letter-spacing:.16em;line-height:1.15;color:#fafafa;margin-top:2px}',
      '.meta{margin-top:3px;font-size:12px;color:#a1a1aa}',
      '.meta b{color:#e4e4e7;font-weight:600}',
      '.lobby-actions{display:flex;gap:4px}',
      '.qr{display:none;flex-direction:column;align-items:center;gap:8px;padding:0 0 14px}',
      '.qr.on{display:flex}',
      '.qr-box{background:#fff;border-radius:14px;padding:10px;line-height:0}',
      '.qr-box svg{width:168px;height:168px;display:block}',
      '.qr p{font-size:12px;color:#a1a1aa}',

      // Now playing.
      '.np{display:grid;grid-template-columns:52px minmax(0,1fr) auto;grid-template-areas:"art text ctl" "bar bar bar";' +
        'align-items:center;column-gap:12px;row-gap:10px;padding:12px;border-radius:16px;background:rgba(255,255,255,.045)}',
      '.art{grid-area:art;position:relative;width:52px;height:52px;flex:none;border-radius:10px;overflow:hidden;background:#27272a;' +
        'box-shadow:0 6px 18px rgba(0,0,0,.45),0 0 24px rgba(var(--ac),.25)}',
      '.art img{width:100%;height:100%;object-fit:cover;display:block}',
      '.art img.wide{transform:scale(1.34)}',
      '.np-text{grid-area:text;min-width:0}',
      '.np-title{font-size:14px;font-weight:700;line-height:1.25;color:#fafafa;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;word-break:break-word}',
      '.np-artist{margin-top:1px;font-size:12px;color:#a1a1aa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.prog{grid-area:bar;display:flex;align-items:center;gap:8px;font-size:10px;color:#71717a;font-variant-numeric:tabular-nums}',
      '.bar{flex:1;height:3px;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden}',
      '.bar i{display:block;height:100%;width:0;border-radius:inherit;background:rgb(var(--ac-light))}',
      '.ctl{grid-area:ctl;display:flex;align-items:center}',
      '.ctl-row{display:flex;align-items:center;gap:2px}',
      '.ctl button{width:28px;height:28px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;color:#d4d4d8;transition:background .15s,transform .1s}',
      '.ctl button:hover{background:rgba(255,255,255,.1);color:#fff}',
      '.ctl button:active{transform:scale(.9)}',
      '.ctl .play{width:34px;height:34px;background:#fafafa;color:#0c0c0f}',
      '.ctl .play:hover{background:#fff;color:#000}',
      '.idle .np{opacity:.55}',
      '.idle .ctl,.idle .prog{display:none}',

      // Sync warning.
      '.warn{display:none;align-items:center;gap:10px;margin-top:10px;padding:9px 10px 9px 12px;border-radius:12px;' +
        'background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.25);color:#fde68a;font-size:12px}',
      '.has-pending .warn{display:flex}',
      '.warn span{flex:1}',
      '.warn button{padding:5px 10px;border-radius:999px;background:rgba(245,158,11,.2);color:#fef3c7;font-size:12px;font-weight:600}',
      '.warn button:hover{background:rgba(245,158,11,.32)}',

      // Extension update.
      '.upd{display:none;margin:2px 0 12px;padding:10px 12px;border-radius:14px;background:rgba(139,92,246,.14);border:1px solid rgba(167,139,250,.3)}',
      '.has-update .upd{display:block}',
      '.upd-title{font-size:13px;font-weight:700;color:#ede9fe}',
      '.upd p{margin-top:2px;font-size:11px;color:#c4b5fd;line-height:1.45}',
      '.upd-acts{display:flex;gap:6px;margin-top:8px}',
      '.upd-acts button{padding:6px 12px;border-radius:999px;font-size:12px;font-weight:600;background:rgba(255,255,255,.08);color:#f4f4f5}',
      '.upd-acts button:hover{background:rgba(255,255,255,.14)}',
      '.upd-acts .pri{background:#8b5cf6;color:#fff}',
      '.upd-acts .pri:hover{background:#7c3aed}',
      '.pill-upd{display:none;font-size:9px;font-weight:800;letter-spacing:.08em;padding:2px 6px;border-radius:999px;background:#8b5cf6;color:#fff}',
      '.has-update .pill-upd{display:inline-block}',

      // Shared queue.
      '.q-head{display:flex;align-items:baseline;justify-content:space-between;margin:16px 2px 6px}',
      '.q-title{font-size:14px;font-weight:700}',
      '.q-count{font-size:12px;color:#71717a}',
      '.rows{display:flex;flex-direction:column;gap:2px}',
      '.row{display:flex;align-items:center;gap:10px;padding:6px 6px 6px 4px;border-radius:12px;transition:background .15s}',
      '.row:hover{background:rgba(255,255,255,.05)}',
      '.row-n{width:16px;text-align:center;font-size:12px;color:#71717a;font-variant-numeric:tabular-nums;flex:none}',
      '.row-art{width:38px;height:38px;flex:none;border-radius:8px;overflow:hidden;background:#27272a}',
      '.row-art img{width:100%;height:100%;object-fit:cover;display:block}',
      '.row-art img.wide{transform:scale(1.34)}',
      '.row-text{flex:1;min-width:0}',
      '.row-title{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:#f4f4f5}',
      '.row-title span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.row-by{margin-top:1px;font-size:11px;color:#a1a1aa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.tag{flex:none;font-style:normal;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:2px 6px;border-radius:999px;' +
        'background:rgba(var(--ac),.2);color:rgb(var(--ac-light))}',
      '.row .rm{width:28px;height:28px;flex:none;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;color:#71717a;opacity:0;transition:opacity .15s,background .15s,color .15s}',
      '.row:hover .rm,.row .rm:focus-visible{opacity:1}',
      '.row .rm:hover{background:rgba(239,68,68,.15);color:#fca5a5}',
      '.more{display:block;width:100%;margin-top:6px;padding:8px;border-radius:12px;font-size:12px;font-weight:600;color:rgb(var(--ac-light));text-align:center}',
      '.more:hover{background:rgba(var(--ac),.12)}',
      '.empty{padding:14px 4px 4px;font-size:12px;color:#a1a1aa;line-height:1.5}',
      '.empty b{color:#e4e4e7;font-weight:600}',
      '.autoplay{margin-top:10px;padding:0 4px;font-size:11px;color:#71717a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.autoplay b{color:#a1a1aa;font-weight:600}',

      '@keyframes in{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:none}}',
      '@keyframes ping{0%{box-shadow:0 0 0 0 rgba(52,211,153,.55)}70%,100%{box-shadow:0 0 0 7px rgba(52,211,153,0)}}',
      '@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}',
    ].join('')
  }

  function html() {
    return (
      '<div id="wrap" class="idle">' +
      // Pill.
      '<button type="button" id="pill" class="surface" aria-expanded="false" aria-label="Open YTMQ">' +
      '<span class="logo">' + logo('ytmq-g-pill') + '<span class="status"></span></span>' +
      '<span class="pill-hint" id="pill-hint">Waiting for a lobby…</span>' +
      '<span class="pill-code mono" id="pill-code" hidden></span>' +
      '<span class="pill-sep" id="pill-sep" hidden></span>' +
      '<span class="pill-stat" id="pill-q" hidden title="Songs in the shared queue">' + icon('queue', 15) + '<span></span></span>' +
      '<span class="pill-stat" id="pill-p" hidden title="People listening">' + icon('people', 15) + '<span></span></span>' +
      '<span class="pill-warn" title="Some songs are not in YouTube Music yet"></span>' +
      '<span class="pill-upd" title="Extension update available">NEW</span>' +
      '<span class="pill-chev">' + icon('chevronUp', 16) + '</span>' +
      '</button>' +
      // Panel.
      '<section id="panel" class="surface" role="dialog" aria-label="YTMQ">' +
      '<div class="head">' +
      '<span class="logo">' + logo('ytmq-g-head') + '<span class="status"></span></span>' +
      '<span class="head-title display">YTMQ</span>' +
      '<span class="chip conn"><i></i><span id="conn">Offline</span></span>' +
      '<span class="spacer"></span>' +
      '<button type="button" class="icon-btn" data-a="focus-app" title="Open YTMQ">' + icon('external') + '</button>' +
      '<button type="button" class="icon-btn" id="close" title="Close (Esc)">' + icon('chevronDown') + '</button>' +
      '</div>' +
      '<div class="scroll">' +
      '<div class="upd"><div class="upd-title" id="upd-title">Extension update ready</div>' +
      '<p>Download the zip, unzip it over your YTMQ extension folder, then press Reload.</p>' +
      '<div class="upd-acts"><button type="button" class="pri" id="upd-dl">Download</button>' +
      '<button type="button" id="upd-reload">Reload</button></div></div>' +
      '<div class="lobby"><div class="lobby-text">' +
      '<div class="label">Lobby code</div>' +
      '<div class="code mono" id="code">······</div>' +
      '<div class="meta" id="meta"></div>' +
      '</div><div class="lobby-actions">' +
      '<button type="button" class="icon-btn" data-a="copy-link" title="Copy room link">' + icon('link', 18) + '</button>' +
      '<button type="button" class="icon-btn" id="qr-btn" title="Show QR code">' + icon('qr', 18) + '</button>' +
      '</div></div>' +
      '<div class="qr" id="qr"><div class="qr-box" id="qr-box"></div><p>Scan to join the queue</p></div>' +
      '<div class="np">' +
      '<div class="art"><img id="np-art" alt="" referrerpolicy="no-referrer" hidden></div>' +
      '<div class="np-text">' +
      '<div class="np-title display" id="np-title">Nothing playing</div>' +
      '<div class="np-artist" id="np-artist">Start a song in YouTube Music</div>' +
      '</div>' +
      '<div class="ctl"><div class="ctl-row">' +
      '<button type="button" data-a="prev" title="Previous">' + icon('prev', 15) + '</button>' +
      '<button type="button" class="play" data-a="toggle" id="np-play" title="Play">' + icon('play', 16) + '</button>' +
      '<button type="button" data-a="next" title="Next">' + icon('next', 15) + '</button>' +
      '</div></div>' +
      '<div class="prog"><span id="np-t0">0:00</span><div class="bar"><i id="np-bar"></i></div><span id="np-t1">0:00</span></div>' +
      '</div>' +
      '<div class="warn">' + icon('warn', 16) + '<span id="warn-text"></span>' +
      '<button type="button" data-a="retry-sync">Retry</button></div>' +
      '<div class="q-head"><span class="q-title display">Up next</span><span class="q-count" id="q-count"></span></div>' +
      '<div class="rows" id="rows"></div>' +
      '<div class="autoplay" id="autoplay" hidden></div>' +
      '</div>' +
      '</section>' +
      '</div>'
    )
  }

  // --- helpers --------------------------------------------------------------

  function $(id) {
    return shadow ? shadow.getElementById(id) : null
  }

  function el(tag, className, text) {
    var node = document.createElement(tag)
    if (className) node.className = className
    if (text != null) node.textContent = text
    return node
  }

  function fmt(sec) {
    if (!isFinite(sec) || sec < 0) return '0:00'
    var t = Math.floor(sec)
    var m = Math.floor(t / 60)
    var s = t % 60
    return m + ':' + (s < 10 ? '0' : '') + s
  }

  function plural(n, one, many) {
    return n + ' ' + (n === 1 ? one : many)
  }

  /** YouTube's 16:9 thumbs pad square art; zoom those to crop the bars. */
  function setArt(img, url) {
    if (!url) {
      img.hidden = true
      img.removeAttribute('src')
      return
    }
    if (img.getAttribute('src') !== url) img.src = url
    img.hidden = false
    img.classList.toggle('wide', /i\.ytimg\.com\/vi\//.test(url))
  }

  function safeUrl(url) {
    return typeof url === 'string' && /^https:\/\//.test(url) ? url : ''
  }

  function postAction(action, extra) {
    var msg = { source: PANEL_SOURCE, type: 'panel-action', action: action }
    if (extra) for (var k in extra) msg[k] = extra[k]
    window.postMessage(msg, '*')
  }

  // --- position -------------------------------------------------------------

  function updatePosition() {
    var wrap = $('wrap')
    if (!wrap) return
    var offset = 84
    try {
      var bar = document.querySelector('ytmusic-player-bar')
      var rect = bar && bar.getBoundingClientRect()
      if (rect && rect.height > 0 && rect.top < window.innerHeight) {
        offset = Math.ceil(window.innerHeight - rect.top) + PANEL_GAP
      }
    } catch (e) {
      /* ignore */
    }
    wrap.style.bottom = offset + 'px'
    wrap.style.setProperty('--max-h', Math.max(240, Math.min(620, window.innerHeight - offset - 16)) + 'px')
  }

  // --- open / close -----------------------------------------------------------

  function setExpanded(on, persist) {
    expanded = on
    var wrap = $('wrap')
    if (wrap) wrap.classList.toggle('open', on)
    var pill = $('pill')
    if (pill) pill.setAttribute('aria-expanded', on ? 'true' : 'false')
    if (persist !== false) {
      try {
        localStorage.setItem(OPEN_KEY, on ? '1' : '0')
      } catch (e) {
        /* ignore */
      }
    }
    updatePosition()
  }

  function setQrShown(on) {
    qrShown = on
    var qr = $('qr')
    var btn = $('qr-btn')
    if (qr) qr.classList.toggle('on', on)
    if (btn) {
      btn.classList.toggle('on', on)
      btn.title = on ? 'Hide QR code' : 'Show QR code'
    }
  }

  // --- rendering ------------------------------------------------------------

  function renderQr(qr) {
    var key = qr ? qr.size + ':' + qr.bits : ''
    if (key === lastQrKey) return
    lastQrKey = key
    var box = $('qr-box')
    if (!box) return
    box.textContent = ''
    if (!qr || !qr.size || typeof qr.bits !== 'string') return
    var n = qr.size
    var quiet = 1
    var svg = document.createElementNS(SVG_NS, 'svg')
    svg.setAttribute('viewBox', -quiet + ' ' + -quiet + ' ' + (n + quiet * 2) + ' ' + (n + quiet * 2))
    svg.setAttribute('shape-rendering', 'crispEdges')
    var d = ''
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        if (qr.bits.charAt(y * n + x) === '1') d += 'M' + x + ' ' + y + 'h1v1h-1z'
      }
    }
    var path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', d)
    path.setAttribute('fill', '#09090b')
    svg.appendChild(path)
    box.appendChild(svg)
  }

  function renderQueue(st) {
    var rows = Array.isArray(st.queue) ? st.queue : []
    var total = typeof st.queueCount === 'number' ? st.queueCount : rows.length
    var key = total + '|' + rows.map(function (r) { return r.id + r.title + r.added_by }).join(',')
    var countEl = $('q-count')
    if (countEl) countEl.textContent = total ? plural(total, 'song', 'songs') : ''
    if (key === lastQueueKey) return
    lastQueueKey = key

    var list = $('rows')
    if (!list) return
    list.textContent = ''

    if (rows.length === 0) {
      var empty = el('div', 'empty')
      empty.appendChild(el('b', null, 'No guest picks yet. '))
      empty.appendChild(
        document.createTextNode(
          st.roomCode
            ? 'Friends join at the YTMQ site with code ' + st.roomCode + ', or scan the QR.'
            : 'Share the lobby so friends can add songs.',
        ),
      )
      list.appendChild(empty)
      return
    }

    rows.forEach(function (row, i) {
      var item = el('div', 'row')
      item.appendChild(el('span', 'row-n', String(i + 1)))
      var art = el('div', 'row-art')
      var img = el('img')
      img.alt = ''
      img.loading = 'lazy'
      img.referrerPolicy = 'no-referrer'
      setArt(img, safeUrl(row.thumbnail_url) || (row.video_id ? 'https://i.ytimg.com/vi/' + encodeURIComponent(row.video_id) + '/mqdefault.jpg' : ''))
      art.appendChild(img)
      item.appendChild(art)

      var text = el('div', 'row-text')
      var title = el('div', 'row-title')
      title.appendChild(el('span', null, row.title || 'Untitled'))
      if (row.insert_mode === 'play_next') title.appendChild(el('em', 'tag', 'Next'))
      text.appendChild(title)
      var by = [row.channel_title, row.added_by ? 'added by ' + row.added_by : ''].filter(Boolean).join(' · ')
      text.appendChild(el('div', 'row-by', by || ' '))
      item.appendChild(text)

      var rm = el('button', 'rm')
      rm.type = 'button'
      rm.title = 'Remove from the queue'
      rm.setAttribute('aria-label', 'Remove ' + (row.title || 'song'))
      rm.innerHTML = icon('remove', 14)
      rm.addEventListener('click', function () {
        item.style.opacity = '.4'
        postAction('remove', { id: String(row.id) })
      })
      item.appendChild(rm)
      list.appendChild(item)
    })

    if (total > rows.length) {
      var more = el('button', 'more', '+' + (total - rows.length) + ' more in YTMQ')
      more.type = 'button'
      more.addEventListener('click', function () {
        openApp()
      })
      list.appendChild(more)
    }
  }

  function renderPlayback() {
    var bar = $('np-bar')
    var t0 = $('np-t0')
    var t1 = $('np-t1')
    var now = clock.time
    if (clock.playing && clock.at) now += (Date.now() - clock.at) / 1000
    if (clock.duration > 0) now = Math.min(now, clock.duration)
    var pct = clock.duration > 0 ? (now / clock.duration) * 100 : 0
    if (bar) bar.style.width = pct.toFixed(2) + '%'
    if (t0) t0.textContent = fmt(now)
    if (t1) t1.textContent = clock.duration > 0 ? fmt(clock.duration) : '–:––'
  }

  function applyState(st) {
    if (!st || st.destroy) {
      lastState = null
      if (host) host.style.display = 'none'
      return
    }
    lastState = st
    if (host) host.style.display = ''
    var wrap = $('wrap')
    if (!wrap) return

    var linked = Boolean(st.roomId)
    var live = Boolean(st.connected)
    var np = st.nowPlaying && st.nowPlaying.title ? st.nowPlaying : null
    var queueCount = typeof st.queueCount === 'number' ? st.queueCount : 0
    var listening = typeof st.listeningCount === 'number' ? st.listeningCount : st.participantCount || 0
    var pending = typeof st.pendingCount === 'number' ? st.pendingCount : 0

    wrap.classList.toggle('live', live)
    wrap.classList.toggle('wait', linked && !live)
    wrap.classList.toggle('idle', !np)
    wrap.classList.toggle('has-pending', pending > 0)

    if (Array.isArray(st.accent) && st.accent.length === 3) {
      var rgb = st.accent.map(function (v) { return Math.max(0, Math.min(255, Math.round(Number(v) || 0))) })
      // A lighter mix of the accent for text and the progress bar.
      var light = rgb.map(function (v) { return Math.round(v + (255 - v) * 0.45) })
      wrap.style.setProperty('--ac', rgb.join(' '))
      wrap.style.setProperty('--ac-light', light.join(' '))
    }

    // Pill.
    var code = st.roomCode || ''
    $('pill-hint').hidden = live && Boolean(code)
    $('pill-hint').textContent = !linked ? 'Waiting for a lobby…' : live ? 'Lobby linked' : 'Connecting…'
    $('pill-code').hidden = !(live && code)
    $('pill-code').textContent = code
    $('pill-sep').hidden = !live
    $('pill-q').hidden = !live
    $('pill-q').lastChild.textContent = String(queueCount)
    $('pill-p').hidden = !live
    $('pill-p').lastChild.textContent = String(listening)
    $('pill').setAttribute(
      'aria-label',
      'YTMQ' + (code ? ', lobby ' + code : '') + ', ' + plural(queueCount, 'song', 'songs') + ' queued, ' + listening + ' listening',
    )

    // Header + lobby.
    $('conn').textContent = live ? 'Live' : linked ? 'Connecting' : 'Offline'
    $('code').textContent = code || '······'
    var meta = $('meta')
    meta.textContent = ''
    if (linked) {
      meta.appendChild(el('b', null, String(listening)))
      meta.appendChild(document.createTextNode(' listening · '))
      meta.appendChild(el('b', null, String(queueCount)))
      meta.appendChild(document.createTextNode(queueCount === 1 ? ' song queued' : ' songs queued'))
    } else {
      meta.textContent = 'Open your lobby in YTMQ as host'
    }
    renderQr(st.qr)

    // Now playing.
    setArt($('np-art'), np ? safeUrl(np.thumbnailUrl) : '')
    $('np-title').textContent = np ? np.title : 'Nothing playing'
    $('np-title').title = np ? np.title : ''
    $('np-artist').textContent = np ? np.artist || ' ' : 'Start a song in YouTube Music'
    var playing = Boolean(np && np.state === 'playing')
    var playBtn = $('np-play')
    if (playBtn.dataset.state !== String(playing)) {
      playBtn.dataset.state = String(playing)
      playBtn.innerHTML = icon(playing ? 'pause' : 'play', 16)
      playBtn.title = playing ? 'Pause' : 'Play'
    }
    clock = {
      at: Date.now(),
      time: np && isFinite(np.currentTime) ? np.currentTime : 0,
      duration: np && np.duration > 0 ? np.duration : 0,
      playing: playing,
    }
    renderPlayback()

    // Sync warning.
    $('warn-text').textContent =
      plural(pending, 'song is', 'songs are') + ' not in YouTube Music yet'

    // Queue + what YouTube Music will play when the shared queue runs dry.
    renderQueue(st)
    var auto = $('autoplay')
    var nx = st.nextSong
    var showAuto = queueCount === 0 && nx && nx.title
    auto.hidden = !showAuto
    auto.textContent = ''
    if (showAuto) {
      auto.appendChild(document.createTextNode('YouTube Music plays next: '))
      auto.appendChild(el('b', null, nx.title + (nx.artist ? ' · ' + nx.artist : '')))
    }
  }

  // --- wiring ---------------------------------------------------------------

  function sendRuntime(message) {
    try {
      chrome.runtime.sendMessage(message, function () {
        void chrome.runtime.lastError
      })
    } catch (e) {
      /* extension reloaded under us */
    }
  }

  var update = null

  function applyUpdate(next) {
    update = next && next.available ? next : null
    var wrap = $('wrap')
    if (wrap) wrap.classList.toggle('has-update', Boolean(update))
    var title = $('upd-title')
    if (title && update) {
      title.textContent =
        'Extension update ready' + (update.version ? ' (v' + update.current + ' → v' + update.version + ')' : '')
    }
  }

  function openApp() {
    try {
      chrome.runtime.sendMessage({
        type: 'ytmq-focus-app',
        roomId: (lastState && lastState.roomId) || '',
      })
    } catch (e) {
      postAction('focus-app')
    }
  }

  function bind() {
    $('pill').addEventListener('click', function () {
      setExpanded(true)
    })
    $('close').addEventListener('click', function () {
      setExpanded(false)
    })
    $('qr-btn').addEventListener('click', function () {
      setQrShown(!qrShown)
    })
    $('upd-dl').addEventListener('click', function () {
      sendRuntime({ type: 'ytmq-download-update' })
    })
    $('upd-reload').addEventListener('click', function () {
      sendRuntime({ type: 'ytmq-reload-extension' })
    })
    shadow.querySelectorAll('[data-a]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var action = btn.getAttribute('data-a')
        if (action === 'focus-app' || action === 'open-app') {
          openApp()
          return
        }
        postAction(action)
      })
    })
    shadow.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && expanded) {
        e.stopPropagation()
        setExpanded(false)
        var pill = $('pill')
        if (pill) pill.focus()
      }
    })
    // Keep YouTube Music's own shortcuts (space, j/k...) from firing while
    // a panel button has focus.
    shadow.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'Enter') e.stopPropagation()
    })
  }

  /** @font-face does not work inside shadow roots, so the font goes on the page. */
  function ensureFont() {
    if (document.getElementById(FONT_LINK_ID)) return
    var link = document.createElement('link')
    link.id = FONT_LINK_ID
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&display=swap'
    ;(document.head || document.documentElement).appendChild(link)
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
      lastQueueKey = ''
      lastQrKey = ''
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
    var mount = document.createElement('div')
    mount.innerHTML = html()
    shadow.appendChild(mount.firstElementChild)
    bind()
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
        lastQueueKey = ''
        lastQrKey = ''
        if (lastState) applyState(lastState)
        applyUpdate(update)
      }
      parent.appendChild(host)
    }
    if (document.head) ensureFont()
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
  window.setInterval(function () {
    if (clock.playing && lastState) renderPlayback()
  }, 250)

  try {
    var showStored = function (session) {
      if (!session || !session.roomId) {
        applyState({ destroy: true })
        return
      }
      ensureHost()
      if (!lastState || !lastState.connected) {
        applyState({ roomId: session.roomId, connected: false, queueCount: 0, listeningCount: 0 })
      }
    }
    chrome.storage.local.get('ytmq_session', function (data) {
      if (data && data.ytmq_session) showStored(data.ytmq_session)
    })
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local') return
      if (changes.ytmq_session) showStored(changes.ytmq_session.newValue)
      if (changes.ytmq_update) applyUpdate(changes.ytmq_update.newValue)
    })
    chrome.storage.local.get('ytmq_update', function (data) {
      applyUpdate(data && data.ytmq_update)
    })
    // Throttled in the background; this just makes sure a check happens.
    sendRuntime({ type: 'ytmq-check-update' })
  } catch (e) {
    /* ignore */
  }
})()
