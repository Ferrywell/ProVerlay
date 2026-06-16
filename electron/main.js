import { app, BrowserWindow, Tray, Menu, nativeImage, shell, clipboard, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 2014)
const BASE_URL = `http://localhost:${PORT}`

let mainWindow = null
let tray = null
let quitting = false

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

app.on('second-instance', () => {
  showDashboard()
})

function userDataDir() {
  return path.join(app.getPath('userData'), 'data')
}

function seedDataDir() {
  // In de gepackagede app staat de seed in Resources/seed-data, in dev gewoon ./data
  return app.isPackaged
    ? path.join(process.resourcesPath, 'seed-data')
    : path.join(__dirname, '..', 'data')
}

function ensureDataDir() {
  const target = userDataDir()
  // Alleen bij eerste installatie seed kopiëren. Updates overschrijven bestaande projecten niet.
  if (!fs.existsSync(path.join(target, 'registry.json'))) {
    fs.cpSync(seedDataDir(), target, { recursive: true })
  }
  process.env.PROVERLAY_DATA_DIR = target
}

async function serverIsUp() {
  try {
    const res = await fetch(`${BASE_URL}/api/state`, { signal: AbortSignal.timeout(1500) })
    return res.ok
  } catch {
    return false
  }
}

async function waitForServer(timeoutMs = 10000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await serverIsUp()) return true
    await new Promise((r) => setTimeout(r, 250))
  }
  return false
}

async function startServer() {
  // Draait er al een ProVerlay (bv. dev-server)? Dan alleen verbinden.
  if (await serverIsUp()) return true
  ensureDataDir()
  await import('../server/index.js')
  return waitForServer()
}

function showDashboard() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
    return
  }
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 640,
    title: 'ProVerlay',
    titleBarStyle: 'hiddenInset',
    webPreferences: { contextIsolation: true }
  })
  mainWindow.loadURL(`${BASE_URL}/control`)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Operator/render links binnen de app houden, externe links naar browser
    if (url.startsWith(BASE_URL)) return { action: 'allow' }
    shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault()
      mainWindow.hide()
    }
  })
}

const TRAY_ICON_DATA =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAaElEQVQ4T2NkoBAwUqifYdQABnzh8B8tgDHCC1tg4TUAm2as3kE3hChXYDMEWSPRBmDzCsleQDeEZAPQDSHLAGRDyDYAZghFBoBcMWoAAyPFYUBxLFCcEinOC6OZiYHi4pziApXi4hwAhf4kEXbN0LkAAAAASUVORK5CYII='

function createTray() {
  const icon = nativeImage.createFromDataURL(TRAY_ICON_DATA)
  icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.setToolTip('ProVerlay')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Dashboard openen', click: () => showDashboard() },
      { label: 'Operator in browser', click: () => shell.openExternal(`${BASE_URL}/operator`) },
      { type: 'separator' },
      {
        label: 'Render-URL kopiëren (OBS/vMix)',
        click: () => clipboard.writeText(`${BASE_URL}/render`)
      },
      { type: 'separator' },
      { label: 'Stop ProVerlay', click: () => app.quit() }
    ])
  )
}

app.setAboutPanelOptions({
  applicationName: 'ProVerlay',
  applicationVersion: app.getVersion(),
  copyright: `© ${new Date().getFullYear()} ProductionPro — productionpro.nl`,
  credits: 'ProVerlay is a ProductionPro product.'
})

app.whenReady().then(async () => {
  const ok = await startServer()
  if (!ok) {
    dialog.showErrorBox(
      'ProVerlay kon niet starten',
      `De server reageert niet op poort ${PORT}. Controleer of een ander programma deze poort gebruikt.`
    )
    app.quit()
    return
  }
  createTray()
  showDashboard()
})

app.on('activate', () => showDashboard())
app.on('before-quit', () => {
  quitting = true
})

// Venster sluiten = verbergen; server blijft draaien voor OBS/vMix via tray
app.on('window-all-closed', () => {})
