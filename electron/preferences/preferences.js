// Preferences window script. Talks to the main process only through the
// `proverlayPrefs` bridge (electron/preferences/preload.cjs).
;(function () {
  'use strict'

  var bridge = window.proverlayPrefs
  var form = document.getElementById('prefs-form')
  var portInput = document.getElementById('port')
  var portError = document.getElementById('port-error')
  var portNote = document.getElementById('port-change-note')
  var openDashboard = document.getElementById('open-dashboard')
  var startAtLogin = document.getElementById('start-at-login')
  var loginHint = document.getElementById('login-hint')
  var alertBox = document.getElementById('prefs-alert')
  var statusEl = document.getElementById('prefs-status')
  var saveButton = document.getElementById('save')
  var cancelButton = document.getElementById('cancel')

  var initialPort = null
  var busy = false

  function showAlert(title, detail) {
    alertBox.replaceChildren()
    if (!title) {
      alertBox.hidden = true
      return
    }
    var strong = document.createElement('strong')
    strong.textContent = title
    alertBox.appendChild(strong)
    if (detail) alertBox.appendChild(document.createTextNode(detail))
    alertBox.hidden = false
  }

  function setPortError(message) {
    portError.textContent = message || ''
    portError.hidden = !message
    if (message) portInput.setAttribute('aria-invalid', 'true')
    else portInput.removeAttribute('aria-invalid')
  }

  function syncPortNote() {
    var value = portInput.value.trim()
    // visibility, not hidden: the note keeps its space, so the Save button
    // does not jump down while the user is about to click it.
    portNote.classList.toggle('is-invisible', !(initialPort !== null && value !== '' && value !== String(initialPort)))
  }

  function setBusy(on, message) {
    busy = on
    saveButton.disabled = on
    cancelButton.disabled = on
    statusEl.textContent = message || ''
  }

  function render(info) {
    var s = info.settings
    initialPort = info.serverRunning ? s.port : null
    portInput.value = String(s.port)
    openDashboard.checked = Boolean(s.openDashboardOnStart)
    startAtLogin.checked = Boolean(s.startAtLogin)
    startAtLogin.disabled = !info.loginItem.supported
    loginHint.textContent = info.loginItem.supported ? '' : info.loginItem.reason || ''
    loginHint.hidden = info.loginItem.supported || !info.loginItem.reason
    if (info.startError) {
      showAlert(info.startError.message, ' ' + info.startError.detail)
      portInput.focus()
      portInput.select()
    } else {
      showAlert('')
    }
    if (info.portOverride) {
      statusEl.textContent = 'Running on port ' + info.runningPort + ' (PORT environment variable).'
    }
    syncPortNote()
  }

  async function load() {
    try {
      render(await bridge.get())
    } catch (err) {
      showAlert('Could not load preferences.', ' ' + (err && err.message ? err.message : ''))
    }
  }

  portInput.addEventListener('input', function () {
    setPortError('')
    syncPortNote()
  })

  form.addEventListener('submit', async function (event) {
    event.preventDefault()
    if (busy) return
    setPortError('')
    showAlert('')
    var restarting = portInput.value.trim() !== String(initialPort)
    setBusy(true, restarting ? 'Starting the server…' : 'Saving…')
    var result
    try {
      result = await bridge.save({
        port: portInput.value.trim(),
        openDashboardOnStart: openDashboard.checked,
        startAtLogin: startAtLogin.checked
      })
    } catch (err) {
      result = { ok: false, error: { message: 'Could not save preferences.', detail: String(err && err.message) } }
    }
    setBusy(false)
    if (result && result.ok) return // the main process closes the window
    if (result && result.errors) {
      if (result.errors.port) setPortError(result.errors.port)
      var other = result.errors.form || result.errors.openDashboardOnStart || result.errors.startAtLogin
      if (other) showAlert(other)
      if (result.errors.port) portInput.focus()
      return
    }
    if (result && result.error) {
      showAlert(result.error.message, result.error.detail ? ' ' + result.error.detail : '')
      if (result.error.field === 'port') {
        portInput.focus()
        portInput.select()
      }
    }
    if (result && 'serverRunning' in result) {
      initialPort = result.serverRunning ? result.savedPort : null
      syncPortNote()
    }
  })

  cancelButton.addEventListener('click', function () {
    bridge.close()
  })

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !busy) bridge.close()
  })

  // Keep the window as tall as its content (alerts and notes come and go).
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(function () {
      bridge.fit(Math.ceil(form.getBoundingClientRect().height))
    }).observe(form)
  }

  load()
})()
