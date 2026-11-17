/**
 * Pure helpers for the Electron main process (no Electron imports, so they
 * are unit-tested with node:test in test/electron-helpers.test.js).
 */

/** Base URL the desktop app uses for its own windows. */
export function baseUrlForPort(port) {
  return `http://localhost:${port}`
}

function parseUrl(value) {
  try {
    return new URL(String(value))
  } catch {
    return null
  }
}

/**
 * True when `url` belongs to the app (same origin as `baseUrl`). Compares
 * parsed origins, so look-alikes such as `http://localhost:2014.evil.test`
 * or `http://localhost:20140` do not pass a prefix check.
 */
export function isAppUrl(url, baseUrl) {
  const target = parseUrl(url)
  const base = parseUrl(baseUrl)
  if (!target || !base) return false
  return target.origin === base.origin
}

/** Only web and mail links may be handed to the OS (never file:, javascript:, custom schemes). */
export function isSafeExternalUrl(url) {
  const target = parseUrl(url)
  if (!target) return false
  return target.protocol === 'https:' || target.protocol === 'http:' || target.protocol === 'mailto:'
}

/** Theme choices the page can send (matches public/shared/app-header.js). */
export function normalizeThemeChoice(value) {
  return value === 'light' || value === 'dark' ? value : 'system'
}

/**
 * Colours of the Windows/Linux caption buttons (titleBarOverlay). They match
 * the app header (tahoe.css `--pv-bg-elevated` over `--pv-bg`, flattened,
 * because the OS paints the overlay opaque) and `--pv-text`.
 */
export const CAPTION_HEIGHT = 56 // tahoe.css --pv-header-height (3.5rem)

export function titleBarOverlayFor(dark) {
  return dark
    ? { color: '#1d1d20', symbolColor: '#f5f5f7', height: CAPTION_HEIGHT }
    : { color: '#fefefe', symbolColor: '#1d1d1f', height: CAPTION_HEIGHT }
}

/** Window background before the page paints (tahoe.css --pv-bg). */
export function windowBackgroundFor(dark) {
  return dark ? '#161618' : '#fafaf9'
}

/**
 * Turn a server listen error into dialog text.
 * @returns {{ code: string, title: string, message: string, detail: string }}
 */
export function describeListenError(err, port, platform = process.platform) {
  const code = err?.code || 'UNKNOWN'
  if (code === 'EADDRINUSE') {
    return {
      code,
      title: 'Port already in use',
      message: `Port ${port} is already in use.`,
      detail:
        `Another program (or another copy of ProVerlay) is using port ${port}, so ProVerlay cannot start its server. ` +
        'Choose another port, or close the other program and start ProVerlay again.'
    }
  }
  if (code === 'EACCES') {
    const windowsHint =
      platform === 'win32'
        ? ' On Windows this often means the port falls in a range reserved by Hyper-V, WSL or Docker ' +
          '(see `netsh interface ipv4 show excludedportrange protocol=tcp`).'
        : ''
    return {
      code,
      title: 'Port not allowed',
      message: `ProVerlay is not allowed to use port ${port}.`,
      detail: `The system refused access to port ${port}.${windowsHint} Choose another port, for example between 3000 and 9000.`
    }
  }
  return {
    code,
    title: 'Server could not start',
    message: `ProVerlay could not start its server on port ${port}.`,
    detail: String(err?.message || err || 'Unknown error')
  }
}

/**
 * URL another device on the network should open for the Operator (iPad,
 * phone). Prefers a private LAN address; falls back to 127.0.0.1.
 * @param {{ urls: { lan: { ip: string, path: string, url: string }[] } }} network buildNetworkUrls() result
 */
export function pickOperatorUrl(network, port) {
  const lan = (network?.urls?.lan || []).filter((entry) => entry.path === 'operator')
  const rank = (ip) => (/^192\.168\./.test(ip) ? 0 : /^10\./.test(ip) ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3)
  lan.sort((a, b) => rank(a.ip) - rank(b.ip))
  return lan[0]?.url || `${localUrlForPort(port)}/operator`
}

/**
 * URL for OBS/vMix browser sources and other clients on this computer. The
 * server listens on IPv4 only (0.0.0.0), and on Windows `localhost` may
 * resolve to ::1 first, so these use 127.0.0.1. (App windows keep
 * baseUrlForPort: their localStorage is tied to that origin.)
 */
export function localUrlForPort(port) {
  return `http://127.0.0.1:${port}`
}

/**
 * True when `body` looks like ProVerlay's GET /api/state response
 * (server/state.js getState(): the active project's state with a `graphics`
 * array and its `projectId`). Another program that answers 200 on every
 * path must not be mistaken for a running ProVerlay.
 */
export function isProVerlayState(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false
  return Array.isArray(body.graphics) && typeof body.projectId === 'string' && body.projectId.length > 0
}

/**
 * Fit a window size into a display work area (DIP). The minimum size is
 * lowered too when the work area is smaller; otherwise it would push the
 * window past the screen edge (behind the taskbar).
 * @param {{ width: number, height: number, minWidth?: number, minHeight?: number }} size
 * @param {{ width: number, height: number } | null | undefined} workArea
 */
export function clampWindowSize(size, workArea) {
  const out = { ...size }
  const areaW = Math.floor(Number(workArea?.width))
  const areaH = Math.floor(Number(workArea?.height))
  if (Number.isFinite(areaW) && areaW > 0) {
    out.width = Math.min(out.width, areaW)
    if (out.minWidth !== undefined) out.minWidth = Math.min(out.minWidth, areaW)
  }
  if (Number.isFinite(areaH) && areaH > 0) {
    out.height = Math.min(out.height, areaH)
    if (out.minHeight !== undefined) out.minHeight = Math.min(out.minHeight, areaH)
  }
  return out
}

/** Command-line flag of the login item: start in the tray, no window. */
export const HIDDEN_ARG = '--hidden'

/**
 * Options for app.setLoginItemSettings (and getLoginItemSettings). Windows
 * stores the args in the Run entry and matches on path + args, so reading
 * and turning the item off must pass the same args.
 */
export function loginItemSettingsFor(platform, openAtLogin) {
  const on = Boolean(openAtLogin)
  if (platform === 'win32') return { openAtLogin: on, args: [HIDDEN_ARG] }
  // openAsHidden only works before macOS 13; later versions report
  // wasOpenedAtLogin instead (see wasStartedHidden).
  if (platform === 'darwin') return { openAtLogin: on, openAsHidden: true }
  return { openAtLogin: on }
}

/**
 * True when this launch came from the login item and should start in the
 * tray/menu bar only (server and tray, no dashboard window).
 * @param {{ platform: string, argv?: string[], loginItem?: { wasOpenedAtLogin?: boolean, wasOpenedAsHidden?: boolean } }} launch
 */
export function wasStartedHidden({ platform, argv = [], loginItem = {} }) {
  if (Array.isArray(argv) && argv.includes(HIDDEN_ARG)) return true
  if (platform === 'darwin') return Boolean(loginItem?.wasOpenedAtLogin || loginItem?.wasOpenedAsHidden)
  return false
}

/**
 * Save dialog options for a download (project export). Without a title the
 * dialog shows the raw blob: URL. The file name is left to Electron.
 */
export function saveDialogOptionsFor(filename) {
  if (/\.proverlay$/i.test(String(filename || ''))) {
    return { title: 'Export project', filters: [{ name: 'ProVerlay project', extensions: ['proverlay'] }] }
  }
  return { title: 'Save file' }
}
