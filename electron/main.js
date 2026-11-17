/**
 * ProVerlay desktop app (Electron).
 *
 * Runs the ProVerlay server in-process (server/app.js), opens the dashboard
 * in a window and keeps running in the tray/menu bar when the window is
 * closed, so OBS/vMix keep receiving graphics.
 *
 * Platform chrome:
 * - macOS: hidden inset title bar (traffic lights inside the page header),
 *   template tray icon in the menu bar, full app menu.
 * - Windows/Linux: frameless window with OS-drawn caption buttons
 *   (titleBarOverlay) whose colours follow the app theme, coloured tray icon,
 *   no menu bar (edit shortcuts are handled by Chromium).
 *
 * Settings live in <userData>/settings.json (see settings.js).
 * Set PROVERLAY_USER_DATA_DIR to run against a separate userData folder
 * (development/testing; never touches the real app data).
 */
import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  nativeTheme,
  shell,
  clipboard,
  dialog,
  ipcMain,
  screen,
  session
} from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { loadSettings, saveSettings, applySettingsPatch, publicSettings, validatePort } from './settings.js'
import {
  baseUrlForPort,
  localUrlForPort,
  isAppUrl,
  isSafeExternalUrl,
  isProVerlayState,
  normalizeThemeChoice,
  titleBarOverlayFor,
  windowBackgroundFor,
  describeListenError,
  pickOperatorUrl,
  clampWindowSize,
  loginItemSettingsFor,
  wasStartedHidden,
  saveDialogOptionsFor
} from './helpers.js'
import {
  RELEASES_PAGE,
  checkForUpdate,
  downloadUpdate,
  isReleasePageUrl,
  macAppBundle,
  macSwapScript,
  prepareMacUpdate
} from './updater.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const IS_MAC = process.platform === 'darwin'
const IS_WINDOWS = process.platform === 'win32'
const APP_ID = 'nl.productionpro.proverlay'
const PRELOAD = path.join(__dirname, 'preload.cjs')
const PREFS_PRELOAD = path.join(__dirname, 'preferences', 'preload.cjs')
const ASSETS = path.join(__dirname, 'assets')
const PREFS_WIDTH = 480

const SECURE_WEB_PREFERENCES = Object.freeze({
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webviewTag: false
})

if (process.env.PROVERLAY_USER_DATA_DIR) {
  app.setPath('userData', path.resolve(process.env.PROVERLAY_USER_DATA_DIR))
} else if (IS_WINDOWS && process.env.LOCALAPPDATA) {
  // Chromium's caches (Cache, Code Cache, GPUCache, Local Storage, …) are
  // machine-local: keep them out of the roaming %APPDATA% profile. userData
  // (%APPDATA%\ProVerlay: settings.json and the data folder with projects)
  // stays where it is. With PROVERLAY_USER_DATA_DIR everything stays in that
  // folder, so a test run never shares a browser profile with the real app.
  app.setPath('sessionData', path.join(process.env.LOCALAPPDATA, 'ProVerlay'))
}
if (IS_WINDOWS) app.setAppUserModelId(APP_ID)

// A single bug must not take a live show off air: log and keep running
// (same policy as server/index.js; also suppresses Electron's crash dialog).
process.on('unhandledRejection', (reason) => {
  console.error('[proverlay] Unhandled promise rejection (app keeps running):', reason)
})
process.on('uncaughtException', (err, origin) => {
  console.error(`[proverlay] Uncaught exception (${origin}); app keeps running:`, err)
})

const isPrimaryInstance = app.requestSingleInstanceLock()
if (!isPrimaryInstance) app.exit(0)

/* --------------------------------------------------------------- state */

const settingsFile = path.join(app.getPath('userData'), 'settings.json')
let settings = null
let portOverride = false // PORT env var wins for this run (development)

let server = null // { handle, port } when this process runs the server
let externalPort = null // port of an already running ProVerlay we attached to
let lastStartError = null
let restarting = false

let mainWindow = null
let prefsWindow = null
let debugWindow = null
let tray = null
let quitting = false
let shuttingDown = false
let themeChoice = 'system' // last System/Light/Dark choice sent by the web UI

const captionWindows = new WeakSet()

function isServerRunning() {
  return Boolean(server) || externalPort !== null
}

function currentPort() {
  if (server) return server.port
  if (externalPort !== null) return externalPort
  return settings.port
}

function baseUrl() {
  return baseUrlForPort(currentPort())
}

function persist(patch) {
  try {
    settings = saveSettings(settingsFile, { ...settings, ...patch })
  } catch (err) {
    settings = { ...settings, ...patch }
    console.error('[proverlay] Could not save settings:', err.message)
  }
}

/* -------------------------------------------------------------- server */

function dataDir() {
  return path.join(app.getPath('userData'), 'data')
}

function seedDataDir() {
  // Packaged app: Resources/seed-data. Dev: ./data if it exists (it is gitignored).
  return app.isPackaged ? path.join(process.resourcesPath, 'seed-data') : path.join(__dirname, '..', 'data')
}

function ensureDataDir() {
  const target = dataDir()
  // Seed only on first install; updates never overwrite existing projects.
  // Without a seed dir the server creates a blank project itself.
  if (!fs.existsSync(path.join(target, 'registry.json')) && fs.existsSync(seedDataDir())) {
    fs.cpSync(seedDataDir(), target, { recursive: true })
  }
  return target
}

/**
 * True when a ProVerlay server answers on `port`. Checks the shape of
 * /api/state, not just the status: a dev server with an SPA fallback answers
 * 200 on every path and must get the "Port already in use" dialog instead.
 */
async function isProVerlayAt(port) {
  try {
    const res = await fetch(`${localUrlForPort(port)}/api/state`, { signal: AbortSignal.timeout(1500) })
    if (!res.ok) return false
    return isProVerlayState(await res.json())
  } catch {
    return false
  }
}

/**
 * Start the server on `port`. Never exits the process; errors are returned.
 * `attach`: at launch, a ProVerlay already running on this port (e.g.
 * `npm run dev`) is used instead. Not for port changes: picking a port that
 * another ProVerlay uses must report "in use", not silently switch data.
 */
async function startServerOn(port, { attach = false } = {}) {
  if (attach && (await isProVerlayAt(port))) {
    externalPort = port
    lastStartError = null
    return { ok: true, external: true }
  }
  try {
    const { startServer } = await import('../server/app.js')
    const handle = await startServer({ dataDir: ensureDataDir(), port, host: '0.0.0.0' })
    server = { handle, port: handle.port }
    externalPort = null
    lastStartError = null
    return { ok: true }
  } catch (err) {
    console.error(`[proverlay] Server could not start on port ${port}:`, err)
    lastStartError = { ...describeListenError(err, port), port }
    return { ok: false, error: lastStartError }
  }
}

async function stopServer() {
  externalPort = null
  if (!server) return
  const { handle } = server
  server = null
  await handle.close()
}

/** Move the server to `port`; on failure the previous port is restored. */
async function restartServer(port) {
  const previous = isServerRunning() ? currentPort() : null
  const wasExternal = externalPort !== null
  restarting = true
  try {
    await stopServer()
    const result = await startServerOn(port)
    if (result.ok || previous === null) return result
    const restored = await startServerOn(previous, { attach: wasExternal })
    if (!restored.ok) lastStartError = restored.error
    return result
  } finally {
    restarting = false
  }
}

async function showStartError() {
  const e = lastStartError
  const { response } = await dialog.showMessageBox({
    type: 'error',
    title: e.title,
    message: e.message,
    detail: e.detail,
    buttons: ['Choose Another Port…', 'Quit'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  })
  if (response === 0) openPreferences()
  else app.quit()
}

function onServerReady({ openDashboard }) {
  ensureTray()
  refreshTrayMenu()
  if (openDashboard) showDashboard()
}

/* -------------------------------------------------------------- windows */

function openExternalSafely(url) {
  if (isSafeExternalUrl(url)) shell.openExternal(url)
  else console.warn('[proverlay] Blocked opening a non-web URL:', url)
}

function appWindowOptions() {
  const dark = nativeTheme.shouldUseDarkColors
  return {
    backgroundColor: windowBackgroundFor(dark),
    autoHideMenuBar: true,
    webPreferences: { ...SECURE_WEB_PREFERENCES, preload: PRELOAD }
  }
}

function updateWindowTheme() {
  const dark = nativeTheme.shouldUseDarkColors
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    if (captionWindows.has(win)) win.setTitleBarOverlay(titleBarOverlayFor(dark))
    if (win !== prefsWindow) win.setBackgroundColor(windowBackgroundFor(dark))
  }
}

function createMainWindow() {
  // 1440×920 does not fit every screen (e.g. 1920×1080 at 125 % leaves a
  // ~816 DIP high work area): keep the window clear of the taskbar/Dock.
  const size = clampWindowSize(
    { width: 1440, height: 920, minWidth: 1024, minHeight: 640 },
    screen.getPrimaryDisplay().workAreaSize
  )
  const options = {
    ...appWindowOptions(),
    ...size,
    title: 'ProVerlay',
    show: false
  }
  if (IS_MAC) {
    options.titleBarStyle = 'hiddenInset'
  } else {
    // Frameless; Windows/Linux draw the caption buttons over the page. The
    // header reserves room for them (tahoe.css, env(titlebar-area-*)).
    options.titleBarStyle = 'hidden'
    options.titleBarOverlay = titleBarOverlayFor(nativeTheme.shouldUseDarkColors)
  }
  const win = new BrowserWindow(options)
  if (!IS_MAC) captionWindows.add(win)
  win.once('ready-to-show', () => win.show())
  win.loadURL(`${baseUrl()}/control`)
  win.on('close', (event) => {
    if (quitting) return
    // Closing hides to the tray; the server keeps serving OBS/vMix.
    event.preventDefault()
    hideToTray(win)
  })
  // Windows sign-out/shutdown: let the window close instead of hiding it.
  win.on('session-end', () => {
    quitting = true
  })
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })
  return win
}

function showDashboard() {
  if (!isServerRunning()) {
    if (prefsWindow && !prefsWindow.isDestroyed()) prefsWindow.focus()
    return
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    return
  }
  mainWindow = createMainWindow()
}

/** After a port change, point every app window at the new origin. */
function moveWindowsTo(oldBase, newBase) {
  // The theme choice lives in localStorage, which is per origin (and so per
  // port): carry it over to the new origin.
  const theme = themeChoice
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win === prefsWindow) continue
    const current = win.webContents.getURL()
    if (!isAppUrl(current, oldBase)) continue
    const u = new URL(current)
    if (theme !== 'system') {
      win.webContents.once('did-finish-load', () => {
        win.webContents
          .executeJavaScript(
            `try { localStorage.setItem('pv-theme', ${JSON.stringify(theme)}) } catch (e) {}
             window.dispatchEvent(new StorageEvent('storage', { key: 'pv-theme' }))`
          )
          .catch(() => {})
      })
    }
    win.loadURL(new URL(`${u.pathname}${u.search}${u.hash}`, newBase).toString())
  }
}

/* ------------------------------------------------------------ preferences */

function loginItemSupport() {
  if (!IS_MAC && !IS_WINDOWS) return { supported: false, reason: 'Not available on this platform.' }
  if (!app.isPackaged) {
    return { supported: false, reason: 'Available in the installed app, not when running from source.' }
  }
  return { supported: true }
}

// Windows: the Run entry carries --hidden, and Windows matches path + args,
// so reading and removing it pass the same args (loginItemSettingsFor).
function loginItemOpensAtLogin() {
  return app.getLoginItemSettings(loginItemSettingsFor(process.platform, true)).openAtLogin
}

/** The login item starts ProVerlay hidden: server and tray, no window. */
function applyLoginItem(openAtLogin) {
  if (!loginItemSupport().supported) return
  try {
    const current = loginItemOpensAtLogin()
    // Already on: leave it alone (re-writing it on Windows would re-enable an
    // entry the user switched off in Task Manager). Off is always applied on
    // Windows: it removes the Run value by name, which also clears an older
    // entry without --hidden (that one does not read back as "on").
    if (openAtLogin && current) return
    if (!openAtLogin && !current && !IS_WINDOWS) return
    app.setLoginItemSettings(loginItemSettingsFor(process.platform, openAtLogin))
  } catch (err) {
    console.error('[proverlay] Could not change the login item:', err.message)
  }
}

function openPreferences() {
  if (prefsWindow && !prefsWindow.isDestroyed()) {
    prefsWindow.show()
    prefsWindow.focus()
    return
  }
  const win = new BrowserWindow({
    width: PREFS_WIDTH,
    height: 380,
    useContentSize: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'Preferences',
    show: false,
    autoHideMenuBar: true,
    backgroundColor: windowBackgroundFor(nativeTheme.shouldUseDarkColors),
    webPreferences: { ...SECURE_WEB_PREFERENCES, preload: PREFS_PRELOAD }
  })
  if (!IS_MAC) win.removeMenu()
  prefsWindow = win
  win.once('ready-to-show', () => win.show())
  win.loadFile(path.join(__dirname, 'preferences', 'index.html'))
  win.on('closed', () => {
    if (prefsWindow === win) prefsWindow = null
    // Opened from the start-up error and closed without a working port.
    if (!isServerRunning() && !restarting && !quitting) app.quit()
  })
}

function isFromPrefs(event) {
  return Boolean(prefsWindow && !prefsWindow.isDestroyed() && event.sender === prefsWindow.webContents)
}

function isFromApp(event) {
  return isAppUrl(event.senderFrame?.url, baseUrl())
}

ipcMain.handle('prefs:get', (event) => {
  if (!isFromPrefs(event)) throw new Error('Not allowed')
  const loginItem = loginItemSupport()
  const shown = publicSettings(settings)
  if (loginItem.supported) shown.startAtLogin = loginItemOpensAtLogin()
  const running = isServerRunning()
  return {
    settings: shown,
    serverRunning: running,
    runningPort: running ? currentPort() : null,
    portOverride: running && portOverride && currentPort() !== settings.port,
    startError: running ? null : lastStartError,
    loginItem
  }
})

ipcMain.handle('prefs:save', async (event, patch) => {
  if (!isFromPrefs(event)) return { ok: false, errors: { form: 'Not allowed.' } }
  const result = applySettingsPatch(settings, patch)
  if (!result.ok) return result
  const next = result.settings
  const wasRunning = isServerRunning()
  const needsStart = !wasRunning || next.port !== settings.port
  const oldBase = baseUrl()

  if (needsStart) {
    const started = await restartServer(next.port)
    if (!started.ok) {
      return {
        ok: false,
        error: { ...started.error, field: 'port' },
        serverRunning: isServerRunning(),
        savedPort: settings.port
      }
    }
    portOverride = false
  }

  applyLoginItem(next.startAtLogin)
  persist(next)

  setImmediate(() => prefsWindow?.close())
  if (needsStart && wasRunning) {
    moveWindowsTo(oldBase, baseUrl())
    refreshTrayMenu()
  } else if (needsStart) {
    onServerReady({ openDashboard: settings.openDashboardOnStart })
  }
  return { ok: true }
})

ipcMain.on('prefs:close', (event) => {
  if (isFromPrefs(event)) prefsWindow.close()
})

// The Preferences page reports its content height so the window fits it
// (it grows when an error is shown; the port-change note has reserved space).
ipcMain.on('prefs:fit', (event, height) => {
  if (!isFromPrefs(event)) return
  const h = Math.round(Number(height))
  if (!Number.isFinite(h)) return
  prefsWindow.setContentSize(PREFS_WIDTH, Math.min(Math.max(h, 240), 800))
})

ipcMain.on('desktop:open-preferences', (event) => {
  if (isFromApp(event)) openPreferences()
})

// The page tells us its theme choice (System/Light/Dark); the native theme
// follows it so the caption buttons and the Preferences window match.
ipcMain.on('desktop:set-theme', (event, theme) => {
  if (!isFromApp(event)) return
  const choice = normalizeThemeChoice(theme)
  themeChoice = choice
  if (nativeTheme.themeSource !== choice) nativeTheme.themeSource = choice
  updateWindowTheme()
})

nativeTheme.on('updated', updateWindowTheme)

/* --------------------------------------------------------- debug console */

/** Debug console (/debug): live server log, outputs and data origins. */
function openDebugConsole() {
  if (!isServerRunning()) return
  if (debugWindow && !debugWindow.isDestroyed()) {
    debugWindow.show()
    debugWindow.focus()
    return
  }
  const size = clampWindowSize(
    { width: 1120, height: 820, minWidth: 640, minHeight: 480 },
    screen.getPrimaryDisplay().workAreaSize
  )
  const win = new BrowserWindow({ ...appWindowOptions(), ...size, title: 'ProVerlay Debug Console', show: false })
  win.once('ready-to-show', () => win.show())
  win.loadURL(`${baseUrl()}/debug`)
  win.on('closed', () => {
    if (debugWindow === win) debugWindow = null
  })
  debugWindow = win
}

ipcMain.on('prefs:open-debug', (event) => {
  if (isFromPrefs(event)) openDebugConsole()
})

/* ---------------------------------------------------------------- updates */

// Manual only: check, download and install each start from a click in
// Preferences (or the "Check for Updates…" menu items). See updater.js.
// PROVERLAY_UPDATE_PRETEND_VERSION makes this build act as an older version,
// to test the whole flow against the latest real release.
let update = { phase: 'idle' }
let downloadAbort = null

function appVersionForUpdates() {
  return process.env.PROVERLAY_UPDATE_PRETEND_VERSION || app.getVersion()
}

function updateDir(version) {
  return path.join(app.getPath('temp'), `ProVerlay-update-${version}`)
}

/** Can this copy of ProVerlay replace itself? */
function installSupport() {
  if (IS_MAC) {
    const bundle = macAppBundle(process.execPath, { isPackaged: app.isPackaged })
    return bundle.ok ? { ok: true, bundle: bundle.bundle } : { ok: false, reason: bundle.reason }
  }
  if (IS_WINDOWS) {
    return app.isPackaged ? { ok: true } : { ok: false, reason: 'Updating works in the installed app. When running from source, use git pull.' }
  }
  return { ok: false, reason: 'Download the new version from the releases page.' }
}

function publicUpdate() {
  const support = installSupport()
  return {
    phase: update.phase,
    currentVersion: appVersionForUpdates(),
    platform: process.platform,
    version: update.version || null,
    size: update.asset?.size || 0,
    progress: update.progress || null,
    error: update.error || null,
    during: update.during || null,
    reason: update.reason || null,
    canInstall: support.ok,
    installNote: support.ok ? null : support.reason
  }
}

let lastProgressSent = 0
function setUpdate(next, { throttle = false } = {}) {
  update = next
  const now = Date.now()
  if (throttle && now - lastProgressSent < 150) return publicUpdate()
  lastProgressSent = now
  const info = publicUpdate()
  if (prefsWindow && !prefsWindow.isDestroyed()) prefsWindow.webContents.send('update:changed', info)
  return info
}

async function startUpdateCheck() {
  if (['checking', 'downloading', 'installing', 'ready'].includes(update.phase)) return publicUpdate()
  setUpdate({ phase: 'checking' })
  try {
    const result = await checkForUpdate({ currentVersion: appVersionForUpdates() })
    return setUpdate({ ...result, phase: result.status })
  } catch (err) {
    return setUpdate({ phase: 'error', during: 'check', error: err.message })
  }
}

async function startUpdateDownload() {
  if (update.phase !== 'available' || !installSupport().ok) return publicUpdate()
  const target = update
  const dir = updateDir(target.version)
  fs.rmSync(dir, { recursive: true, force: true })
  downloadAbort = new AbortController()
  setUpdate({ ...target, phase: 'downloading', progress: { received: 0, total: target.asset.size } })
  try {
    const file = await downloadUpdate(target, {
      dir,
      signal: downloadAbort.signal,
      onProgress: (received, total) => setUpdate({ ...target, phase: 'downloading', progress: { received, total } }, { throttle: true })
    })
    let installFrom = file
    if (IS_MAC) installFrom = await prepareMacUpdate(file, { dir, bundleId: APP_ID, version: target.version })
    return setUpdate({ ...target, phase: 'ready', dir, installFrom })
  } catch (err) {
    fs.rmSync(dir, { recursive: true, force: true })
    if (downloadAbort?.signal.aborted) return setUpdate({ ...target, phase: 'available' })
    return setUpdate({ ...target, phase: 'error', during: 'download', error: err.message })
  } finally {
    downloadAbort = null
  }
}

/** Graphics on air right now (for the warning before restarting). */
async function graphicsOnAir() {
  try {
    const res = await fetch(`${localUrlForPort(currentPort())}/api/state`, { signal: AbortSignal.timeout(1500) })
    const state = await res.json()
    return (state.graphics || []).filter((g) => g.visible).map((g) => g.name || g.id)
  } catch {
    return []
  }
}

async function installUpdate() {
  if (update.phase !== 'ready') return publicUpdate()
  const support = installSupport()
  if (!support.ok) return setUpdate({ ...update, phase: 'error', during: 'install', error: support.reason })
  const onAir = await graphicsOnAir()
  const { response } = await dialog.showMessageBox(prefsWindow && !prefsWindow.isDestroyed() ? prefsWindow : undefined, {
    type: onAir.length ? 'warning' : 'question',
    title: 'Install update',
    message: `Install ProVerlay ${update.version} now?`,
    detail:
      (onAir.length
        ? `${onAir.length} ${onAir.length === 1 ? 'graphic is' : 'graphics are'} on air (${onAir.slice(0, 3).join(', ')}${onAir.length > 3 ? ', …' : ''}). `
        : '') +
      'ProVerlay quits, so OBS, vMix and operators lose the connection until the new version has started. ' +
      'They reconnect by themselves; graphics that were on air come back on air.',
    buttons: [IS_WINDOWS ? 'Quit and Install' : 'Install and Restart', 'Cancel'],
    defaultId: onAir.length ? 1 : 0,
    cancelId: 1,
    noLink: true
  })
  if (response !== 0) return publicUpdate()
  const ready = update
  try {
    if (IS_MAC) {
      const script = path.join(ready.dir, 'install-update.sh')
      fs.writeFileSync(
        script,
        macSwapScript({
          pid: process.pid,
          newApp: ready.installFrom,
          target: support.bundle,
          backup: path.join(ready.dir, 'ProVerlay-previous.app'),
          log: path.join(ready.dir, 'install-update.log')
        }),
        { mode: 0o755 }
      )
      spawn('/bin/sh', [script], { detached: true, stdio: 'ignore' }).unref()
    } else {
      // The NSIS installer finds the existing installation (per user or for
      // everyone) and replaces it; ProVerlay has quit by then.
      spawn(ready.installFrom, [], { detached: true, stdio: 'ignore' }).unref()
    }
  } catch (err) {
    return setUpdate({ ...ready, phase: 'error', during: 'install', error: err.message })
  }
  const info = setUpdate({ ...ready, phase: 'installing' })
  setTimeout(() => app.quit(), 300)
  return info
}

function checkForUpdatesFromMenu() {
  openPreferences()
  startUpdateCheck()
}

ipcMain.handle('update:get', (event) => {
  if (!isFromPrefs(event)) throw new Error('Not allowed')
  return publicUpdate()
})
ipcMain.handle('update:check', (event) => {
  if (!isFromPrefs(event)) throw new Error('Not allowed')
  return startUpdateCheck()
})
ipcMain.handle('update:download', (event) => {
  if (!isFromPrefs(event)) throw new Error('Not allowed')
  return startUpdateDownload()
})
ipcMain.handle('update:cancel', (event) => {
  if (!isFromPrefs(event)) throw new Error('Not allowed')
  downloadAbort?.abort()
  return publicUpdate()
})
ipcMain.handle('update:install', (event) => {
  if (!isFromPrefs(event)) throw new Error('Not allowed')
  return installUpdate()
})
ipcMain.on('update:open-page', (event) => {
  if (!isFromPrefs(event)) return
  const url = update.pageUrl && isReleasePageUrl(update.pageUrl) ? update.pageUrl : RELEASES_PAGE
  openExternalSafely(url)
})

/* ---------------------------------------------------------------- tray */

const MAC_TRAY_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAaElEQVQ4T2NkoBAwUqifYdQABnzh8B8tgDHCC1tg4TUAm2as3kE3hChXYDMEWSPRBmDzCsleQDeEZAPQDSHLAGRDyDYAZghFBoBcMWoAAyPFYUBxLFCcEinOC6OZiYHi4pziApXi4hwAhf4kEXbN0LkAAAAASUVORK5CYII='

function trayImage() {
  if (IS_MAC) {
    const icon = nativeImage.createFromDataURL(MAC_TRAY_ICON)
    icon.setTemplateImage(true)
    return icon
  }
  // Coloured app icon at 100/150/200% (electron/assets/tray-win-*.png,
  // downscaled from build/icon.png).
  const icon = nativeImage.createEmpty()
  for (const [size, scaleFactor] of [
    [16, 1],
    [24, 1.5],
    [32, 2]
  ]) {
    const png = fs.readFileSync(path.join(ASSETS, `tray-win-${size}.png`))
    icon.addRepresentation({ scaleFactor, width: size, height: size, dataURL: `data:image/png;base64,${png.toString('base64')}` })
  }
  return icon
}

async function copyOperatorUrl() {
  const { buildNetworkUrls } = await import('../server/network.js')
  const port = currentPort()
  clipboard.writeText(pickOperatorUrl(buildNetworkUrls(port), port))
}

function refreshTrayMenu() {
  if (!tray) return
  const running = isServerRunning()
  tray.setToolTip(running ? `ProVerlay — port ${currentPort()}` : 'ProVerlay')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Dashboard', enabled: running, click: () => showDashboard() },
      { label: 'Copy Operator URL (iPad/Phone)', enabled: running, click: () => copyOperatorUrl() },
      {
        label: 'Copy Render URL (OBS/vMix)',
        enabled: running,
        // 127.0.0.1, not localhost: the server is IPv4-only and Windows may
        // resolve localhost to ::1 first.
        click: () => clipboard.writeText(`${localUrlForPort(currentPort())}/render`)
      },
      { type: 'separator' },
      { label: 'Preferences…', click: () => openPreferences() },
      { label: 'Check for Updates…', click: () => checkForUpdatesFromMenu() },
      { label: 'Debug Console', enabled: running, click: () => openDebugConsole() },
      { type: 'separator' },
      { label: 'Quit ProVerlay', click: () => app.quit() }
    ])
  )
}

function ensureTray() {
  if (tray) return
  tray = new Tray(trayImage())
  // Windows convention: a left click opens the app; the menu is on right click.
  if (!IS_MAC) tray.on('click', () => showDashboard())
}

let trayNoticePending = false
let trayNoticeShownThisRun = false

/**
 * Close button: hide the window, keep the server running. The first close
 * of a run (until the user ticks "Don't show this again") explains that
 * ProVerlay is still running, in a message box on top of the window: a tray
 * balloon/toast can be suppressed by Do Not Disturb, so it is not used.
 * macOS: no notice; apps that keep running after their window closes (Dock
 * icon, menu bar extra, Cmd+Q to quit) are the norm there.
 */
async function hideToTray(win) {
  if (trayNoticePending) return
  const notice = !IS_MAC && tray && isServerRunning() && !settings.trayNoticeShown && !trayNoticeShownThisRun
  if (!notice) {
    win.hide()
    return
  }
  trayNoticePending = true
  trayNoticeShownThisRun = true
  try {
    const { checkboxChecked } = await dialog.showMessageBox(win, {
      type: 'info',
      title: 'ProVerlay',
      message: 'ProVerlay keeps running in the tray',
      detail:
        'ProVerlay keeps running in the system tray so OBS, vMix and operators stay connected. ' +
        'Quit from the tray icon (right-click → Quit ProVerlay).',
      checkboxLabel: "Don't show this again",
      checkboxChecked: false,
      buttons: ['OK'],
      noLink: true
    })
    if (checkboxChecked) persist({ trayNoticeShown: true })
  } catch (err) {
    console.error('[proverlay] Could not show the tray notice:', err.message)
  } finally {
    trayNoticePending = false
  }
  if (!win.isDestroyed() && !quitting) win.hide()
}

/* ---------------------------------------------------------------- menu */

function buildAppMenu() {
  if (!IS_MAC) {
    // No menu bar on Windows/Linux. Copy/paste/undo in text fields are
    // handled by Chromium; the few app shortcuts are in addAppShortcuts().
    Menu.setApplicationMenu(null)
    return
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'ProVerlay',
        submenu: [
          { role: 'about' },
          { label: 'Check for Updates…', click: () => checkForUpdatesFromMenu() },
          { type: 'separator' },
          { label: 'Preferences…', accelerator: 'CommandOrControl+,', click: () => openPreferences() },
          { label: 'Debug Console', click: () => openDebugConsole() },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' }
    ])
  )
}

/** Windows/Linux keyboard shortcuts that a menu would otherwise provide. */
function addAppShortcuts(contents) {
  if (IS_MAC) return
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const key = String(input.key || '').toLowerCase()
    const ctrlOnly = input.control && !input.alt && !input.meta
    if (ctrlOnly && !input.shift && key === ',') {
      event.preventDefault()
      openPreferences()
    } else if ((ctrlOnly && !input.shift && key === 'r') || (key === 'f5' && !input.control && !input.alt)) {
      event.preventDefault()
      contents.reload()
    } else if (!app.isPackaged && ctrlOnly && input.shift && key === 'i') {
      event.preventDefault()
      contents.toggleDevTools()
    }
  })
}

// Every web contents: app-origin popups stay in the app (secure options),
// everything else opens in the default browser; navigation never leaves the
// app origin (the Preferences page never navigates at all).
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url, baseUrl())) {
      return { action: 'allow', overrideBrowserWindowOptions: appWindowOptions() }
    }
    openExternalSafely(url)
    return { action: 'deny' }
  })
  contents.on('will-navigate', (event, url) => {
    if (isAppUrl(url, baseUrl()) && isAppUrl(contents.getURL(), baseUrl())) return
    event.preventDefault()
    if (!isAppUrl(url, baseUrl())) openExternalSafely(url)
  })
  contents.on('will-attach-webview', (event) => event.preventDefault())
  if (contents.getType() === 'window') addAppShortcuts(contents)
})

/* ---------------------------------------------------------------- start */

async function showFirewallNoticeOnce() {
  if (!IS_WINDOWS || settings.firewallNoticeShown) return
  await dialog.showMessageBox({
    type: 'info',
    title: 'ProVerlay',
    message: 'Windows may ask to allow ProVerlay on your network',
    detail:
      'When Windows Defender Firewall asks, allow ProVerlay on "Private networks". ' +
      'That lets an iPad, phone or Bitfocus Companion on the same network connect.\n\n' +
      'Windows marks a new network as Public by default. If yours is Public, switch it to Private ' +
      '(Settings → Network & internet → your network → Properties), or allow both. ' +
      'Otherwise phones and Companion are blocked.\n\n' +
      'OBS or vMix on this computer can use ProVerlay either way.',
    buttons: ['OK'],
    noLink: true
  })
  persist({ firewallNoticeShown: true })
}

function initialPort() {
  if (process.env.PORT) {
    const env = validatePort(process.env.PORT)
    if (env.ok) {
      portOverride = env.port !== settings.port
      return env.port
    }
    console.warn(`[proverlay] Ignoring PORT=${process.env.PORT}: ${env.error}`)
  }
  return settings.port
}

app.setAboutPanelOptions({
  applicationName: 'ProVerlay',
  applicationVersion: app.getVersion(),
  copyright: `© ${new Date().getFullYear()} ProductionPro — productionpro.nl`,
  credits: 'ProVerlay is a ProductionPro product.'
})

app.on('second-instance', () => {
  if (isServerRunning()) showDashboard()
  else if (prefsWindow && !prefsWindow.isDestroyed()) prefsWindow.focus()
})

app.whenReady().then(async () => {
  if (!isPrimaryInstance) return
  const loaded = loadSettings(settingsFile)
  if (loaded.corrupt) console.warn('[proverlay] settings.json is unreadable; using defaults.', loaded.error?.message || '')
  settings = loaded.settings

  buildAppMenu()

  // Downloads come from the dashboard's project export (an <a download> on a
  // blob: URL); without a title the Save dialog shows that raw URL.
  session.defaultSession.on('will-download', (_event, item) => {
    item.setSaveDialogOptions(saveDialogOptionsFor(item.getFilename()))
  })

  // Started by the login item: server and tray only, no dashboard window.
  const startHidden = wasStartedHidden({
    platform: process.platform,
    argv: process.argv,
    loginItem: IS_MAC ? app.getLoginItemSettings() : undefined
  })

  await showFirewallNoticeOnce()

  const result = await startServerOn(initialPort(), { attach: true })
  if (result.ok) onServerReady({ openDashboard: settings.openDashboardOnStart && !startHidden })
  else await showStartError()
})

app.on('activate', () => {
  if (isServerRunning()) showDashboard()
})

app.on('before-quit', () => {
  quitting = true
})

// Let the server flush pending project writes before the process exits.
app.on('will-quit', (event) => {
  if (!server || shuttingDown) return
  event.preventDefault()
  shuttingDown = true
  const { handle } = server
  server = null
  Promise.race([handle.close(), new Promise((resolve) => setTimeout(resolve, 3000))])
    .catch((err) => console.error('[proverlay] Server shutdown failed:', err))
    .finally(() => app.quit())
})

// Closing windows hides them; the server keeps running for OBS/vMix (tray).
app.on('window-all-closed', () => {})
