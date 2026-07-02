import express from 'express'
import http from 'http'
import path from 'path'
import { fileURLToPath } from 'url'
import { Server } from 'socket.io'
import { createApiRouter } from './api.js'
import { loadState, getState, onStateChange, reloadState } from './state.js'
import { initF1Timing } from './f1Timing.js'
import { detectDevice, preferredDashboard } from './device.js'
import { assetsDir } from './projects.js'
import { buildNetworkUrls } from './network.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PORT = Number(process.env.PORT || 2014)

const app = express()
const server = http.createServer(app)
const io = new Server(server, { cors: { origin: '*' } })

app.use(express.json())
app.use('/api', createApiRouter())
app.use('/public', express.static(path.join(ROOT, 'public')))
app.use('/templates', express.static(path.join(ROOT, 'templates')))

app.use('/projects/:projectId/assets', (req, res, next) => {
  const dir = assetsDir(req.params.projectId)
  express.static(dir)(req, res, next)
})

app.get('/render', (_req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'render', 'index.html'))
})

app.get('/render/:graphicId', (req, res) => {
  res.redirect(`/render?graphic=${encodeURIComponent(req.params.graphicId)}`)
})

app.get('/control', (_req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'control', 'index.html'))
})

app.get('/operator', (_req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'operator', 'index.html'))
})

app.get('/operate/:widgetId', (_req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'operate', 'index.html'))
})

app.get('/operate', (_req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'operate', 'index.html'))
})

app.get('/layout', (_req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'layout', 'index.html'))
})

app.get('/editor', (_req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'editor', 'index.html'))
})

app.get('/editor/:graphicId', (req, res) => {
  res.redirect(`/editor?graphic=${encodeURIComponent(req.params.graphicId)}`)
})

app.get('/compose', (_req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'compose', 'index.html'))
})

app.get('/project', (_req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'project', 'index.html'))
})

app.get('/', (req, res) => {
  const device = detectDevice(req.headers['user-agent'] || '')
  const dashboard = preferredDashboard(device, req.query)
  res.redirect(`/${dashboard}`)
})

io.on('connection', (socket) => {
  socket.emit('stateChanged', getState())

  socket.on('getState', (_payload, ack) => {
    if (typeof ack === 'function') ack(getState())
  })

  socket.on('patchState', async (payload, ack) => {
    const { patchState } = await import('./state.js')
    const next = await patchState(payload)
    if (typeof ack === 'function') ack(next)
  })

  socket.on('patchGraphic', async ({ id, patch }, ack) => {
    const { patchGraphic } = await import('./state.js')
    const next = await patchGraphic(id, patch)
    if (typeof ack === 'function') ack(next ? getState().graphics.find((g) => g.id === id) : null)
  })

  socket.on('toggleGraphic', async ({ id, visible }, ack) => {
    const { setGraphicVisibility, getGraphic } = await import('./state.js')
    await setGraphicVisibility(id, visible)
    if (typeof ack === 'function') ack(getGraphic(id))
  })

  socket.on('toggleGraphicSolo', async ({ id, soloVisible }, ack) => {
    const { setGraphicSoloVisibility, getGraphic } = await import('./state.js')
    await setGraphicSoloVisibility(id, soloVisible)
    if (typeof ack === 'function') ack(getGraphic(id))
  })

  socket.on('activateProject', async ({ id }, ack) => {
    const { activateProject } = await import('./projects.js')
    const project = await activateProject(id)
    if (!project) {
      if (typeof ack === 'function') ack({ error: 'Not found' })
      return
    }
    await reloadState()
    io.emit('stateChanged', getState())
    if (typeof ack === 'function') ack({ project, state: getState() })
  })
})

onStateChange((state) => {
  io.emit('stateChanged', state)
})

await loadState()
initF1Timing(io)

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `ProVerlay could not bind to port ${PORT} (already in use). ` +
        'Close the other instance or set PORT to a free port.'
    )
    process.exit(1)
  }
  console.error('Server error:', err)
  process.exit(1)
})

server.listen(PORT, '0.0.0.0', () => {
  const net = buildNetworkUrls(PORT)
  console.log(`ProVerlay running on port ${PORT}`)
  console.log(`  Dashboard: http://localhost:${PORT}/control`)
  console.log(`  Operator:  http://localhost:${PORT}/operator`)
  console.log(`  Operate:   http://localhost:${PORT}/operate?graphic=<id>`)
  console.log(`  Editor:    http://localhost:${PORT}/editor`)
  console.log(`  Render:    http://localhost:${PORT}/render`)
  console.log(`  Project:   ${getState().projectId}`)
  console.log('  Netwerk (gebruik http, geen https):')
  for (const { url } of net.urls.lan.filter((u) => u.path === 'operator')) {
    console.log(`    Operator: ${url}`)
  }
  for (const { url } of net.urls.lan.filter((u) => u.path === 'control')) {
    console.log(`    Dashboard: ${url}`)
  }
})
