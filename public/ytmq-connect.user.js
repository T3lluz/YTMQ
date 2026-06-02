// ==UserScript==
// @name         YTMQ — YouTube Music connect
// @namespace    https://github.com/T3lluz/YTMQ
// @version      1.4.0
// @description  Auto-connects YTMQ on music.youtube.com (from host link or last session)
// @match        https://music.youtube.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  if (window.__YTMQ_BRIDGE__ || window.__YTMQ_BRIDGE_LOADING__) return

  var SESSION_KEY = 'ytmq_session'
  var SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
  var DEFAULT_BRIDGE =
    'https://t3lluz.github.io/YTMQ/ytmusic-bridge.js'

  var q = new URLSearchParams(location.search)
  var roomId = q.get('roomId')
  var sb = q.get('sb')
  var key = q.get('key')
  var bridgeList = q.get('ytmqBridge')
  var since = q.get('since')

  if (roomId && sb && key) {
    try {
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          roomId: roomId,
          sb: sb,
          key: key,
          since: since || '',
          bridgeList: bridgeList || '',
          at: Date.now(),
        }),
      )
    } catch (e) {
      /* private mode */
    }
  } else {
    try {
      var stored = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')
      if (
        stored &&
        stored.roomId &&
        stored.sb &&
        stored.key &&
        Date.now() - (stored.at || 0) < SESSION_MAX_AGE_MS
      ) {
        roomId = stored.roomId
        sb = stored.sb
        key = stored.key
        since = stored.since || since
        bridgeList = stored.bridgeList || ''
      }
    } catch (e2) {
      /* ignore */
    }
  }

  if (!roomId || !sb || !key) return

  window.__YTMQ_BRIDGE_LOADING__ = true
  window.__YTMQ_BRIDGE_PARAMS__ = {
    roomId: roomId,
    sb: sb,
    key: key,
    since: since || new Date().toISOString(),
  }

  var urls = (bridgeList || DEFAULT_BRIDGE)
    .split(',')
    .map(function (s) {
      return s.trim()
    })
    .filter(Boolean)
  if (urls.indexOf(DEFAULT_BRIDGE) === -1) urls.push(DEFAULT_BRIDGE)

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
