/**
 * The YTMQ panel view, shared by the YouTube Music overlay (ytm-panel.js,
 * inside a shadow root) and the toolbar popup (popup.js), so both look and
 * behave the same.
 *
 *   var view = YTMQUI.createView(container, { mode, onAction })
 *   view.apply(state)        // panel-state from the bridge, plus `phase`
 *   view.applyUpdate(update) // extension update info, or null
 *
 * `phase` picks what the body shows: 'unlinked', 'no-tab', 'connecting',
 * 'ended' or 'live'. Everything that comes from guests (titles, names) is
 * set with textContent, never parsed as markup.
 *
 * Plain script, no modules: content scripts and the popup both load it as a
 * classic script and read window.YTMQUI.
 */
;(function () {
  if (window.YTMQUI) return

  var SVG_NS = 'http://www.w3.org/2000/svg'
  var SITE = 'https://t3lluz.com/ytmq'
  var logoCount = 0

  var ICONS = {
    queue: '<path d="M3 6h13"/><path d="M3 12h9"/><path d="M3 18h9"/><path d="M17 11v8"/><path d="m14 16 3 3 3-3"/>',
    people: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    chevronUp: '<path d="m6 15 6-6 6 6"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3z"/><path d="M20 14v.01"/><path d="M14 20h.01"/><path d="M17 17h4v4h-4"/>',
    prev: '<path d="M19 20 9 12l10-8v16z" fill="currentColor" stroke="none"/><path d="M5 19V5"/>',
    next: '<path d="m5 4 10 8-10 8V4z" fill="currentColor" stroke="none"/><path d="M19 5v14"/>',
    play: '<path d="M7 4v16l13-8z" fill="currentColor" stroke="none"/>',
    pause: '<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/>',
    remove: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    warn: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>',
    ytm: '<circle cx="12" cy="12" r="10" fill="#ff0033" stroke="none"/><circle cx="12" cy="12" r="5.2" fill="none" stroke="#fff" stroke-width="1.4"/><path d="M10.6 9.6v4.8l3.9-2.4z" fill="#fff" stroke="none"/>',
    spotify: '<circle cx="12" cy="12" r="10" fill="#1ed760" stroke="none"/><path d="M7 9.4c3.4-1 7.2-.7 10 .9" stroke="#000" stroke-width="1.6"/><path d="M7.6 12.4c2.8-.8 5.8-.5 8.2.8" stroke="#000" stroke-width="1.4"/><path d="M8.2 15.2c2.2-.6 4.4-.4 6.3.6" stroke="#000" stroke-width="1.2"/>',
    sparkle: '<path d="M12 3v3"/><path d="M12 18v3"/><path d="M3 12h3"/><path d="M18 12h3"/><path d="m5.6 5.6 2.1 2.1"/><path d="m16.3 16.3 2.1 2.1"/><path d="m5.6 18.4 2.1-2.1"/><path d="m16.3 7.7 2.1-2.1"/>',
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

  /** The app's logo. Every copy needs its own gradient id, or a hidden copy
   *  takes the gradient with it. */
  function logo() {
    var id = 'ytmq-g-' + ++logoCount
    return (
      '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><defs><linearGradient id="' + id +
      '" x1="6" y1="4" x2="26" y2="28"><stop stop-color="#8B5CF6"/><stop offset="1" stop-color="#D946EF"/></linearGradient></defs><rect width="32" height="32" rx="8" fill="url(#' + id +
      ')"/><rect x="6" y="7" width="20" height="6.5" rx="3.25" fill="#fff" fill-opacity="0.96"/><path fill="#7C3AED" d="M10.2 9.1v3.3l3.1-1.65z"/><rect x="6" y="15.5" width="20" height="4.5" rx="2.25" fill="#fff" fill-opacity="0.42"/><rect x="6" y="21.5" width="13.5" height="4.5" rx="2.25" fill="#fff" fill-opacity="0.24"/></svg>'
    )
  }

  var EASE = 'cubic-bezier(.22,1,.36,1)'

  /** Styles for the view. `scope` prefixes nothing; both hosts isolate it
   *  (shadow root, or a page of its own). */
  function css() {
    return [
      '*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;margin:0}',
      '[hidden]{display:none!important}',
      'button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer}',
      'button:focus-visible{outline:2px solid rgb(var(--ac-light));outline-offset:2px}',
      '.display{font-family:Montserrat,"YouTube Sans",Roboto,system-ui,sans-serif}',
      '.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',

      '.ytmq-ui{--ac:139 92 246;--ac-light:196 181 253;font-family:"YouTube Sans",Roboto,system-ui,-apple-system,sans-serif;' +
        'font-size:13px;line-height:1.35;color:#f4f4f5;-webkit-font-smoothing:antialiased}',

      // Glass surface, tinted by the album art through a cross-faded glow.
      '.surface{position:relative;background:rgba(12,12,15,.84);backdrop-filter:blur(24px) saturate(170%);' +
        '-webkit-backdrop-filter:blur(24px) saturate(170%);border:1px solid rgba(255,255,255,.09);' +
        'box-shadow:0 18px 50px rgba(0,0,0,.55),0 0 0 1px rgba(var(--ac),.08)}',
      '.glow{position:absolute;inset:0;border-radius:inherit;pointer-events:none;overflow:hidden}',
      '.glow i{position:absolute;inset:0;opacity:0;transition:opacity .9s ease}',
      '.glow i.on{opacity:1}',

      // View layout.
      '.view{display:flex;flex-direction:column;min-height:0;max-height:inherit;border-radius:inherit}',
      '.view>*{position:relative}',
      '.head{display:flex;align-items:center;gap:10px;padding:12px 10px 6px 12px;flex:none}',
      '.logo{position:relative;width:28px;height:28px;flex:none}',
      '.logo svg{display:block;width:100%;height:100%;border-radius:8px}',
      '.status{position:absolute;right:-2px;bottom:-2px;width:11px;height:11px;border-radius:50%;border:2px solid #0c0c0f;background:#71717a;transition:background .3s}',
      '.is-live .status{background:#34d399;animation:ytmq-ping 2.4s ease-out infinite}',
      '.is-connecting .status{background:#fbbf24;animation:ytmq-blink 1.2s ease-in-out infinite}',
      '.title{font-size:15px;font-weight:800;letter-spacing:.01em}',
      '.chip{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 9px;border-radius:999px;font-size:11px;font-weight:600;' +
        'background:rgba(113,113,122,.18);color:#d4d4d8;border:1px solid rgba(113,113,122,.3);transition:background .3s,color .3s,border-color .3s}',
      '.chip i{width:6px;height:6px;border-radius:50%;background:currentColor}',
      '.is-live .chip{background:rgba(16,185,129,.12);color:#6ee7b7;border-color:rgba(16,185,129,.3)}',
      '.is-connecting .chip{background:rgba(245,158,11,.12);color:#fcd34d;border-color:rgba(245,158,11,.3)}',
      '.is-ended .chip{background:rgba(239,68,68,.12);color:#fca5a5;border-color:rgba(239,68,68,.3)}',
      '.spacer{flex:1}',
      '.icon-btn{width:32px;height:32px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;color:#a1a1aa;' +
        'transition:background .15s,color .15s,transform .12s}',
      '.icon-btn:hover{background:rgba(255,255,255,.08);color:#fafafa}',
      '.icon-btn:active{transform:scale(.9)}',
      '.icon-btn.on{background:rgba(var(--ac),.2);color:rgb(var(--ac-light))}',

      '.body{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:0 14px 12px;' +
        'scrollbar-width:thin;scrollbar-color:rgba(113,113,122,.4) transparent}',
      '.body::-webkit-scrollbar{width:6px}',
      '.body::-webkit-scrollbar-thumb{background:rgba(113,113,122,.4);border-radius:999px}',
      '.pane{animation:ytmq-in .35s ' + EASE + ' backwards}',

      // Collapsible blocks (QR, banners): animate height via grid rows.
      '.fold{display:grid;grid-template-rows:0fr;opacity:0;transition:grid-template-rows .32s ' + EASE + ',opacity .2s ease,margin .32s ' + EASE + '}',
      '.fold>div{overflow:hidden;min-height:0}',
      '.fold.on{grid-template-rows:1fr;opacity:1}',

      // Empty / status states.
      '.empty-state{display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;padding:22px 8px 10px}',
      '.empty-icon{width:48px;height:48px;border-radius:16px;display:flex;align-items:center;justify-content:center;margin-bottom:6px;' +
        'background:rgba(var(--ac),.14);color:rgb(var(--ac-light))}',
      '.empty-state h3{font-size:16px;font-weight:700;color:#fafafa}',
      '.empty-state p{font-size:12.5px;color:#a1a1aa;line-height:1.5;max-width:280px}',
      '.empty-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:10px}',
      '.btn{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 16px;border-radius:999px;font-size:13px;font-weight:600;' +
        'background:rgba(255,255,255,.08);color:#f4f4f5;transition:background .15s,transform .12s,box-shadow .2s}',
      '.btn:hover{background:rgba(255,255,255,.14)}',
      '.btn:active{transform:scale(.96)}',
      '.btn.pri{background:linear-gradient(135deg,#8b5cf6,#7c3aed);color:#fff;box-shadow:0 6px 18px rgba(124,58,237,.35)}',
      '.btn.pri:hover{background:linear-gradient(135deg,#a78bfa,#8b5cf6)}',
      '.spinner{width:22px;height:22px;border-radius:50%;border:2.5px solid rgba(var(--ac),.25);border-top-color:rgb(var(--ac-light));animation:ytmq-spin .8s linear infinite}',

      // Lobby.
      '.lobby{display:flex;align-items:center;gap:12px;padding:8px 0 12px}',
      '.lobby-text{flex:1;min-width:0}',
      '.label{font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#71717a}',
      '.code{font-size:28px;font-weight:700;letter-spacing:.16em;line-height:1.15;color:#fafafa;margin-top:2px}',
      '.join{margin-top:3px;font-size:12px;color:#a1a1aa}',
      '.join b{color:#e4e4e7;font-weight:600}',
      '.lobby-actions{display:flex;gap:2px}',
      '.stats{display:flex;gap:6px;margin:0 0 12px}',
      '.stat{flex:1;display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.045)}',
      '.stat svg{color:rgb(var(--ac-light));flex:none}',
      '.stat b{font-size:15px;font-weight:700;font-variant-numeric:tabular-nums;color:#fafafa;display:inline-block}',
      '.stat span{font-size:11px;color:#a1a1aa}',
      '.qr-inner{display:flex;flex-direction:column;align-items:center;gap:8px;padding:0 0 14px}',
      '.qr-box{background:#fff;border-radius:16px;padding:10px;line-height:0;box-shadow:0 10px 30px rgba(0,0,0,.4)}',
      '.qr-box svg{width:172px;height:172px;display:block}',
      '.qr-inner p{font-size:12px;color:#a1a1aa}',

      // Now playing.
      '.np{display:grid;grid-template-columns:52px minmax(0,1fr) auto;grid-template-areas:"art text ctl" "bar bar bar";' +
        'align-items:center;column-gap:12px;row-gap:10px;padding:12px;border-radius:16px;background:rgba(255,255,255,.045)}',
      '.np.swap .art,.np.swap .np-text{animation:ytmq-swap .45s ' + EASE + ' backwards}',
      '.np.swap .np-text{animation-delay:.04s}',
      '.art{grid-area:art;position:relative;width:52px;height:52px;border-radius:10px;overflow:hidden;background:#27272a;' +
        'box-shadow:0 6px 18px rgba(0,0,0,.45),0 0 24px rgba(var(--ac),.25)}',
      '.art img,.row-art img{width:100%;height:100%;object-fit:cover;display:block;opacity:0;transition:opacity .3s}',
      '.art img.ready,.row-art img.ready{opacity:1}',
      '.wide{transform:scale(1.34)}',
      '.np-text{grid-area:text;min-width:0}',
      '.np-label{display:flex;align-items:center;gap:6px;white-space:nowrap;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:rgb(var(--ac-light));margin-bottom:2px}',
      '.eq{display:inline-flex;align-items:flex-end;gap:2px;height:10px}',
      '.eq i{width:2px;height:100%;border-radius:1px;background:currentColor;transform-origin:bottom;transform:scaleY(.35)}',
      '.playing .eq i{animation:ytmq-eq 1s ease-in-out infinite}',
      '.playing .eq i:nth-child(2){animation-delay:-.4s}',
      '.playing .eq i:nth-child(3){animation-delay:-.7s}',
      '.np-title{font-size:14px;font-weight:700;line-height:1.25;color:#fafafa;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;word-break:break-word}',
      '.np-artist{margin-top:1px;font-size:12px;color:#a1a1aa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.ctl{grid-area:ctl;display:flex;align-items:center}',
      '.ctl button{width:28px;height:28px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;color:#d4d4d8;transition:background .15s,transform .1s,color .15s}',
      '.ctl button:hover{background:rgba(255,255,255,.1);color:#fff}',
      '.ctl button:active{transform:scale(.88)}',
      '.ctl .play{width:34px;height:34px;background:#fafafa;color:#0c0c0f;margin:0 2px}',
      '.ctl .play:hover{background:#fff;color:#000}',
      '.prog{grid-area:bar;display:flex;align-items:center;gap:8px;font-size:10px;color:#71717a;font-variant-numeric:tabular-nums}',
      '.bar{flex:1;height:3px;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden}',
      '.bar i{display:block;height:100%;width:0;border-radius:inherit;background:rgb(var(--ac-light));transition:background .6s}',
      '.np.idle{grid-template-areas:"art text text" "bar bar bar"}',
      '.np.idle .ctl,.np.idle .prog{display:none}',
      '.np.idle .art{box-shadow:none}',

      '.src-badge{display:inline-flex;align-items:center;gap:4px;margin-left:auto;padding:1px 7px 1px 3px;border-radius:999px;background:rgba(255,255,255,.07);color:#d4d4d8;letter-spacing:.04em;text-transform:none;font-weight:600}',

      // Sources (popup): where playback comes from.
      '.sources{display:flex;flex-direction:column;gap:2px;margin-top:12px}',
      '.src{display:flex;align-items:center;gap:10px;padding:8px 8px 8px 10px;border-radius:12px;background:rgba(255,255,255,.035);transition:background .2s}',
      '.src-ico{flex:none;line-height:0}',
      '.src-text{flex:1;min-width:0;display:flex;flex-direction:column}',
      '.src-text b{font-size:13px;font-weight:600;color:#f4f4f5}',
      '.src-text span{font-size:11px;color:#a1a1aa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.src-dot{width:7px;height:7px;border-radius:50%;flex:none;background:#52525b;transition:background .3s}',
      '.src.live .src-dot{background:#34d399;box-shadow:0 0 0 3px rgba(52,211,153,.18)}',
      '.src.connecting .src-dot{background:#fbbf24;animation:ytmq-blink 1.2s ease-in-out infinite}',
      '.btn.sm{height:28px;padding:0 12px;font-size:12px}',

      // Banners.
      '.banner{display:flex;align-items:center;gap:10px;padding:9px 10px 9px 12px;border-radius:12px;font-size:12px;line-height:1.4}',
      '.banner span{flex:1}',
      '.banner button{padding:5px 11px;border-radius:999px;font-size:12px;font-weight:600;white-space:nowrap;transition:background .15s,transform .12s}',
      '.banner button:active{transform:scale(.95)}',
      '.warn{margin-top:10px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.25);color:#fde68a}',
      '.warn button{background:rgba(245,158,11,.2);color:#fef3c7}',
      '.warn button:hover{background:rgba(245,158,11,.32)}',
      '.upd{flex-direction:column;align-items:stretch;gap:2px;margin-bottom:12px;padding:10px 12px;background:rgba(139,92,246,.14);border:1px solid rgba(167,139,250,.3);color:#ddd6fe}',
      '.upd strong{font-size:13px;color:#ede9fe}',
      '.upd p{font-size:11px;color:#c4b5fd;line-height:1.45}',
      '.upd .row-btns{display:flex;gap:6px;margin-top:8px}',
      '.upd button{background:rgba(255,255,255,.08);color:#f4f4f5}',
      '.upd button:hover{background:rgba(255,255,255,.14)}',
      '.upd button.pri{background:#8b5cf6;color:#fff}',
      '.upd button.pri:hover{background:#7c3aed}',

      // Shared queue.
      '.q-head{display:flex;align-items:baseline;justify-content:space-between;margin:16px 2px 6px}',
      '.q-title{font-size:14px;font-weight:700}',
      '.q-count{font-size:12px;color:#71717a}',
      '.rows{position:relative;display:flex;flex-direction:column;gap:2px}',
      '.row{display:flex;align-items:center;gap:10px;padding:6px 6px 6px 4px;border-radius:12px;transition:background .15s,opacity .2s}',
      '.row:hover{background:rgba(255,255,255,.05)}',
      '.row.enter{animation:ytmq-row-in .4s ' + EASE + ' backwards}',
      '.row.leave{animation:ytmq-row-out .26s ease-in both;pointer-events:none}',
      '.row.busy{opacity:.45}',
      '.row-n{width:16px;text-align:center;font-size:12px;color:#71717a;font-variant-numeric:tabular-nums;flex:none}',
      '.row-art{width:38px;height:38px;flex:none;border-radius:8px;overflow:hidden;background:#27272a}',
      '.row-text{flex:1;min-width:0}',
      '.row-title{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:#f4f4f5}',
      '.row-title span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.row-by{margin-top:1px;font-size:11px;color:#a1a1aa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.tag{flex:none;font-style:normal;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:2px 6px;border-radius:999px;' +
        'background:rgba(var(--ac),.2);color:rgb(var(--ac-light))}',
      '.rm{width:28px;height:28px;flex:none;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;color:#71717a;opacity:0;transition:opacity .15s,background .15s,color .15s}',
      '.row:hover .rm,.rm:focus-visible{opacity:1}',
      '.rm:hover{background:rgba(239,68,68,.15);color:#fca5a5}',
      '@media (hover:none){.rm{opacity:.7}}',
      '.more{display:block;width:100%;margin-top:6px;padding:8px;border-radius:12px;font-size:12px;font-weight:600;color:rgb(var(--ac-light));text-align:center;transition:background .15s}',
      '.more:hover{background:rgba(var(--ac),.12)}',
      '.q-empty{padding:12px 4px 4px;font-size:12px;color:#a1a1aa;line-height:1.5}',
      '.q-empty b{color:#e4e4e7;font-weight:600}',
      '.autoplay{margin-top:10px;padding:0 4px;font-size:11px;color:#71717a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.autoplay b{color:#a1a1aa;font-weight:600}',

      // Footer.
      '.foot{display:flex;align-items:center;gap:6px;padding:8px 10px 10px 12px;border-top:1px solid rgba(255,255,255,.06);flex:none}',
      '.foot .link{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 10px;border-radius:999px;font-size:12px;font-weight:600;color:#a1a1aa;transition:background .15s,color .15s}',
      '.foot .link:hover{background:rgba(255,255,255,.07);color:#fafafa}',
      '.foot .link.danger:hover{background:rgba(239,68,68,.12);color:#fca5a5}',

      '.bump{animation:ytmq-bump .45s ' + EASE + '}',

      '@keyframes ytmq-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',
      '@keyframes ytmq-swap{from{opacity:0;transform:translateY(6px) scale(.97);filter:blur(4px)}to{opacity:1;transform:none;filter:none}}',
      '@keyframes ytmq-row-in{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:none}}',
      '@keyframes ytmq-row-out{to{opacity:0;transform:translateX(14px);margin-top:-48px}}',
      '@keyframes ytmq-bump{0%{transform:scale(1)}35%{transform:scale(1.3);color:rgb(var(--ac-light))}100%{transform:scale(1)}}',
      '@keyframes ytmq-eq{0%,100%{transform:scaleY(.3)}50%{transform:scaleY(1)}}',
      '@keyframes ytmq-ping{0%{box-shadow:0 0 0 0 rgba(52,211,153,.55)}70%,100%{box-shadow:0 0 0 7px rgba(52,211,153,0)}}',
      '@keyframes ytmq-blink{50%{opacity:.4}}',
      '@keyframes ytmq-spin{to{transform:rotate(360deg)}}',
      '@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}',
    ].join('')
  }

  // --- small helpers ----------------------------------------------------------

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

  function safeUrl(url) {
    return typeof url === 'string' && /^https:\/\//.test(url) ? url : ''
  }

  function thumbFor(row) {
    return (
      safeUrl(row.thumbnail_url) ||
      (row.video_id ? 'https://i.ytimg.com/vi/' + encodeURIComponent(row.video_id) + '/mqdefault.jpg' : '')
    )
  }

  /** YouTube's 16:9 thumbs pad square art; zoom those to crop the bars.
   *  Images fade in once loaded instead of popping. */
  function setArt(img, url) {
    if (!url) {
      img.hidden = true
      img.removeAttribute('src')
      img.classList.remove('ready')
      return
    }
    img.hidden = false
    img.classList.toggle('wide', /i\.ytimg\.com\/vi\//.test(url))
    if (img.getAttribute('src') === url) return
    img.classList.remove('ready')
    img.onload = function () {
      img.classList.add('ready')
    }
    img.src = url
  }

  function bump(node) {
    node.classList.remove('bump')
    void node.offsetWidth
    node.classList.add('bump')
  }

  function setText(node, text, animate) {
    var value = String(text)
    if (node.textContent === value) return
    node.textContent = value
    if (animate) bump(node)
  }

  function clampRgb(list) {
    return list.map(function (v) {
      return Math.max(0, Math.min(255, Math.round(Number(v) || 0)))
    })
  }

  function drawQr(box, qr) {
    box.textContent = ''
    if (!qr || !qr.size || typeof qr.bits !== 'string') return
    var n = qr.size
    var svg = document.createElementNS(SVG_NS, 'svg')
    svg.setAttribute('viewBox', '-1 -1 ' + (n + 2) + ' ' + (n + 2))
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

  // --- the view ---------------------------------------------------------------

  function skeleton(mode) {
    return (
      '<div class="glow" aria-hidden="true"><i data-glow="0"></i><i data-glow="1"></i></div>' +
      '<div class="view">' +
      '<header class="head">' +
      '<span class="logo">' + logo() + '<span class="status"></span></span>' +
      '<span class="title display">YTMQ</span>' +
      '<span class="chip"><i></i><span data-r="chip">Not linked</span></span>' +
      '<span class="spacer"></span>' +
      '<button type="button" class="icon-btn" data-a="open-app" title="Open YTMQ">' + icon('external') + '</button>' +
      (mode === 'overlay'
        ? '<button type="button" class="icon-btn" data-a="close" title="Close (Esc)">' + icon('chevronDown') + '</button>'
        : '') +
      '</header>' +
      '<div class="body" data-r="body">' +
      // Extension update.
      '<div class="fold" data-r="upd"><div><div class="banner upd">' +
      '<strong data-r="upd-title">Extension update ready</strong>' +
      '<p>Download the zip, unzip it over your YTMQ extension folder, then press Reload.</p>' +
      '<div class="row-btns"><button type="button" class="pri" data-a="update-download">Download</button>' +
      '<button type="button" data-a="update-reload">Reload</button></div></div></div></div>' +
      // Status states.
      '<div class="empty-state pane" data-r="state" hidden>' +
      '<div class="empty-icon" data-r="state-icon"></div>' +
      '<h3 class="display" data-r="state-title"></h3>' +
      '<p data-r="state-text"></p>' +
      '<div class="empty-actions" data-r="state-actions"></div>' +
      '</div>' +
      // Live.
      '<div class="pane" data-r="live" hidden>' +
      '<div class="lobby"><div class="lobby-text">' +
      '<div class="label">Lobby code</div>' +
      '<div class="code mono" data-r="code">······</div>' +
      '<div class="join">Guests join at <b>t3lluz.com/ytmq</b></div>' +
      '</div><div class="lobby-actions">' +
      '<button type="button" class="icon-btn" data-a="copy-link" data-r="copy" title="Copy room link">' + icon('link', 18) + '</button>' +
      '<button type="button" class="icon-btn" data-a="qr" data-r="qr-btn" title="Show QR code">' + icon('qr', 18) + '</button>' +
      '</div></div>' +
      '<div class="fold" data-r="qr"><div><div class="qr-inner"><div class="qr-box" data-r="qr-box"></div><p>Scan with a phone camera to join</p></div></div></div>' +
      '<div class="stats">' +
      '<div class="stat" title="People with the lobby open">' + icon('people', 16) + '<div><b data-r="listening">0</b> <span>listening</span></div></div>' +
      '<div class="stat" title="Songs in the shared queue">' + icon('queue', 16) + '<div><b data-r="queued">0</b> <span data-r="queued-label">queued</span></div></div>' +
      '</div>' +
      '<div class="np idle" data-r="np">' +
      '<div class="art"><img data-r="np-art" alt="" referrerpolicy="no-referrer" hidden></div>' +
      '<div class="np-text">' +
      '<div class="np-label"><span class="eq" aria-hidden="true"><i></i><i></i><i></i></span><span data-r="np-label">Now playing</span>' +
      '<span class="src-badge" data-r="np-src" hidden></span></div>' +
      '<div class="np-title display" data-r="np-title">Nothing playing</div>' +
      '<div class="np-artist" data-r="np-artist">Start a song in YouTube Music</div>' +
      '</div>' +
      '<div class="ctl">' +
      '<button type="button" data-a="prev" title="Previous">' + icon('prev', 15) + '</button>' +
      '<button type="button" class="play" data-a="toggle" data-r="play" title="Play">' + icon('play', 16) + '</button>' +
      '<button type="button" data-a="next" title="Next">' + icon('next', 15) + '</button>' +
      '</div>' +
      '<div class="prog"><span data-r="t0">0:00</span><div class="bar"><i data-r="bar"></i></div><span data-r="t1">0:00</span></div>' +
      '</div>' +
      (mode === 'popup'
        ? '<div class="sources">' +
          '<div class="src" data-r="src-ytm"><span class="src-dot"></span><span class="src-ico">' + icon('ytm', 22) + '</span>' +
          '<div class="src-text"><b>YouTube Music</b><span data-r="src-ytm-text"></span></div>' +
          '<button type="button" class="btn sm" data-r="src-ytm-btn" data-a="open-ytm">Open</button></div>' +
          '<div class="src" data-r="src-sp"><span class="src-dot"></span><span class="src-ico">' + icon('spotify', 22) + '</span>' +
          '<div class="src-text"><b>Spotify</b><span data-r="src-sp-text"></span></div>' +
          '<button type="button" class="btn sm" data-r="src-sp-btn" data-a="open-admin">Set up</button></div>' +
          '</div>'
        : '') +
      '<div class="fold" data-r="warn"><div><div class="banner warn">' + icon('warn', 16) +
      '<span data-r="warn-text"></span><button type="button" data-a="retry-sync">Retry</button></div></div></div>' +
      '<div class="q-head"><span class="q-title display">Up next from guests</span><span class="q-count" data-r="q-count"></span></div>' +
      '<div class="rows" data-r="rows"></div>' +
      '<div class="autoplay" data-r="autoplay" hidden></div>' +
      '</div>' +
      '</div>' +
      '<footer class="foot" data-r="foot">' +
      '<button type="button" class="link" data-a="open-app">' + icon('external', 14) + 'Open YTMQ</button>' +
      '<span class="spacer"></span>' +
      '<button type="button" class="link danger" data-a="disconnect" title="Unlink YouTube Music from this lobby">' + icon('power', 14) + 'Disconnect</button>' +
      '</footer>' +
      '</div>'
    )
  }

  var STATES = {
    unlinked: {
      icon: 'music',
      chip: 'Not linked',
      title: 'No lobby linked yet',
      text: 'Create a lobby on YTMQ, then press Connect YouTube Music in its Admin tab. This picks it up by itself.',
      actions: [
        ['open-app', 'Open YTMQ', true],
        ['setup', 'Setup guide', false],
      ],
    },
    connecting: {
      icon: null,
      chip: 'Connecting',
      title: 'Connecting to your lobby…',
      text: 'Linking this YouTube Music tab to the shared queue. It usually takes a second or two.',
      actions: [],
    },
    ended: {
      icon: 'power',
      chip: 'Ended',
      title: 'This lobby has ended',
      text: 'Start a new lobby on YTMQ and connect YouTube Music from its Admin tab again.',
      actions: [['open-app', 'Start a new lobby', true]],
    },
  }

  function createView(container, opts) {
    var mode = opts.mode || 'overlay'
    var onAction = opts.onAction || function () {}
    container.classList.add('ytmq-ui', 'surface', 'mode-' + mode)
    container.innerHTML = skeleton(mode)

    var r = {}
    container.querySelectorAll('[data-r]').forEach(function (node) {
      r[node.getAttribute('data-r')] = node
    })
    var glows = container.querySelectorAll('[data-glow]')

    var current = {
      phase: '',
      videoId: '',
      queueKey: '',
      qrKey: '',
      qrShown: false,
      accentKey: '',
      glow: 0,
      roomUrl: '',
      rows: Object.create(null),
      clock: { at: 0, time: 0, duration: 0, playing: false },
      lastState: null,
    }

    // Buttons with data-a either act locally or go out through onAction.
    container.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('[data-a]') : null
      if (!btn || !container.contains(btn)) return
      var action = btn.getAttribute('data-a')
      if (action === 'qr') {
        setQr(!current.qrShown)
        return
      }
      if (action === 'copy-link') {
        flashCopied()
      }
      if (action === 'remove') {
        var row = btn.closest('.row')
        if (row) row.classList.add('busy')
        onAction('remove', { id: btn.getAttribute('data-id') })
        return
      }
      if (action === 'setup') {
        onAction('open-url', { url: SITE + '/setup' })
        return
      }
      onAction(action, { roomUrl: current.roomUrl })
    })

    function flashCopied() {
      var copy = r.copy
      copy.innerHTML = icon('check', 18)
      copy.classList.add('on')
      setTimeout(function () {
        copy.innerHTML = icon('link', 18)
        copy.classList.remove('on')
      }, 1400)
    }

    function setQr(on) {
      current.qrShown = on
      r.qr.classList.toggle('on', on)
      r['qr-btn'].classList.toggle('on', on)
      r['qr-btn'].title = on ? 'Hide QR code' : 'Show QR code'
    }

    function setAccent(rgb) {
      var c = clampRgb(rgb)
      var key = c.join(',')
      if (key === current.accentKey) return
      current.accentKey = key
      var light = c.map(function (v) {
        return Math.round(v + (255 - v) * 0.45)
      })
      container.style.setProperty('--ac', c.join(' '))
      container.style.setProperty('--ac-light', light.join(' '))
      // Cross-fade the glow instead of snapping to the new color.
      current.glow = 1 - current.glow
      var next = glows[current.glow]
      var prev = glows[1 - current.glow]
      next.style.background =
        'radial-gradient(120% 90% at 85% 0%,rgba(' + c.join(',') + ',.24),transparent 60%)'
      next.classList.add('on')
      prev.classList.remove('on')
    }

    function showPhase(phase) {
      container.classList.toggle('is-live', phase === 'live')
      container.classList.toggle('is-connecting', phase === 'connecting')
      container.classList.toggle('is-ended', phase === 'ended')
      if (phase === 'live') {
        r.chip.textContent = 'Live'
      } else {
        r.chip.textContent = STATES[phase] ? STATES[phase].chip : 'Not linked'
      }
      r.foot.hidden = phase === 'unlinked'
      if (phase === current.phase) return
      current.phase = phase
      var live = phase === 'live'
      r.live.hidden = !live
      r.state.hidden = live
      // Re-trigger the entrance animation for the pane that is now showing.
      var pane = live ? r.live : r.state
      pane.classList.remove('pane')
      void pane.offsetWidth
      pane.classList.add('pane')
      if (!live) fillState(phase)
    }

    function fillState(phase) {
      var def = STATES[phase] || STATES.unlinked
      r['state-icon'].innerHTML = def.icon ? icon(def.icon, 24) : '<div class="spinner"></div>'
      r['state-title'].textContent = def.title
      r['state-text'].textContent = def.text
      var actions = r['state-actions']
      actions.textContent = ''
      def.actions.forEach(function (a) {
        var b = el('button', a[2] ? 'btn pri' : 'btn', a[1])
        b.type = 'button'
        b.setAttribute('data-a', a[0])
        actions.appendChild(b)
      })
    }

    function renderNowPlaying(st) {
      var np = st.nowPlaying && st.nowPlaying.title ? st.nowPlaying : null
      var box = r.np
      box.classList.toggle('idle', !np)
      var playing = Boolean(np && np.state === 'playing')
      box.classList.toggle('playing', playing)
      var src = np && (np.source === 'spotify' || np.source === 'ytm') ? np.source : ''
      if (mode !== 'popup') src = ''
      // With a source badge next to it, "Playing" says enough.
      r['np-label'].textContent = !np ? 'Now playing' : !playing ? 'Paused' : src ? 'Playing' : 'Now playing'
      r['np-src'].hidden = !src
      if (src && r['np-src'].getAttribute('data-src') !== src) {
        r['np-src'].setAttribute('data-src', src)
        r['np-src'].innerHTML = icon(src === 'spotify' ? 'spotify' : 'ytm', 12)
        r['np-src'].appendChild(document.createTextNode(src === 'spotify' ? 'Spotify' : 'YouTube Music'))
      }
      var id = np ? np.videoId || np.title : ''
      if (id !== current.videoId) {
        if (current.videoId && id) {
          box.classList.remove('swap')
          void box.offsetWidth
          box.classList.add('swap')
        }
        current.videoId = id
      }
      setArt(r['np-art'], np ? safeUrl(np.thumbnailUrl) : '')
      r['np-title'].textContent = np ? np.title : 'Nothing playing'
      r['np-title'].title = np ? np.title : ''
      r['np-artist'].textContent = np
        ? np.artist || ' '
        : mode === 'popup'
          ? 'Play something in YouTube Music or Spotify'
          : 'Start a song in YouTube Music'
      var play = r.play
      if (play.getAttribute('data-state') !== String(playing)) {
        play.setAttribute('data-state', String(playing))
        play.innerHTML = icon(playing ? 'pause' : 'play', 16)
        play.title = playing ? 'Pause' : 'Play'
      }
      current.clock = {
        at: Date.now(),
        time: np && isFinite(np.currentTime) ? np.currentTime : 0,
        duration: np && np.duration > 0 ? np.duration : 0,
        playing: playing,
      }
      tick()
    }

    function tick() {
      var c = current.clock
      var now = c.time
      if (c.playing && c.at) now += (Date.now() - c.at) / 1000
      if (c.duration > 0) now = Math.min(now, c.duration)
      r.bar.style.width = (c.duration > 0 ? (now / c.duration) * 100 : 0).toFixed(2) + '%'
      r.t0.textContent = fmt(now)
      r.t1.textContent = c.duration > 0 ? fmt(c.duration) : '–:––'
    }

    function buildRow(row) {
      var item = el('div', 'row')
      item.setAttribute('data-id', String(row.id))
      item.appendChild(el('span', 'row-n'))
      var art = el('div', 'row-art')
      var img = el('img')
      img.alt = ''
      img.loading = 'lazy'
      img.referrerPolicy = 'no-referrer'
      setArt(img, thumbFor(row))
      art.appendChild(img)
      item.appendChild(art)
      var text = el('div', 'row-text')
      var title = el('div', 'row-title')
      title.appendChild(el('span', null, row.title || 'Untitled'))
      if (row.insert_mode === 'play_next') title.appendChild(el('em', 'tag', 'Plays next'))
      text.appendChild(title)
      var by = [row.added_by ? 'Added by ' + row.added_by : '', row.channel_title].filter(Boolean).join(' · ')
      text.appendChild(el('div', 'row-by', by || ' '))
      item.appendChild(text)
      var rm = el('button', 'rm')
      rm.type = 'button'
      rm.title = 'Remove from the queue'
      rm.setAttribute('aria-label', 'Remove ' + (row.title || 'song'))
      rm.setAttribute('data-a', 'remove')
      rm.setAttribute('data-id', String(row.id))
      rm.innerHTML = icon('remove', 14)
      item.appendChild(rm)
      return item
    }

    /** Keyed render: rows that stay are moved (FLIP), new ones slide in,
     *  gone ones slide out. */
    function renderQueue(st) {
      var rows = Array.isArray(st.queue) ? st.queue : []
      var total = typeof st.queueCount === 'number' ? st.queueCount : rows.length
      r['q-count'].textContent = total ? plural(total, 'song', 'songs') : ''
      var key =
        total + '|' + rows.map(function (q) { return q.id + ':' + q.title + ':' + q.added_by + ':' + q.insert_mode }).join(',')
      if (key === current.queueKey) return
      var first = current.queueKey === ''
      current.queueKey = key

      var list = r.rows
      var before = {}
      Object.keys(current.rows).forEach(function (id) {
        before[id] = current.rows[id].getBoundingClientRect().top
      })

      var keep = Object.create(null)
      rows.forEach(function (row) {
        keep[String(row.id)] = true
      })
      Object.keys(current.rows).forEach(function (id) {
        if (keep[id]) return
        var gone = current.rows[id]
        delete current.rows[id]
        gone.classList.remove('enter')
        gone.classList.add('leave')
        setTimeout(function () {
          gone.remove()
        }, 260)
      })

      var empty = list.querySelector('.q-empty')
      if (empty) empty.remove()
      var more = list.querySelector('.more')
      if (more) more.remove()

      rows.forEach(function (row, i) {
        var id = String(row.id)
        var item = current.rows[id]
        var rowKey = [row.title, row.added_by, row.channel_title, row.insert_mode, row.thumbnail_url].join('|')
        if (item && item.getAttribute('data-key') !== rowKey) {
          // Same song, new details (e.g. Play next became a normal pick).
          var fresh = buildRow(row)
          item.replaceWith(fresh)
          current.rows[id] = item = fresh
        }
        if (item) item.setAttribute('data-key', rowKey)
        if (!item) {
          item = buildRow(row)
          item.setAttribute('data-key', rowKey)
          current.rows[id] = item
          if (!first) {
            item.classList.add('enter')
            item.style.animationDelay = Math.min(i, 6) * 30 + 'ms'
          }
        }
        item.querySelector('.row-n').textContent = String(i + 1)
        item.classList.remove('busy')
        list.appendChild(item)
      })
      // Leaving rows stay at the end while they animate out.
      list.querySelectorAll('.row.leave').forEach(function (node) {
        list.appendChild(node)
      })

      // FLIP the rows that moved.
      Object.keys(before).forEach(function (id) {
        var item = current.rows[id]
        if (!item) return
        var dy = before[id] - item.getBoundingClientRect().top
        if (!dy) return
        item.style.transition = 'none'
        item.style.transform = 'translateY(' + dy + 'px)'
        requestAnimationFrame(function () {
          item.style.transition = 'transform .35s ' + EASE + ',background .15s,opacity .2s'
          item.style.transform = ''
        })
      })

      if (rows.length === 0) {
        var note = el('div', 'q-empty pane')
        note.appendChild(el('b', null, 'No guest picks yet. '))
        note.appendChild(
          document.createTextNode(
            st.roomCode
              ? 'Friends open t3lluz.com/ytmq and enter ' + st.roomCode + ', or scan the QR above.'
              : 'Share the lobby so friends can add songs.',
          ),
        )
        list.appendChild(note)
      } else if (total > rows.length) {
        var btn = el('button', 'more', '+' + (total - rows.length) + ' more in YTMQ')
        btn.type = 'button'
        btn.setAttribute('data-a', 'open-app')
        list.appendChild(btn)
      }
    }

    function apply(st) {
      st = st || {}
      current.lastState = st
      var phase = st.phase || 'unlinked'
      current.roomUrl = st.roomUrl || ''
      if (Array.isArray(st.accent) && st.accent.length === 3) setAccent(st.accent)
      else if (!current.accentKey) setAccent([139, 92, 246])
      showPhase(phase)
      if (phase !== 'live') return

      setText(r.code, st.roomCode || '······', false)
      var listening = typeof st.listeningCount === 'number' ? st.listeningCount : st.participantCount || 0
      var queued = typeof st.queueCount === 'number' ? st.queueCount : 0
      setText(r.listening, listening, true)
      setText(r.queued, queued, true)
      r['queued-label'].textContent = queued === 1 ? 'song queued' : 'queued'

      var qrKey = st.qr ? st.qr.size + ':' + st.qr.bits : ''
      if (qrKey !== current.qrKey) {
        current.qrKey = qrKey
        drawQr(r['qr-box'], st.qr)
      }
      r['qr-btn'].hidden = !qrKey

      renderNowPlaying(st)

      var pending = typeof st.pendingCount === 'number' ? st.pendingCount : 0
      r.warn.classList.toggle('on', pending > 0)
      if (pending > 0) {
        r['warn-text'].textContent = plural(pending, 'song is', 'songs are') + ' not in YouTube Music yet'
      }

      if (st.sources) renderSources(st.sources)
      renderQueue(st)
      var nx = st.nextSong
      var showAuto = queued === 0 && nx && nx.title
      r.autoplay.hidden = !showAuto
      r.autoplay.textContent = ''
      if (showAuto) {
        r.autoplay.appendChild(document.createTextNode('When the queue is empty, YouTube Music plays '))
        r.autoplay.appendChild(el('b', null, nx.title + (nx.artist ? ' · ' + nx.artist : '')))
      }
    }

    function renderSource(prefix, src) {
      var row = r['src-' + prefix]
      if (!row || !src) return
      row.classList.toggle('live', src.status === 'live')
      row.classList.toggle('connecting', src.status === 'connecting')
      r['src-' + prefix + '-text'].textContent = src.text || ''
      var btn = r['src-' + prefix + '-btn']
      btn.hidden = !src.action
      if (src.action) {
        btn.textContent = src.action[1]
        btn.setAttribute('data-a', src.action[0])
      }
    }

    function renderSources(sources) {
      renderSource('ytm', sources.ytm)
      renderSource('sp', sources.spotify)
    }

    function applyUpdate(update) {
      var available = Boolean(update && update.available)
      r.upd.classList.toggle('on', available)
      if (available) {
        r['upd-title'].textContent =
          'Extension update ready' +
          (update.version && update.current ? ' (v' + update.current + ' → v' + update.version + ')' : '')
      }
    }

    var timer = setInterval(function () {
      if (current.clock.playing && current.phase === 'live') tick()
    }, 250)

    return {
      apply: apply,
      applyUpdate: applyUpdate,
      setQr: setQr,
      destroy: function () {
        clearInterval(timer)
      },
    }
  }

  window.YTMQUI = {
    css: css,
    icon: icon,
    logo: logo,
    createView: createView,
    plural: plural,
  }
})()
