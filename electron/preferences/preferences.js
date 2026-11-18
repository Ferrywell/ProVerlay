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

  /* ------------------------------------------------------------ updates */

  var updateVersion = document.getElementById('update-version')
  var updateCheck = document.getElementById('update-check')
  var updatePanel = document.getElementById('update-panel')
  var updateTitle = document.getElementById('update-title')
  var updateDetail = document.getElementById('update-detail')
  var updateProgress = document.getElementById('update-progress')
  var updateNotes = document.getElementById('update-notes')
  var updateCancel = document.getElementById('update-cancel')
  var updateAction = document.getElementById('update-action')
  var updateActions = document.getElementById('update-actions')
  var updateNext = null // what updateAction does in the current phase

  function megabytes(bytes) {
    return (bytes / 1048576).toFixed(bytes >= 10485760 ? 0 : 1) + ' MB'
  }

  var lastUpdate = null

  function renderUpdate(u) {
    if (!u) return
    if (!u.currentVersion && lastUpdate) u.currentVersion = lastUpdate.currentVersion
    lastUpdate = u
    updateVersion.textContent = 'ProVerlay ' + u.currentVersion
    var busy = u.phase === 'checking' || u.phase === 'downloading' || u.phase === 'installing'
    updateCheck.disabled = busy || u.phase === 'ready'
    updatePanel.hidden = u.phase === 'idle'
    updatePanel.classList.toggle('is-error', u.phase === 'error')
    updateProgress.hidden = u.phase !== 'downloading'
    updateCancel.hidden = u.phase !== 'downloading'
    updateNotes.hidden = !u.version || u.phase === 'current' || u.phase === 'checking'
    updateNext = null
    var title = ''
    var detail = ''
    var action = ''
    if (u.phase === 'checking') {
      title = 'Checking for updates…'
    } else if (u.phase === 'current') {
      title = 'ProVerlay is up to date.'
      detail = u.version && u.version !== u.currentVersion
        ? 'The latest release is ' + u.version + '; you have ' + u.currentVersion + '.'
        : 'Version ' + u.currentVersion + ' is the newest release.'
    } else if (u.phase === 'unsupported') {
      title = 'ProVerlay ' + u.version + ' is available.'
      detail = u.reason || ''
      action = 'Open Releases Page'
      updateNext = 'page'
    } else if (u.phase === 'available') {
      title = 'ProVerlay ' + u.version + ' is available.'
      detail = 'You have ' + u.currentVersion + '. Download ' + megabytes(u.size || 0) + '.'
      if (u.canInstall) {
        action = 'Download'
        updateNext = 'download'
      } else {
        detail += ' ' + (u.installNote || '')
        action = 'Open Releases Page'
        updateNext = 'page'
      }
    } else if (u.phase === 'downloading') {
      title = 'Downloading ProVerlay ' + u.version + '…'
      var total = u.progress && u.progress.total
      var received = (u.progress && u.progress.received) || 0
      if (total) {
        updateProgress.max = total
        updateProgress.value = received
        detail = megabytes(received) + ' of ' + megabytes(total)
      } else {
        updateProgress.removeAttribute('value')
        detail = megabytes(received)
      }
    } else if (u.phase === 'ready') {
      title = 'ProVerlay ' + u.version + ' is ready to install.'
      detail = 'Downloaded and verified. Installing quits ProVerlay and opens the new version' +
        (u.platform === 'win32' ? ' installer.' : '.')
      action = u.platform === 'win32' ? 'Quit and Install' : 'Install and Restart'
      updateNext = 'install'
    } else if (u.phase === 'installing') {
      title = 'Installing…'
      detail = 'ProVerlay quits now and starts again in a moment.'
    } else if (u.phase === 'error') {
      title = u.during === 'download' ? 'The update could not be downloaded.' : u.during === 'install' ? 'The update could not be installed.' : 'Could not check for updates.'
      detail = u.error || ''
      if (u.during === 'download' || u.during === 'install') {
        action = 'Open Releases Page'
        updateNext = 'page'
      }
    }
    updateTitle.textContent = title
    updateDetail.textContent = detail
    updateDetail.hidden = !detail
    updateAction.textContent = action
    updateAction.hidden = !action
    updateAction.disabled = false
    updateAction.classList.toggle('prefs__button--primary', updateNext === 'install')
    updateActions.hidden = updateAction.hidden && updateCancel.hidden && updateNotes.hidden
  }

  async function runUpdate(step) {
    try {
      renderUpdate(await step())
    } catch (err) {
      renderUpdate({ phase: 'error', error: err && err.message ? err.message : String(err), currentVersion: '' })
    }
  }

  updateCheck.addEventListener('click', function () {
    runUpdate(bridge.update.check)
  })
  updateAction.addEventListener('click', function () {
    if (updateNext === 'download') runUpdate(bridge.update.download)
    else if (updateNext === 'install') {
      updateAction.disabled = true
      runUpdate(bridge.update.install)
    } else if (updateNext === 'page') bridge.update.openReleasePage()
  })
  updateCancel.addEventListener('click', function () {
    runUpdate(bridge.update.cancel)
  })
  updateNotes.addEventListener('click', function () {
    bridge.update.openReleasePage()
  })
  bridge.update.onChange(renderUpdate)
  bridge.update.get().then(renderUpdate, function () {})

  document.getElementById('open-debug').addEventListener('click', function () {
    bridge.openDebug()
  })

  // Keep the window as tall as its content (alerts and notes come and go).
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(function () {
      bridge.fit(Math.ceil(form.getBoundingClientRect().height))
    }).observe(form)
  }

  load()
})()
