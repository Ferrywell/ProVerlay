const { io } = require('socket.io-client')

const host = process.env.PROVERLAY_HOST || '127.0.0.1'
const port = process.env.PROVERLAY_PORT || '2014'
const url = `http://${host}:${port}`

const socket = io(url)

socket.on('connect', async () => {
  console.log('Connected to ProVerlay')

  const response = await fetch(`${url}/api/state`)
  const state = await response.json()
  console.log(`Graphics: ${state.graphics.length}`)
  console.log(`Visible: ${state.graphics.filter((g) => g.visible).length}`)

  socket.disconnect()
  process.exit(0)
})

socket.on('connect_error', (error) => {
  console.error('Connection failed:', error.message)
  process.exit(1)
})

setTimeout(() => {
  console.error('Timeout waiting for ProVerlay')
  process.exit(1)
}, 5000)
