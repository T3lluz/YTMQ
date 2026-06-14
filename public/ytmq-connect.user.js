// ==UserScript==
// @name         YTMQ — YouTube Music connect
// @namespace    https://github.com/T3lluz/YTMQ
// @version      1.5.0
// @description  Auto-connects YTMQ on music.youtube.com (from host link or saved session)
// @match        https://music.youtube.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  var SESSION_KEY = 'ytmq_session'
  var CAPTURE_KEY = 'ytmq_url_capture'
  var SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
  var DEFAULT_BRIDGE = 'https://t3lluz.github.io/YTMQ/ytmusic-bridge.js'

  function readQueryParams() {
    var q = new URLSearchParams(location.search)
    var roomId = q.get('roomId')
    var sb = q.get('sb')
    var key = q.get('key')
    if (!roomId || !sb || !key) return null
    return {
      roomId: roomId,
      sb: sb,
      key: key,
      since: q.get('since') || '',
      bridgeList: q.get('ytmqBridge') || '',
      at: Date.now(),
    }
  }

  function persistSession(session) {
    try {
      sessionStorage.setItem(CAPTURE_KEY, JSON.stringify(session))
      localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    } catch (e) {
      /* private mode */
    }
  }

  /** Capture deep-link params before YouTube Music strips the query string. */
  function captureUrlParamsNow() {
    var fromUrl = readQueryParams()
    if (fromUrl) persistSession(fromUrl)
    return fromUrl
  }

  captureUrlParamsNow()

  function readStoredSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY)
      if (!raw) return null
      var stored = JSON.parse(raw)
      if (
        !stored ||
        !stored.roomId ||
        !stored.sb ||
        !stored.key ||
        Date.now() - (stored.at || 0) >= SESSION_MAX_AGE_MS
      ) {
        return null
      }
      return stored
    } catch (e) {
      return null
    }
  }

  function readCapturedSession() {
    try {
      var raw = sessionStorage.getItem(CAPTURE_KEY)
      if (!raw) return null
      var captured = JSON.parse(raw)
      if (!captured || !captured.roomId || !captured.sb || !captured.key) {
        return null
      }
      return captured
    } catch (e) {
      return null
    }
  }

  function resolveSession() {
    return (
      readQueryParams() ||
      readCapturedSession() ||
      readStoredSession()
    )
  }

  function injectBridge(session) {
    if (window.__YTMQ_BRIDGE__ || window.__YTMQ_BRIDGE_LOADING__) return

    window.__YTMQ_BRIDGE_LOADING__ = true
    window.__YTMQ_BRIDGE_PARAMS__ = {
      roomId: session.roomId,
      sb: session.sb,
      key: session.key,
      since: session.since || new Date().toISOString(),
    }

    var urls = (session.bridgeList || DEFAULT_BRIDGE)
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
          ;(document.head || document.documentElement).appendChild(s)
          delete window.__YTMQ_BRIDGE_LOADING__
        })
        .catch(function () {
          load(i + 1)
        })
    }

    load(0)
  }

  function tryConnect() {
    if (window.__YTMQ_BRIDGE__ || window.__YTMQ_BRIDGE_LOADING__) return

    var session = resolveSession()
    if (!session) return

    persistSession(session)
    injectBridge(session)
  }

  function scheduleTry() {
    if (document.head) {
      tryConnect()
      return
    }

    var observer = new MutationObserver(function () {
      if (document.head) {
        observer.disconnect()
        tryConnect()
      }
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })
    document.addEventListener('DOMContentLoaded', tryConnect, { once: true })
  }

  scheduleTry()

  window.addEventListener('pageshow', function () {
    if (!window.__YTMQ_BRIDGE__) scheduleTry()
  })

  document.addEventListener(
    'yt-navigate-finish',
    function () {
      captureUrlParamsNow()
      if (!window.__YTMQ_BRIDGE__) scheduleTry()
    },
    true,
  )
})()
