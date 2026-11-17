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
 * phone). Prefers a private LAN address; falls back to localhost.
 * @param {{ urls: { lan: { ip: string, path: string, url: string }[] } }} network buildNetworkUrls() result
 */
export function pickOperatorUrl(network, port) {
  const lan = (network?.urls?.lan || []).filter((entry) => entry.path === 'operator')
  const rank = (ip) => (/^192\.168\./.test(ip) ? 0 : /^10\./.test(ip) ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3)
  lan.sort((a, b) => rank(a.ip) - rank(b.ip))
  return lan[0]?.url || `${baseUrlForPort(port)}/operator`
}
