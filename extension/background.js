/**
 * YTMQ service worker. Injects the bundled bridge into music.youtube.com's
 * MAIN world (page context) when the content script reports a session, since
 * the bridge needs access to YT Music's Polymer/queue internals.
 *
 * It also receives session updates straight from the YTMQ web app (via
 * site.js) so already-open YouTube Music tabs link to the CURRENT room —
 * switching lobbies re-points every tab instead of leaving a stale bridge.
 */

const YTM_ORIGIN = 'https://music.youtube.com'
const YTMQ_SITE_ORIGIN = 'https://t3lluz.github.io'
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

function isValidSession(session) {
  return Boolean(
    session &&
      typeof session.roomId === 'string' &&
      session.roomId &&
      typeof session.sb === 'string' &&
      session.sb &&
      typeof session.key === 'string' &&
      session.key,
  )
}

function normalizeSession(session) {
  return {
    roomId: session.roomId,
    sb: session.sb,
    key: session.key,
    since: session.since || new Date().toISOString(),
    at: typeof session.at === 'number' ? session.at : Date.now(),
  }
}

function isYtmSender(sender) {
  return Boolean(
    sender.tab &&
      typeof sender.tab.id === 'number' &&
      typeof sender.url === 'string' &&
      sender.url.startsWith(YTM_ORIGIN),
  )
}

function isSiteSender(sender) {
  return Boolean(
    sender.tab &&
      typeof sender.url === 'string' &&
      sender.url.startsWith(YTMQ_SITE_ORIGIN + '/'),
  )
}

function ytmDeepLink(session) {
  const q = new URLSearchParams({
    roomId: session.roomId,
    sb: session.sb,
    key: session.key,
    since: session.since,
  })
  return YTM_ORIGIN + '/?' + q.toString()
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
  // navigations, bfcache restores) don't start a second bridge — and stops a
  // bridge that's still linked to a PREVIOUS room so the tab follows the host
  // to the new lobby.
  const [{ result: alreadyRunning }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    injectImmediately: true,
    func: (bridgeParams) => {
      const existing = window.__YTMQ_BRIDGE__
      if (existing) {
        if (existing.roomId === bridgeParams.roomId) return true
        try {
          if (typeof existing.stop === 'function') existing.stop()
        } catch (e) {
          /* old bridge already broken */
        }
        delete window.__YTMQ_BRIDGE__
        delete window.__YTMQ_BRIDGE_LOADING__
      } else if (window.__YTMQ_BRIDGE_LOADING__) {
        return true
      }
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

/**
 * Store the session and link every open YouTube Music tab to it.
 * Options: focus — bring a linked tab to the front; openIfNone — open a new
 * YT Music tab when none exists.
 */
async function connectSession(session, options) {
  const opts = options || {}
  await chrome.storage.local.set({ ytmq_session: session })

  const tabs = await chrome.tabs.query({ url: YTM_ORIGIN + '/*' })
  const results = await Promise.allSettled(
    tabs.map((tab) => injectBridge(tab.id, session)),
  )
  const linkedTabs = tabs.filter((tab, i) => results[i].status === 'fulfilled')

  if (linkedTabs.length > 0) {
    if (opts.focus) {
      const target = linkedTabs[0]
      await chrome.tabs.update(target.id, { active: true }).catch(() => {})
      await chrome.windows
        .update(target.windowId, { focused: true })
        .catch(() => {})
    }
    return { ok: true, hadTab: true, connectedTabs: linkedTabs.length }
  }

  if (opts.openIfNone) {
    // content.js on the new tab captures the params and requests injection.
    await chrome.tabs.create({ url: ytmDeepLink(session), active: !!opts.focus })
    return { ok: true, hadTab: false, connectedTabs: 0 }
  }

  return { ok: true, hadTab: false, connectedTabs: 0 }
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
          delete window.__YTMQ_BRIDGE__
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
    if (!isValidSession(session)) {
      sendResponse({ ok: false })
      return false
    }
    injectBridge(sender.tab.id, normalizeSession(session)).then(
      () => sendResponse({ ok: true }),
      (err) => {
        console.warn('[YTMQ] Bridge injection failed', err)
        sendResponse({ ok: false })
      },
    )
    return true
  }

  // The YTMQ web app announced the current room — keep the stored session
  // fresh and auto-link any YouTube Music tabs that are already open.
  if (message && message.type === 'ytmq-site-session' && isSiteSender(sender)) {
    const session = message.session
    if (!isValidSession(session)) {
      sendResponse({ ok: false })
      return false
    }
    connectSession(normalizeSession(session), {
      focus: false,
      openIfNone: false,
    }).then(
      (result) => sendResponse(result),
      (err) => {
        console.warn('[YTMQ] Session sync failed', err)
        sendResponse({ ok: false })
      },
    )
    return true
  }

  // Explicit "Connect YouTube Music" click in the app: reuse an open YT Music
  // tab (focusing it) or open a fresh one.
  if (message && message.type === 'ytmq-connect' && isSiteSender(sender)) {
    const session = message.session
    if (!isValidSession(session)) {
      sendResponse({ ok: false })
      return false
    }
    connectSession(normalizeSession(session), {
      focus: true,
      openIfNone: true,
    }).then(
      (result) => sendResponse(result),
      (err) => {
        console.warn('[YTMQ] Connect failed', err)
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

// Drop sessions that aged out so the popup / tabs never revive a long-dead
// room after the browser restarts.
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get('ytmq_session', (data) => {
    const session = data && data.ytmq_session
    if (session && Date.now() - (session.at || 0) >= SESSION_MAX_AGE_MS) {
      chrome.storage.local.remove('ytmq_session')
    }
  })
})
