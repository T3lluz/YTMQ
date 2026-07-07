/**
 * YTMQ service worker. Injects the bundled bridge into music.youtube.com's
 * MAIN world (page context) when the content script reports a session, since
 * the bridge needs access to YT Music's Polymer/queue internals.
 */

const YTM_ORIGIN = 'https://music.youtube.com'

function isYtmSender(sender) {
  return Boolean(
    sender.tab &&
      typeof sender.tab.id === 'number' &&
      typeof sender.url === 'string' &&
      sender.url.startsWith(YTM_ORIGIN),
  )
}

async function injectBridge(tabId, session) {
  const params = {
    roomId: session.roomId,
    sb: session.sb,
    key: session.key,
    since: session.since || new Date().toISOString(),
  }

  // Params must land in the page before the bridge IIFE reads them. The same
  // step marks the page as loading so repeated inject requests (SPA
  // navigations, bfcache restores) don't start a second bridge.
  const [{ result: alreadyRunning }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    injectImmediately: true,
    func: (bridgeParams) => {
      if (window.__YTMQ_BRIDGE__ || window.__YTMQ_BRIDGE_LOADING__) return true
      window.__YTMQ_BRIDGE_LOADING__ = true
      window.__YTMQ_BRIDGE_PARAMS__ = bridgeParams
      return false
    },
    args: [params],
  })

  if (alreadyRunning) return true

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      injectImmediately: true,
      files: ['ytmusic-bridge.js'],
    })
  } catch (err) {
    // Unblock future attempts (the loading flag would otherwise wedge this
    // document until a full page reload).
    await chrome.scripting
      .executeScript({
        target: { tabId },
        world: 'MAIN',
        func: () => {
          delete window.__YTMQ_BRIDGE_LOADING__
        },
      })
      .catch(() => {})
    throw err
  }

  return true
}

async function disconnectEverywhere() {
  await chrome.storage.local.remove('ytmq_session')

  const tabs = await chrome.tabs.query({ url: `${YTM_ORIGIN}/*` })
  await Promise.allSettled(
    tabs.map((tab) =>
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: () => {
          try {
            const bridge = window.__YTMQ_BRIDGE__
            if (bridge && typeof bridge.stop === 'function') bridge.stop()
          } catch (e) {
            /* bridge not running */
          }
          delete window.__YTMQ_BRIDGE_LOADING__
          try {
            localStorage.removeItem('ytmq_session')
            sessionStorage.removeItem('ytmq_url_capture')
          } catch (e) {
            /* private mode */
          }
        },
      }),
    ),
  )
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'ytmq-inject' && isYtmSender(sender)) {
    const session = message.session
    if (!session || !session.roomId || !session.sb || !session.key) {
      sendResponse({ ok: false })
      return false
    }
    injectBridge(sender.tab.id, session).then(
      () => sendResponse({ ok: true }),
      (err) => {
        console.warn('[YTMQ] Bridge injection failed', err)
        sendResponse({ ok: false })
      },
    )
    return true
  }

  if (message && message.type === 'ytmq-disconnect') {
    disconnectEverywhere().then(
      () => sendResponse({ ok: true }),
      () => sendResponse({ ok: false }),
    )
    return true
  }

  return false
})
