import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { startServer } from '../server/app.js'
import { reconnectAfterServerDisconnect } from '../public/shared/reconnect.js'
import { makeTempDir, sleep } from './helpers.js'

// The same Socket.io client bundle the server hands to browsers at
// /socket.io/socket.io.js (it ships inside the socket.io package, so no
// extra dependency). Node 22 has a global WebSocket; there is no
// XMLHttpRequest, so the test clients use the websocket transport only.
const require = createRequire(import.meta.url)
const { io } = require(path.join(path.dirname(require.resolve('socket.io/package.json')), 'client-dist', 'socket.io.js'))

function waitFor(predicate, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = () => {
      if (predicate()) return resolve()
      if (Date.now() - started > timeoutMs) return reject(new Error(`timed out waiting for ${label}`))
      setTimeout(tick, 20)
    }
    tick()
  })
}

function trackedClient(url) {
  const socket = io(url, { transports: ['websocket'], reconnectionDelay: 100, reconnectionDelayMax: 200 })
  const log = { connects: 0, states: 0, reasons: [] }
  socket.on('connect', () => log.connects++)
  socket.on('stateChanged', () => log.states++)
  socket.on('disconnect', (reason) => log.reasons.push(reason))
  return { socket, log }
}

test('clients reconnect after a clean server shutdown and restart on the same port', async () => {
  const dataDir = await makeTempDir()
  let server = await startServer({ dataDir, port: 0, host: '127.0.0.1' })
  const port = server.port
  const url = `http://127.0.0.1:${port}`

  const withHelper = trackedClient(url)
  reconnectAfterServerDisconnect(withHelper.socket, { delayMs: 50 })
  const plain = trackedClient(url)

  try {
    await waitFor(() => withHelper.log.states >= 1 && plain.log.states >= 1, 3000, 'initial state')

    await server.close()
    await waitFor(() => !withHelper.socket.connected && !plain.socket.connected, 3000, 'disconnect')
    assert.equal(withHelper.log.reasons[0], 'io server disconnect')
    assert.equal(plain.log.reasons[0], 'io server disconnect')

    // Let the client try (and fail) while the server is down, as during a restart.
    await sleep(300)
    server = await startServer({ dataDir, port, host: '127.0.0.1' })

    await waitFor(() => withHelper.socket.connected && withHelper.log.states >= 2, 5000, 'reconnect')
    assert.equal(withHelper.log.connects, 2)

    // Without the helper Socket.io stays disconnected for good: that is the bug.
    await sleep(400)
    assert.equal(plain.socket.connected, false)
    assert.equal(plain.log.connects, 1)
  } finally {
    withHelper.socket.close()
    plain.socket.close()
    await server.close()
    await fs.rm(dataDir, { recursive: true, force: true })
  }
})
