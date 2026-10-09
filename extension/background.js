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
const YTMQ_SITE_ORIGIN = 'https://t3lluz.com'
const YTMQ_SITE_PATH = '/ytmq'
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

function isValidSession(session) {
  return Boolean(
    session &&
      typeof session.roomId === 'string' &&
      session.roomId &&
      typeof session.api === 'string' &&
      session.api,
  )
}

function normalizeSession(session) {
  return {
    roomId: session.roomId,
    api: session.api,
    since: session.since || new Date().toISOString(),
    at: typeof session.at === 'number' ? session.at : Date.now(),
  }
}

function bridgeParamsFromSession(session) {
  return {
    roomId: session.roomId,
    api: session.api,
    since: session.since || new Date().toISOString(),
  }
}

/** Most recently used first — focus the tab the user was actually using. */
function byLastAccessed(a, b) {
  return (b.lastAccessed || 0) - (a.lastAccessed || 0)
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
      sender.url.toLowerCase().startsWith(YTMQ_SITE_ORIGIN + YTMQ_SITE_PATH + '/'),
  )
}

function ytmDeepLink(session) {
  const q = new URLSearchParams({
    roomId: session.roomId,
    api: session.api,
    since: session.since,
  })
  return YTM_ORIGIN + '/?' + q.toString()
}

function ytmqRoomUrl(roomId) {
  return roomId
    ? `${YTMQ_SITE_ORIGIN}${YTMQ_SITE_PATH}/room/${encodeURIComponent(roomId)}`
    : `${YTMQ_SITE_ORIGIN}${YTMQ_SITE_PATH}/`
}

async function focusYtmqTab(roomId) {
  const tabs = await chrome.tabs.query({ url: `${YTMQ_SITE_ORIGIN}${YTMQ_SITE_PATH}/*` })
  if (tabs.length === 0) return false
  tabs.sort(byLastAccessed)
  let target = tabs[0]
  if (roomId) {
    for (const tab of tabs) {
      if (tab.url && tab.url.includes(roomId)) {
        target = tab
        break
      }
    }
  }
  await chrome.tabs.update(target.id, { active: true }).catch(() => {})
  await chrome.windows.update(target.windowId, { focused: true }).catch(() => {})
  return true
}

async function openYtmqTab(roomId) {
  const focused = await focusYtmqTab(roomId)
  if (focused) return true
  await chrome.tabs.create({ url: ytmqRoomUrl(roomId) })
  return true
}

async function apiRpc(session, fn, body) {
  const res = await fetch(`${session.api}/rpc/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) return null
  return res.json()
}

async function fetchCounts(session) {
  try {
    const res = await fetch(
      `${session.api}/rooms/${encodeURIComponent(session.roomId)}/counts`,
    )
    if (!res.ok) return { queue: 0, participants: 0 }
    return await res.json()
  } catch {
    return { queue: 0, participants: 0 }
  }
}

async function fetchRoomMeta(session) {
  const data = await apiRpc(session, 'get_room', {
    p_room_id: session.roomId,
  })
  if (!data || typeof data !== 'object') return { code: '', roomId: session.roomId }
  return {
    code: typeof data.code === 'string' ? data.code : '',
    roomId: session.roomId,
  }
}

async function queryLinkedYtmTabs() {
  const tabs = await chrome.tabs.query({ url: `${YTM_ORIGIN}/*` })
  tabs.sort(byLastAccessed)
  return tabs
}

async function readYtmSnapshot() {
  const tabs = await queryLinkedYtmTabs()
  for (const tab of tabs) {
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: () => {
          const bridge = window.__YTMQ_BRIDGE__
          const bridgeActive = Boolean(bridge)
          let bridgeConnected = bridgeActive
          if (bridge && typeof bridge.getStatus === 'function') {
            try {
              const status = bridge.getStatus()
              bridgeConnected = status.connected !== false
            } catch (e) {
              bridgeConnected = bridgeActive
            }
          }

          const bar = document.querySelector('ytmusic-player-bar')
          const title =
            bar?.querySelector('.title')?.textContent?.trim() ||
            bar?.querySelector('[title]')?.textContent?.trim() ||
            ''
          const artist =
            bar?.querySelector('.byline')?.textContent?.trim() ||
            bar?.querySelector('.subtitle')?.textContent?.trim() ||
            ''
          let currentTime = 0
          let duration = 0
          let state = 'unknown'
          try {
            const api = bar?.playerApi
            currentTime = api?.getCurrentTime?.() ?? 0
            duration = api?.getDuration?.() ?? 0
            const code = api?.getPlayerState?.()
            if (code === 1 || code === 3) state = 'playing'
            else if (code === 2 || code === 0 || code === 5) state = 'paused'
          } catch (e) {
            /* player not ready */
          }
          return {
            bridgeActive,
            bridgeConnected,
            hasPlayer: Boolean(bar),
            title: title || 'Nothing playing',
            artist,
            currentTime,
            duration,
            state,
          }
        },
      })
      if (result) return { ...result, ytmTabId: tab.id }
    } catch (e) {
      /* tab not injectable */
    }
  }
  return {
    bridgeActive: false,
    bridgeConnected: false,
    hasPlayer: false,
    title: 'No YouTube Music tab',
    artist: '',
    currentTime: 0,
    duration: 0,
    state: 'unknown',
    ytmTabId: null,
  }
}

async function runYtmDomPlayback(action) {
  const tabs = await queryLinkedYtmTabs()
  for (const tab of tabs) {
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: (kind) => {
          const bar = document.querySelector('ytmusic-player-bar')
          if (!bar) return { ok: false, reason: 'no_player' }
          const click = (selector) => {
            const btn = bar.querySelector(selector)
            if (btn) {
              btn.click()
              return true
            }
            return false
          }
          if (kind === 'toggle') {
            if (click('#play-pause-button')) return { ok: true }
            if (click('button[aria-label*="Pause" i]')) return { ok: true }
            if (click('button[aria-label*="Play" i]')) return { ok: true }
            const api = bar.playerApi
            if (api) {
              const code = api.getPlayerState?.()
              if (code === 1 || code === 3) {
                api.pauseVideo?.()
                return { ok: true }
              }
              api.playVideo?.()
              return { ok: true }
            }
          }
          if (kind === 'next') {
            if (bar.playerApi?.nextVideo) {
              bar.playerApi.nextVideo()
              return { ok: true }
            }
            if (click('.next-button, tp-yt-paper-icon-button.next-button, button[aria-label*="Next" i]')) {
              return { ok: true }
            }
          }
          if (kind === 'prev') {
            if (bar.playerApi?.previousVideo) {
              bar.playerApi.previousVideo()
              return { ok: true }
            }
            if (click('.previous-button, tp-yt-paper-icon-button.previous-button, button[aria-label*="Previous" i]')) {
              return { ok: true }
            }
          }
          return { ok: false, reason: 'control_failed' }
        },
        args: [action],
      })
      if (result?.ok) return result
    } catch (e) {
      /* try next tab */
    }
  }
  return { ok: false, reason: 'no_tab' }
}

async function runYtmPlayback(action) {
  if (action === 'syncAll' || action === 'openQueue') {
    return runYtmBridgeAction(action)
  }
  const bridgeResult = await runYtmBridgeAction(action)
  if (bridgeResult?.ok) return bridgeResult
  return runYtmDomPlayback(action)
}

async function runYtmBridgeAction(action) {
  const tabs = await queryLinkedYtmTabs()
  for (const tab of tabs) {
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: async (kind) => {
          const bridge = window.__YTMQ_BRIDGE__
          if (!bridge) return { ok: false, reason: 'no_bridge' }
          if (kind === 'syncAll' && typeof bridge.syncAll === 'function') {
            const n = await bridge.syncAll()
            return { ok: true, synced: n }
          }
          if (kind === 'next' && typeof bridge.next === 'function') {
            return { ok: bridge.next() }
          }
          if (kind === 'prev' && typeof bridge.prev === 'function') {
            return { ok: bridge.prev() }
          }
          if (kind === 'toggle' && typeof bridge.togglePlayPause === 'function') {
            return { ok: bridge.togglePlayPause() }
          }
          if (kind === 'openQueue' && typeof bridge.openQueue === 'function') {
            bridge.openQueue()
            return { ok: true }
          }
          return { ok: false, reason: 'unsupported' }
        },
        args: [action],
      })
      if (result?.ok) return result
    } catch (e) {
      /* try next tab */
    }
  }
  return { ok: false, reason: 'no_tab' }
}

async function buildPopupState() {
  const data = await chrome.storage.local.get('ytmq_session')
  const session = data?.ytmq_session
  if (!isValidSession(session) || Date.now() - (session.at || 0) >= SESSION_MAX_AGE_MS) {
    return { linked: false }
  }
  const [room, counts, ytm] = await Promise.all([
    fetchRoomMeta(session),
    fetchCounts(session),
    readYtmSnapshot(),
  ])
  const queueCount = counts.queue || 0
  const participantCount = counts.participants || 0
  const ytmTabs = await queryLinkedYtmTabs()
  return {
    linked: true,
    session,
    room,
    queueCount,
    participantCount,
    ytmTabs: ytmTabs.length,
    ytm,
    roomUrl: ytmqRoomUrl(session.roomId),
  }
}

async function persistSessionInTab(tabId, session) {
  await chrome.scripting
    .executeScript({
      target: { tabId },
      world: 'MAIN',
      func: (stored) => {
        try {
          localStorage.setItem('ytmq_session', JSON.stringify(stored))
          sessionStorage.setItem('ytmq_url_capture', JSON.stringify(stored))
        } catch (e) {
          /* private mode */
        }
      },
      args: [session],
    })
    .catch(() => {})
}

/**
 * Inject the bridge the site serves right now, so bridge fixes reach this
 * extension without a reinstall. Returns false if it could not run (offline,
 * or YouTube Music's CSP / Trusted Types refused the inline script); the
 * caller then injects the bundled copy.
 */
async function injectLiveBridge(tabId) {
  let code
  try {
    const res = await fetch(YTMQ_SITE_ORIGIN + YTMQ_SITE_PATH + '/ytmusic-bridge.js', {
      cache: 'no-cache',
    })
    if (!res.ok) return false
    code = await res.text()
  } catch (e) {
    return false
  }
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      injectImmediately: true,
      func: (source) => {
        delete window.__YTMQ_BRIDGE_RAN__
        try {
          const script = document.createElement('script')
          const tt = window.trustedTypes
          script.text =
            tt && tt.createPolicy
              ? tt
                  .createPolicy('ytmq-bridge-' + Date.now(), { createScript: (x) => x })
                  .createScript(source)
              : source
          ;(document.head || document.documentElement).appendChild(script)
          script.remove()
        } catch (e) {
          /* blocked: fall back to the bundled copy */
        }
        return window.__YTMQ_BRIDGE_RAN__ === true
      },
      args: [code],
    })
    return result === true
  } catch (e) {
    return false
  }
}

async function injectBridge(tabId, session) {
  const params = bridgeParamsFromSession(session)

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
      function paramsMatch(target) {
        if (!target) return false
        return (
          target.roomId === bridgeParams.roomId &&
          target.api === bridgeParams.api &&
          (target.since || '') === (bridgeParams.since || '')
        )
      }

      const existing = window.__YTMQ_BRIDGE__
      if (existing) {
        if (paramsMatch(existing)) {
          if (!document.getElementById('ytmq-ytm-panel') && !document.getElementById('ytmq-ext-host')) {
            try {
              if (typeof existing.stop === 'function') existing.stop()
            } catch (e) {
              /* old bridge without panel */
            }
            delete window.__YTMQ_BRIDGE__
            delete window.__YTMQ_BRIDGE_LOADING__
          } else {
            return true
          }
        } else {
          try {
            if (typeof existing.stop === 'function') existing.stop()
          } catch (e) {
            /* old bridge already broken */
          }
          delete window.__YTMQ_BRIDGE__
          delete window.__YTMQ_BRIDGE_LOADING__
        }
      } else if (window.__YTMQ_BRIDGE_LOADING__) {
        if (paramsMatch(window.__YTMQ_BRIDGE_PARAMS__)) return true
        delete window.__YTMQ_BRIDGE_LOADING__
      }
      window.__YTMQ_BRIDGE_LOADING__ = true
      window.__YTMQ_BRIDGE_PARAMS__ = bridgeParams
      return false
    },
    args: [params],
  })

  if (alreadyRunning) {
    await persistSessionInTab(tabId, session)
    return true
  }

  try {
    const live = await injectLiveBridge(tabId)
    console.info('[YTMQ] bridge injected:', live ? 'live from the site' : 'bundled copy')
    if (!live) {
      await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        injectImmediately: true,
        files: ['ytmusic-bridge.js'],
      })
    }
    await persistSessionInTab(tabId, session)
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
  const normalized = normalizeSession(session)

  await chrome.storage.local.set({ ytmq_session: normalized })

  const tabs = await chrome.tabs.query({ url: YTM_ORIGIN + '/*' })
  tabs.sort(byLastAccessed)

  const results = await Promise.allSettled(
    tabs.map((tab) => injectBridge(tab.id, normalized)),
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
    await chrome.tabs.create({
      url: ytmDeepLink(normalized),
      active: !!opts.focus,
    })
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

/** Auto-link new or reloaded YouTube Music tabs to the stored session. */
async function linkTabIfSessionStored(tabId) {
  const data = await chrome.storage.local.get('ytmq_session')
  const session = data && data.ytmq_session
  if (!isValidSession(session)) return
  if (Date.now() - (session.at || 0) >= SESSION_MAX_AGE_MS) {
    await chrome.storage.local.remove('ytmq_session')
    return
  }
  await injectBridge(tabId, normalizeSession(session))
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return
  if (!tab.url || !tab.url.startsWith(YTM_ORIGIN)) return
  void linkTabIfSessionStored(tabId)
})

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

  if (message && message.type === 'ytmq-focus-app') {
    focusYtmqTab(message.roomId || '').then(
      (ok) => sendResponse({ ok }),
      () => sendResponse({ ok: false }),
    )
    return true
  }

  if (message && message.type === 'ytmq-open-app') {
    openYtmqTab(message.roomId || '').then(
      (ok) => sendResponse({ ok }),
      () => sendResponse({ ok: false }),
    )
    return true
  }

  if (message && message.type === 'ytmq-popup-state') {
    buildPopupState().then(
      (state) => sendResponse(state),
      () => sendResponse({ linked: false }),
    )
    return true
  }

  if (message && message.type === 'ytmq-popup-action') {
    runYtmPlayback(message.action || '').then(
      (result) => sendResponse(result),
      () => sendResponse({ ok: false }),
    )
    return true
  }

  return false
})

// --- Update check -----------------------------------------------------------
// An unpacked extension cannot update itself. The site publishes a
// fingerprint of the extension's files (scripts/pack-extension.mjs); when
// ours differs, the panel and popup offer the new zip and a Reload button.

const UPDATE_INFO_URL = YTMQ_SITE_ORIGIN + YTMQ_SITE_PATH + '/ytmq-extension.json'
const UPDATE_CHECK_MS = 30 * 60 * 1000

async function sha256Hex(data) {
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

async function localFingerprint(files) {
  let joined = ''
  for (const file of files) {
    const res = await fetch(chrome.runtime.getURL(file))
    if (!res.ok) return ''
    joined += file + '\n' + (await sha256Hex(await res.arrayBuffer())) + '\n'
  }
  return sha256Hex(new TextEncoder().encode(joined))
}

async function checkForUpdate(force) {
  const { ytmq_update: last } = await chrome.storage.local.get('ytmq_update')
  if (!force && last && Date.now() - (last.checkedAt || 0) < UPDATE_CHECK_MS) return last
  let info
  try {
    const res = await fetch(UPDATE_INFO_URL, { cache: 'no-cache' })
    if (!res.ok) return last || null
    info = await res.json()
  } catch (e) {
    return last || null
  }
  if (!info || !Array.isArray(info.files) || typeof info.fingerprint !== 'string') {
    return last || null
  }
  const mine = await localFingerprint(info.files.filter((f) => typeof f === 'string'))
  const update = {
    available: Boolean(mine) && mine !== info.fingerprint,
    version: String(info.version || ''),
    current: chrome.runtime.getManifest().version,
    zip: YTMQ_SITE_ORIGIN + YTMQ_SITE_PATH + '/' + String(info.zip || 'ytmq-extension.zip'),
    checkedAt: Date.now(),
  }
  await chrome.storage.local.set({ ytmq_update: update })
  await chrome.action.setBadgeText({ text: update.available ? 'NEW' : '' })
  if (update.available) await chrome.action.setBadgeBackgroundColor({ color: '#8b5cf6' })
  return update
}

// The service worker starts often (every message wakes it), which makes this
// a cheap stand-in for a timer; checkForUpdate throttles itself.
void checkForUpdate(false)
chrome.runtime.onInstalled.addListener(() => {
  void checkForUpdate(true)
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'ytmq-check-update') {
    checkForUpdate(Boolean(message.force)).then(
      (update) => sendResponse(update),
      () => sendResponse(null),
    )
    return true
  }
  if (message && message.type === 'ytmq-download-update') {
    chrome.storage.local.get('ytmq_update', (data) => {
      const zip = (data && data.ytmq_update && data.ytmq_update.zip) || UPDATE_INFO_URL.replace(/\.json$/, '.zip')
      chrome.tabs.create({ url: zip })
      sendResponse({ ok: true })
    })
    return true
  }
  if (message && message.type === 'ytmq-reload-extension') {
    sendResponse({ ok: true })
    // Picks up the files you unzipped over this folder.
    setTimeout(() => chrome.runtime.reload(), 100)
    return false
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
