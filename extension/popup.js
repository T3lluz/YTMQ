var SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
var YTMQ_SITE = 'https://t3lluz.github.io/YTMQ'
var YTM_ORIGIN = 'https://music.youtube.com'

var currentSession = null

function isActiveSession(session) {
  return Boolean(
    session &&
      session.roomId &&
      session.sb &&
      session.key &&
      Date.now() - (session.at || 0) < SESSION_MAX_AGE_MS,
  )
}

function render(session) {
  currentSession = isActiveSession(session) ? session : null
  var active = Boolean(currentSession)

  document.getElementById('dot').classList.toggle('on', active)
  document.getElementById('status-text').textContent = active
    ? 'Linked — YT Music tabs auto-connect'
    : 'Not linked to a room'

  var room = document.getElementById('room')
  room.classList.toggle('hidden', !active)
  if (active) room.textContent = 'Room ' + currentSession.roomId

  document.getElementById('hint').classList.toggle('hidden', active)
  document.getElementById('disconnect').classList.toggle('hidden', !active)
}

chrome.storage.local.get('ytmq_session', function (data) {
  render(data && data.ytmq_session)
})

// Keep the popup live if the app updates the session while it's open.
chrome.storage.onChanged.addListener(function (changes, area) {
  if (area === 'local' && changes.ytmq_session) {
    render(changes.ytmq_session.newValue)
  }
})

function focusTab(tab) {
  chrome.tabs.update(tab.id, { active: true }, function () {
    void chrome.runtime.lastError
  })
  chrome.windows.update(tab.windowId, { focused: true }, function () {
    void chrome.runtime.lastError
  })
}

/** Most recently used first, so we reopen what the user was looking at. */
function byLastAccessed(a, b) {
  return (b.lastAccessed || 0) - (a.lastAccessed || 0)
}

/**
 * Open YTMQ: focus the app tab that's already open (that IS the current
 * lobby) instead of spawning a new tab pointing at a possibly stale room.
 * Only when no app tab exists do we fall back to the stored session's room,
 * then to the landing page.
 */
document.getElementById('open-ytmq').addEventListener('click', function () {
  chrome.tabs.query({ url: YTMQ_SITE + '/*' }, function (tabs) {
    void chrome.runtime.lastError
    tabs = tabs || []
    if (tabs.length > 0) {
      tabs.sort(byLastAccessed)
      // Prefer the tab already showing the linked room, if any.
      var target = tabs[0]
      if (currentSession) {
        for (var i = 0; i < tabs.length; i += 1) {
          if (tabs[i].url && tabs[i].url.indexOf(currentSession.roomId) !== -1) {
            target = tabs[i]
            break
          }
        }
      }
      focusTab(target)
      window.close()
      return
    }

    var url = currentSession
      ? YTMQ_SITE + '/room/' + encodeURIComponent(currentSession.roomId)
      : YTMQ_SITE + '/'
    chrome.tabs.create({ url: url })
  })
})

/** Open YT Music: focus an existing tab instead of always opening another. */
document.getElementById('open-ytm').addEventListener('click', function () {
  chrome.tabs.query({ url: YTM_ORIGIN + '/*' }, function (tabs) {
    void chrome.runtime.lastError
    tabs = tabs || []
    if (tabs.length > 0) {
      tabs.sort(byLastAccessed)
      focusTab(tabs[0])
      window.close()
      return
    }
    chrome.tabs.create({ url: YTM_ORIGIN })
  })
})

document.getElementById('disconnect').addEventListener('click', function () {
  chrome.runtime.sendMessage({ type: 'ytmq-disconnect' }, function () {
    void chrome.runtime.lastError
    render(null)
  })
})
