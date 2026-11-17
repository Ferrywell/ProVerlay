/**
 * ProVerlay server factory. `node server/index.js` (and the Electron app)
 * use startServer(); tests use it too, with port 0 and a temp data dir.
 *
 * The state/project modules are process-wide singletons, so only one
 * server should be running per process at a time.
 */
import express from 'express'
import http from 'http'
import path from 'path'
import { fileURLToPath } from 'url'
import { Server } from 'socket.io'
import multer from 'multer'
import { createApiRouter } from './api.js'
import { loadState, getState, onStateChange, resetState } from './state.js'
import { initF1Timing, shutdownF1Timing } from './f1Timing.js'
import { detectDevice, preferredDashboard } from './device.js'
import { ASSET_EXT_RE, assetsDir, projectExists, flushTouchProject, resetProjectsCache } from './projects.js'
import { setDataDir } from './paths.js'
import { drainWrites } from './writeQueue.js'
import { originGuard, socketAllowRequest } from './netSecurity.js'
import { isValidProjectId } from './validation.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

function sendPage(file) {
  return (_req, res) => res.sendFile(path.join(ROOT, 'public', file, 'index.html'))
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err)
  const isApi = req.originalUrl?.startsWith('/api')
  let status = Number(err.status || err.statusCode) || 500
  let message = err.expose || status < 500 ? err.message : 'Internal server error'

  if (err instanceof SyntaxError && 'body' in err) {
    status = 400
    message = 'Invalid JSON body'
  } else if (err instanceof multer.MulterError) {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400
    message = err.code === 'LIMIT_FILE_SIZE' ? 'File too large' : `Upload error: ${err.code}`
  } else if (err.type === 'entity.too.large') {
    status = 413
    message = 'Request body too large'
  }

  if (status >= 500) console.error(`[http] ${req.method} ${req.originalUrl} failed:`, err)
  if (isApi) return res.status(status).json({ error: message || 'Request failed' })
  res.status(status).type('text/plain').send(message || 'Request failed')
}

/**
 * Build (but do not start) the server.
 * @param {{ dataDir?: string, port?: number, host?: string }} [options]
 */
export function createApp({ dataDir, port = Number(process.env.PORT || 2014), host = '0.0.0.0' } = {}) {
  if (dataDir) setDataDir(dataDir)

  let boundPort = port
  const app = express()
  app.disable('x-powered-by')
  const server = http.createServer(app)
  // No CORS: every ProVerlay page is served from this server. Origin/Host
  // checks (see netSecurity.js) apply to the socket.io handshake too.
  const io = new Server(server, { allowRequest: socketAllowRequest })

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    next()
  })
  app.use(originGuard())
  app.use(express.json({ limit: '5mb' }))
  app.use('/api', createApiRouter({ getPort: () => boundPort }))
  app.use('/public', express.static(path.join(ROOT, 'public')))
  app.use('/templates', express.static(path.join(ROOT, 'templates')))

  // Project assets: only known project ids, only allow-listed file types.
  app.use('/projects/:projectId/assets', (req, res, next) => {
    const { projectId } = req.params
    if (!isValidProjectId(projectId)) return res.status(404).end()
    let file = ''
    try {
      file = decodeURIComponent(req.path.split('/').pop() || '')
    } catch {
      return res.status(400).end()
    }
    if (!ASSET_EXT_RE.test(file)) return res.status(404).end()
    projectExists(projectId)
      .then((exists) => {
        if (!exists) return res.status(404).end()
        express.static(assetsDir(projectId), { dotfiles: 'deny', index: false, redirect: false })(req, res, next)
      })
      .catch(next)
  })

  app.get('/render', sendPage('render'))
  app.get('/render/:graphicId', (req, res) => {
    res.redirect(`/render?graphic=${encodeURIComponent(req.params.graphicId)}`)
  })

  app.get('/control', (req, res) => {
    // Decision A: tablets/phones use Operator for live control — not the dense desktop dashboard.
    const device = detectDevice(req.headers['user-agent'] || '')
    if (device === 'mobile' || device === 'tablet') {
      return res.redirect('/operator')
    }
    res.sendFile(path.join(ROOT, 'public', 'control', 'index.html'))
  })

  app.get('/design', sendPage('design'))
  app.get('/operator', sendPage('operator'))
  app.get('/operate/:widgetId', sendPage('operate'))
  app.get('/operate', sendPage('operate'))
  app.get('/layout', sendPage('layout'))
  app.get('/editor', sendPage('editor'))
  app.get('/editor/:graphicId', (req, res) => {
    res.redirect(`/editor?graphic=${encodeURIComponent(req.params.graphicId)}`)
  })
  app.get('/compose', sendPage('compose'))
  app.get('/project', sendPage('project'))

  app.get('/', (req, res) => {
    const device = detectDevice(req.headers['user-agent'] || '')
    const dashboard = preferredDashboard(device, req.query)
    res.redirect(`/${dashboard}`)
  })

  // API/JSON errors → JSON (geen HTML stack traces met filesystem-paden)
  app.use(errorHandler)

  // Read-only socket API: clients receive `stateChanged` and may ask for
  // `getState`. All writes go through the REST API (validated, queued).
  io.on('connection', (socket) => {
    try {
      socket.emit('stateChanged', getState())
    } catch (err) {
      console.error('[socket] initial state failed:', err.message)
    }
    socket.on('getState', (_payload, ack) => {
      if (typeof ack !== 'function') return
      try {
        ack(getState())
      } catch (err) {
        ack({ error: err.message })
      }
    })
  })

  let unsubscribe = null
  let started = false

  async function listen() {
    resetProjectsCache()
    resetState()
    await loadState()
    unsubscribe = onStateChange((state) => io.emit('stateChanged', state))
    initF1Timing(io)
    started = true
    await new Promise((resolve, reject) => {
      const onError = (err) => {
        server.off('listening', onListening)
        reject(err)
      }
      const onListening = () => {
        server.off('error', onError)
        resolve()
      }
      server.once('error', onError)
      server.once('listening', onListening)
      server.listen(port, host)
    }).catch(async (err) => {
      await cleanup()
      throw err
    })
    boundPort = server.address().port
    server.on('error', (err) => console.error('[server] error:', err))
    return { port: boundPort, url: `http://127.0.0.1:${boundPort}` }
  }

  async function cleanup() {
    if (!started) return
    started = false
    shutdownF1Timing()
    unsubscribe?.()
    unsubscribe = null
    await flushTouchProject()
    await drainWrites()
  }

  async function close() {
    await new Promise((resolve) => {
      if (!server.listening) return resolve()
      server.close(() => resolve())
      io.disconnectSockets(true)
      server.closeAllConnections?.()
    })
    io.close()
    await cleanup()
  }

  return {
    app,
    server,
    io,
    listen,
    close,
    get port() {
      return boundPort
    }
  }
}

/** Create and start a server. Resolves to the handle once it is listening. */
export async function startServer(options = {}) {
  const handle = createApp(options)
  await handle.listen()
  return handle
}
