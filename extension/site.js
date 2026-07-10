/**
 * YTMQ content script for the YTMQ web app itself (the GitHub Pages site).
 *
 * The app posts window messages (source: 'ytmq-app'); this script relays them
 * to the service worker so the extension always tracks the CURRENT room:
 *  - 'ytmq:session'          → store session + auto-link open YT Music tabs
 *  - 'ytmq:connect-request'  → link an existing YT Music tab (or open one),
 *                              reply with 'ytmq:connect-result'
 *  - 'ytmq:session-clear'    → lobby ended; drop the session everywhere
 */

var APP_SOURCE = 'ytmq-app'
var EXT_SOURCE = 'ytmq-extension'

// Synchronous "extension installed" marker (document_start runs before the
// app) so the app never waits on a reply that will never come.
try {
  document.documentElement.dataset.ytmqExtension = '1'
} catch (e) {
  /* ignore */
}

function reply(message) {
  try {
    window.postMessage(
      Object.assign({ source: EXT_SOURCE }, message),
      window.location.origin,
    )
  } catch (e) {
    /* ignore */
  }
}

function send(message, onResponse) {
  try {
    chrome.runtime.sendMessage(message, function (response) {
      void chrome.runtime.lastError
      if (onResponse) onResponse(response)
    })
  } catch (e) {
    // Extension context invalidated (e.g. it was updated) — nothing to relay.
    if (onResponse) onResponse(null)
  }
}

window.addEventListener('message', function (event) {
  if (event.source !== window) return
  var data = event.data
  if (!data || data.source !== APP_SOURCE) return

  if (data.type === 'ytmq:session' && data.session) {
    send({ type: 'ytmq-site-session', session: data.session }, function (res) {
      reply({
        type: 'ytmq:session-result',
        roomId: data.session.roomId,
        connectedTabs: res && res.ok ? res.connectedTabs || 0 : 0,
      })
    })
    return
  }

  if (data.type === 'ytmq:connect-request' && data.session) {
    send({ type: 'ytmq-connect', session: data.session }, function (res) {
      reply({
        type: 'ytmq:connect-result',
        requestId: data.requestId,
        ok: Boolean(res && res.ok),
        hadTab: Boolean(res && res.hadTab),
      })
    })
    return
  }

  if (data.type === 'ytmq:session-clear') {
    send({ type: 'ytmq-disconnect' })
  }
})
