/**
 * Shared Socket.io connection state for dashboard, operator and operate.
 *
 * - Status pill text: "Connecting…" → "Connected" / "Reconnecting…"
 * - While disconnected: a full-width banner "Disconnected — changes are not sent"
 *   and the live-control containers become inert (no taps, no keyboard) and dimmed.
 */

import { reconnectAfterServerDisconnect } from '/public/shared/reconnect.js'

const BANNER_TEXT = 'Disconnected — changes are not sent'

let pageSocket = null

/**
 * One Socket.io connection per page, shared by the page script and the app
 * header (project chip, connection pill). Returns null when the socket.io
 * client script is not loaded.
 */
export function sharedSocket() {
  if (pageSocket) return pageSocket
  if (typeof window.io !== 'function') return null
  pageSocket = reconnectAfterServerDisconnect(window.io())
  // Listed in the Debug console (connected pages). No personal data: the
  // page name and window size only.
  pageSocket.on('connect', () => {
    pageSocket.emit('debug:hello', {
      page: window.location.pathname.split('/')[1] || 'home',
      width: window.innerWidth,
      height: window.innerHeight
    })
  })
  return pageSocket
}

function setPill(pill, mode) {
  if (!pill) return
  pill.classList.toggle('is-connected', mode === 'connected')
  pill.classList.toggle('is-offline', mode === 'offline')
  pill.classList.toggle('is-connecting', mode === 'connecting')
  const text = mode === 'connected' ? 'Connected' : mode === 'offline' ? 'Reconnecting…' : 'Connecting…'
  const label = pill.querySelector('.status-label')
  if (label) label.textContent = text
  pill.setAttribute('aria-label', `Server connection: ${text}`)
  pill.title = mode === 'offline' ? BANNER_TEXT : text
}

function ensureBanner() {
  let banner = document.getElementById('pv-offline-banner')
  if (banner) return banner
  banner = document.createElement('div')
  banner.id = 'pv-offline-banner'
  banner.className = 'pv-offline-banner'
  banner.setAttribute('role', 'alert')
  banner.hidden = true
  banner.innerHTML = `<span class="status-dot" aria-hidden="true"></span><span>${BANNER_TEXT}</span>`
  document.body.appendChild(banner)
  return banner
}

/**
 * @param {import('socket.io-client').Socket} socket
 * @param {{ pill?: HTMLElement|null, controls?: Array<HTMLElement|null>, onChange?: (connected: boolean) => void }} options
 */
export function wireConnectionState(socket, { pill = null, controls = [], onChange } = {}) {
  const banner = ensureBanner()
  if (pill) pill.dataset.pvWired = '1'
  let connected = Boolean(socket.connected)
  setPill(pill, connected ? 'connected' : 'connecting')

  const apply = (isConnected) => {
    connected = isConnected
    setPill(pill, isConnected ? 'connected' : 'offline')
    banner.hidden = isConnected
    document.body.classList.toggle('pv-offline', !isConnected)
    for (const el of controls) {
      if (!el) continue
      el.inert = !isConnected
      el.classList.toggle('pv-offline-disabled', !isConnected)
      if (isConnected) el.removeAttribute('aria-disabled')
      else el.setAttribute('aria-disabled', 'true')
    }
    onChange?.(isConnected)
  }

  socket.on('connect', () => apply(true))
  socket.on('disconnect', () => apply(false))
  socket.on('connect_error', () => {
    if (!socket.connected) apply(false)
  })

  return {
    get connected() {
      return connected
    }
  }
}
