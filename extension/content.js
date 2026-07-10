/**
 * YTMQ content script (isolated world, document_start) for music.youtube.com.
 *
 * Captures the room session from the connect deep link before YouTube Music
 * strips the query string, persists it (localStorage + chrome.storage), and
 * asks the service worker to inject the bundled bridge into the page's MAIN
 * world. Re-runs on SPA navigations and bfcache restores so the bridge always
 * comes back after a reload.
 */

var SESSION_KEY = 'ytmq_session'
var CAPTURE_KEY = 'ytmq_url_capture'
var SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
var UI_SOURCE = 'ytmq-bridge-ui'

var injectRequested = false

try {
  document.documentElement.dataset.ytmqExtension = '1'
} catch (e) {
  /* ignore */
}

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
    at: Date.now(),
  }
}

function isValidSession(session) {
  return Boolean(
    session &&
      session.roomId &&
      session.sb &&
      session.key &&
      Date.now() - (session.at || 0) < SESSION_MAX_AGE_MS,
  )
}

function persistSession(session) {
  try {
    sessionStorage.setItem(CAPTURE_KEY, JSON.stringify(session))
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch (e) {
    /* private mode */
  }
  try {
    chrome.storage.local.set({ ytmq_session: session })
  } catch (e) {
    /* extension context invalidated */
  }
}

/** Capture deep-link params immediately, before YTM rewrites the URL. */
function captureUrlParamsNow() {
  var fromUrl = readQueryParams()
  if (fromUrl) persistSession(fromUrl)
  return fromUrl
}

captureUrlParamsNow()

function readJson(storage, key) {
  try {
    var raw = storage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch (e) {
    return null
  }
}

function readExtensionSession() {
  return new Promise(function (resolve) {
    try {
      chrome.storage.local.get('ytmq_session', function (data) {
        resolve(data && data.ytmq_session ? data.ytmq_session : null)
      })
    } catch (e) {
      resolve(null)
    }
  })
}

async function resolveSession() {
  // An explicit deep link always wins (the host just clicked Connect).
  var fromUrl = readQueryParams()
  if (isValidSession(fromUrl)) return fromUrl

  // Otherwise the NEWEST session wins. The extension session is synced from
  // the YTMQ app whenever the host opens a lobby, so a freshly created room
  // beats a stale one left behind in this tab's local/session storage.
  var candidates = [
    readJson(sessionStorage, CAPTURE_KEY),
    readJson(localStorage, SESSION_KEY),
    await readExtensionSession(),
  ]
  var best = null
  for (var i = 0; i < candidates.length; i += 1) {
    var candidate = candidates[i]
    if (!isValidSession(candidate)) continue
    if (!best || (candidate.at || 0) > (best.at || 0)) best = candidate
  }
  return best
}

function requestInject(session) {
  if (injectRequested) return
  injectRequested = true
  try {
    chrome.runtime.sendMessage(
      { type: 'ytmq-inject', session: session },
      function (response) {
        // Ignore chrome.runtime.lastError; allow a retry if injection failed.
        void chrome.runtime.lastError
        if (!response || !response.ok) injectRequested = false
      },
    )
  } catch (e) {
    injectRequested = false
  }
}

async function tryConnect() {
  var session = await resolveSession()
  if (!session) return
  persistSession(session)
  requestInject(session)
}

function scheduleTry() {
  if (document.head) {
    void tryConnect()
    return
  }

  var observer = new MutationObserver(function () {
    if (document.head) {
      observer.disconnect()
      void tryConnect()
    }
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
  document.addEventListener(
    'DOMContentLoaded',
    function () {
      void tryConnect()
    },
    { once: true },
  )
}

scheduleTry()

window.addEventListener('pageshow', function () {
  injectRequested = false
  scheduleTry()
})

document.addEventListener(
  'yt-navigate-finish',
  function () {
    captureUrlParamsNow()
    injectRequested = false
    scheduleTry()
  },
  true,
)

function sendToBackground(message) {
  try {
    chrome.runtime.sendMessage(message, function () {
      void chrome.runtime.lastError
    })
  } catch (e) {
    /* extension context invalidated */
  }
}

window.addEventListener('message', function (event) {
  if (event.source !== window) return
  var data = event.data
  if (!data || data.source !== UI_SOURCE) return
  if (data.type === 'ytmq:focus-app') {
    sendToBackground({ type: 'ytmq-focus-app', roomId: data.roomId || '' })
  }
  if (data.type === 'ytmq:open-app') {
    sendToBackground({ type: 'ytmq-open-app', roomId: data.roomId || '' })
  }
})
