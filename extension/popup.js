var SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
var YTMQ_SITE = 'https://t3lluz.github.io/YTMQ'

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

function ytmqAppUrl(session) {
  if (session && session.roomId) {
    return YTMQ_SITE + '/room/' + encodeURIComponent(session.roomId)
  }
  return YTMQ_SITE + '/'
}

function render(session) {
  currentSession = isActiveSession(session) ? session : null
  var active = Boolean(currentSession)

  document.getElementById('dot').classList.toggle('on', active)
  document.getElementById('status-text').textContent = active
    ? 'Linked — auto-connecting YT Music tabs'
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

document.getElementById('open-ytmq').addEventListener('click', function () {
  chrome.tabs.create({ url: ytmqAppUrl(currentSession) })
})

document.getElementById('open-ytm').addEventListener('click', function () {
  chrome.tabs.create({ url: 'https://music.youtube.com' })
})

document.getElementById('disconnect').addEventListener('click', function () {
  chrome.runtime.sendMessage({ type: 'ytmq-disconnect' }, function () {
    void chrome.runtime.lastError
    render(null)
  })
})
