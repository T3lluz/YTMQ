var SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
var YTMQ_SITE = 'https://t3lluz.github.io/YTMQ'
var YTM_ORIGIN = 'https://music.youtube.com'

var popupState = { linked: false }
var refreshTimer = 0
var toastTimer = 0

function $(id) {
  return document.getElementById(id)
}

function send(message) {
  return new Promise(function (resolve) {
    try {
      chrome.runtime.sendMessage(message, function (response) {
        void chrome.runtime.lastError
        resolve(response)
      })
    } catch (e) {
      resolve(null)
    }
  })
}

function showToast(message) {
  var el = $('toast')
  el.textContent = message
  el.classList.add('show')
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(function () {
    el.classList.remove('show')
  }, 2200)
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  var total = Math.floor(seconds)
  var m = Math.floor(total / 60)
  var s = total % 60
  return m + ':' + (s < 10 ? '0' : '') + s
}

function shortRoomId(roomId) {
  return roomId.length > 8 ? roomId.slice(0, 8) + '…' : roomId
}

function focusTab(tab) {
  chrome.tabs.update(tab.id, { active: true }, function () {
    void chrome.runtime.lastError
  })
  chrome.windows.update(tab.windowId, { focused: true }, function () {
    void chrome.runtime.lastError
  })
}

function byLastAccessed(a, b) {
  return (b.lastAccessed || 0) - (a.lastAccessed || 0)
}

function openYtmqTab(roomId) {
  chrome.tabs.query({ url: YTMQ_SITE + '/*' }, function (tabs) {
    void chrome.runtime.lastError
    tabs = tabs || []
    if (tabs.length > 0) {
      tabs.sort(byLastAccessed)
      var target = tabs[0]
      if (roomId) {
        for (var i = 0; i < tabs.length; i += 1) {
          if (tabs[i].url && tabs[i].url.indexOf(roomId) !== -1) {
            target = tabs[i]
            break
          }
        }
      }
      focusTab(target)
      window.close()
      return
    }
    var url = roomId
      ? YTMQ_SITE + '/room/' + encodeURIComponent(roomId)
      : YTMQ_SITE + '/'
    chrome.tabs.create({ url: url })
  })
}

function openYtmTab() {
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
}

function setPlaybackControlsEnabled(enabled) {
  $('ctl-prev').disabled = !enabled
  $('ctl-play').disabled = !enabled
  $('ctl-next').disabled = !enabled
}

function render(state) {
  popupState = state || { linked: false }
  var linked = Boolean(state && state.linked)

  $('hint').classList.toggle('hidden', linked)
  $('linked').classList.toggle('hidden', !linked)
  $('unlinked').classList.toggle('hidden', linked)

  if (!linked) {
    setPlaybackControlsEnabled(false)
    return
  }

  var room = state.room || {}
  var ytm = state.ytm || {}
  var hasYtm = (state.ytmTabs || 0) > 0
  var live = Boolean(ytm.bridgeConnected || (ytm.bridgeActive && hasYtm) || (hasYtm && ytm.hasPlayer))

  $('badge').classList.toggle('off', !live)
  $('badge-text').textContent = live
    ? 'Live'
    : hasYtm
      ? ytm.bridgeActive
        ? 'Connected'
        : 'YT Music open'
      : 'No YT tab'

  $('lobby-code').textContent = room.code || shortRoomId(room.roomId || state.session.roomId)
  $('lobby-meta').textContent =
    'Room ' + shortRoomId(state.session.roomId) + ' · ' + (state.ytmTabs || 0) + ' YT tab(s)'

  $('stat-queue').textContent = String(state.queueCount || 0)
  $('stat-participants').textContent = String(state.participantCount || 0)

  $('track-title').textContent = ytm.title || '—'
  $('track-artist').textContent = ytm.artist || '—'

  var pct = 0
  if (ytm.duration > 0) {
    pct = Math.min(100, Math.max(0, (ytm.currentTime / ytm.duration) * 100))
  }
  $('progress-bar').style.width = pct + '%'
  $('time-cur').textContent = formatTime(ytm.currentTime || 0)
  $('time-dur').textContent = formatTime(ytm.duration || 0)

  var playing = ytm.state === 'playing'
  $('icon-play').classList.toggle('hidden', playing)
  $('icon-pause').classList.toggle('hidden', !playing)
  $('ctl-play').setAttribute('aria-label', playing ? 'Pause' : 'Play')

  setPlaybackControlsEnabled(hasYtm)
  $('now-card').classList.toggle('disabled-section', !hasYtm)
}

async function refresh() {
  var state = await send({ type: 'ytmq-popup-state' })
  render(state)
}

function runAction(action) {
  return send({ type: 'ytmq-popup-action', action: action })
}

$('open-ytmq').addEventListener('click', function () {
  openYtmqTab(popupState.session && popupState.session.roomId)
})
$('open-ytmq-idle').addEventListener('click', function () {
  openYtmqTab(null)
})
$('focus-ytmq').addEventListener('click', function () {
  openYtmqTab(popupState.session && popupState.session.roomId)
  showToast('Switching to YTMQ…')
})

$('open-ytm').addEventListener('click', openYtmTab)
$('open-ytm-idle').addEventListener('click', openYtmTab)

$('copy-link').addEventListener('click', function () {
  var link = popupState.roomUrl || YTMQ_SITE + '/'
  void navigator.clipboard.writeText(link).then(
    function () {
      showToast('Room link copied')
    },
    function () {
      showToast('Could not copy link')
    },
  )
})

$('ctl-prev').addEventListener('click', function () {
  void runAction('prev').then(function (res) {
    if (!res || !res.ok) showToast('Could not skip back')
    window.setTimeout(refresh, 400)
  })
})
$('ctl-next').addEventListener('click', function () {
  void runAction('next').then(function (res) {
    if (!res || !res.ok) showToast('Could not skip forward')
    window.setTimeout(refresh, 400)
  })
})
$('ctl-play').addEventListener('click', function () {
  void runAction('toggle').then(function (res) {
    if (!res || !res.ok) showToast('Could not toggle playback')
    window.setTimeout(refresh, 400)
  })
})

$('disconnect').addEventListener('click', function () {
  void send({ type: 'ytmq-disconnect' }).then(function () {
    showToast('Disconnected')
    void refresh()
  })
})

chrome.storage.onChanged.addListener(function (changes, area) {
  if (area === 'local' && changes.ytmq_session) void refresh()
})

void refresh()
refreshTimer = window.setInterval(function () {
  void refresh()
}, 2500)

window.addEventListener('unload', function () {
  window.clearInterval(refreshTimer)
})
