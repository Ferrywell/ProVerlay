// Quick check that a ProVerlay server is reachable the way the module talks to it:
// a socket.io connection (stateChanged) plus the REST API.
// Usage: PROVERLAY_HOST=127.0.0.1 PROVERLAY_PORT=2014 npm run test:connection
import { io } from 'socket.io-client'

const host = process.env.PROVERLAY_HOST || '127.0.0.1'
const port = process.env.PROVERLAY_PORT || '2014'
const url = `http://${host}:${port}`

const socket = io(url, { reconnection: false, timeout: 5000 })

const timer = setTimeout(() => finish(1, 'Timeout waiting for ProVerlay'), 6000)

function finish(code, message) {
  clearTimeout(timer)
  if (message) (code ? console.error : console.log)(message)
  socket.disconnect()
  process.exitCode = code
}

socket.on('stateChanged', async (state) => {
  console.log(`Connected to ProVerlay at ${url} (socket.io)`)
  try {
    const response = await fetch(`${url}/api/state`)
    if (!response.ok) {
      finish(1, `GET /api/state failed: HTTP ${response.status}`)
      return
    }
    const rest = await response.json()
    console.log(`Project: ${rest.client?.name || rest.projectId}`)
    console.log(`Graphics: ${rest.graphics.length} (on air: ${state.graphics.filter((g) => g.visible).length})`)
    finish(0)
  } catch (err) {
    finish(1, `GET /api/state failed: ${err.message}`)
  }
})

socket.on('connect_error', (error) => finish(1, `Connection failed: ${error.message}`))
