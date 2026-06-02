// ==UserScript==
// @name         YTMQ — YouTube Music connect
// @namespace    https://github.com/T3lluz/YTMQ
// @version      1.0.0
// @description  Auto-loads the YTMQ bridge when you open a connect link from the host lobby
// @match        https://music.youtube.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  if (window.__YTMQ_BRIDGE__ || window.__YTMQ_BRIDGE_LOADING__) return

  const q = new URLSearchParams(location.search)
  const roomId = q.get('roomId')
  const sb = q.get('sb')
  const key = q.get('key')
  const bridgeList = q.get('ytmqBridge')
  if (!roomId || !sb || !key || !bridgeList) return

  window.__YTMQ_BRIDGE_LOADING__ = true
  window.__YTMQ_BRIDGE_PARAMS__ = { roomId, sb, key }

  const urls = bridgeList.split(',').map((s) => s.trim()).filter(Boolean)

  function load(i) {
    if (i >= urls.length) {
      console.error('[YTMQ] Userscript could not load bridge from', urls)
      delete window.__YTMQ_BRIDGE_LOADING__
      return
    }
    fetch(urls[i])
      .then(function (r) {
        if (!r.ok) throw new Error('load ' + r.status)
        return r.text()
      })
      .then(function (c) {
        var s = document.createElement('script')
        var t = window.trustedTypes
        if (t && t.createPolicy) {
          s.text = t
            .createPolicy('ytmq', { createScript: function (x) { return x } })
            .createScript(c)
        } else {
          s.textContent = c
        }
        document.head.appendChild(s)
        delete window.__YTMQ_BRIDGE_LOADING__
      })
      .catch(function () {
        load(i + 1)
      })
  }

  load(0)
})()
