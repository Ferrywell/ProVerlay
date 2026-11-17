/**
 * Keep a Socket.io client connected across a clean ProVerlay restart.
 *
 * When ProVerlay shuts down cleanly (port change, Quit + restart, update) it
 * closes every socket, and clients get the reason 'io server disconnect'.
 * Socket.io deliberately does not reconnect by itself in that case, so OBS
 * render pages and operator pages would go stale until someone refreshes
 * them. Call connect() again; if the server is still down, Socket.io's own
 * reconnection backoff takes over from there.
 *
 * No DOM access: the tests import this module in Node.
 */

export const SERVER_DISCONNECT_RETRY_MS = 1000

/**
 * @template {{ connected: boolean, connect: () => unknown, on: (event: string, fn: (...args: any[]) => void) => unknown }} S
 * @param {S} socket
 * @param {{ delayMs?: number }} [options]
 * @returns {S}
 */
export function reconnectAfterServerDisconnect(socket, { delayMs = SERVER_DISCONNECT_RETRY_MS } = {}) {
  let timer = null
  socket.on('disconnect', (reason) => {
    if (reason !== 'io server disconnect') return
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (!socket.connected) socket.connect()
    }, delayMs)
  })
  socket.on('connect', () => clearTimeout(timer))
  return socket
}
